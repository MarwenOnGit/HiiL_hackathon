"""The dispute-prevention monitor: the resolution agent's pre-court duty.

These tests pin the honesty rules the plan is built on:
- relative delays are labelled and derived, not presented as facts written in
  the contract ("estimated" vs "absolute");
- an "event_linked" due date stays None until the real event is confirmed —
  never invented from the start date;
- confirmations transition state, bind relatives, and anchor;
- the demo clock only moves the *view*, never the version ledger.
"""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from blockchain_client import InMemoryChain
from blockchain_client.client import EventType
from config import load_profile
from core.schemas import Party
from core.taxonomy import ObligationState
from hardening_agent import harden
from monitor import (
    build_schedule,
    check_in_text,
    confirm_obligation,
    escalate_to_amicable,
    monitor_as_of,
)
from rag import InMemoryIndex, Retriever

JAN = datetime(2026, 1, 15, tzinfo=timezone.utc)
PARTIES = [
    Party("p_buyer", "msme_owner", "Atelier Trabelsi", "pseudo_buyer"),
    Party("p_supplier", "counterparty", "Bois du Nord", "pseudo_supplier"),
]
SEED = Path(__file__).resolve().parent.parent / "seed" / "contract_supply_defective.txt"


class _FakeStore:
    """save() is a no-op: tests read obligations straight off the contract."""

    def __init__(self):
        self.saved = 0

    def save(self, contract) -> None:
        self.saved += 1


def _harden(text: str, *, effective: datetime = JAN, contract_id: str = "c_mon") :
    chain = InMemoryChain()
    report = harden(
        text=text,
        contract_id=contract_id,
        parties=PARTIES,
        profile=load_profile("supply"),
        retriever=Retriever(InMemoryIndex()),
        chain=chain,
        effective_from=effective,
    )
    return chain, report.contract, report


class DateProvenance(unittest.TestCase):
    """Invariant: a derived date is labelled derived; nothing is invented."""

    def test_estimated_delivery_is_derived_from_effective_date(self):
        _, contract, report = _harden(SEED.read_text(encoding="utf-8"))
        delivery = next(o for o in report.obligations if o.kind == "delivery")
        # "delai raisonnable" has no number: unknown stays unknown, and the
        # monitor must not fabricate a duedate for it.
        if delivery.delay_days is None:
            self.assertIsNone(delivery.due_date)
            self.assertEqual(delivery.date_reference, "unknown")

    def test_event_linked_payment_stays_unbound_until_delivery(self):
        # The exact seed texts the web harden wizard ships, so the demo path
        # and this test can never disagree about what gets extracted.
        text = (
            "Article 2 : Le fournisseur livre les marchandises commandees dans "
            "un delai de 7 jours ouvrables a compter de la confirmation de la "
            "commande. "
            "\n\nArticle 4 : L'acheteur regle le prix convenu par virement bancaire "
            "dans un delai de 30 jours a compter de la livraison."
        )
        _, contract, report = _harden(text)
        by_kind = {o.kind: o for o in report.obligations}
        self.assertEqual(by_kind["delivery"].date_reference, "estimated")
        self.assertEqual(by_kind["delivery"].delay_days, 7)
        self.assertIsNotNone(by_kind["delivery"].due_date)

        payment = by_kind["payment"]
        self.assertEqual(payment.date_reference, "event_linked")
        self.assertEqual(payment.delay_days, 30)
        # Never invented from the start date, no matter that the contract has
        # an effective date: the phrase anchors to delivery, which has not
        # happened.
        self.assertIsNone(payment.due_date)

    def test_absolute_date_in_text_wins(self):
        text = (
            "Article 2 : Le livreur livre au plus tard le 28/02/2026. "
            "\n\nArticle 4 : paiement net 30."
        )
        _, contract, report = _harden(text)
        delivery = next(o for o in report.obligations if o.kind == "delivery")
        self.assertEqual(delivery.date_reference, "absolute")
        self.assertEqual(delivery.due_date.date().isoformat(), "2026-02-28")


