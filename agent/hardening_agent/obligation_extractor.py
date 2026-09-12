"""Who owes what, and when it falls due.

Pattern-based and conservative: an obligation it cannot date is still recorded,
with `due_date=None`, rather than being dropped or given a guessed deadline.
The obligation ledger is evidence, and a fabricated due date in evidence is
worse than a missing one.
"""

from __future__ import annotations

import re
from datetime import timedelta
from typing import Any

from core.schemas import Clause, Obligation
from core.taxonomy import Language, ObligationState

from rag.chunker import normalise

# "sous 5 jours ouvrables", "a 30 jours", "dans les 7 jours", "net 30"
_DELAY = re.compile(
    r"(?:sous|dans les|a|à|net|أجل|خلال)\s*(?P<n>\d{1,3})\s*"
    r"(?P<unit>jours?\s*ouvrables?|jours?|mois|أيام|شهر)?",
    re.IGNORECASE,
)


def _delay_days(text: str) -> int | None:
    match = _DELAY.search(text)
    if not match:
        return None
    count = int(match.group("n"))
    unit = (match.group("unit") or "").lower()
    if "mois" in unit or "شهر" in unit:
        return count * 30
    return count


def extract_obligations(
    clauses: list[Clause], profile: dict[str, Any], supplier_id: str, buyer_id: str
) -> list[Obligation]:
    cues = profile.get("obligation_cues", {})
    obligations: list[Obligation] = []
    counter = 0

    for clause in clauses:
        lang_key = "ar" if clause.language is Language.AR else "fr"
        lang_cues = cues.get(lang_key, {})
        haystack = normalise(clause.text)

        # Score every action and take the strongest. Taking the first match
        # attributed "paiement a 30 jours a compter de la livraison" to the
        # supplier as a delivery, because the word "livraison" appeared in a
        # payment clause. A misattributed obligor is a false fact in what is
        # meant to be an evidence ledger.
        scores = {
            action: sum(1 for w in words if normalise(w) in haystack)
            for action, words in lang_cues.items()
        }
        # The clause's own classification outranks word counting where it is
        # unambiguous about which side owes what.
        if clause.type == "payment_terms" and scores.get("pay"):
            scores = {"pay": scores["pay"] + 10}
        elif clause.type in {"delivery_deadline", "subject"} and scores.get("deliver"):
            scores["deliver"] = scores.get("deliver", 0) + 10

        ranked = [a for a, n in sorted(scores.items(), key=lambda kv: -kv[1]) if n]
        for action in ranked[:1]:
            counter += 1
            days = _delay_days(clause.text)
            if action == "deliver":
                obligor, obligee = supplier_id, buyer_id
                label = "livrer les marchandises"
            else:
                obligor, obligee = buyer_id, supplier_id
                label = "payer le prix"
            obligations.append(Obligation(
                obligation_id=f"ob_{counter:03d}",
                clause_id=clause.clause_id,
                obligor=obligor,
                obligee=obligee,
                action=label,
                trigger=(
                    f"{days} jours" if days is not None
                    else "déclencheur non chiffré dans le contrat"
                ),
                due_date=None,  # bound to a real event date at monitoring time
                evidence_required=(
                    "bon de livraison signé" if action == "deliver"
                    else "preuve de virement"
                ),
                state=ObligationState.PENDING,
            ))

    # One obligation per (obligor, action). Several clauses mention delivery,
    # and three identical rows in an evidence ledger read as three separate
    # duties. Keep the one that carries a quantified trigger.
    best: dict[tuple[str, str], Obligation] = {}
    for ob in obligations:
        key = (ob.obligor, ob.action)
        current = best.get(key)
        if current is None:
            best[key] = ob
            continue
        if "non chiffré" in current.trigger and "non chiffré" not in ob.trigger:
            best[key] = ob
    return sorted(best.values(), key=lambda o: o.obligation_id)


def due_from(trigger_event, days: int | None):
    """Bind a relative delay to a real event date. None stays None."""
    if days is None or trigger_event is None:
        return None
    return trigger_event + timedelta(days=days)
