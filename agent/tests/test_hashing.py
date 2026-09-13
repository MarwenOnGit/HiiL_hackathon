"""Keccak-256 and the canonical byte form.

Two systems hashing "the same document" disagree over encoding and whitespace
as easily as over the algorithm, so both halves are pinned here.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.hashing import canonical_bytes, content_hash, keccak256


class OfficialVectors(unittest.TestCase):
    """If these fail, the implementation is not Keccak-256 and nothing that
    depends on matching Solidity can be trusted."""

    VECTORS = {
        b"": "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        b"abc": "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
        b"testing": "5f16f4c7f149ac4f9510d9cf8cf384038ad348b3bcdc01915f95de12df9d1b02",
        b"hello": "1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8",
    }

    def test_matches_the_published_vectors(self):
        for data, expected in self.VECTORS.items():
            self.assertEqual(keccak256(data).hex(), expected, f"for {data!r}")

    def test_it_is_keccak_not_nist_sha3(self):
        """SHA3-256("") is a different digest. Ethereum uses the original
        padding, and confusing the two is the classic mistake here."""
        sha3_empty = "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a"
        self.assertNotEqual(keccak256(b"").hex(), sha3_empty)

    def test_digest_is_32_bytes(self):
        self.assertEqual(len(keccak256(b"anything")), 32)


class CanonicalForm(unittest.TestCase):
    """Each of these is a real way two systems disagree about one document."""

    def test_line_endings_do_not_change_the_hash(self):
        self.assertEqual(content_hash("a\r\nb"), content_hash("a\nb"))
        self.assertEqual(content_hash("a\rb"), content_hash("a\nb"))

    def test_trailing_whitespace_does_not_change_the_hash(self):
        self.assertEqual(content_hash("a  \nb\t"), content_hash("a\nb"))

    def test_surrounding_blank_space_does_not_change_the_hash(self):
        self.assertEqual(content_hash("\n\n a\nb \n\n"), content_hash("a\nb"))

    def test_unicode_composition_does_not_change_the_hash(self):
        composed = "délai"          # é as one codepoint
        decomposed = "délai"        # e + combining acute
        self.assertNotEqual(composed, decomposed)
        self.assertEqual(content_hash(composed), content_hash(decomposed))

    def test_real_differences_still_change_the_hash(self):
        self.assertNotEqual(content_hash("30 jours"), content_hash("60 jours"))
        self.assertNotEqual(content_hash("a\nb"), content_hash("ab"))

    def test_output_shape(self):
        digest = content_hash("x")
        self.assertTrue(digest.startswith("0x"))
        self.assertEqual(len(digest), 66)

    def test_canonical_bytes_are_utf8(self):
        self.assertEqual(canonical_bytes("é"), "é".encode("utf-8"))


class CrossImplementationVector(unittest.TestCase):
    """The vector published in the cross-team request document.

    If this changes, the document must change with it, or the chain owner will
    verify against a stale value.
    """

    INPUT = "CONTRAT DE FOURNITURE\nArticle 1 - Objet\nLivraison de panneaux."
    EXPECTED = "0xb688abbdf2658d16a5d8400bc131476e33ceedc03ecf2d97f5639eaf4b94f912"

    def test_the_published_vector_still_holds(self):
        actual = content_hash(self.INPUT)
        self.assertEqual(
            actual, self.EXPECTED,
            "the published cross-team vector no longer matches — update "
            "docs/cross-team/2026-09-12-chain-interface-v3-request.md",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)


class PartyPseudonyms(unittest.TestCase):
    """Deferred identity: stable and distinct, explicitly not authentication."""

    def test_the_same_party_always_gets_the_same_pseudonym(self):
        from core.identity import derive_pseudonym
        self.assertEqual(derive_pseudonym("p_buyer"), derive_pseudonym("p_buyer"))

    def test_different_parties_get_different_pseudonyms(self):
        from core.identity import derive_pseudonym
        self.assertNotEqual(derive_pseudonym("p_buyer"), derive_pseudonym("p_supplier"))

    def test_the_salt_changes_the_pseudonym(self):
        from core.identity import derive_pseudonym
        self.assertNotEqual(
            derive_pseudonym("p_buyer", salt="a"),
            derive_pseudonym("p_buyer", salt="b"),
        )

    def test_a_pseudonym_carries_no_whitespace_so_the_chain_accepts_it(self):
        from core.identity import derive_pseudonym
        from blockchain_client.client import validate_parties
        validate_parties([derive_pseudonym("p_buyer")])

    def test_the_identity_model_admits_it_does_not_authenticate(self):
        from core.identity import IDENTITY_MODEL
        self.assertEqual(IDENTITY_MODEL["mode"], "deferred")
        self.assertFalse(IDENTITY_MODEL["authenticates_parties"])

    def test_an_empty_party_id_is_refused(self):
        from core.identity import derive_pseudonym
        with self.assertRaises(ValueError):
            derive_pseudonym("")