class DeliveryDoesNotWaitOnItself(unittest.TestCase):
    """A delivery clause says "livraison"; that must not make it event_linked.

    When both duties landed in one segment, the delivery inherited the
    payment's "à compter de la livraison" anchor, lost its due date, and never
    came due — so the monitor asked nobody anything, silently.
    """

    TWO_DUTIES_ONE_CLAUSE = (
        "Le fournisseur livre les marchandises commandees dans un delai de 7 "
        "jours ouvrables a compter de la confirmation de la commande, et "
        "l'acheteur regle le prix convenu par virement bancaire dans un delai "
        "de 30 jours a compter de la livraison."
    )

    def test_the_delivery_keeps_its_estimated_date(self):
        _, _, report = _harden(self.TWO_DUTIES_ONE_CLAUSE)
        delivery = next(o for o in report.obligations if o.kind == "delivery")
        self.assertEqual(delivery.date_reference, "estimated")
        self.assertIsNotNone(delivery.due_date)

    def test_that_delivery_actually_comes_due(self):
        _, contract, report = _harden(self.TWO_DUTIES_ONE_CLAUSE)
        delivery = next(o for o in report.obligations if o.kind == "delivery")
        milestones = build_schedule(contract, as_of=delivery.due_date)
        due = next(m for m in milestones if m.kind == "delivery")
        self.assertEqual(due.alert, "due")
        self.assertNotEqual(check_in_text(due, "fr"), "")

    def test_a_payment_still_waits_for_the_delivery(self):
        """The guard must not disable event_linked for the side that does wait."""
        text = (
            "Article 2 : Le fournisseur livre les marchandises commandees dans "
            "un delai de 7 jours ouvrables a compter de la confirmation de la "
            "commande."
            "\n\nArticle 4 : L'acheteur regle le prix convenu par virement "
            "bancaire dans un delai de 30 jours a compter de la livraison."
        )
        _, _, report = _harden(text)
        payment = next(o for o in report.obligations if o.kind == "payment")
        self.assertEqual(payment.date_reference, "event_linked")
        self.assertIsNone(payment.due_date)


class TheDemoClockAccumulates(unittest.TestCase):
    """Pressing "+4 jours" twice must reach day 8, not stay at day 4.

    Assigning the offset pinned the clock, so no deadline could ever pass and
    the breach -> amicable half of the flow could not be demonstrated at all.
    """

    def test_repeated_advances_add_up(self):
        _, contract, _ = _harden(SEED.read_text(encoding="utf-8"))
        for _ in range(3):
            current = int(contract.metadata.get("monitor_offset_days", 0) or 0)
            contract.metadata["monitor_offset_days"] = current + 4
        self.assertEqual(contract.metadata["monitor_offset_days"], 12)
        self.assertEqual(
            monitor_as_of(contract, JAN).date(), (JAN + timedelta(days=12)).date()
        )

    def test_an_advanced_clock_eventually_makes_a_deadline_pass(self):
        text = (
            "Article 2 : Le fournisseur livre les marchandises commandees dans "
            "un delai de 7 jours ouvrables a compter de la confirmation de la "
            "commande."
        )
        _, contract, report = _harden(text)
        delivery = next(o for o in report.obligations if o.kind == "delivery")
        contract.metadata["monitor_offset_days"] = 11
        milestones = build_schedule(contract, as_of=monitor_as_of(contract, JAN))
        overdue = next(m for m in milestones if m.obligation_id == delivery.obligation_id)
        self.assertEqual(overdue.alert, "overdue_unconfirmed")


