"""The in-chat assistant the threads summon ("Insaf assist").

Answers questions about a contract that the agents already built. Read only:

- the ``ContractObject`` produced by Agent 1 / Agent 2 (invariant 5 — never
  re-parse a document), and
- retrieved corpus chunks (invariant 7 — never invent a legal claim).

The digest is built deterministically: a structured, neutral summary selected
by question intent, plus whatever legal chunks retrieval returns. Where nothing
is retrieved, the reply says so — a plausible-sounding COC article is the one
failure this project must never ship.

When a model backend is configured (see ``core/llm_client``), that digest is
handed to the narrator in ``narration.py``, which rewrites it as prose in the
asker's language and is checked against the same retrieved chunks before the
answer is used. The model is given that digest and nothing else — no clause
text, since the digest is built from obligations and version lineage — so the
worst it can do is phrase the same facts badly. If it is absent, rate-limited, or caught inventing an article, the
deterministic digest is returned unchanged — which is why it is still built
first, every time.

The reply is deliberately written so it reads the same to both parties: same
facts, same numbers, same caveats, no party-sided language (Agent 2 posture
rule 2).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable

from core.schemas import ContractObject
from core.taxonomy import Language, ObligationState
from rag.retriever import Mode, Retriever

# Question-intent gating. The chat assistant is only trustworthy if it answers
# questions the contract can actually answer; anything else is a graceful "I
# can't help with that from the documents".
_INTENTS: list[tuple[str, list[str]]] = [
    ("obligations", ["obligation", "devoir", "livrer", "livraison", "livrer", "payer", "paiement",
                     "obligation", "deadline", "échéance", "due", "deliver", "pay"]),
    ("versions", ["version", "en vigueur", "vigueur", "gouverne", "applicable", "signé", "signed",
                  "enforce", "amendement", "amend"]),
    ("dispute", ["tribunal", "procès", "litige", "règlement", "transiger", "traité", "court",
                 "dispute", "batna", "jugement", "indemnité", "damages", "settle"]),
]


def detect_language(text: str) -> Language:
    """Coarse FR/AR detection for the assistant's reply language.

    Per-CLAUDE.md the system is language-aware at *clause* granularity; this is
    that same principle applied to the question asked in chat.
    """
    if any("\u0600" <= ch <= "\u06FF" for ch in text):
        return Language.AR
    return Language.FR


def _intent(question: str) -> str | None:
    lowered = question.lower()
    for name, keywords in _INTENTS:
        for kw in keywords:
            if kw in lowered:
                return name
    return None


@dataclass
class AssistantReply:
    answer: str             # markdown-light plain text, neutral for both parties
    grounded_legal: bool
    citations: list[dict[str, str]] = field(default_factory=list)
    mode: str | None = None
    no_legal_basis_note: str | None = None
    # False once a model has written the prose. The facts underneath are
    # deterministic either way — this says who phrased them.
    rule_based: bool = True
    model: str | None = None
    # Why the rule-based text is being shown when a backend was configured:
    # no key, a rate limit, or a narrative discarded for citing a phantom
    # article. Empty when nothing was attempted or the narrative was used.
    narration_note: str = ""

    def as_dict(self) -> dict:
        return {
            "answer": self.answer,
            "grounded_legal": self.grounded_legal,
            "citations": self.citations,
            "mode": self.mode,
            "no_legal_basis_note": self.no_legal_basis_note,
            "rule_based": self.rule_based,
            "model": self.model,
            "narration_note": self.narration_note,
        }


def _fmt_date(dt: datetime | None) -> str:
    if dt is None:
        return "none"
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")


def _parties(contract: ContractObject) -> dict[str, str]:
    return {
        p.party_id: p.display_name
        for p in contract.parties
        if p.role in ("msme_owner", "counterparty")
    }


def _obligation_digest(contract: ContractObject, names: dict[str, str]) -> str:
    obligations = list(contract.obligations())
    if not obligations:
        return "- No obligation has been extracted from this contract yet."
    lines = ["Obligations extracted from the analysed versions:"]
    for o in obligations:
        subject = names.get(o.obligor, o.obligor)
        due = _fmt_date(o.due_date)
        lines.append(
            f"- {subject} must {o.action}. Trigger: {o.trigger}. "
            f"Due: {due}. State: {o.state.value}."
        )
    return "\n".join(lines)


def _version_digest(contract: ContractObject) -> str:
    from core.version_manager import effective_to, governing_version_at, status_of

    if not contract.versions:
        return "- This contract has no versions yet."
    latest = contract.versions[-1]
    governing_v = governing_version_at(contract, datetime.now(timezone.utc))
    lines = [
        f"- {len(contract.versions)} version(s); the latest is "
        f"{latest.version_id} ({latest.doc_type.value})."
    ]
    for v in contract.versions:
        lines.append(
            f"  - {v.version_id}: {v.doc_type.value}, status={status_of(contract, v.version_id).value}, "
            f"effective {_fmt_date(v.effective_from)} → {_fmt_date(effective_to(contract, v.version_id))}, "
            f"anchored={'yes' if v.anchor_tx else 'no'}"
        )
    if governing_v is not None:
        lines.append(
            f"- Governing version as of today: {governing_v.version_id} "
            f"(a proposal is never in force; an unsuperseded signed version governs)."
        )
    return "\n".join(lines)


def _dispute_digest(contract: ContractObject) -> str | None:
    """Presence digests are tricky — a dispute record isn't stored on the
    ContractObject. The assistant never fabricates dispute numbers, so this
    helper simply reports whether a resolution report exists in the agent
    runtime's separate dispute registry if one is ever provided."""
    return None


