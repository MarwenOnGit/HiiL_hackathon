"""The store is the last line of defence for invariant 1: version_manager makes
overwriting impossible through its API, but a tampered in-memory object could
still reach save(). These tests are that backstop.
"""

import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.contract_store import AppendOnlyViolation, JsonFileStore, StoreError
from core.llm_client import LLMUnavailable, NullLLMClient, ScriptedLLMClient
from core.schemas import Clause, ContractObject, LegalRef, Party, RiskFlag
from core.taxonomy import CorpusType, DocType, Language, RiskKind
from core.version_manager import add_version, governing_version_at, status_of

JAN = datetime(2026, 1, 1, tzinfo=timezone.utc)
MAR = datetime(2026, 3, 1, tzinfo=timezone.utc)


def seeded():
    c = ContractObject(
        contract_id="contract_supply_001",
        parties=[Party("p_owner", "msme_owner", "Atelier Trabelsi", "pseudo_a")],
        metadata={"contract_type": "supply"},
    )
    add_version(
        c, doc_type=DocType.ORIGINAL, text_hash="0xaaa", effective_from=JAN,
        clauses=[
            Clause(
                clause_id="", type="delivery", language=Language.FR,
                text="Livraison sous un delai raisonnable.",
                risk_flags=[RiskFlag(kind=RiskKind.AMBIGUOUS, detail="no objective deadline")],
            )
        ],
    )
    return c


