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

from blockchain_client.client import BlockchainClient
from core.schemas import Clause, ContractObject, Obligation, Party
from core.taxonomy import DocType, Language
from core.version_manager import add_version
from rag.retriever import Retriever

from .classifier import classify
from .gap_detector import Gap, detect_gaps
from .ingest import detect_language
from .obligation_extractor import extract_obligations
from .remediation import Redline, propose_redlines
from .risk_scorer import score_clause


@dataclass
class HardeningReport:
    contract: ContractObject
    original_version_id: str
    gaps: list[Gap] = field(default_factory=list)
    redlines: list[Redline] = field(default_factory=list)
    obligations: list[Obligation] = field(default_factory=list)
    anchor_doc_id: str | None = None
    anchor_tx: str | None = None
    corpus_size: int = 0

    @property
    def grounded_redlines(self) -> int:
        return sum(1 for r in self.redlines if r.grounded)

    def as_dict(self) -> dict[str, Any]:
        version = self.contract.version(self.original_version_id)
        return {
            "contract_id": self.contract.contract_id,
            "version_id": self.original_version_id,
            "text_hash": version.text_hash if version else None,
            "anchor": {"doc_id": self.anchor_doc_id, "tx_hash": self.anchor_tx},
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
            "redlines": [r.as_dict() for r in self.redlines],
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
                "grounded_redlines": self.grounded_redlines,
                "total_redlines": len(self.redlines),
                # Surfaced so the UI can say this plainly rather than implying
                # an ungrounded finding was legally checked.
                "all_ungrounded": self.corpus_size == 0 and bool(self.redlines),
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
) -> HardeningReport:
    from .segmenter import segment  # local import keeps the module graph shallow

    supplier = next((p.party_id for p in parties if p.role == "counterparty"), "p_supplier")
    buyer = next((p.party_id for p in parties if p.role == "msme_owner"), "p_buyer")

    contract = ContractObject(contract_id=contract_id, parties=list(parties),
                              metadata={"profile": profile["name"]})

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

    text_hash = _keccak_like(text)
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

    redlines: list[Redline] = []
    for clause in original.clauses:
        findings = score_clause(clause.text, profile, clause.language)
        clause.risk_flags.extend(f.flag for f in findings)
        clause_redlines, extra = propose_redlines(clause, findings, retriever, profile)
        clause.risk_flags.extend(extra)
        redlines.extend(clause_redlines)

    obligations = extract_obligations(original.clauses, profile, supplier, buyer)
    by_clause = {c.clause_id: c for c in original.clauses}
    for obligation in obligations:
        clause = by_clause.get(obligation.clause_id)
        if clause is not None:
            clause.obligations.append(obligation)

    if store is not None:
        store.save(contract)

    return HardeningReport(
        contract=contract,
        original_version_id=original.version_id,
        gaps=gaps,
        redlines=redlines,
        obligations=obligations,
        anchor_doc_id=anchor_doc_id,
        anchor_tx=anchor_tx,
        corpus_size=len(retriever._index),  # noqa: SLF001 - reporting only
    )


def _keccak_like(text: str) -> str:
    """A 32-byte hex fingerprint of the contract text.

    sha256, not keccak256: the Node side hashes with keccak via ethers, and
    matching that would mean pulling a crypto dependency into the agent layer
    for no benefit while the chain is a fake. The real chain cutover must
    settle on one hash function — flagged in the cross-team request.
    """
    import hashlib
    return "0x" + hashlib.sha256(text.encode("utf-8")).hexdigest()
