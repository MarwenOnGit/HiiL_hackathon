"""The highest-value component: sorting every fact into agreed, disputed or
unsupported.

Neutrality is mechanical here, not aspirational. Both parties' statements go
through identical code, the output is one ledger both of them see, and no
wording anywhere depends on who is reading. A string that would read
differently to each side is a bug (posture rule 2).

`unsupported` is the honest default and carries no blame: it means nobody
evidenced it, not that someone lied.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from core.schemas import Fact, Obligation
from core.taxonomy import FactStatus, ObligationState

from rag.chunker import normalise
from rag.index import tokenise

# Two statements are about the same thing if they share enough content words.
SAME_TOPIC = 0.45

_NEGATIONS = {
    "non", "pas", "jamais", "aucun", "aucune", "ni", "refuse", "conteste",
    "nie", "faux", "لم", "لا", "ليس", "ينكر", "يرفض",
}


@dataclass
class Statement:
    party_id: str
    text: str
    evidence_refs: list[str] = field(default_factory=list)


def _overlap(a: list[str], b: list[str]) -> float:
    if not a or not b:
        return 0.0
    sa, sb = set(a), set(b)
    return len(sa & sb) / len(sa | sb)


def _negated(text: str) -> bool:
    """Detect negation on the RAW text, never on tokenised output.

    `tokenise` strips stopwords, and "ne" and "pas" are stopwords — so running
    this over tokens deleted the negation before it could be seen, and
    "contenait 12 panneaux fissures" versus "ne contenait pas de panneaux
    fissures" came back AGREED. Marking a flat contradiction as agreed is the
    worst thing this ledger can do.
    """
    words = set(re.findall(r"[\w\u0600-\u06ff']+", normalise(text)))
    return bool(words & _NEGATIONS)


def reconcile(
    statements: list[Statement],
    obligations: list[Obligation] | None = None,
) -> list[Fact]:
    """Pair up statements across parties and classify each resulting fact."""
    obligations = obligations or []
    tokenised = [(s, tokenise(s.text)) for s in statements]
    used: set[int] = set()
    facts: list[Fact] = []

    for i, (stmt_a, tokens_a) in enumerate(tokenised):
        if i in used:
            continue
        partner = None
        for j in range(i + 1, len(tokenised)):
            if j in used:
                continue
            stmt_b, tokens_b = tokenised[j]
            if stmt_b.party_id == stmt_a.party_id:
                continue
            if _overlap(tokens_a, tokens_b) >= SAME_TOPIC:
                partner = (j, stmt_b, tokens_b)
                break

        if partner is None:
            # Only one side said it. Evidence can still raise it above hearsay.
            status = FactStatus.UNSUPPORTED
            if stmt_a.evidence_refs:
                status = FactStatus.DISPUTED  # asserted with proof, not yet answered
            facts.append(Fact(
                fact=stmt_a.text.strip(),
                status=status,
                source_evidence=list(stmt_a.evidence_refs),
            ))
            used.add(i)
            continue

        j, stmt_b, tokens_b = partner
        used.update({i, j})
        both_evidence = list(stmt_a.evidence_refs) + list(stmt_b.evidence_refs)
        if _negated(stmt_a.text) != _negated(stmt_b.text):
            status = FactStatus.DISPUTED
        else:
            status = FactStatus.AGREED
        facts.append(Fact(
            fact=stmt_a.text.strip(),
            status=status,
            source_evidence=both_evidence,
        ))

    for obligation in obligations:
        if obligation.state is ObligationState.OVERDUE_UNCONFIRMED:
            # A neutral, timestamped record — never phrased as an accusation.
            facts.append(Fact(
                fact=(
                    f"Obligation « {obligation.action} » : aucune confirmation "
                    "enregistrée à l'échéance."
                ),
                status=FactStatus.AGREED,
                source_evidence=[f"obligation:{obligation.obligation_id}"],
            ))

    return facts


def summarise(facts: list[Fact]) -> dict[str, int]:
    return {
        "agreed": sum(1 for f in facts if f.status is FactStatus.AGREED),
        "disputed": sum(1 for f in facts if f.status is FactStatus.DISPUTED),
        "unsupported": sum(1 for f in facts if f.status is FactStatus.UNSUPPORTED),
    }
