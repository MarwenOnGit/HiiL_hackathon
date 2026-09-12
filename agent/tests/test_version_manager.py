"""Everything else in the system rests on these two behaviours: the lineage
cannot be corrupted, and "which version governed on this date" is right.
"""

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.schemas import Clause, ContractObject, Party
from core.taxonomy import DocType, Language, ReviewStatus, VersionStatus
from core.version_manager import (
    ClauseDiff,
    LineageError,
    add_version,
    allocate_clause_ids,
    diff_versions,
    effective_to,
    governing_version_at,
    lineage,
    next_clause_id,
    status_of,
)

JAN = datetime(2026, 1, 1, tzinfo=timezone.utc)
MAR = datetime(2026, 3, 1, tzinfo=timezone.utc)
JUN = datetime(2026, 6, 1, tzinfo=timezone.utc)
SEP = datetime(2026, 9, 1, tzinfo=timezone.utc)


def clause(text, clause_id="", type_="delivery"):
    return Clause(clause_id=clause_id, type=type_, language=Language.FR, text=text)


def fresh():
    return ContractObject(
        contract_id="contract_supply_001",
        parties=[
            Party("p_owner", "msme_owner", "Atelier Trabelsi", "pseudo_a"),
            Party("p_cp", "counterparty", "Bois du Nord", "pseudo_b"),
        ],
    )


def supply_chain():
    """original (Jan, in force) -> hardened (proposal) -> signed (Mar, in force).

    Mirrors the real flow: the hardened proposal is never anchored and never
    governs; signing creates a new version whose parent is that proposal.
    """
    c = fresh()
    v1 = add_version(
        c, doc_type=DocType.ORIGINAL, text_hash="0xaaa",
        clauses=[clause("Livraison sous un delai raisonnable."), clause("Paiement a 30 jours.")],
        effective_from=JAN,
    )
    v2 = add_version(
        c, doc_type=DocType.HARDENED, text_hash="0xbbb", parent_version_id=v1.version_id,
        clauses=[
            clause("Livraison sous 5 jours ouvrables.", clause_id="cl_0001"),
            clause("Paiement a 30 jours.", clause_id="cl_0002"),
        ],
    )
    v3 = add_version(
        c, doc_type=DocType.SIGNED, text_hash="0xccc", parent_version_id=v2.version_id,
        clauses=[
            clause("Livraison sous 5 jours ouvrables.", clause_id="cl_0001"),
            clause("Paiement a 30 jours.", clause_id="cl_0002"),
        ],
        effective_from=MAR, review_status=ReviewStatus.PARTY_ACCEPTED,
    )
    return c, v1, v2, v3


class LineageIntegrity(unittest.TestCase):
    def test_original_cannot_have_a_parent(self):
        c, v1, _, _ = supply_chain()
        with self.assertRaises(LineageError):
            add_version(c, doc_type=DocType.ORIGINAL, text_hash="0x1",
                        parent_version_id=v1.version_id)

    def test_a_second_original_is_refused(self):
        c = fresh()
        add_version(c, doc_type=DocType.ORIGINAL, text_hash="0x1", effective_from=JAN)
        with self.assertRaises(LineageError) as ctx:
            add_version(c, doc_type=DocType.ORIGINAL, text_hash="0x2", effective_from=MAR)
        self.assertIn("rival lineage", str(ctx.exception))

    def test_non_original_must_name_its_parent(self):
        c = fresh()
        add_version(c, doc_type=DocType.ORIGINAL, text_hash="0x1", effective_from=JAN)
        with self.assertRaises(LineageError):
            add_version(c, doc_type=DocType.AMENDMENT, text_hash="0x2", effective_from=MAR)

    def test_parent_must_exist(self):
        c = fresh()
        add_version(c, doc_type=DocType.ORIGINAL, text_hash="0x1", effective_from=JAN)
        with self.assertRaises(LineageError):
            add_version(c, doc_type=DocType.HARDENED, text_hash="0x2",
                        parent_version_id="v999")

    def test_a_version_id_is_never_reused(self):
        """Invariant 1: append-only. Re-adding an id must not overwrite."""
        c, v1, _, _ = supply_chain()
        with self.assertRaises(LineageError) as ctx:
            add_version(c, doc_type=DocType.AMENDMENT, text_hash="0xdead",
                        parent_version_id=v1.version_id, version_id=v1.version_id)
        self.assertIn("append-only", str(ctx.exception))
        self.assertEqual(c.version(v1.version_id).text_hash, "0xaaa")

    def test_module_exposes_no_delete_or_update(self):
        """The invariant is a shape, not a rule to remember."""
        import core.version_manager as vm
        public = {n for n in dir(vm) if not n.startswith("_")}
        for forbidden in ("delete_version", "remove_version", "update_version",
                          "overwrite_version", "set_version"):
            self.assertNotIn(forbidden, public)

    def test_cannot_take_force_before_its_parent(self):
        c, v1, v2, _ = supply_chain()
        with self.assertRaises(LineageError) as ctx:
            add_version(c, doc_type=DocType.AMENDMENT, text_hash="0xeee",
                        parent_version_id=v2.version_id,
                        effective_from=JAN - timedelta(days=30))
        self.assertIn("before its parent", str(ctx.exception))

    def test_two_versions_cannot_take_force_at_the_same_instant(self):
        c, _, _, v3 = supply_chain()
        with self.assertRaises(LineageError) as ctx:
            add_version(c, doc_type=DocType.AMENDMENT, text_hash="0xfff",
                        parent_version_id=v3.version_id, effective_from=MAR)
        self.assertIn("same", str(ctx.exception))

    def test_lineage_is_root_first(self):
        c, v1, v2, v3 = supply_chain()
        self.assertEqual(
            [v.version_id for v in lineage(c, v3.version_id)],
            [v1.version_id, v2.version_id, v3.version_id],
        )

    def test_lineage_of_unknown_version_raises(self):
        c, _, _, _ = supply_chain()
        with self.assertRaises(LineageError):
            lineage(c, "v999")

    def test_naive_effective_from_is_refused(self):
        c = fresh()
        with self.assertRaises(ValueError):
            add_version(c, doc_type=DocType.ORIGINAL, text_hash="0x1",
                        effective_from=datetime(2026, 1, 1))


