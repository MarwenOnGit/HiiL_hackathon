"""Agent 1, Agent 2, retrieval, and the guards that protect the invariants
which cannot be expressed as a type.
"""

import re
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from blockchain_client import InMemoryChain
from config import load_batna_reference, load_profile
from core.schemas import Party
from core.taxonomy import CorpusType, FactStatus, Language, RiskKind
from hardening_agent import harden
from hardening_agent.ingest import PdfIngest, PlainTextIngest, detect_language, get_engine
from rag import InMemoryIndex, Retriever
from rag.chunker import Chunk, chunk_article_file
from rag.retriever import MIN_COVERAGE, Mode
from resolution_agent import resolve
from resolution_agent.entitlement_estimator import estimate
from resolution_agent.fact_reconciler import Statement, reconcile, summarise

JAN = datetime(2026, 1, 15, tzinfo=timezone.utc)
JUN = datetime(2026, 6, 10, tzinfo=timezone.utc)
SEED = ROOT / "seed" / "contract_supply_defective.txt"

PARTIES = [
    Party("p_buyer", "msme_owner", "Atelier Trabelsi", "pseudo_buyer"),
    Party("p_supplier", "counterparty", "Bois du Nord", "pseudo_supplier"),
]


def run_hardening(retriever=None, chain=None):
    return harden(
        text=SEED.read_text(encoding="utf-8"),
        contract_id="c1",
        parties=PARTIES,
        profile=load_profile("supply"),
        retriever=retriever or Retriever(InMemoryIndex()),
        chain=chain,
        effective_from=JAN,
    )


class NeverFabricateLaw(unittest.TestCase):
    """Invariant 7, from three angles."""

    def test_the_profile_asserts_no_legal_content(self):
        """The checklist may say a clause is missing; only the corpus may say
        what the law makes of that.

        A `verified_article:` pin is the one permitted exception, and it is a
        different kind of statement: it NAMES an article for retrieval to fetch,
        and the text still comes from the corpus. It never carries legal wording
        of its own, so a wrong pin is visible to anyone who reads the excerpt.
        """
        lines = (ROOT / "config" / "profiles" / "supply.yaml").read_text(
            encoding="utf-8"
        ).splitlines()
        raw = "\n".join(
            line for line in lines
            if not line.lstrip().startswith("#")
            and not line.lstrip().startswith("verified_article:")
        ).lower()
        for banned in (" coc ", "article ", "art.", "ohada", "code des obligations"):
            self.assertNotIn(banned, raw, f"profile asserts law: {banned!r}")

    def test_every_pinned_article_resolves_in_the_corpus(self):
        """A pin that does not resolve degrades silently to lexical search,
        which is exactly what pinning exists to avoid. Fail loudly instead.

        Skipped when no corpus is loaded — an empty corpus is a valid state.
        """
        import yaml
        from rag import InMemoryIndex, Retriever
        from runtime import load_corpus
        from core.taxonomy import CorpusType, Language

        index = InMemoryIndex()
        load_corpus(index)
        if len(index) == 0:
            self.skipTest("no corpus loaded; pins cannot be checked")

        retriever = Retriever(index)
        profile = yaml.safe_load(
            (ROOT / "config" / "profiles" / "supply.yaml").read_text(encoding="utf-8")
        )
        pins = [
            entry["verified_article"]
            for group in ("ambiguous_terms", "asymmetric_patterns", "required_clauses")
            for entry in profile.get(group, [])
            if entry.get("verified_article")
        ]
        self.assertTrue(pins, "no pins configured")
        for ref in pins:
            hit = retriever.by_article_ref(
                ref, language=Language.FR,
                corpus_types=[CorpusType.NORMATIVE, CorpusType.CLAUSE_LIBRARY],
            )
            self.assertIsNotNone(
                hit, f"pinned {ref!r} is not in the corpus — the finding would "
                     "silently fall back to lexical search",
            )

    def test_every_recommendation_is_ungrounded_when_the_corpus_is_empty(self):
        report = run_hardening()
        self.assertGreater(len(report.recommendations), 0)
        for recommendation in report.recommendations:
            self.assertEqual(recommendation.legal_basis, [])
            self.assertIsNotNone(recommendation.no_legal_basis)
        self.assertTrue(report.as_dict()["grounding"]["all_ungrounded"])

    def test_the_empty_result_says_why(self):
        result = Retriever(InMemoryIndex()).retrieve(
            "delai de livraison", mode=Mode.NORMATIVE, language=Language.FR
        )
        self.assertFalse(result.grounded)
        self.assertIn("empty", result.empty.reason)
        self.assertIn("pas encore chargé", result.empty.message_fr)

    def test_a_chunk_sharing_nothing_is_not_a_citation(self):
        index = InMemoryIndex()
        index.add([Chunk("x::1", "Le transport maritime de marchandises diverses.",
                         "x", "art. 1", CorpusType.NORMATIVE, Language.FR)])
        result = Retriever(index).retrieve(
            "conformite des panneaux", mode=Mode.NORMATIVE, language=Language.FR
        )
        self.assertFalse(result.grounded)
        self.assertRegex(result.empty.reason, r"meaningful term|selective")

    def test_a_partial_overlap_below_the_floor_is_not_a_citation(self):
        """The dangerous case: the chunk genuinely shares a word, so lexical
        scoring ranks it first — and it is still not a legal basis."""
        index = InMemoryIndex()
        index.add([Chunk("x::1", "Le delai de paiement est fixe librement par les parties.",
                         "x", "art. 9", CorpusType.NORMATIVE, Language.FR)])
        result = Retriever(index).retrieve(
            "delai livraison conformite", mode=Mode.NORMATIVE, language=Language.FR
        )
        self.assertFalse(result.grounded, "a one-in-three term overlap became a legal basis")
        self.assertRegex(result.empty.reason, r"floor|selective term")

    def test_an_unenforceable_flag_cannot_exist_without_a_citation(self):
        from core.schemas import RiskFlag
        with self.assertRaises(ValueError):
            RiskFlag(kind=RiskKind.UNENFORCEABLE, detail="contradicts a mandatory rule")


