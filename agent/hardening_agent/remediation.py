"""Redlines: what to change, why, and on what authority.

Every redline carries four things — original, proposed, rationale, and legal
basis. The fourth is the one that matters. It is populated *only* from
retrieved chunks, and when retrieval comes back empty the redline still ships
but carries an explicit `NoLegalBasis` instead.

That distinction is the product's integrity: "here is a drafting improvement"
and "here is what the law requires" are different claims, and this module never
lets the first quietly present itself as the second.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from core.schemas import Clause, LegalRef, RiskFlag
from core.taxonomy import Language, RiskKind

from rag.retriever import Mode, NoLegalBasis, Retriever

from .risk_scorer import Finding


@dataclass
class Redline:
    clause_id: str
    original: str
    proposed: str
    rationale: str
    risk_kind: RiskKind
    legal_basis: list[LegalRef] = field(default_factory=list)
    no_legal_basis: NoLegalBasis | None = None

    @property
    def grounded(self) -> bool:
        return bool(self.legal_basis)

    def as_dict(self) -> dict[str, Any]:
        return {
            "clause_id": self.clause_id,
            "original": self.original,
            "proposed": self.proposed,
            "rationale": self.rationale,
            "risk_kind": str(self.risk_kind),
            "grounded": self.grounded,
            "legal_basis": [
                {
                    "source_doc": r.source_doc,
                    "article_ref": r.article_ref,
                    "excerpt": r.excerpt,
                    "corpus_type": str(r.corpus_type),
                }
                for r in self.legal_basis
            ],
            "no_legal_basis": (
                None if self.no_legal_basis is None
                else {
                    "reason": self.no_legal_basis.reason,
                    "message": self.no_legal_basis.message_fr,
                    "corpus_size": self.no_legal_basis.corpus_size,
                }
            ),
        }


def propose_redlines(
    clause: Clause,
    findings: list[Finding],
    retriever: Retriever,
    profile: dict[str, Any],
) -> tuple[list[Redline], list[RiskFlag]]:
    """Redlines for one clause, plus any flags upgraded by retrieval.

    Returns flags separately because a retrieved provision can turn an
    observation into an `unenforceable` finding — and that flag type refuses to
    exist without the citation that justifies it.
    """
    redlines: list[Redline] = []
    extra_flags: list[RiskFlag] = []

    for finding in findings:
        query = f"{finding.matched_text} {clause.type}".strip()
        result = retriever.retrieve(query, mode=Mode.NORMATIVE, language=clause.language)

        proposed = finding.suggested_fix or _default_fix(finding, clause.language)
        rationale = finding.flag.detail

        if result.grounded:
            refs = result.legal_refs()
            redlines.append(Redline(
                clause_id=clause.clause_id,
                original=clause.text.strip()[:800],
                proposed=proposed,
                rationale=rationale,
                risk_kind=finding.flag.kind,
                legal_basis=refs,
            ))
        else:
            redlines.append(Redline(
                clause_id=clause.clause_id,
                original=clause.text.strip()[:800],
                proposed=proposed,
                rationale=rationale,
                risk_kind=finding.flag.kind,
                no_legal_basis=result.empty,
            ))

    return redlines, extra_flags


def _default_fix(finding: Finding, language: Language) -> str:
    if finding.flag.kind is RiskKind.ASYMMETRIC:
        return (
            "Rendre la faculté réciproque, ou documenter explicitement pourquoi "
            "elle ne l'est pas. Signalé pour information — une clause "
            "déséquilibrée peut être parfaitement valable et voulue."
            if language is Language.FR else
            "جعل الحق متبادلاً أو توثيق سبب عدم تبادله صراحة."
        )
    return (
        "Remplacer par un critère objectif et vérifiable."
        if language is Language.FR else
        "استبدالها بمعيار موضوعي قابل للتحقق."
    )
