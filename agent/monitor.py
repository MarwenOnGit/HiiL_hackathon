"""Dispute-prevention monitor (the resolution agent's pre-court duty).

The second agent now *prevents* disputes before court instead of only
preparing for them: it turns extracted obligations into a dated monitoring
plan, checks in with the parties inside the chat when a milestone gets close,
records confirmations as anchored facts, and only when something is missed
does it open the amicable-resitution phase — still in the same chat, still
anchored.

No LLM here. Every decision is deterministic over the version-aware
obligation ledger, and every number shown carries its provenance
(`date_reference`) so "derived" is never presented as "written in the
contract" (Audit corrections 12/13/20 spirit, invariant 7).

The offset in `contract.metadata["monitor_offset_days"]` exists only for the
demo's "Simuler +4 jours" control. It shifts the *viewing* date; it never
writes to version history (invariant 1).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from config.monitor import (
    AMICABLE_OPENING,
    CHECK_IN,
    CONFIRMED,
    OVERDUE,
    REMIND_DAYS,
)
from core.hashing import json_fingerprint
from core.schemas import ContractObject, Milestone, Obligation
from core.taxonomy import ObligationState
from core.version_manager import governing_version_at

from blockchain_client.client import (
    BlockchainClient,
    EventType,
)


def monitor_as_of(contract: ContractObject, now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    try:
        offset = int(contract.metadata.get("monitor_offset_days", 0))
    except (TypeError, ValueError):
        offset = 0
    return now + timedelta(days=offset)


def _labels(contract: ContractObject) -> dict[str, str]:
    return {p.party_id: p.display_name for p in contract.parties}


@dataclass
class MonitorFlag:
    milestone_id: str
    alert: str
    days_until: int | None


def _milestone_for(contract: ContractObject, obligation: Obligation, as_of: datetime) -> Milestone:
    names = _labels(contract)
    days_until = None
    alert = None
    if obligation.due_date is not None:
        delta = (obligation.due_date.date() - as_of.date()).days
        days_until = delta
        if obligation.state not in (
            ObligationState.PERFORMED,
            ObligationState.BREACHED,
            ObligationState.WAIVED,
            ObligationState.CURED,
        ):
            if delta < 0:
                alert = "overdue_unconfirmed"
            elif delta == 0:
                alert = "due"
            elif delta <= REMIND_DAYS:
                alert = "due_soon"
    return Milestone(
        milestone_id=obligation.obligation_id,
        obligation_id=obligation.obligation_id,
        clause_id=obligation.clause_id,
        kind=obligation.kind,
        action=obligation.action,
        obligor_label=names.get(obligation.obligor, obligation.obligor),
        obligee_label=names.get(obligation.obligee, obligation.obligee),
        trigger_text=obligation.trigger,
        due_date=obligation.due_date,
        date_reference=obligation.date_reference,
        evidence_required=obligation.evidence_required,
        state=obligation.state,
        days_until=days_until,
        alert=alert,
    )


def build_schedule(contract: ContractObject, as_of: datetime | None = None) -> list[Milestone]:
    """Milestones over the obligations of the version governing `as_of`.

    Per-invariant 6 every milestone is a projection of the obligation ledger,
    never an independent copy: the monitor reads `contract.obligations()` and
    the clauses' versions, and a milestone is only ever rebuilt from them.
    """
    as_of = as_of or monitor_as_of(contract)
    governing = governing_version_at(contract, as_of)
    if governing is None:
        return []
    obligations = {
        o.obligation_id: o
        for clause in governing.clauses
        for o in clause.obligations
    }
    return [_milestone_for(contract, o, as_of) for o in obligations.values()]


def _obligation_in_force(contract: ContractObject, obligation_id: str, as_of: datetime) -> Obligation | None:
    governing = governing_version_at(contract, as_of)
    if governing is None:
        return None
    for clause in governing.clauses:
        for o in clause.obligations:
            if o.obligation_id == obligation_id:
                return o
    return None


def check_in_text(milestone: Milestone, lang: str) -> str:
    """The neutral check-in question for one milestone, in one language."""
    if milestone.due_date is None:
        return ""
    templ = CHECK_IN.get(lang, CHECK_IN["fr"])
    date_s = milestone.due_date.astimezone(timezone.utc).strftime("%Y-%m-%d")
    if milestone.alert == "overdue_unconfirmed":
        return OVERDUE.get(lang, OVERDUE["fr"]).format(
            action=milestone.action, date=date_s
        )
    kind_tmpl = templ.get(milestone.kind, templ["generic"])
    days = milestone.days_until if milestone.days_until is not None else 0
    return kind_tmpl.format(action=milestone.action, date=date_s, days=days)


def confirm_obligation(
    contract: ContractObject,
    obligation_id: str,
    outcome: str,
    chain: BlockchainClient,
    store: Any,
    now: datetime | None = None,
    party_id: str | None = None,
    lang: str = "fr",
) -> dict[str, Any]:
    """Record a party's confirmation about one obligation.

    outcome: "performed" | "not_yet" | "breached".

    - performed / breached transition the obligation's state and anchor the
      confirmed fact on-chain (performed also binds "event_linked" relatives,
      e.g. a payment due N days after delivery).
    - not_yet records a timestamped fact without changing state and without
      anchoring; it is an observation, not a resolution.
    """
    now = now or datetime.now(timezone.utc)
    as_of = monitor_as_of(contract, now)
    if outcome not in ("performed", "not_yet", "breached"):
        raise ValueError(f"unknown monitoring outcome: {outcome!r}")

    obligation = _obligation_in_force(contract, obligation_id, as_of)
    if obligation is None:
        raise KeyError(f"no obligation {obligation_id!r} in force at {as_of.date()}")

    names = _labels(contract)
    date_s = now.astimezone(timezone.utc).strftime("%Y-%m-%d")

    tx = None
    if outcome == "performed":
        obligation.state = ObligationState.PERFORMED
    elif outcome == "breached":
        obligation.state = ObligationState.BREACHED
    obligation.state_changed_at = now

    if outcome in ("performed", "breached"):
        kind = (
            EventType.OBLIGATION_PERFORMED if outcome == "performed"
            else EventType.OBLIGATION_BREACHED
        )
        payload = json_fingerprint({
            "obligation_id": obligation.obligation_id,
            "action": obligation.action,
            "clause_id": obligation.clause_id,
            "confirmed_at": now.isoformat(),
            "confirmed_by": party_id,
        })
        signer = ""
        for p in contract.parties:
            if p.party_id == party_id:
                signer = p.pseudonym
                break
        if not signer:
            signer = (
                contract.parties[0].pseudonym
                if contract.parties
                else "pseudo_unknown"
            )
        anchor = chain.attest_event(
            contract.contract_id, kind, payload, signer,
        )
        tx = anchor.tx_hash

        if outcome == "performed" and obligation.kind == "delivery":
            _bind_event_linked(contract, event_date=now)

    if outcome == "not_yet":
        confirmation_line = {"not_yet": True, "at": now.isoformat()}
    else:
        confirmation_line = {outcome: True, "at": now.isoformat(), "tx": tx}

    persistence = contract.metadata.setdefault("monitor_log", [])
    persistence.append({
        "obligation_id": obligation.obligation_id,
        "outcome": outcome,
        "at": now.isoformat(),
        "tx": tx or None,
    })
    store.save(contract)

    template = CONFIRMED.get(lang, CONFIRMED["fr"])[outcome]
    line = template.format(
        action=obligation.action,
        date=date_s,
        tx=(tx if tx else ""),
    ).strip()

    return {
        "obligation_id": obligation.obligation_id,
        "outcome": outcome,
        "state": str(obligation.state),
        "anchored": tx is not None,
        "tx": tx,
        "line": line,
        "confirmation": confirmation_line,
        "as_of": as_of.isoformat(),
    }


def _bind_event_linked(contract: ContractObject, event_date: datetime) -> None:
    """Bind relatives that were waiting on a real event (Audit inference 8).

    A payment "30 jours à compter de la livraison" has no due date until the
    delivery actually happens. When delivery is confirmed, every event_linked
    obligation in force is bound to the confirmed event date, so the ledger
    still carries only *one* derived number and never invents one from the
    start date.
    """
    from hardening_agent.obligation_extractor import due_from

    as_of = monitor_as_of(contract, event_date)
    governing = governing_version_at(contract, as_of)
    if governing is None:
        return
    changed = False
    for clause in governing.clauses:
        for o in clause.obligations:
            if (
                o.date_reference == "event_linked"
                and o.due_date is None
                and o.delay_days is not None
                and o.state in (ObligationState.PENDING, ObligationState.OVERDUE_UNCONFIRMED)
            ):
                o.due_date = due_from(event_date, o.delay_days)
                changed = True
    if changed:
        pass  # caller persists the contract: state lives on the clause object


def escalate_to_amicable(
    contract: ContractObject,
    obligation_ids: list[str] | None,
    chain: BlockchainClient,
    store: Any,
    now: datetime | None = None,
    lang: str = "fr",
) -> dict[str, Any]:
    """Open the amicable phase inside the thread, anchored as disputed.

    The résiliation handler—the 'differend' of the old hire flow—never left
    unresolved: a breach claim is anchored as DISPUTE_OPENED here, proving a
    good-faith resolution was attempted before any further step.
    """
    now = now or datetime.now(timezone.utc)
    contract.metadata["phase"] = "amicable"
    contract.metadata["amicable_opened_at"] = now.isoformat()
    subject = ",".join(obligation_ids or [])
    payload = json_fingerprint({
        "contract_id": contract.contract_id,
        "phase": "amicable",
        "subject": subject,
        "opened_at": now.isoformat(),
    })
    anchor = chain.attest_event(
        contract.contract_id,
        EventType.DISPUTE_OPENED,
        payload,
        contract.parties[0].pseudonym if contract.parties else "pseudo_unknown",
    )
    store.save(contract)
    return {
        "phase": "amicable",
        "anchored": True,
        "tx": anchor.tx_hash,
        "line": AMICABLE_OPENING.get(lang, AMICABLE_OPENING["fr"]),
    }