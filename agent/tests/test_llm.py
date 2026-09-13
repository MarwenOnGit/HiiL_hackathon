"""The model layer: system prompts, the grounding check, and degradation.

The architecture here is "a model narrates, it never sources". These tests pin
the three properties that claim depends on:

- **The narrator cannot change the audit.** Findings, obligations, hashes and
  anchors are identical whether a model ran or not. A model that could move a
  number would make the deterministic pipeline pointless.
- **The narrator cannot see the contract.** It is handed the digest and the
  retrieved chunks. If contract text ever reaches the prompt, the token bill
  and the off-chain storage promise both change silently.
- **Invented law is discarded, not repaired.** `GeneratedTextIsChecked` is also
  the compensating test for the exemption `test_agents.BannedPhrasing` grants
  `core/grounding.py`: the blocklist is allowed to spell the forbidden phrase
  precisely because these tests prove it rejects it.

No test here reaches the network. The model is `ScriptedLLMClient`, and the one
test that exercises the HTTP shape substitutes a fake `urlopen`.
"""

from __future__ import annotations

import json
import unittest
from datetime import datetime, timezone
from pathlib import Path

from blockchain_client import InMemoryChain
from config import load_llm_settings
from config.prompts import AGENTS, LANGUAGES, system_prompt, user_prompt
from core import grounding
from core.llm_client import (
    LLMConfigError,
    LLMUnavailable,
    NullLLMClient,
    OpenRouterClient,
    ScriptedLLMClient,
    build_client,
)
from core.schemas import Party
from config import load_profile
from hardening_agent import harden
from narration import narrate
from rag import InMemoryIndex, Retriever

JAN = datetime(2026, 1, 15, tzinfo=timezone.utc)
PARTIES = [
    Party("p_buyer", "msme_owner", "Atelier Trabelsi", "pseudo_buyer"),
    Party("p_supplier", "counterparty", "Bois du Nord", "pseudo_supplier"),
]
SEED = Path(__file__).resolve().parent.parent / "seed" / "contract_supply_defective.txt"
CITATIONS = [{"source_doc": "cocFR", "article_ref": "Article 564",
              "excerpt": "Le vendeur est tenu de garantir la chose vendue."}]


def _harden(llm=None, contract_id="c_llm"):
    return harden(
        text=SEED.read_text(encoding="utf-8"),
        contract_id=contract_id,
        parties=PARTIES,
        profile=load_profile("supply"),
        retriever=Retriever(InMemoryIndex()),
        chain=InMemoryChain(),
        effective_from=JAN,
        llm=llm,
    )


class GeneratedTextIsChecked(unittest.TestCase):
    """Invariant 7 at the boundary where a model meets a prompt."""

    def test_an_invented_article_is_rejected(self):
        verdict = grounding.check("Selon l'article 1107 du COC, la clause est nulle.", CITATIONS)
        self.assertFalse(verdict.ok)
        self.assertEqual(verdict.unsupported_articles, ["1107"])

    def test_a_retrieved_article_is_accepted(self):
        self.assertTrue(grounding.check("L'article 564 impose une garantie.", CITATIONS).ok)

    def test_the_banned_settlement_phrasing_is_rejected(self):
        """The compensating test for test_agents.BannedPhrasing's exemption of
        core/grounding.py. Every spelling in the blocklist must actually be
        caught, or the exemption would be hiding a hole."""
        for spelling in grounding.BANNED_PHRASES["force of a final judgment"]:
            with self.subTest(spelling=spelling):
                verdict = grounding.check(f"La transaction a {spelling} entre les parties.", CITATIONS)
                self.assertFalse(verdict.ok)
                self.assertIn("force of a final judgment", verdict.banned)

    def test_accented_and_unaccented_spellings_are_both_caught(self):
        self.assertFalse(grounding.check("force de chose jugée", CITATIONS).ok)
        self.assertFalse(grounding.check("FORCE DE CHOSE JUGEE", CITATIONS).ok)

    def test_plain_numbers_are_not_mistaken_for_citations(self):
        """A delay and an amount are not legal references. If they tripped the
        check, every grounded narrative would be discarded."""
        text = "Le délai est de 30 jours et le montant de 1800 TND pour 40 unités."
        self.assertTrue(grounding.check(text, CITATIONS).ok)

    def test_an_arabic_article_reference_is_detected(self):
        self.assertEqual(grounding.article_numbers("ينص الفصل 1107 على ما يلي"), {"1107"})
        self.assertFalse(grounding.check("ينص الفصل 1107 على ما يلي", CITATIONS).ok)

    def test_an_excerpt_that_quotes_its_own_heading_grounds_that_article(self):
        cites = [{"source_doc": "cocFR", "article_ref": "",
                  "excerpt": "Article 1458. La transaction est un contrat..."}]
        self.assertTrue(grounding.check("L'article 1458 définit la transaction.", cites).ok)


