"""The chain fake, invariant-3 enforcement, and the tamper-detection path that
is the whole reason for anchoring.
"""

import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from blockchain_client import (
    ChainError,
    ContractResolver,
    EventType,
    InMemoryChain,
    OnChainPayloadRejected,
    TamperDetected,
)
from blockchain_client.client import MAX_METADATA_VALUE_CHARS, AnchorRecord
from core.contract_store import JsonFileStore
from core.schemas import Clause, ContractObject, Party
from core.taxonomy import DocType, Language
from core.version_manager import add_version

JAN = datetime(2026, 1, 1, tzinfo=timezone.utc)
MAR = datetime(2026, 3, 1, tzinfo=timezone.utc)
HASH_A = "0x" + "aa" * 32
HASH_B = "0x" + "bb" * 32
HASH_C = "0x" + "cc" * 32


class InvariantThree(unittest.TestCase):
    """Only hashes, pseudonymous ids, timestamps and event types on-chain."""

    def setUp(self):
        self.chain = InMemoryChain()

    def test_a_metadata_key_carrying_content_is_refused(self):
        for key in ("text", "contract_text", "clauses", "excerpt", "evidence", "messages"):
            with self.assertRaises(OnChainPayloadRejected, msg=key):
                self.chain.anchor_document(HASH_A, DocType.ORIGINAL, ["p"], metadata={key: "x"})

    def test_content_keys_are_matched_case_insensitively(self):
        with self.assertRaises(OnChainPayloadRejected):
            self.chain.anchor_document(HASH_A, DocType.ORIGINAL, ["p"],
                                       metadata={"Contract_Text": "x"})

    def test_an_oversized_metadata_value_is_refused(self):
        """The realistic failure: a convenience field grows until clause text
        is riding along inside it."""
        ok = "x" * MAX_METADATA_VALUE_CHARS
        self.chain.anchor_document(HASH_A, DocType.ORIGINAL, ["p"], metadata={"note": ok})
        with self.assertRaises(OnChainPayloadRejected) as ctx:
            self.chain.anchor_document(HASH_B, DocType.ORIGINAL, ["p"],
                                       metadata={"note": ok + "x"})
        self.assertIn("invariant 3", str(ctx.exception))

    def test_a_non_hash_document_hash_is_refused(self):
        for bad in ("not-a-hash", "0xabc", "aa" * 32, "", None, 12):
            with self.assertRaises(OnChainPayloadRejected, msg=repr(bad)):
                self.chain.anchor_document(bad, DocType.ORIGINAL, ["p"])

    def test_a_display_name_is_refused_as_a_party(self):
        with self.assertRaises(OnChainPayloadRejected) as ctx:
            self.chain.anchor_document(
                HASH_A, DocType.ORIGINAL,
                ["Ines Trabelsi — Atelier Trabelsi (menuiserie), Tunis, Tunisia"],
            )
        self.assertIn("pseudonymous", str(ctx.exception))

    def test_at_least_one_party_is_required(self):
        with self.assertRaises(OnChainPayloadRejected):
            self.chain.anchor_document(HASH_A, DocType.ORIGINAL, [])

    def test_a_free_text_event_type_is_refused(self):
        with self.assertRaises(ValueError):
            self.chain.attest_event("k1", "the supplier was late again",
                                    HASH_A, "pseudo_a")

    def test_a_non_string_metadata_value_is_refused(self):
        with self.assertRaises(OnChainPayloadRejected):
            self.chain.anchor_document(HASH_A, DocType.ORIGINAL, ["p"],
                                       metadata={"count": 5})


class Anchoring(unittest.TestCase):
    def setUp(self):
        self.chain = InMemoryChain()

    def test_anchor_returns_a_doc_id_and_tx_hash(self):
        rec = self.chain.anchor_document(HASH_A, DocType.ORIGINAL, ["pseudo_a"],
                                         metadata={"contract_id": "k1"})
        self.assertEqual(rec.doc_id, "doc_0000")
        self.assertTrue(rec.tx_hash.startswith("0x"))
        self.assertEqual(rec.document_hash, HASH_A)
        self.assertIsNone(rec.parent_doc_id)
        self.assertIsNotNone(rec.timestamp.tzinfo)

    def test_a_parent_doc_id_must_have_been_anchored(self):
        with self.assertRaises(ChainError):
            self.chain.anchor_document(HASH_B, DocType.SIGNED, ["p"],
                                       parent_doc_id="doc_9999")

    def test_a_parent_link_is_recorded(self):
        first = self.chain.anchor_document(HASH_A, DocType.ORIGINAL, ["p"],
                                           metadata={"contract_id": "k1"})
        second = self.chain.anchor_document(HASH_B, DocType.SIGNED, ["p"],
                                            parent_doc_id=first.doc_id,
                                            metadata={"contract_id": "k1"})
        self.assertEqual(second.parent_doc_id, first.doc_id)

    def test_records_are_immutable(self):
        rec = self.chain.anchor_document(HASH_A, DocType.ORIGINAL, ["p"])
        with self.assertRaises(Exception):
            rec.document_hash = HASH_B

    def test_the_same_document_can_be_anchored_twice_with_distinct_ids(self):
        """Re-anchoring is a real event (two parties, two moments), not an error
        for the chain to dedupe."""
        a = self.chain.anchor_document(HASH_A, DocType.ORIGINAL, ["p"])
        b = self.chain.anchor_document(HASH_A, DocType.ORIGINAL, ["p"])
        self.assertNotEqual(a.doc_id, b.doc_id)


