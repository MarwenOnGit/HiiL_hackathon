"""Agent 1's narrator: reads the audit out loud, in the contract's language.

The analysis is already done and is entirely deterministic. This module builds
a compact digest of it and asks the model to explain it to a PME owner. The
contract text itself is never sent — only the findings, which is both the
cheaper prompt and the one that keeps the document in off-chain storage.

Nothing here can change the audit. If the narrator is unavailable, discarded,
or slow, `harden()` returns exactly what it returned before.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from core.llm_client import LLMClient
from narration import Narrative, citations_from_legal_refs, narrate, unavailable

# Caps, not truncation of meaning: the findings list is ordered by severity
# upstream, and a narrative that covers the worst dozen items is the one a
# reader will actually finish. Also the cost control on a long contract.
MAX_GAPS = 10
MAX_RECOMMENDATIONS = 12
MAX_OBLIGATIONS = 12
MAX_CITATIONS = 8


def dominant_language(report: Any) -> str:
    """The language most of the contract is written in.

    Detection is per-clause by design (invariant 8), but the narrative is one
    piece of prose and has to pick. The majority clause language is the honest
    choice; a genuinely mixed contract still gets explained in the language its
    bulk is written in.
    """
    version = report.contract.version(report.original_version_id)
    clauses = version.clauses if version else []
    counts = Counter(str(getattr(c.language, "value", c.language)) for c in clauses)
    if not counts:
        return "fr"
    return counts.most_common(1)[0][0]


def digest(report: Any) -> str:
    """The DONNÉES block: what the deterministic pass found, nothing else."""
    version = report.contract.version(report.original_version_id)
    clauses = version.clauses if version else []
    lines = [
        f"contract_id: {report.contract.contract_id}",
        f"clauses analysees: {len(clauses)}",
        f"versions: {len(report.contract.versions)}",
        f"points releves: {len(report.gaps)} lacune(s), "
        f"{len(report.recommendations)} recommandation(s) "
        f"({report.grounded_recommendations} avec extrait juridique retrouve)",
    ]

    parties = ", ".join(
        f"{p.display_name} ({p.role})" for p in report.contract.parties
    )
    if parties:
        lines.append(f"parties: {parties}")

    if report.gaps:
        lines.append("")
        lines.append("LACUNES (clause absente ou non quantifiee) :")
        for gap in report.gaps[:MAX_GAPS]:
            lines.append(f"- [{gap.severity}] {gap.label} — {gap.why}")

    if report.recommendations:
        lines.append("")
        lines.append("RISQUES PAR CLAUSE :")
        for rec in report.recommendations[:MAX_RECOMMENDATIONS]:
            refs = ", ".join(
                r.article_ref for r in rec.legal_basis if r.article_ref
            )
            basis = f" | extrait retrouve: {refs}" if refs else " | aucun extrait retrouve"
            original = " ".join(str(rec.original).split())[:180]
            lines.append(
                f"- clause {rec.clause_id} [{rec.risk_kind}] « {original} »"
                f" — {rec.rationale}{basis}"
            )

    obligations = list(report.obligations)[:MAX_OBLIGATIONS]
    if obligations:
        lines.append("")
        lines.append("OBLIGATIONS EXTRAITES :")
        for obligation in obligations:
            due = obligation.due_date.date().isoformat() if obligation.due_date else "non determinee"
            lines.append(
                f"- {obligation.obligor} doit {obligation.action}"
                f" | declencheur: {obligation.trigger} | echeance: {due}"
                f" | etat: {obligation.state}"
            )

    lines.append("")
    lines.append(
        "RAPPEL FACTUEL : aucune de ces recommandations n'a ete appliquee au "
        "contrat. Le document est inchange."
    )
    return "\n".join(lines)


def citations(report: Any) -> list[dict[str, str]]:
    """Every retrieved excerpt behind the findings, deduplicated and capped."""
    refs = [ref for rec in report.recommendations for ref in rec.legal_basis]
    return citations_from_legal_refs(refs)[:MAX_CITATIONS]


def summarise(report: Any, client: LLMClient | None, language: str | None = None) -> Narrative:
    """Narrate a hardening report. Returns a stated absence, never raises."""
    if client is None:
        return unavailable("no model backend configured", language or "fr")
    return narrate(
        client,
        agent="hardening",
        language=language or dominant_language(report),
        data=digest(report),
        citations=citations(report),
    )