class SystemPrompts(unittest.TestCase):
    """Invariant 8: every language is data, and no language is a special case."""

    def test_every_agent_has_a_prompt_in_every_language(self):
        for agent in AGENTS:
            for language in LANGUAGES:
                with self.subTest(agent=agent, language=language):
                    self.assertGreater(len(system_prompt(agent, language)), 500)

    def test_both_agents_are_present(self):
        self.assertIn("hardening", AGENTS)
        self.assertIn("resolution", AGENTS)

    def test_an_unknown_language_falls_back_rather_than_raising(self):
        self.assertEqual(system_prompt("hardening", "zz"), system_prompt("hardening", "fr"))
        self.assertEqual(system_prompt("hardening", None), system_prompt("hardening", "fr"))

    def test_an_unknown_agent_raises(self):
        with self.assertRaises(KeyError):
            system_prompt("nonexistent")

    def test_no_prompt_spells_the_forbidden_settlement_phrasing(self):
        """Naming a phrase in a negative instruction is a reliable way to make
        a model produce it, so the prompts state the approved wording instead."""
        for agent in AGENTS:
            for language in LANGUAGES:
                with self.subTest(agent=agent, language=language):
                    self.assertEqual(grounding.banned_phrases(system_prompt(agent, language)), [])

    def test_the_guardrails_reach_every_agent(self):
        """A new surface cannot be added without the rules."""
        for agent in AGENTS:
            prompt = system_prompt(agent, "fr")
            self.assertIn("CITATIONS", prompt)
            self.assertIn("RÈGLES ABSOLUES", prompt)

    def test_an_empty_citation_block_says_so_rather_than_being_blank(self):
        """A blank block invites the model to fill the gap; a stated absence
        instructs it not to."""
        prompt = user_prompt(language="fr", data="x", citations=[])
        self.assertIn("aucun extrait juridique", prompt)


class Degradation(unittest.TestCase):
    """No key is a supported deployment, not a broken one."""

    def test_no_key_yields_the_null_client(self):
        self.assertIsInstance(build_client({"enabled": False}), NullLLMClient)

    def test_the_null_client_degrades_with_a_stated_reason(self):
        narrative = narrate(NullLLMClient(), agent="hardening", data="x", citations=CITATIONS)
        self.assertFalse(narrative.available)
        self.assertIn("no LLM backend configured", narrative.reason)
        self.assertTrue(narrative.as_dict()["rule_based"])

    def test_a_discarded_narrative_reports_why(self):
        client = ScriptedLLMClient(["Selon l'article 9999 du COC, tout est nul."])
        narrative = narrate(client, agent="hardening", data="x", citations=CITATIONS)
        self.assertFalse(narrative.available)
        self.assertIn("9999", narrative.reason)
        self.assertEqual(narrative.text, "")

    def test_a_narrator_that_explodes_cannot_fail_the_run(self):
        class Exploding:
            name = "exploding"

            def complete(self, *a, **k):
                raise RuntimeError("boom")

        narrative = narrate(Exploding(), agent="hardening", data="x", citations=CITATIONS)
        self.assertFalse(narrative.available)
        self.assertIn("boom", narrative.reason)

    def test_settings_report_disabled_without_a_key(self):
        import os
        saved = os.environ.pop("OPENROUTER_API_KEY", None)
        try:
            self.assertFalse(load_llm_settings()["enabled"])
        finally:
            if saved is not None:
                os.environ["OPENROUTER_API_KEY"] = saved