def _retrieval_section(retriever: Retriever, question: str, language: Language) -> tuple[list[dict[str, str]], str | None, bool]:
    """Normative + evaluative retrieval for the question.

    Returns (citations, missing_note, grounded). missing_note is a plain
    sentence when retrieval found nothing; the caller stays silent about law
    in that case.
    """
    results = [
        (Mode.NORMATIVE, retriever.retrieve(question, mode=Mode.NORMATIVE, language=language, limit=3)),
        (Mode.EVALUATIVE, retriever.retrieve(question, mode=Mode.EVALUATIVE, language=language, limit=3)),
    ]
    citations: list[dict[str, str]] = []
    used_modes: list[str] = []
    for mode, result in results:
        for hit in result.hits:
            citations.append({
                "source_doc": hit.source_doc,
                "article_ref": hit.article_ref,
                "excerpt": hit.text[:400],
                "mode": mode.value,
            })
            if mode.value not in used_modes:
                used_modes.append(mode.value)
    if citations:
        return citations, None, True
    empty = results[0][1].empty or results[1][1].empty
    if empty and empty.corpus_size == 0:
        return [], (
            "No legal basis is cited: the legal corpus is not loaded on this "
            "deployment, so this reply makes no claim about what the law says."
        ), False
    return [], (
        "No relevant legal text was retrieved from the corpus for this "
        "question, so no article is cited."
    ), False


def answer_question(
    contract: ContractObject,
    question: str,
    retriever: Retriever | None,
    llm=None,
) -> AssistantReply:
    language = detect_language(question)
    names = _parties(contract)
    intent = _intent(question)

    sections: list[str] = []
    if intent == "obligations":
        sections.append(_obligation_digest(contract, names))
    elif intent == "versions":
        sections.append(_version_digest(contract))
    elif intent == "dispute":
        digest = _dispute_digest(contract)
        sections.append(
            digest
            if digest
            else "- No dispute analysis exists for this contract yet; the "
                 "court-outcome figures are only produced once both parties "
                 "state their account."
        )
    else:
        sections.append(
            f"This contract covers {len(contract.versions[-1].clauses) if contract.versions else 0} "
            f"clause(s) across {len(contract.versions)} version(s)."
        )
        sections.append(_obligation_digest(contract, names) if list(contract.obligations()) else None)
        sections = [s for s in sections if s]

    body = "\n\n".join(sections)

    citations: list[dict[str, str]] = []
    missing_note: str | None = None
    grounded = False
    mode: str | None = None
    if retriever is not None:
        citations, missing_note, grounded = _retrieval_section(retriever, question, language)
        if citations:
            mode = "normative+evaluative"

    # The narrator gets the digest that was just built and the chunks that were
    # just retrieved — never the contract, never its own memory of the law.
    narrative = None
    if llm is not None:
        from narration import narrate
        narrative = narrate(
            llm,
            agent="assistant",
            language=language,
            data=body,
            citations=citations,
            question=question,
        )

    if narrative is not None and narrative.available:
        signature = (
            "— Insaf assist · réponse rédigée par un modèle à partir de "
            "l'analyse du contrat ; toute base légale citée est un extrait "
            "retrouvé dans le corpus."
            if narrative.language == "fr" else
            "— Insaf assist · جواب حرّره نموذج انطلاقًا من تحليل العقد؛ كل أساس "
            "قانوني مذكور هو مقتطف مُستخرَج من المدوّنة."
        )
        tail = [signature]
        if missing_note:
            tail.insert(0, missing_note)
        return AssistantReply(
            answer="\n\n".join([narrative.text, *tail]),
            grounded_legal=grounded,
            citations=citations,
            mode=mode,
            no_legal_basis_note=missing_note,
            rule_based=False,
            model=narrative.model,
        )

    tail = [
        "— Insaf assist · rule-based reply (no language model on this build); "
        "every legal basis above is a retrieved corpus extract."
    ]
    if missing_note:
        tail.insert(0, missing_note)

    answer = "\n\n".join([body, *tail])

    return AssistantReply(
        answer=answer,
        grounded_legal=grounded,
        citations=citations,
        mode=mode,
        no_legal_basis_note=missing_note,
        narration_note=(narrative.reason if narrative is not None else ""),
    )