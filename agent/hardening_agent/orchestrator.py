"""Runs Agent 1 end to end and hands back one report.

Order is load-bearing: ingest -> segment -> classify -> anchor the original ->
deterministic gap check -> risk scoring -> remediation. The original is
anchored *before* any analysis, so the fingerprint proves what was uploaded,
not what the tool thought of it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from blockchain_client.client import BlockchainClient, EventType
from core.hashing import content_hash, json_fingerprint
from core.schemas import Clause, ContractObject, Obligation, Party
from core.taxonomy import DocType, Language
from core.version_manager import add_version
from rag.retriever import Retriever

from .classifier import classify
from .gap_detector import Gap, detect_gaps
from .ingest import detect_language
from .obligation_extractor import extract_obligations
from .remediation import Recommendation, propose_recommendations
from .risk_scorer import score_clause


@dataclass
class HardeningReport:
    contract: ContractObject
    original_version_id: str
    gaps: list[Gap] = field(default_factory=list)
    recommendations: list[Recommendation] = field(default_factory=list)
    obligations: list[Obligation] = field(default_factory=list)
    anchor_doc_id: str | None = None
    anchor_tx: str | None = None
    corpus_size: int = 0
    analysis_tx: str | None = None
    analysis_fingerprint: str | None = None

    @property
    def grounded_recommendations(self) -> int:
        return sum(1 for r in self.recommendations if r.grounded)

    def as_dict(self) -> dict[str, Any]:
        version = self.contract.version(self.original_version_id)
        return {
            "contract_id": self.contract.contract_id,
            "version_id": self.original_version_id,
            "text_hash": version.text_hash if version else None,
            "anchor": {"doc_id": self.anchor_doc_id, "tx_hash": self.anchor_tx},
            "analysis_anchor": {
                # True as soon as the audit fingerprint is on the chain. Only a
                # hash rides along; the findings themselves stay off-chain.
                "attested": bool(self.analysis_tx),
                "tx_hash": self.analysis_tx,
                "findings_hash": self.analysis_fingerprint,
                "total": len(self.recommendations),
                "grounded": self.grounded_recommendations,
                "gaps": len(self.gaps),
            },
            "clauses": [
                {
                    "clause_id": c.clause_id,
                    "type": c.type,
                    "language": str(c.language),
                    "text": c.text,
                    "risk_flags": [
                        {"kind": str(f.kind), "detail": f.detail} for f in c.risk_flags
                    ],
                }
                for c in (version.clauses if version else [])
            ],
            "gaps": [g.as_dict() for g in self.gaps],
            "recommendations": [r.as_dict() for r in self.recommendations],
            "obligations": [
                {
                    "obligation_id": o.obligation_id,
                    "clause_id": o.clause_id,
                    "obligor": o.obligor,
                    "obligee": o.obligee,
                    "action": o.action,
                    "trigger": o.trigger,
                    "evidence_required": o.evidence_required,
                    "state": str(o.state),
                }
                for o in self.obligations
            ],
            "grounding": {
                "corpus_size": self.corpus_size,
                "grounded_recommendations": self.grounded_recommendations,
                "total_recommendations": len(self.recommendations),
                # Surfaced so the UI can say this plainly rather than implying
                # an ungrounded finding was legally checked.
                "all_ungrounded": self.corpus_size == 0 and bool(self.recommendations),
            },
        }


def harden(
    *,
    text: str,
    contract_id: str,
    parties: list[Party],
    profile: dict[str, Any],
    retriever: Retriever,
    chain: BlockchainClient | None = None,
    store=None,
    effective_from: datetime | None = None,
    metadata: dict[str, Any] | None = None,
) -> HardeningReport:
    from .segmenter import segment  # local import keeps the module graph shallow

    supplier = next((p.party_id for p in parties if p.role == "counterparty"), "p_supplier")
    buyer = next((p.party_id for p in parties if p.role == "msme_owner"), "p_buyer")

    meta = dict(metadata or {})
    meta.setdefault("profile", profile["name"])
    contract = ContractObject(contract_id=contract_id, parties=list(parties), metadata=meta)

    clauses: list[Clause] = []
    for seg in segment(text):
        language = detect_language(seg.text)
        clauses.append(Clause(
            clause_id="",
            type=classify(seg.text, profile, language),
            language=language,
            text=seg.text,
            span=seg.span,
        ))

    text_hash = content_hash(text)
    original = add_version(
        contract,
        doc_type=DocType.ORIGINAL,
        text_hash=text_hash,
        clauses=clauses,
        effective_from=effective_from or datetime.now(timezone.utc),
    )

    # Anchor before analysis: the fingerprint proves what was uploaded.
    anchor_doc_id = anchor_tx = None
    if chain is not None:
        record = chain.anchor_document(
            text_hash, DocType.ORIGINAL,
            [p.pseudonym for p in parties],
            metadata={"contract_id": contract_id, "profile": profile["name"]},
        )
        anchor_doc_id, anchor_tx = record.doc_id, record.tx_hash
        original.anchor_tx = record.tx_hash

    gaps = detect_gaps(original.clauses, text, profile)

    recommendations: list[Recommendation] = []
    for clause in original.clauses:
        findings = score_clause(clause.text, profile, clause.language)
        clause.risk_flags.extend(f.flag for f in findings)
        clause_recs, extra = propose_recommendations(clause, findings, retriever, profile)
        clause.risk_flags.extend(extra)
        recommendations.extend(clause_recs)

    obligations = extract_obligations(original.clauses, profile, supplier, buyer)
    by_clause = {c.clause_id: c for c in original.clauses}
    for obligation in obligations:
        clause = by_clause.get(obligation.clause_id)
        if clause is not None:
            clause.obligations.append(obligation)

    # After analysis: attest WHAT the analysis found, as a fingerprint. The
    # original was anchored *before* analysis below in this file; this second
    # on-chain fact proves the audit's own content is intact and unedited —
    # the number of anomalies, which clauses they touched, and what retrieval
    # grounded them. Only a hash rides along (invariant 3): the findings text
    # itself stays in the off-chain report a party can read.
    analysis_tx = analysis_fingerprint = None
    if chain is not None and parties:
        findings_snapshot = {
            "version_id": original.version_id,
            "anchor_doc_id": anchor_doc_id,
            "gaps": [
                {"label": g.label, "why": g.why, "severity": g.severity}
                for g in gaps
            ],
            "recommendations": [
                {
                    "clause_id": r.clause_id,
                    "risk_kind": str(r.risk_kind),
                    "grounded": r.grounded,
                    "rationale": r.rationale,
                }
                for r in recommendations
            ],
            "obligations": [
                {"clause_id": o.clause_id, "obligor": o.obligor, "action": o.action}
                for o in obligations
            ],
        }
        analysis_fingerprint = json_fingerprint(findings_snapshot)
        signer = next(
            (p.pseudonym for p in parties if p.role == "msme_owner"),
            parties[0].pseudonym,
        )
        record = chain.attest_event(
            contract_id,
            EventType.ANALYSIS_COMPLETED,
            analysis_fingerprint,
            signer,
        )
        analysis_tx = record.tx_hash
        # Kept on the contract so the signed anchor and any later consumer can
        # reference the analysis without re-deriving or trusting a re-upload.
        contract.metadata["analysis_fingerprint"] = analysis_fingerprint
        contract.metadata["analysis_tx"] = analysis_tx

    if store is not None:
        store.save(contract)

    return HardeningReport(
        contract=contract,
        original_version_id=original.version_id,
        gaps=gaps,
        recommendations=recommendations,
        obligations=obligations,
        anchor_doc_id=anchor_doc_id,
        anchor_tx=anchor_tx,
        corpus_size=len(retriever._index),  # noqa: SLF001 - reporting only
        analysis_tx=analysis_tx,
        analysis_fingerprint=analysis_fingerprint,
    )


# Resolved: the fingerprint is Keccak-256 over a canonical byte form, matching
# Solidity and ethers exactly. See core/hashing.py.