class BannedPhrasing(unittest.TestCase):
    def test_force_of_a_final_judgment_appears_nowhere(self):
        """Unverified for Tunisia. The approved wording is 'binding settlement
        enforceable between the parties'."""
        banned = [
            "force of a final judgment", "force de chose jugee",
            "force de chose jugée", "autorite de la chose jugee",
            "autorité de la chose jugée",
        ]
        checked = 0
        for path in list(ROOT.rglob("*.py")) + list(ROOT.rglob("*.yaml")) + list(ROOT.rglob("*.md")):
            # The corpus is excluded on purpose. The ban is on OUR copy
            # describing a settlement that way — the statute itself legitimately
            # uses the phrase ("jugement passé en force de chose jugée"), and
            # censoring the source text would corrupt the very thing citations
            # are checked against.
            #
            # core/grounding.py is excluded for the same reason as this file:
            # it is the blocklist that REJECTS the phrase in generated text, so
            # it has to be able to spell what it forbids. That exemption is not
            # a hole — GeneratedTextIsChecked in test_llm.py proves the
            # blocklist actually rejects the phrase, which is the behaviour this
            # string search is a proxy for.
            if (
                "__pycache__" in str(path)
                or path.name == "test_agents.py"
                or path.as_posix().endswith("core/grounding.py")
                or "rag/corpus/" in path.as_posix()
            ):
                continue
            text = path.read_text(encoding="utf-8", errors="replace").lower()
            checked += 1
            for phrase in banned:
                self.assertNotIn(phrase, text, f"{path.name} uses banned phrasing {phrase!r}")
        self.assertGreater(checked, 10)


