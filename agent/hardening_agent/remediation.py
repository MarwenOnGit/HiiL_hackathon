"""Recommendations: an anomaly, why it matters, and authority — never a change.

Agent 1 does anomaly detection, not editing. The AI never alters the contract:
every finding is advisory, carries `applied=False`, and the proposed wording is
a drafting suggestion the user may take or leave — it is never written into a
version of the contract.

Every recommendation carries five things — the clause, the anomaly, a drafting
path, the rationale, and the legal basis. The legal basis is the one that
matters. It is populated *only* from retrieved chunks, and when retrieval comes
back empty the recommendation still ships but carries an explicit
`NoLegalBasis` instead.

That distinction is the product's integrity: "here is a drafting improvement"
and "here is what the law requires" are different claims, and this module never
lets the first quietly present itself as the second.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from core.schemas import Clause, LegalRef, RiskFlag
from core.taxonomy import CorpusType, Language, RiskKind

from rag.retriever import Mode, NoLegalBasis, RetrievalResult, Retriever

from .risk_scorer import Finding


@dataclass
class Recommendation:
    clause_id: str
    original: str
    proposed: str
    rationale: str
    risk_kind: RiskKind
    legal_basis: list[LegalRef] = field(default_factory=list)
    matched_terms: list[list[str]] = field(default_factory=list)
    # True when the article was named by a human who read it, rather than
    # found by lexical search. The UI says which, because they are different
    # kinds of claim.
    verified_pin: bool = False
    no_legal_basis: NoLegalBasis | None = None
    # Always False by construction: the AI never alters the contract. Surfaced
    # so no consumer can mistake a recommendation for an applied change.
    applied: bool = False

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
            # The only value the pipeline ever emits. Nothing in this module
            # mutates the contract; "applied" would take a human editor.
            "applied": self.applied,
            "grounded": self.grounded,
            "legal_basis": [
                {
                    "source_doc": r.source_doc,
                    "article_ref": r.article_ref,
                    "excerpt": r.excerpt,
                    "corpus_type": str(r.corpus_type),
                    # Which selective words actually matched. Shown in the UI so
                    # a reader can judge the citation instead of trusting it:
                    # lexical retrieval proves shared vocabulary, not legal
                    # authority, and the difference must be visible.
                    "matched_terms": terms,
                }
                for r, terms in zip(self.legal_basis, self.matched_terms or [[]] * len(self.legal_basis))
            ],
            "verified_pin": self.verified_pin,
            "verification_note": (
                "Article vérifié à la main : quelqu'un a lu ce texte et confirmé "
                "qu'il régit ce point. L'extrait provient du corpus."
                if self.verified_pin else
                "Extraits retrouvés par recherche lexicale dans le corpus. "
                "Ils partagent le vocabulaire de la clause — ce n'est pas une "
                "confirmation qu'ils la régissent. À vérifier avant tout usage."
            ),
            "no_legal_basis": (
                None if self.no_legal_basis is None
                else {
                    "reason": self.no_legal_basis.reason,
                    "message": self.no_legal_basis.message_fr,
                    "corpus_size": self.no_legal_basis.corpus_size,
                }
            ),
        }


def propose_recommendations(
    clause: Clause,
    findings: list[Finding],
    retriever: Retriever,
    profile: dict[str, Any],
) -> tuple[list[Recommendation], list[RiskFlag]]:
    """Recommendations for one clause, plus any flags upgraded by retrieval.

    Returns flags separately because a retrieved provision can turn an
    observation into an `unenforceable` finding — and that flag type refuses to
    exist without the citation that justifies it.
    """
    recommendations: list[Recommendation] = []
    extra_flags: list[RiskFlag] = []

    for finding in findings:
        # The clause TYPE is an internal English enum id ("delivery_deadline")
        # and never appears in a French corpus, so including it only added
        # noise. Query with the matched French term plus the requirement's own
        # French label.
        query = f"{finding.matched_text} {_label_for(clause.type, profile)}".strip()

        # A hand-verified anchor wins over search. Lexical retrieval answers
        # "shares vocabulary with", not "governs" — an audit of the demo path
        # caught it citing a warehouse-register article for a vague quantity
        # term and an offer-by-correspondence article for a vague delivery
        # term. Where a human has read the article and confirmed it applies,
        # use that. The excerpt still comes from the corpus, so a wrong pin is
        # visible to anyone who reads it.
        pinned = None
        if finding.verified_article:
            pinned = retriever.by_article_ref(
                finding.verified_article,
                language=clause.language,
                corpus_types=[CorpusType.NORMATIVE, CorpusType.CLAUSE_LIBRARY],
            )
        result = (
            RetrievalResult(query=query, mode=Mode.NORMATIVE,
                            language=clause.language, hits=[pinned])
            if pinned is not None
            else retriever.retrieve(query, mode=Mode.NORMATIVE, language=clause.language)
        )

        proposed = finding.suggested_fix or _default_fix(finding, clause.language)
        rationale = finding.flag.detail

        if result.grounded:
            recommendations.append(Recommendation(
                clause_id=clause.clause_id,
                original=clause.text.strip()[:800],
                proposed=proposed,
                rationale=rationale,
                risk_kind=finding.flag.kind,
                legal_basis=result.legal_refs(),
                matched_terms=[h.matched_terms for h in result.hits],
                verified_pin=pinned is not None,
            ))
        else:
            recommendations.append(Recommendation(
                clause_id=clause.clause_id,
                original=clause.text.strip()[:800],
                proposed=proposed,
                rationale=rationale,
                risk_kind=finding.flag.kind,
                no_legal_basis=result.empty,
            ))

    return recommendations, extra_flags


def _label_for(clause_type: str, profile: dict[str, Any]) -> str:
    for entry in profile.get("required_clauses", []):
        if entry["id"] == clause_type:
            return entry.get("label_fr", "")
    return ""


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