class RoundTrip(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.store = JsonFileStore(self.dir.name)

    def tearDown(self):
        self.dir.cleanup()

    def test_save_then_get_preserves_everything_that_matters(self):
        original = seeded()
        self.store.save(original)
        loaded = self.store.get("contract_supply_001")

        self.assertEqual(loaded.contract_id, original.contract_id)
        self.assertEqual(loaded.metadata["contract_type"], "supply")
        self.assertEqual(len(loaded.versions), 1)
        self.assertEqual(loaded.versions[0].clause_ids, ["cl_0001"])
        self.assertEqual(loaded.versions[0].effective_from, JAN)
        self.assertIs(loaded.versions[0].clauses[0].language, Language.FR)
        self.assertIs(loaded.versions[0].clauses[0].risk_flags[0].kind, RiskKind.AMBIGUOUS)

    def test_datetimes_survive_as_aware_utc(self):
        self.store.save(seeded())
        loaded = self.store.get("contract_supply_001")
        stamp = loaded.versions[0].effective_from
        self.assertIsNotNone(stamp.tzinfo)
        self.assertEqual(stamp, JAN)

    def test_lineage_logic_still_works_after_a_round_trip(self):
        """Loading must produce a real object, not a lookalike."""
        c = seeded()
        add_version(c, doc_type=DocType.SIGNED, text_hash="0xccc",
                    parent_version_id="v001", effective_from=MAR)
        self.store.save(c)
        loaded = self.store.get("contract_supply_001")
        self.assertEqual(governing_version_at(loaded, MAR).version_id, "v002")
        self.assertEqual(str(status_of(loaded, "v001")), "superseded")

    def test_legal_refs_round_trip_with_their_grounding(self):
        c = seeded()
        ref = LegalRef(
            source_doc="COC", article_ref="art. 1458",
            excerpt="La transaction est un contrat par lequel...",
            corpus_type=CorpusType.NORMATIVE, language=Language.FR,
        )
        add_version(
            c, doc_type=DocType.HARDENED, text_hash="0xbbb", parent_version_id="v001",
            clauses=[Clause(clause_id="cl_0001", type="delivery", language=Language.FR,
                            text="Livraison sous 5 jours.", legal_refs=[ref])],
        )
        self.store.save(c)
        loaded = self.store.get("contract_supply_001")
        got = loaded.versions[1].clauses[0].legal_refs[0]
        self.assertEqual(got.article_ref, "art. 1458")
        self.assertIn("transaction", got.excerpt)

    def test_appending_a_version_is_allowed(self):
        c = seeded()
        self.store.save(c)
        add_version(c, doc_type=DocType.SIGNED, text_hash="0xccc",
                    parent_version_id="v001", effective_from=MAR)
        self.store.save(c)
        self.assertEqual(len(self.store.get("contract_supply_001").versions), 2)

    def test_list_ids_and_exists(self):
        self.assertEqual(self.store.list_ids(), [])
        self.assertFalse(self.store.exists("contract_supply_001"))
        self.store.save(seeded())
        self.assertEqual(self.store.list_ids(), ["contract_supply_001"])
        self.assertTrue(self.store.exists("contract_supply_001"))

    def test_get_unknown_raises(self):
        with self.assertRaises(StoreError):
            self.store.get("nope")

    def test_unsafe_contract_id_is_refused(self):
        for bad in ("../escape", "a/b", ".hidden", ""):
            with self.assertRaises(StoreError):
                self.store.exists(bad)


class AppendOnlyEnforcement(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.store = JsonFileStore(self.dir.name)
        self.store.save(seeded())

    def tearDown(self):
        self.dir.cleanup()

    def test_dropping_a_version_is_refused(self):
        c = self.store.get("contract_supply_001")
        c.versions.clear()
        with self.assertRaises(AppendOnlyViolation) as ctx:
            self.store.save(c)
        self.assertIn("never deleted", str(ctx.exception))

    def test_rewriting_a_stored_text_hash_is_refused(self):
        c = self.store.get("contract_supply_001")
        c.versions[0].text_hash = "0xdeadbeef"
        with self.assertRaises(AppendOnlyViolation) as ctx:
            self.store.save(c)
        self.assertIn("immutable", str(ctx.exception))

    def test_moving_a_stored_effective_from_is_refused(self):
        c = self.store.get("contract_supply_001")
        c.versions[0].effective_from = MAR
        with self.assertRaises(AppendOnlyViolation):
            self.store.save(c)

    def test_editing_clause_text_inside_a_stored_version_is_refused(self):
        """A rewrite is a new version keeping the same clause_id — never an
        edit in place."""
        c = self.store.get("contract_supply_001")
        c.versions[0].clauses[0].text = "Livraison sous 5 jours."
        with self.assertRaises(AppendOnlyViolation) as ctx:
            self.store.save(c)
        self.assertIn("belongs in a new", str(ctx.exception))

    def test_removing_a_clause_from_a_stored_version_is_refused(self):
        c = self.store.get("contract_supply_001")
        c.versions[0].clauses.clear()
        with self.assertRaises(AppendOnlyViolation):
            self.store.save(c)

    def test_changing_contract_id_is_refused(self):
        c = self.store.get("contract_supply_001")
        c.contract_id = "contract_other"
        # Saves under the new name, so load the original and compare identity.
        self.store.save(c)
        self.assertTrue(self.store.exists("contract_other"))
        with self.assertRaises(AppendOnlyViolation):
            mutated = self.store.get("contract_other")
            mutated.contract_id = "contract_supply_001"
            JsonFileStore._assert_append_only(self.store.get("contract_other"), mutated)

    def test_a_refused_save_leaves_the_stored_file_untouched(self):
        c = self.store.get("contract_supply_001")
        c.versions[0].text_hash = "0xdeadbeef"
        with self.assertRaises(AppendOnlyViolation):
            self.store.save(c)
        self.assertEqual(self.store.get("contract_supply_001").versions[0].text_hash, "0xaaa")
        self.assertEqual(
            list(Path(self.dir.name).glob("*.tmp")), [], "temp file left behind"
        )


class LLMSeam(unittest.TestCase):
    def test_the_default_client_refuses_rather_than_inventing_text(self):
        with self.assertRaises(LLMUnavailable):
            NullLLMClient().complete("draft a delivery clause")

    def test_scripted_client_is_deterministic_and_records_prompts(self):
        client = ScriptedLLMClient(["first", "second"])
        self.assertEqual(client.complete("a").text, "first")
        self.assertEqual(client.complete("b", system="s").text, "second")
        self.assertEqual([c["prompt"] for c in client.calls], ["a", "b"])
        with self.assertRaises(LLMUnavailable):
            client.complete("c")

    def test_temperature_defaults_to_zero_for_reproducibility(self):
        client = ScriptedLLMClient(["x"])
        client.complete("a")
        self.assertEqual(client.calls[0]["temperature"], 0.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
