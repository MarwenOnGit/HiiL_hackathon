"""Turning a deterministic result into prose, without letting it become a source.

Both agents produce structured objects: findings, obligations, a fact ledger, a
BATNA estimate. Those objects are the product. This module is the thin layer
that asks a model to *read them out* in the user's language, and it is built on
one rule:

    the model is a narrator, never a source.

Everything it is allowed to say is in the prompt already. It receives the
structured digest and the retrieved legal excerpts, and nothing else. The
document is never sent whole — each agent's digest decides what travels, and
Agent 1's includes a bounded quote of the clauses it flagged so the narrative
can name the wording at issue. Afterwards `core.grounding` checks the output and
the narrative is **discarded whole** if the model cited an article it was not
given, or reached for a forbidden phrasing.

Discarding rather than repairing is the important decision. A model that
invented one article has not earned trust in its other sentences, and the
deterministic report is always still there underneath — so the cost of throwing
it away is a plainer answer, while the cost of keeping it is the one failure
this product cannot survive.

Every outcome is reported, never swallowed: `Narrative.available` is False with
a `reason` the UI can show. "No narrative because there is no API key" and "no
narrative because the model cited a phantom article" are both facts, and the
system says which.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from config.prompts import normalise_language, system_prompt, user_prompt
from core import grounding
from core.llm_client import LLMClient, LLMUnavailable


@dataclass
class Narrative:
    """Generated prose, or a stated reason there is none."""

    available: bool
    text: str = ""
    model: str = ""
    language: str = "fr"
    reason: str = ""
    # Present whenever a model actually answered, so a reviewer can see that
    # the check ran and what it concluded — including on the happy path.
    grounding: dict[str, Any] | None = None
    citations: list[dict[str, str]] = field(default_factory=list)
    prompt_tokens: int | None = None
    completion_tokens: int | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "text": self.text,
            "model": self.model,
            "language": self.language,
            "reason": self.reason,
            "grounding": self.grounding,
            "citations": self.citations,
            "usage": {
                "prompt_tokens": self.prompt_tokens,
                "completion_tokens": self.completion_tokens,
            },
            # The flag every consumer already understands: False here means a
            # language model wrote this prose. The structured findings beside
            # it stay rule-based either way.
            "rule_based": not self.available,
        }


def unavailable(reason: str, language: object = "fr") -> Narrative:
    return Narrative(available=False, reason=reason,
                     language=normalise_language(language))


def narrate(
    client: LLMClient | None,
    *,
    agent: str,
    language: object = "fr",
    data: str,
    citations: list[dict[str, str]] | None = None,
    question: str | None = None,
    max_tokens: int | None = None,
    timeout: float | None = None,
) -> Narrative:
    """Ask `agent`'s narrator to describe `data`. Never raises.

    `citations` is simultaneously the model's source material and the whitelist
    it is checked against, which is what makes the check meaningful: the two
    cannot drift apart because they are the same list.
    """
    lang = normalise_language(language)
    citations = list(citations or [])

    if client is None:
        return unavailable("no model backend configured", lang)

    try:
        response = client.complete(
            user_prompt(language=lang, data=data, citations=citations,
                        question=question),
            system=system_prompt(agent, lang),
            **({"max_tokens": max_tokens} if max_tokens else {}),
            **({"timeout": timeout} if timeout else {}),
        )
    except LLMUnavailable as exc:
        # The supported path when there is no key, no network, or a rate limit.
        return unavailable(str(exc), lang)
    except Exception as exc:  # pragma: no cover - defensive
        # A narrator must never be able to fail a hardening run. Anything the
        # client did not anticipate still degrades to the deterministic report.
        return unavailable(f"unexpected narrator failure: {type(exc).__name__}: {exc}", lang)

    verdict = grounding.check(response.text, citations)
    if not verdict.ok:
        return Narrative(
            available=False,
            model=response.model,
            language=lang,
            reason=f"narrative discarded — {verdict.reason}",
            grounding=verdict.as_dict(),
            citations=citations,
        )

    return Narrative(
        available=True,
        text=response.text,
        model=response.model,
        language=lang,
        grounding=verdict.as_dict(),
        citations=citations,
        prompt_tokens=response.prompt_tokens,
        completion_tokens=response.completion_tokens,
    )


def narrate_in_background(on_done, **kwargs) -> None:
    """Run `narrate` off the request thread and hand the result to `on_done`.

    The analysis endpoints answer an HTTP caller with a timeout of its own —
    10s for the Next proxy's generic POST path — while one narrative takes
    anywhere from 9 to 38 seconds depending on how OpenRouter routes it. Making
    the caller wait would trade a working page for a paragraph.

    So the deterministic report returns immediately and the prose catches up:
    the thread writes it onto the contract, and the next `GET /contracts/{id}`
    serves it. A daemon thread, because a half-written narrative is never worth
    holding shutdown open — the report it describes is already saved and
    anchored.
    """
    import threading

    def run() -> None:
        try:
            on_done(narrate(**kwargs))
        except Exception:  # pragma: no cover - a narrator cannot break a run
            pass

    threading.Thread(target=run, daemon=True,
                     name=f"narrate-{kwargs.get('agent', '?')}").start()


def pending(reason: str = "narrative is being generated") -> dict[str, Any]:
    """The placeholder an analysis response carries while the thread works."""
    return {"available": False, "pending": True, "reason": reason,
            "text": "", "rule_based": True}


def citations_from_legal_refs(refs: Any) -> list[dict[str, str]]:
    """Flatten `LegalRef` objects into the citation shape prompts expect.

    Deduplicated on (source, article) because the same COC article is commonly
    retrieved for several clauses, and paying to send it three times buys
    nothing.
    """
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, str]] = []
    for ref in refs or []:
        key = (getattr(ref, "source_doc", ""), getattr(ref, "article_ref", ""))
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "source_doc": getattr(ref, "source_doc", ""),
            "article_ref": getattr(ref, "article_ref", ""),
            # Trimmed: the model needs enough to paraphrase accurately, not the
            # whole article. Cost control that does not change what is cited.
            "excerpt": " ".join(str(getattr(ref, "excerpt", "")).split())[:600],
        })
    return out
