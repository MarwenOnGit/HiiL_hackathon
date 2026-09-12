"""The single seam every model call passes through.

No agent module may import a provider SDK. That is what makes the backend
swappable, and it is also what makes invariant 7 enforceable: grounding is
checked at the boundary where retrieved chunks meet a prompt, and there is
exactly one such boundary.

Until a provider is chosen, `NullLLMClient` is the configured default. It
raises `LLMUnavailable` rather than returning plausible text, so a missing
provider surfaces as an explicit, handled outcome instead of silently becoming
ungrounded output.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


class LLMUnavailable(Exception):
    """No model backend is configured or reachable.

    Callers are expected to handle this and degrade honestly — for a clause
    with no retrievable legal basis, that means emitting a "no legal basis
    retrieved" finding, never a guess.
    """


@dataclass
class LLMResponse:
    text: str
    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    metadata: dict[str, str] = field(default_factory=dict)


class LLMClient(Protocol):
    name: str

    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.0,
    ) -> LLMResponse: ...


class NullLLMClient:
    """The default until a backend is picked. Always raises."""

    name = "null"

    def complete(self, prompt: str, *, system=None, max_tokens=1024, temperature=0.0):
        raise LLMUnavailable(
            "no LLM backend configured — set one up in core/llm_client.py. "
            "Callers must degrade honestly rather than substituting generated text."
        )


class ScriptedLLMClient:
    """Deterministic test double.

    Findings have to be reproducible across runs — a demo that answers
    differently each time is worthless — so agent tests run against scripted
    replies rather than a live model. Records the prompts it saw, which is how
    a test asserts that only retrieved chunks reached the prompt.
    """

    name = "scripted"

    def __init__(self, replies: list[str]) -> None:
        self._replies = list(replies)
        self.calls: list[dict[str, object]] = []

    def complete(self, prompt: str, *, system=None, max_tokens=1024, temperature=0.0):
        self.calls.append(
            {"prompt": prompt, "system": system, "max_tokens": max_tokens,
             "temperature": temperature}
        )
        if not self._replies:
            raise LLMUnavailable("ScriptedLLMClient ran out of scripted replies")
        return LLMResponse(text=self._replies.pop(0), model="scripted")
