"""Who owes what, and when it falls due.

Pattern-based and conservative: an obligation it cannot date is still recorded,
with `due_date=None`, rather than being dropped or given a guessed deadline.
The obligation ledger is evidence, and a fabricated due date in evidence is
worse than a missing one.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

from core.schemas import Clause, Obligation
from core.taxonomy import Language, ObligationState

from rag.chunker import normalise

# "sous 5 jours ouvrables", "a 30 jours", "dans les 7 jours", "net 30",
# "dans un delai de 7 jours", "في أجل سبعة أيام". Matched over the
# accent-stripped, lowercased clause, so "dans un délai" and "dans un delai"
# are the same thing.
_DELAY = re.compile(
    r"(?:sous|dans\s+(?:les|un)\s+(?:delai\s+de\s+)?|a|à|net|أجل|في\s+أجل|خلال)\s*"
    r"(?P<n>\d{1,3})\s*"
    r"(?P<unit>jours?\s*ouvrables?|jours?|mois|أيام|شهر|ا)?",
    re.IGNORECASE,
)

# An anchor event that happens later, so a delay is relative to it rather than
# to the contract's start: "a compter de la livraison", "from delivery".
# Matched over normalised (accent-free) clause text.
_EVENT_ANCHOR = re.compile(
    r"(?:compter de|partir de|reception de|بعد|من)\s*(?:la\s*)?"
    r"(livraison|reception|remise|(?:ال)?تسليم)",
    re.IGNORECASE,
)

# Absolute calendar dates written in the clause: "au plus tard le 30/04/2026",
# "avant le 30 avril 2026", "أقصى أجل 15/03/2026". Two-digit years read as
# 20xx. The missing year defaults to the year of the reference date.
_DATE_NUM = r"\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}"
_ABSOLUTE_DATE = re.compile(
    r"(?:au\s+plus\s+tard|avant|jusqu'?au|le|pour\s+le|أقصى|قبل|في)\s*"
    r"(?:le\s+)?(?P<d>\d{1,2})[/.-](?P<m>\d{1,2})[/.-](?P<y>\d{2,4})",
    re.IGNORECASE,
)
_MONTHS_FR = {
    "janvier": 1, "février": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "août": 8, "septembre": 9, "octobre": 10, "novembre": 11,
    "décembre": 12,
}
_MONTH_NAME = re.compile(
    r"(?:au\s+plus\s+tard|avant|le)\s+(?P<d>\d{1,2})\s+"
    r"(?P<m>janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+"
    r"(?P<y>\d{2,4})",
    re.IGNORECASE,
)


def _absolute_date(text: str, ref: datetime) -> datetime | None:
    """A calendar date actually written in the clause, or None.

    A fabricated date in evidence is worse than a missing one, so this only
    ever returns a date that the text names. A clause with no date stays None
    rather than being guessed.
    """
    tz = ref.tzinfo if ref.tzinfo is not None else _now_timezone()
    for match in (_ABSOLUTE_DATE.search(text), _MONTH_NAME.search(normalise(text))):
        if match is None:
            continue
        try:
            day = int(match.group("d"))
            month = int(match.group("m"))
        except (IndexError, ValueError):
            continue
        if match.re is _MONTH_NAME:
            month = _MONTHS_FR.get(match.group("m") or "", month)
        try:
            year = int(match.group("y"))
        except (IndexError, ValueError):
            continue
        if year < 100:
            year += 2000
        if year < 1900:
            continue
        try:
            return datetime(year, month, day, tzinfo=tz)
        except ValueError:
            continue
    return None


def _now_timezone():
    from datetime import timezone

    return timezone.utc


def _delay_days(text: str) -> int | None:
    match = _DELAY.search(normalise(text))
    if not match:
        return None
    count = int(match.group("n"))
    unit = (match.group("unit") or "").lower()
    if "mois" in unit or "شهر" in unit:
        return count * 30
    return count


def extract_obligations(
    clauses: list[Clause],
    profile: dict[str, Any],
    supplier_id: str,
    buyer_id: str,
    effective: datetime | None = None,
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
                kind = "delivery"
            else:
                obligor, obligee = buyer_id, supplier_id
                label = "payer le prix"
                kind = "payment"

            due_date, date_reference = _bind_due_date(
                clause.text, days=days, effective=effective
            )
            obligations.append(Obligation(
                obligation_id=f"ob_{counter:03d}",
                clause_id=clause.clause_id,
                obligor=obligor,
                obligee=obligee,
                action=label,
                kind=kind,
                trigger=(
                    f"{days} jours" if days is not None
                    else "déclencheur non chiffré dans le contrat"
                ),
                due_date=due_date,
                date_reference=date_reference,
                delay_days=days,
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


def _bind_due_date(
    clause_text: str, *, days: int | None, effective: datetime | None
) -> tuple[datetime | None, str]:
    """Provenance of a due date, in order of how much evidence backs it.

    1. absolute — a calendar date the clause itself names.
    2. event_linked — a delay anchored to a later event ("30 jours après la
       livraison"); unresolved until that event happens.
    3. estimated — a quantified delay anchored to the contract's start, an
       explicit approximation ("entrée en vigueur") because the clause's real
       anchor (e.g. order confirmation) is not observed.
    4. unknown — nothing numeric in the clause at all.

    Never invent: a clause with no date stays `unknown`, exactly as the
    extractor's contract of honesty requires.
    """
    if effective is not None:
        absolute = _absolute_date(clause_text, effective)
        if absolute is not None:
            return absolute, "absolute"
    if days is not None:
        if _EVENT_ANCHOR.search(normalise(clause_text)):
            return None, "event_linked"
        if effective is not None:
            return effective + timedelta(days=days), "estimated"
    return None, "unknown"
