"""Agent 2's narrator: states the dispute in terms both parties can accept.

The neutrality rule is the whole design here. Both parties read this text, so
the digest carries the same fact ledger and the same BATNA figures for both,
and the system prompt forbids addressing either of them. If a sentence would
read differently depending on who saw it, that is a bug (CLAUDE.md, Agent 2
posture rule 2).

The BATNA figures come from `config/batna.yaml` via the estimator and are
passed through with their source named, because rule 3 requires every number to
be traceable to a published source and presented as a range.
"""

from __future__ import annotations

from typing import Any

from core.llm_client import LLMClient
from narration import Narrative, narrate, unavailable

MAX_FACTS = 20
MAX_OPTIONS = 5


def digest(report: Any) -> str:
    """The DONNÉES block: ledger, governing version, outcome estimate, options."""
    dispute = report.intake.dispute
    lines = [
        f"dispute_id: {dispute.dispute_id}",
        f"contract_id: {dispute.contract_id}",
        f"version applicable a la date des faits: {report.intake.version.version_id} "
        f"({report.intake.version.doc_type})",
        f"motif de selection: {report.intake.explanation_fr}",
    ]

    if dispute.claims:
        lines.append("")
        lines.append("DEMANDES DECLAREES :")
        for claim in dispute.claims:
            lines.append(f"- {claim}")

    lines.append("")
    lines.append(
        "REGISTRE DES FAITS (agreed = les deux parties l'affirment ; disputed = "
        "elles se contredisent ; unsupported = aucun element produit, ce qui ne "
        "signifie pas qu'une partie a tort) :"
    )
    for fact in report.facts[:MAX_FACTS]:
        evidence = ", ".join(fact.source_evidence) if fact.source_evidence else "aucune piece"
        clauses = ", ".join(fact.clause_ids) if fact.clause_ids else "aucune clause rattachee"
        lines.append(f"- [{fact.status}] {fact.fact} | pieces: {evidence} | clauses: {clauses}")

    batna = report.batna.as_dict()
    lines.append("")
    lines.append("ESTIMATION D'ISSUE JUDICIAIRE (chiffres a reprendre tels quels) :")
    for key, value in batna.items():
        lines.append(f"- {key}: {value}")

    if report.options:
        lines.append("")
        lines.append("OPTIONS DE REGLEMENT GENEREES :")
        for option in report.options[:MAX_OPTIONS]:
            lines.append(f"- {option.as_dict()}")

    if report.caveats:
        lines.append("")
        lines.append("RESERVES A REPRENDRE :")
        for caveat in report.caveats:
            lines.append(f"- {caveat}")

    lines.append("")
    lines.append(
        "RAPPEL FACTUEL : rien ici n'engage les parties. Toute transaction "
        "suppose une revue par un avocat puis une signature humaine."
    )
    return "\n".join(lines)


def summarise(
    report: Any,
    client: LLMClient | None,
    language: str | None = None,
    citations: list[dict[str, str]] | None = None,
) -> Narrative:
    """Narrate a dispute report. Returns a stated absence, never raises.

    `citations` is usually empty: Agent 2 reasons over facts and figures rather
    than over law, so the model is told there is no legal basis and must not
    invent one. When the caller does retrieve doctrine, passing it here makes
    those articles — and only those — quotable.
    """
    if client is None:
        return unavailable("no model backend configured", language or "fr")
    return narrate(
        client,
        agent="resolution",
        language=language or "fr",
        data=digest(report),
        citations=citations or [],
    )