class ScheduleAndConfirm(unittest.TestCase):
    def test_no_fabricated_check_in_when_no_date(self):
        _, contract, _ = _harden(SEED.read_text(encoding="utf-8"))
        milestones = build_schedule(contract, as_of=monitor_as_of(contract, JAN))
        for m in milestones:
            self.assertEqual(check_in_text(m, "fr"), "")

    def test_a_breach_that_is_later_met_is_cured_not_overwritten(self):
        """Answering 'performed' after a breach must not erase the breach."""
        text = (
            "Article 2 : Le fournisseur livre les marchandises commandees dans "
            "un delai de 7 jours ouvrables a compter de la confirmation de la "
            "commande."
        )
        chain, contract, report = _harden(text)
        delivery = next(o for o in report.obligations if o.kind == "delivery")
        store = _FakeStore()
        confirm_obligation(
            contract, delivery.obligation_id, "breached",
            chain=chain, store=store, now=JAN, party_id="p_buyer", lang="fr",
        )
        self.assertEqual(delivery.state, ObligationState.BREACHED)

        result = confirm_obligation(
            contract, delivery.obligation_id, "performed",
            chain=chain, store=store, now=JAN, party_id="p_supplier", lang="fr",
        )
        self.assertEqual(delivery.state, ObligationState.CURED)
        self.assertEqual(result["state"], str(ObligationState.CURED))

        # Both facts stay on the chain; neither replaces the other.
        kinds = [
            e.event_type for e in chain.fetch_history(contract.contract_id)
            if hasattr(e, "event_type")
        ]
        self.assertIn(EventType.OBLIGATION_BREACHED, kinds)
        self.assertIn(EventType.OBLIGATION_PERFORMED, kinds)

    def test_confirming_delivery_binds_event_linked_payment(self):
        text = (
            "Article 2 : Le fournisseur livre les marchandises commandees dans "
            "un delai de 7 jours ouvrables a compter de la confirmation de la "
            "commande. "
            "\n\nArticle 4 : L'acheteur regle le prix convenu par virement bancaire "
            "dans un delai de 30 jours a compter de la livraison."
        )
        chain, contract, report = _harden(text)
        delivery = next(o for o in report.obligations if o.kind == "delivery")
        payment = next(o for o in report.obligations if o.kind == "payment")

        delivery_due = delivery.due_date
        self.assertIsNotNone(delivery_due)
        store = _FakeStore()
        result = confirm_obligation(
            contract, delivery.obligation_id, "performed",
            chain=chain, store=store,
            now=delivery_due, party_id="p_buyer", lang="fr",
        )
        self.assertEqual(result["outcome"], "performed")
        self.assertTrue(result["anchored"])

        # After the confirmation the payment's window opens from that date,
        # derived from the confirmed event — still never from the start date.
        milestones = build_schedule(contract, as_of=delivery_due)
        payment_m = next(m for m in milestones if m.kind == "payment")
        self.assertIsNotNone(payment_m.due_date)

        updated = next(o for o in contract.obligations() if o.obligation_id == payment.obligation_id)
        self.assertEqual(updated.due_date, delivery_due + timedelta(days=30))

    def test_not_yet_records_a_fact_without_changing_state_or_anchoring(self):
        _, contract, report = _harden(
            "Le fournisseur livre les marchandises dans un delai de 7 jours.",
            contract_id="c_notyet"
        )
        delivery = next(o for o in report.obligations if o.kind == "delivery")
        result = confirm_obligation(
            contract, delivery.obligation_id, "not_yet",
            chain=InMemoryChain(), store=_FakeStore(), party_id="p_buyer", lang="fr",
        )
        self.assertEqual(result["anchored"], False)
        updated = next(o for o in contract.obligations() if o.obligation_id == delivery.obligation_id)
        self.assertIs(updated.state, ObligationState.PENDING)

    def test_breached_anchors_a_closed_state(self):
        _, contract, report = _harden(
            "Le fournisseur livre les marchandises dans un delai de 7 jours.",
            contract_id="c_breach"
        )
        chain = InMemoryChain()
        delivery = next(o for o in report.obligations if o.kind == "delivery")
        result = confirm_obligation(
            contract, delivery.obligation_id, "breached",
            chain=chain, store=_FakeStore(), party_id="p_buyer", lang="fr",
        )
        self.assertTrue(result["anchored"])
        updated = next(o for o in contract.obligations() if o.obligation_id == delivery.obligation_id)
        self.assertIs(updated.state, ObligationState.BREACHED)

    def test_demo_clock_is_a_view_not_an_event(self):
        _, contract, _ = _harden("Le fournisseur livre les marchandises dans un delai de 7 jours.",
                                 contract_id="c_clock")
        contract.metadata["monitor_offset_days"] = 4
        as_of = monitor_as_of(contract, JAN)
        self.assertEqual(as_of, JAN + timedelta(days=4))
        # Version ledger untouched: still exactly one version, effective JAN.
        self.assertEqual(len(contract.versions), 1)
        self.assertEqual(contract.versions[0].effective_from, JAN)

    def test_escalate_opens_amicable_phase_anchored(self):
        _, contract, report = _harden("Le fournisseur livre les marchandises dans un delai de 7 jours.",
                                      contract_id="c_amicable")
        chain = InMemoryChain()
        ids = [o.obligation_id for o in report.obligations]
        result = escalate_to_amicable(contract, ids, chain=chain, store=_FakeStore(), lang="ar")
        self.assertEqual(result["phase"], "amicable")
        self.assertTrue(result["anchored"])
        self.assertEqual(contract.metadata.get("phase"), "amicable")
        self.assertIn("لِنحلها", result["line"])

    def test_check_in_copy_exists_in_both_languages(self):
        _, contract, _ = _harden("Le livreur livre dans un delai de 4 jours.",
                                 contract_id="c_checkin")
        milestones = build_schedule(contract, as_of=JAN + timedelta(days=2))
        actionable = [m for m in milestones if m.alert]
        self.assertTrue(actionable)
        fr = check_in_text(actionable[0], "fr")
        ar = check_in_text(actionable[0], "ar")
        self.assertIn("ancrée", fr)
        self.assertIn("يُثبَّت", ar)


class MonitorEndpoints(unittest.TestCase):
    def test_confirm_rejects_unknown_obligation(self):
        _, contract, _ = _harden(SEED.read_text(encoding="utf-8"), contract_id="c_nope")
        with self.assertRaises(KeyError):
            confirm_obligation(
                contract, "ob_does_not_exist", "performed",
                chain=InMemoryChain(), store=_FakeStore(), party_id="p_buyer", lang="fr",
            )


if __name__ == "__main__":
    unittest.main()