class NarratorCannotChangeTheAudit(unittest.TestCase):
    """The deterministic pipeline is the product; the model only reads it out."""

    def test_findings_are_identical_with_and_without_a_model(self):
        plain = _harden(llm=None, contract_id="c_plain")
        narrated = _harden(
            llm=ScriptedLLMClient(["Le contrat comporte plusieurs imprécisions."]),
            contract_id="c_narrated",
        )
        self.assertEqual(len(plain.gaps), len(narrated.gaps))
        self.assertEqual(len(plain.recommendations), len(narrated.recommendations))
        self.assertEqual(len(plain.obligations), len(narrated.obligations))
        self.assertEqual(
            [g.label for g in plain.gaps], [g.label for g in narrated.gaps]
        )

    def test_the_text_hash_is_unaffected_by_narration(self):
        """The narrative runs after anchoring. If it touched the hash, the
        fingerprint would no longer describe what was anchored."""
        plain = _harden(llm=None, contract_id="c_hash_a")
        narrated = _harden(llm=ScriptedLLMClient(["texte"]), contract_id="c_hash_b")
        self.assertEqual(
            plain.contract.version(plain.original_version_id).text_hash,
            narrated.contract.version(narrated.original_version_id).text_hash,
        )

    def test_only_flagged_clauses_are_quoted_and_only_in_part(self):
        """The document is never sent whole. A flagged clause is quoted up to
        MAX_CLAUSE_QUOTE so the narrative can name the wording at issue; a
        clause with no finding against it never travels at all.

        This is what keeps prompt size tracking the number of problems rather
        than the length of the contract — and it is the honest version of "the
        model does not see the contract", which is not quite true.
        """
        from hardening_agent.narrative import MAX_CLAUSE_QUOTE

        client = ScriptedLLMClient(["Résumé."])
        report = _harden(llm=client, contract_id="c_leak")
        self.assertTrue(client.calls, "the narrator was never called")
        sent = client.calls[0]["prompt"]

        flagged = {rec.clause_id for rec in report.recommendations}
        version = report.contract.version(report.original_version_id)
        unflagged = [c for c in version.clauses if c.clause_id not in flagged]
        self.assertTrue(unflagged, "seed contract should leave some clause unflagged")
        for clause in unflagged:
            body = " ".join(clause.text.split())
            self.assertNotIn(body[:80], sent, f"unflagged {clause.clause_id} was sent")

        # No quoted run of contract text exceeds the cap.
        for clause in version.clauses:
            body = " ".join(clause.text.split())
            if len(body) > MAX_CLAUSE_QUOTE + 20:
                self.assertNotIn(body[:MAX_CLAUSE_QUOTE + 20], sent)

    def test_quoted_contract_text_never_exceeds_the_document(self):
        """The digest as a whole is usually LONGER than the contract — the
        findings are wordier than the clauses that provoked them, which is the
        point. What must not grow is the quoted contract text: a clause with
        two findings used to be quoted twice, so quoting could exceed the
        document it came from. Grouping by clause is what this pins.
        """
        client = ScriptedLLMClient(["Résumé."])
        _harden(llm=client, contract_id="c_size")
        sent = client.calls[0]["prompt"]
        quoted = sum(len(" ".join(l.split())) for l in sent.splitlines() if "« " in l)
        self.assertLess(quoted, len(SEED.read_text(encoding="utf-8")))

    def test_the_report_always_carries_a_narrative_field(self):
        """Present even with no model, so no consumer has to tell "no key"
        apart from "not implemented"."""
        report = _harden(llm=None, contract_id="c_field").as_dict()
        self.assertIn("narrative", report)
        self.assertFalse(report["narrative"]["available"])

    def test_a_successful_narrative_is_reported_as_not_rule_based(self):
        report = _harden(
            llm=ScriptedLLMClient(["Le contrat comporte des imprécisions de délai."]),
            contract_id="c_ok",
        ).as_dict()
        self.assertTrue(report["narrative"]["available"])
        self.assertFalse(report["narrative"]["rule_based"])
        self.assertTrue(report["narrative"]["grounding"]["ok"])


class OpenRouterRequestShape(unittest.TestCase):
    """The HTTP contract, without touching the network."""

    def _client(self, **kw):
        return OpenRouterClient(api_key="sk-or-secret", model="deepseek/deepseek-chat", **kw)

    def test_a_key_and_a_model_are_both_required(self):
        with self.assertRaises(LLMConfigError):
            OpenRouterClient(api_key="", model="m")
        with self.assertRaises(LLMConfigError):
            OpenRouterClient(api_key="k", model="")

    def test_an_oversized_prompt_is_refused_rather_than_truncated(self):
        """Truncation would cut the citations off the end of the user turn and
        leave the model talking about law with no sources — invariant 7's
        failure shape, arrived at by helpfulness."""
        with self.assertRaises(LLMUnavailable) as caught:
            self._client(max_prompt_chars=100).complete("x" * 200)
        self.assertIn("refusing rather than truncating", str(caught.exception))

    def test_the_request_carries_the_system_prompt_and_the_model(self):
        captured = {}

        class FakeResponse:
            def read(self):
                return json.dumps({
                    "model": "deepseek/deepseek-chat",
                    "choices": [{"message": {"content": "Résumé du contrat."}}],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 4},
                }).encode()

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        import urllib.request
        original = urllib.request.urlopen

        def fake_urlopen(request, timeout=None):
            captured["headers"] = dict(request.headers)
            captured["body"] = json.loads(request.data.decode())
            captured["url"] = request.full_url
            return FakeResponse()

        urllib.request.urlopen = fake_urlopen
        try:
            response = self._client().complete("la question", system="les règles")
        finally:
            urllib.request.urlopen = original

        self.assertEqual(response.text, "Résumé du contrat.")
        self.assertEqual(response.prompt_tokens, 10)
        self.assertTrue(captured["url"].endswith("/chat/completions"))
        self.assertEqual(captured["body"]["model"], "deepseek/deepseek-chat")
        roles = [m["role"] for m in captured["body"]["messages"]]
        self.assertEqual(roles, ["system", "user"])
        self.assertEqual(captured["body"]["messages"][0]["content"], "les règles")

    def test_an_empty_completion_is_an_unavailability_not_an_empty_answer(self):
        self.assertRaises(LLMUnavailable, OpenRouterClient._parse, {"choices": []})
        self.assertRaises(
            LLMUnavailable, OpenRouterClient._parse,
            {"choices": [{"message": {"content": "   "}}]},
        )


if __name__ == "__main__":
    unittest.main()