class RetrievalFiltering(unittest.TestCase):
    def setUp(self):
        self.index = InMemoryIndex()
        self.index.add([
            Chunk("fr::1", "Le vendeur doit delivrer la chose dans le delai de livraison convenu.",
                  "SYNTHETIC-FR", "art. 1", CorpusType.NORMATIVE, Language.FR),
            Chunk("ar::1", "على البائع تسليم الشيء في أجل التسليم المتفق عليه.",
                  "SYNTHETIC-AR", "الفصل 1", CorpusType.NORMATIVE, Language.AR),
            Chunk("doc::1", "Les juridictions commerciales statuent en moyenne sur le delai de livraison.",
                  "SYNTHETIC-DOCTRINE", "p. 4", CorpusType.EVALUATIVE, Language.FR),
        ])
        self.retriever = Retriever(self.index)

    def test_language_filter_excludes_the_other_language(self):
        result = self.retriever.retrieve("delai de livraison", mode=Mode.NORMATIVE,
                                         language=Language.FR)
        self.assertTrue(result.grounded)
        for hit in result.hits:
            self.assertIs(hit.language, Language.FR)

    def test_normative_and_evaluative_never_share_a_result_set(self):
        norm = self.retriever.retrieve("delai de livraison", mode=Mode.NORMATIVE,
                                       language=Language.FR)
        evalu = self.retriever.retrieve("delai de livraison", mode=Mode.EVALUATIVE,
                                        language=Language.FR)
        self.assertTrue(all(h.corpus_type is CorpusType.NORMATIVE for h in norm.hits))
        self.assertTrue(all(h.corpus_type is CorpusType.EVALUATIVE for h in evalu.hits))

    def test_an_unfiltered_search_is_refused(self):
        with self.assertRaises(ValueError):
            self.index.search("x", language=Language.FR, corpus_types=[], limit=3)

    def test_a_hit_becomes_a_legal_ref_carrying_its_source(self):
        result = self.retriever.retrieve("delai de livraison", mode=Mode.NORMATIVE,
                                         language=Language.FR)
        ref = result.legal_refs()[0]
        self.assertEqual(ref.source_doc, "SYNTHETIC-FR")
        self.assertEqual(ref.article_ref, "art. 1")
        self.assertTrue(ref.excerpt)

    def test_articles_chunk_at_their_boundaries(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "coc.txt"
            path.write_text("Preambule du texte.\n\nArticle 564\nPremier.\n\n"
                            "Article 565\nSecond.\n", encoding="utf-8")
            chunks = chunk_article_file(path, "SYNTH", Language.FR, CorpusType.NORMATIVE)
        self.assertEqual([c.article_ref for c in chunks],
                         ["(preamble)", "art. 564", "art. 565"])
        self.assertIn("Premier", chunks[1].text)
        self.assertNotIn("Second", chunks[1].text)


class Agent1Hardening(unittest.TestCase):
    def setUp(self):
        self.report = run_hardening(chain=InMemoryChain())
        self.data = self.report.as_dict()

    def test_clauses_are_classified_by_subject(self):
        got = [c["type"] for c in self.data["clauses"]]
        self.assertEqual(got, ["parties", "subject", "price", "delivery_deadline",
                               "payment_terms", "conformity", "duration_termination"])

    def test_a_delivery_clause_without_a_number_is_still_a_gap(self):
        """The contract talks about delivery but fixes no deadline. Treating
        classification as presence used to delete this finding."""
        ids = [g["requirement_id"] for g in self.data["gaps"]]
        self.assertIn("delivery_deadline", ids)

    def test_the_expected_gaps_are_found_and_nothing_else(self):
        self.assertEqual(
            sorted(g["requirement_id"] for g in self.data["gaps"]),
            ["delivery_deadline", "dispute_resolution", "force_majeure",
             "late_delivery", "late_payment"],
        )

    def test_ambiguous_terms_are_flagged(self):
        details = " ".join(
            f["detail"] for c in self.data["clauses"] for f in c["risk_flags"]
        )
        for term in ("delai raisonnable", "qualite convenue", "prix du marche"):
            self.assertIn(term, details)

    def test_asymmetry_is_flagged_but_never_auto_rewritten(self):
        asym = [
            r for r in self.data["recommendations"] if r["risk_kind"] == "asymmetric"
        ]
        self.assertTrue(asym)
        for recommendation in asym:
            self.assertFalse(recommendation["applied"])
            self.assertIn("information", recommendation["proposed"].lower())

    def test_the_payment_obligation_belongs_to_the_buyer(self):
        """'paiement a 30 jours a compter de la livraison' once made the
        supplier the obligor, because 'livraison' matched first."""
        pay = [o for o in self.data["obligations"] if "payer" in o["action"]]
        self.assertEqual(len(pay), 1)
        self.assertEqual(pay[0]["obligor"], "p_buyer")
        self.assertEqual(pay[0]["trigger"], "30 jours")

    def test_obligations_are_not_duplicated(self):
        keys = [(o["obligor"], o["action"]) for o in self.data["obligations"]]
        self.assertEqual(len(keys), len(set(keys)))

    def test_the_original_is_anchored_before_analysis(self):
        self.assertIsNotNone(self.data["anchor"]["doc_id"])
        self.assertTrue(self.data["anchor"]["tx_hash"].startswith("0x"))

    def test_findings_are_reproducible_across_runs(self):
        again = run_hardening(chain=InMemoryChain()).as_dict()
        self.assertEqual(self.data["gaps"], again["gaps"])
        self.assertEqual([c["type"] for c in self.data["clauses"]],
                         [c["type"] for c in again["clauses"]])
        self.assertEqual(self.data["text_hash"], again["text_hash"])

    def test_the_analysis_is_attested_on_chain_with_a_fingerprint(self):
        """After analysis the contract has two on-chain facts: the original
        anchor and the audit itself. Only a hash of the findings rides along."""
        chain = InMemoryChain()
        report = run_hardening(chain=chain)
        data = report.as_dict()
        self.assertTrue(data["analysis_anchor"]["attested"])
        self.assertTrue(data["analysis_anchor"]["tx_hash"].startswith("0x"))
        self.assertTrue(data["analysis_anchor"]["findings_hash"].startswith("0x"))
        self.assertEqual(data["analysis_anchor"]["total"], len(report.recommendations))
        from blockchain_client.client import EventType
        events = [e for e in chain.fetch_history("c1")
                  if type(e).__name__ == "AttestationRecord"]
        self.assertEqual(len(events), 1)
        self.assertIs(events[0].event_type, EventType.ANALYSIS_COMPLETED)
        self.assertEqual(events[0].payload_hash,
                         data["analysis_anchor"]["findings_hash"])


class IngestEngines(unittest.TestCase):
    def test_the_engine_is_chosen_by_file_type(self):
        self.assertIsInstance(get_engine(Path("a.txt")), PlainTextIngest)
        self.assertIsInstance(get_engine(Path("a.pdf")), PdfIngest)

    def test_an_unknown_type_is_refused(self):
        with self.assertRaises(ValueError):
            get_engine(Path("a.docx"))

    def test_language_is_detected_per_clause_not_per_document(self):
        self.assertIs(detect_language("delai de livraison convenu"), Language.FR)
        self.assertIs(detect_language("أجل التسليم المتفق عليه"), Language.AR)


class Agent2Resolution(unittest.TestCase):
    def setUp(self):
        self.chain = InMemoryChain()
        self.hardening = run_hardening(chain=self.chain)
        self.report = resolve(
            contract=self.hardening.contract, dispute_id="d1", event_date=JUN,
            claims=["Livraison de juin non conforme"],
            statements=[
                Statement("p_buyer", "La livraison de juin contenait 12 panneaux fissures", ["photo_001"]),
                Statement("p_supplier", "La livraison de juin ne contenait pas de panneaux fissures"),
                Statement("p_buyer", "Le paiement de juin n a pas ete effectue"),
                Statement("p_supplier", "Le paiement de juin n a pas ete effectue"),
                Statement("p_supplier", "Les panneaux ont ete stockes dehors par l acheteur"),
            ],
            obligations=self.hardening.obligations,
            contested=True, claim_amount=1800.0, chain=self.chain,
        )
        self.data = self.report.as_dict()

    def test_a_flat_contradiction_is_disputed_not_agreed(self):
        """'contenait 12 panneaux' vs 'ne contenait pas de panneaux' was once
        AGREED, because tokenisation stripped 'ne' and 'pas' as stopwords."""
        facts = self.data["fact_ledger"]["facts"]
        contested = next(f for f in facts if "12 panneaux" in f["fact"])
        self.assertEqual(contested["status"], "disputed")

    def test_a_mutual_admission_is_agreed(self):
        facts = self.data["fact_ledger"]["facts"]
        paid = next(f for f in facts if "paiement" in f["fact"])
        self.assertEqual(paid["status"], "agreed")

    def test_a_one_sided_claim_with_no_evidence_is_unsupported(self):
        facts = self.data["fact_ledger"]["facts"]
        stored = next(f for f in facts if "stockes dehors" in f["fact"])
        self.assertEqual(stored["status"], "unsupported")

    def test_facts_map_to_stable_clause_ids(self):
        facts = self.data["fact_ledger"]["facts"]
        self.assertTrue(any(f["clause_ids"] for f in facts))
        for fact in facts:
            for cid in fact["clause_ids"]:
                self.assertRegex(cid, r"^cl_\d{4}$")

    def test_the_governing_version_is_chosen_by_event_date(self):
        self.assertIn("date des faits", self.data["governing_version"]["explanation"])
        self.assertEqual(self.data["governing_version"]["version_id"], "v001")

    def test_nothing_is_binding_and_a_lawyer_gate_is_set(self):
        negotiation = self.data["negotiation"]
        self.assertFalse(negotiation["binding"])
        self.assertTrue(negotiation["lawyer_review_required"])
        self.assertIn("signé", negotiation["human_gate_note"])

    def test_non_monetary_options_are_offered_first(self):
        options = self.data["settlement_options"]
        self.assertFalse(options[0]["monetary"])
        self.assertGreaterEqual(sum(1 for o in options if not o["monetary"]), 3)

    def test_the_dispute_is_attested_on_chain(self):
        """Proof that resolution was attempted before court."""
        self.assertIsNotNone(self.data["anchor"]["attest_tx"])

    def test_agent2_never_reparses_the_contract(self):
        """Invariant 5: it reads the object Agent 1 built."""
        source = "".join(
            p.read_text(encoding="utf-8")
            for p in (ROOT / "resolution_agent").glob("*.py")
        )
        for forbidden in ("segment(", "PdfReader", "from hardening_agent"):
            self.assertNotIn(forbidden, source)


class BatnaPosture(unittest.TestCase):
    def test_figures_are_a_range_and_carry_their_source(self):
        est = estimate(contested=True, claim_amount=1800.0).as_dict()
        self.assertLess(est["duration_days"]["low"], est["duration_days"]["high"])
        self.assertIn("World Bank", est["source"])
        self.assertIn("first-instance", est["scope"].lower())

    def test_both_parties_receive_an_identical_estimate(self):
        """Posture rule 2: no claimant view and no respondent view."""
        a = estimate(contested=True, claim_amount=1800.0).as_dict()
        b = estimate(contested=True, claim_amount=1800.0).as_dict()
        self.assertEqual(a, b)

    def test_an_uncontested_debt_does_not_reuse_the_ordinary_figures(self):
        """Quoting ordinary-procedure numbers at an uncontested debt oversells
        settlement."""
        est = estimate(contested=False, claim_amount=1800.0).as_dict()
        self.assertIsNone(est["duration_days"])
        self.assertIsNone(est["cost_percent"])
        self.assertIn("injonction de payer", est["note"])
        self.assertTrue(any("aucune source" in c.lower() for c in est["caveats"]))

    def test_the_reference_figures_live_in_config_not_in_code(self):
        reference = load_batna_reference()["reference"]
        self.assertEqual(reference["duration_days"], 565)
        self.assertEqual(reference["cost_percent_of_claim"], 21.8)
        source = (ROOT / "resolution_agent" / "entitlement_estimator.py").read_text()
        self.assertNotIn("565", source)
        self.assertNotIn("21.8", source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
