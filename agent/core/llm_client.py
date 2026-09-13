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


class LLMConfigError(Exception):
    """The backend is configured contradictorily — a key with no model, say.

    Distinct from `LLMUnavailable`: that one means "carry on without me", this
    one means someone mis-wired the deployment and should be told.
    """


class OpenRouterClient:
    """OpenRouter's chat-completions API over the standard library.

    OpenRouter speaks the OpenAI-compatible shape, so this is one POST with a
    `messages` array. It is written against `urllib` rather than an SDK because
    no HTTP client is installed in this venv and pip is externally managed
    offline — and because the surface actually used here is one endpoint, which
    is not enough to justify a dependency that the demo could fail to install.

    Failure is always `LLMUnavailable`. Every caller in this codebase already
    degrades to deterministic output on that exception, so a rate limit, a cold
    route or a dead network downgrades the product instead of breaking it.
    """

    name = "openrouter"

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: str = "https://openrouter.ai/api/v1",
        timeout: float = 45.0,
        max_tokens: int = 700,
        temperature: float = 0.2,
        max_retries: int = 1,
        max_prompt_chars: int = 12000,
        app_title: str = "Insaf agent service",
        app_url: str = "https://github.com/insaf/hack4justice",
    ) -> None:
        if not api_key:
            raise LLMConfigError("OpenRouterClient needs an API key")
        if not model:
            raise LLMConfigError("OpenRouterClient needs a model id")
        self._api_key = api_key
        self.model = model
        self._base_url = base_url.rstrip("/")
        self._timeout = float(timeout)
        self._max_tokens = int(max_tokens)
        self._temperature = float(temperature)
        self._max_retries = max(0, int(max_retries))
        self._max_prompt_chars = int(max_prompt_chars)
        self._app_title = app_title
        self._app_url = app_url

    def describe(self) -> dict[str, object]:
        """What /health may say about the backend. Never the key."""
        return {
            "provider": "openrouter",
            "model": self.model,
            "max_tokens": self._max_tokens,
            "temperature": self._temperature,
        }

    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> LLMResponse:
        import json
        import urllib.error
        import urllib.request

        budget = len(prompt) + len(system or "")
        if budget > self._max_prompt_chars:
            # Deliberately not truncated. The citations sit at the end of the
            # user turn, so trimming would quietly remove the model's only
            # lawful sources while leaving it talking about law — the exact
            # shape of invariant 7's failure. Refusing degrades to the
            # deterministic output instead, which is always still there.
            raise LLMUnavailable(
                f"prompt is {budget} chars, over the {self._max_prompt_chars} "
                "limit; refusing rather than truncating away the citations"
            )

        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = json.dumps({
            "model": self.model,
            "messages": messages,
            "max_tokens": int(max_tokens or self._max_tokens),
            "temperature": (
                self._temperature if temperature is None else float(temperature)
            ),
        }).encode("utf-8")

        request = urllib.request.Request(
            f"{self._base_url}/chat/completions",
            data=payload,
            method="POST",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
                # OpenRouter attributes traffic with these two; they are
                # optional but they are how the dashboard stays readable.
                "HTTP-Referer": self._app_url,
                "X-Title": self._app_title,
            },
        )

        last_error = ""
        for attempt in range(self._max_retries + 1):
            try:
                with urllib.request.urlopen(request, timeout=self._timeout) as response:
                    body = json.loads(response.read().decode("utf-8"))
                return self._parse(body)
            except urllib.error.HTTPError as exc:
                detail = self._error_detail(exc)
                # 4xx other than rate limiting will not fix itself on a retry.
                if exc.code not in (408, 409, 429) and exc.code < 500:
                    raise LLMUnavailable(
                        f"OpenRouter rejected the request ({exc.code}): {detail}"
                    ) from exc
                last_error = f"HTTP {exc.code}: {detail}"
            except urllib.error.URLError as exc:
                last_error = f"network error: {exc.reason}"
            except (ValueError, KeyError) as exc:
                raise LLMUnavailable(f"unreadable OpenRouter response: {exc}") from exc
            if attempt < self._max_retries:
                import time
                time.sleep(1.0 + attempt)

        raise LLMUnavailable(f"OpenRouter unreachable after retries — {last_error}")

    @staticmethod
    def _error_detail(exc) -> str:
        """The provider's message, never the request that carried the key."""
        try:
            import json
            body = json.loads(exc.read().decode("utf-8"))
        except Exception:
            return exc.reason or "no detail"
        error = body.get("error")
        if isinstance(error, dict):
            return str(error.get("message") or error)[:300]
        return str(error or body)[:300]

    @staticmethod
    def _parse(body: dict) -> LLMResponse:
        choices = body.get("choices") or []
        if not choices:
            # OpenRouter reports an upstream refusal this way rather than as a
            # transport error, so an empty choices list is a real outcome.
            raise LLMUnavailable(
                f"OpenRouter returned no completion: {str(body.get('error') or body)[:300]}"
            )
        text = (choices[0].get("message") or {}).get("content") or ""
        if not text.strip():
            raise LLMUnavailable("OpenRouter returned an empty completion")
        usage = body.get("usage") or {}
        return LLMResponse(
            text=text.strip(),
            model=str(body.get("model") or "openrouter"),
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            metadata={"id": str(body.get("id") or "")},
        )


def build_client(settings: dict | None = None) -> LLMClient:
    """The configured backend, or the Null client when there is no key.

    Called once at startup (see `runtime.py`). Returning `NullLLMClient` rather
    than raising is the whole degradation story: a deployment with no key is a
    supported deployment that answers deterministically and says so, not a
    broken one.
    """
    if settings is None:
        from config import load_llm_settings
        settings = load_llm_settings()
    if not settings.get("enabled"):
        return NullLLMClient()
    return OpenRouterClient(
        api_key=settings["api_key"],
        model=settings["model"],
        base_url=settings.get("base_url") or "https://openrouter.ai/api/v1",
        timeout=settings.get("timeout_seconds", 45),
        max_tokens=settings.get("max_tokens", 700),
        temperature=settings.get("temperature", 0.2),
        max_retries=settings.get("max_retries", 1),
        max_prompt_chars=settings.get("max_prompt_chars", 12000),
    )