class ClauseIdStability(unittest.TestCase):
    def test_ids_are_sequential_and_reproducible(self):
        c = fresh()
        add_version(c, doc_type=DocType.ORIGINAL, text_hash="0x1",
                    clauses=[clause("a"), clause("b"), clause("c")], effective_from=JAN)
        self.assertEqual(c.versions[0].clause_ids, ["cl_0001", "cl_0002", "cl_0003"])

    def test_a_rewritten_clause_keeps_its_id(self):
        """Invariant 2. This is what makes the diff below meaningful."""
        c, v1, v2, _ = supply_chain()
        self.assertEqual(v1.clause("cl_0001").text, "Livraison sous un delai raisonnable.")
        self.assertEqual(v2.clause("cl_0001").text, "Livraison sous 5 jours ouvrables.")

    def test_a_new_clause_never_reuses_a_retired_id(self):
        c, _, _, v3 = supply_chain()
        add_version(
            c, doc_type=DocType.AMENDMENT, text_hash="0xddd",
            parent_version_id=v3.version_id,
            clauses=[clause("Paiement a 30 jours.", clause_id="cl_0002"), clause("Penalite de retard.")],
            effective_from=JUN,
        )
        # cl_0001 was dropped; the new clause must not inherit its number.
        self.assertEqual(c.versions[-1].clause_ids, ["cl_0002", "cl_0003"])
        self.assertEqual(next_clause_id(c), "cl_0004")

    def test_inserting_does_not_renumber_neighbours(self):
        c = fresh()
        add_version(c, doc_type=DocType.ORIGINAL, text_hash="0x1",
                    clauses=[clause("first"), clause("third")], effective_from=JAN)
        v1 = c.versions[0]
        add_version(
            c, doc_type=DocType.HARDENED, text_hash="0x2", parent_version_id=v1.version_id,
            clauses=[
                clause("first", clause_id="cl_0001"),
                clause("second inserted"),
                clause("third", clause_id="cl_0002"),
            ],
        )
        self.assertEqual(c.versions[1].clause_ids, ["cl_0001", "cl_0003", "cl_0002"])

    def test_allocate_leaves_supplied_ids_untouched(self):
        c = fresh()
        out = allocate_clause_ids(c, [clause("x", clause_id="cl_0042"), clause("y")])
        self.assertEqual([x.clause_id for x in out], ["cl_0042", "cl_0001"])


class GoverningVersionByDate(unittest.TestCase):
    def test_nothing_governs_before_the_first_version_took_force(self):
        c, _, _, _ = supply_chain()
        self.assertIsNone(governing_version_at(c, JAN - timedelta(days=1)))

    def test_the_original_governs_its_own_window(self):
        c, v1, _, _ = supply_chain()
        got = governing_version_at(c, JAN + timedelta(days=14))
        self.assertEqual(got.version_id, v1.version_id)

    def test_the_signed_version_governs_after_it_took_force(self):
        c, _, _, v3 = supply_chain()
        got = governing_version_at(c, JUN)
        self.assertEqual(got.version_id, v3.version_id)

    def test_the_boundary_instant_belongs_to_the_incoming_version(self):
        """Half-open [start, end). Without this the boundary is ambiguous."""
        c, _, _, v3 = supply_chain()
        self.assertEqual(governing_version_at(c, MAR).version_id, v3.version_id)
        self.assertEqual(
            governing_version_at(c, MAR - timedelta(microseconds=1)).version_id, "v001"
        )

    def test_a_proposal_never_governs_anything(self):
        """The hardened version sits between two in-force versions and has no
        effective_from. It must never win, at any date."""
        c, _, v2, _ = supply_chain()
        for when in (JAN, JAN + timedelta(days=20), MAR, JUN, SEP):
            self.assertNotEqual(governing_version_at(c, when).version_id, v2.version_id)

    def test_resolution_is_not_simply_the_latest_version(self):
        """The mistake this function exists to prevent: a June dispute under a
        September amendment is still governed by the March signed version."""
        c, _, _, v3 = supply_chain()
        add_version(c, doc_type=DocType.AMENDMENT, text_hash="0xddd",
                    parent_version_id=v3.version_id, effective_from=SEP)
        self.assertEqual(governing_version_at(c, JUN).version_id, v3.version_id)
        self.assertEqual(governing_version_at(c, SEP + timedelta(days=1)).version_id, "v004")

    def test_naive_query_date_is_refused(self):
        c, _, _, _ = supply_chain()
        with self.assertRaises(ValueError):
            governing_version_at(c, datetime(2026, 6, 1))