class History(unittest.TestCase):
    def setUp(self):
        self.chain = InMemoryChain()
        self.chain.anchor_document(HASH_A, DocType.ORIGINAL, ["pa"], metadata={"contract_id": "k1"})
        self.chain.attest_event("k1", EventType.OBLIGATION_PERFORMED, HASH_B, "pa")
        self.chain.anchor_document(HASH_C, DocType.SIGNED, ["pa"], parent_doc_id="doc_0000",
                                   metadata={"contract_id": "k1"})
        self.chain.attest_event("k1", EventType.DISPUTE_OPENED, HASH_A, "pb")
        # a different contract, which must never appear in k1's history
        self.chain.anchor_document(HASH_B, DocType.ORIGINAL, ["pc"], metadata={"contract_id": "k2"})
        self.chain.attest_event("k2", EventType.DISPUTE_OPENED, HASH_C, "pc")

    def test_history_is_scoped_to_one_contract(self):
        history = self.chain.fetch_history("k1")
        self.assertEqual(len(history), 4)
        for item in history:
            cid = getattr(item, "contract_id", None) or item.metadata.get("contract_id")
            self.assertEqual(cid, "k1")

    def test_history_is_totally_ordered_even_on_identical_timestamps(self):
        """In-memory writes can share a timestamp; the sequence must still be
        unambiguous, because the ordering is the evidence."""
        history = self.chain.fetch_history("k1")
        kinds = [type(i).__name__ for i in history]
        self.assertEqual(
            kinds, ["AnchorRecord", "AttestationRecord", "AnchorRecord", "AttestationRecord"]
        )
        stamps = [i.timestamp for i in history]
        self.assertEqual(stamps, sorted(stamps))

    def test_latest_anchor_ignores_attestations_and_other_contracts(self):
        latest = self.chain.fetch_latest_anchor("k1")
        self.assertIsInstance(latest, AnchorRecord)
        self.assertEqual(latest.document_hash, HASH_C)

    def test_unknown_contract_has_empty_history(self):
        self.assertEqual(self.chain.fetch_history("nope"), [])
        self.assertIsNone(self.chain.fetch_latest_anchor("nope"))


class FetchContractAndTamperDetection(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.store = JsonFileStore(self.dir.name)
        self.chain = InMemoryChain()
        self.resolver = ContractResolver(self.chain, self.store)

        self.contract = ContractObject(
            contract_id="k1",
            parties=[Party("p_owner", "msme_owner", "Atelier Trabelsi", "pseudo_a")],
        )
        add_version(
            self.contract, doc_type=DocType.ORIGINAL, text_hash=HASH_A, effective_from=JAN,
            clauses=[Clause(clause_id="", type="delivery", language=Language.FR,
                            text="Livraison sous un delai raisonnable.")],
        )
        self.store.save(self.contract)
        self.chain.anchor_document(HASH_A, DocType.ORIGINAL, ["pseudo_a"],
                                   metadata={"contract_id": "k1"})

    def tearDown(self):
        self.dir.cleanup()

    def test_fetch_contract_returns_the_verified_version(self):
        resolved = self.resolver.fetch_contract("k1")
        self.assertEqual(resolved.version.text_hash, HASH_A)
        self.assertTrue(resolved.verified)
        self.assertEqual(resolved.anchor.document_hash, HASH_A)

    def test_fetch_contract_follows_the_latest_anchor(self):
        add_version(self.contract, doc_type=DocType.SIGNED, text_hash=HASH_C,
                    parent_version_id="v001", effective_from=MAR)
        self.store.save(self.contract)
        self.chain.anchor_document(HASH_C, DocType.SIGNED, ["pseudo_a"],
                                   parent_doc_id="doc_0000", metadata={"contract_id": "k1"})
        self.assertEqual(self.resolver.fetch_contract("k1").version.text_hash, HASH_C)

    def test_altered_storage_raises_rather_than_returning_terms(self):
        """The point of the whole system. Tampering happens *around* the store,
        so this edits the JSON on disk directly — which is what a real tamper
        looks like.
        """
        path = Path(self.dir.name) / "k1.json"
        raw = json.loads(path.read_text())
        raw["versions"][0]["text_hash"] = HASH_B      # text swapped after anchoring
        path.write_text(json.dumps(raw))

        with self.assertRaises(TamperDetected) as ctx:
            self.resolver.fetch_contract("k1")
        self.assertIn("tamper", str(ctx.exception).lower())

    def test_a_deleted_version_is_also_tamper(self):
        path = Path(self.dir.name) / "k1.json"
        raw = json.loads(path.read_text())
        raw["versions"] = []
        path.write_text(json.dumps(raw))
        with self.assertRaises(TamperDetected):
            self.resolver.fetch_contract("k1")

    def test_tamper_is_an_exception_not_a_flag(self):
        """A boolean on an otherwise-successful result would let a caller who
        forgets to check serve altered terms."""
        import inspect
        source = inspect.getsource(self.resolver.fetch_contract)
        self.assertIn("raise TamperDetected", source)

    def test_an_unanchored_contract_cannot_be_fetched(self):
        with self.assertRaises(ChainError):
            self.resolver.fetch_contract("never-anchored")

    def test_verify_version_answers_yes_and_no(self):
        self.assertTrue(self.resolver.verify_version("k1", "v001"))
        add_version(self.contract, doc_type=DocType.HARDENED, text_hash=HASH_B,
                    parent_version_id="v001")
        self.store.save(self.contract)
        # a hardened proposal is deliberately never anchored
        self.assertFalse(self.resolver.verify_version("k1", "v002"))

    def test_verify_unknown_version_raises(self):
        with self.assertRaises(ChainError):
            self.resolver.verify_version("k1", "v999")


if __name__ == "__main__":
    unittest.main(verbosity=2)