class DerivedLifecycle(unittest.TestCase):
    def test_a_version_with_no_effective_from_is_proposed(self):
        c, _, v2, _ = supply_chain()
        self.assertIs(status_of(c, v2.version_id), VersionStatus.PROPOSED)

    def test_superseded_once_a_successor_takes_force(self):
        c, v1, _, v3 = supply_chain()
        self.assertIs(status_of(c, v1.version_id), VersionStatus.SUPERSEDED)
        self.assertIs(status_of(c, v3.version_id), VersionStatus.IN_FORCE)

    def test_a_proposal_between_two_signed_versions_does_not_break_the_chain(self):
        """v1's window must close at v3's start even though v2 sits between
        them with no date of its own."""
        c, v1, _, v3 = supply_chain()
        self.assertEqual(effective_to(c, v1.version_id), v3.effective_from)

    def test_the_version_in_force_has_an_open_window(self):
        c, _, _, v3 = supply_chain()
        self.assertIsNone(effective_to(c, v3.version_id))

    def test_a_proposal_has_no_window_at_all(self):
        c, _, v2, _ = supply_chain()
        self.assertIsNone(effective_to(c, v2.version_id))

    def test_cached_status_field_tracks_the_derived_value(self):
        c, v1, v2, v3 = supply_chain()
        for v in (v1, v2, v3):
            self.assertIs(v.status, status_of(c, v.version_id))

    def test_logic_ignores_a_corrupted_status_field(self):
        """status_of recomputes, so a hand-edited field cannot change behaviour."""
        c, v1, _, _ = supply_chain()
        v1.status = VersionStatus.IN_FORCE          # a lie
        self.assertIs(status_of(c, v1.version_id), VersionStatus.SUPERSEDED)


class ClauseLevelDiff(unittest.TestCase):
    def test_a_rewrite_is_one_modification_not_an_add_plus_a_remove(self):
        c, v1, v2, _ = supply_chain()
        d = diff_versions(c, v1.version_id, v2.version_id)
        self.assertEqual(d.added, [])
        self.assertEqual(d.removed, [])
        self.assertEqual([m[0] for m in d.modified], ["cl_0001"])
        self.assertEqual(d.unchanged, ["cl_0002"])
        before, after = d.modified[0][1], d.modified[0][2]
        self.assertIn("delai raisonnable", before)
        self.assertIn("5 jours", after)

    def test_additions_and_removals_are_reported(self):
        c, _, _, v3 = supply_chain()
        add_version(
            c, doc_type=DocType.AMENDMENT, text_hash="0xddd",
            parent_version_id=v3.version_id,
            clauses=[clause("Paiement a 30 jours.", clause_id="cl_0002"), clause("Penalite de retard.")],
            effective_from=JUN,
        )
        d = diff_versions(c, v3.version_id, "v004")
        self.assertEqual(d.removed, ["cl_0001"])
        self.assertEqual(d.added, ["cl_0003"])
        self.assertEqual(d.unchanged, ["cl_0002"])

    def test_identical_versions_report_no_change(self):
        c, _, v2, v3 = supply_chain()
        d = diff_versions(c, v2.version_id, v3.version_id)
        self.assertEqual(d.changed_clause_ids, [])
        self.assertEqual(len(d.unchanged), 2)

    def test_similarity_is_available_for_a_modified_clause(self):
        c, v1, v2, _ = supply_chain()
        d = diff_versions(c, v1.version_id, v2.version_id)
        ratio = d.similarity("cl_0001")
        self.assertTrue(0.0 < ratio < 1.0)
        self.assertIsNone(d.similarity("cl_0002"))

    def test_diff_of_unknown_version_raises(self):
        c, v1, _, _ = supply_chain()
        with self.assertRaises(LineageError):
            diff_versions(c, v1.version_id, "v999")


if __name__ == "__main__":
    unittest.main(verbosity=2)
