"""The boundary check on generated text: did the model stay inside its sources?

Invariant 7 is the single worst failure this product can have — a confident,
plausible, invented COC article is exactly what a legal judge will catch. The
prompts in `config/prompts.py` tell the model the CITATIONS block is the whole
of the law available to it. This module verifies the answer, because a prompt
is a request and a check is a guarantee.

Two things are checked:

**Article references.** Every article number the text mentions must appear in
the citations that were handed to the model. A number that does not is, by
definition, one the model supplied from its own weights — which is the failure
mode, regardless of whether the number happens to be correct.

**Banned phrasings.** "Force of a final judgment" is unverified for Tunisia
(CLAUDE.md), so it is forbidden in code, copy and UI. A model asked not to use
it will still reach for it, because it is the standard phrase everywhere else.

The check is deliberately one-directional: it catches invention, not omission.
It also matches only numbers introduced by an article word, so a delay ("30
jours") or an amount ("1800 TND") is never mistaken for a citation. A written
range ("articles 1458 à 1477") is read as its first number only — a safety net
sized for the failure it exists to stop, not a citation parser.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# "article 564", "art. 1107", "arts 12", and the Arabic equivalents الفصل /
# المادة. The number is what gets compared; the word only proves that a number
# is being used as a legal reference.
_ARTICLE_RE = re.compile(
    r"(?:articles?|arts?\b\.?|الفصول|الفصل|المواد|المادة)"
    r"\s*\.?\s*(?:n[°o]\s*)?(\d{1,4})",
    re.IGNORECASE,
)

_NUMBER_RE = re.compile(r"\d{1,4}")

# Each entry is a family of spellings for one forbidden idea.
BANNED_PHRASES: dict[str, tuple[str, ...]] = {
    "force of a final judgment": (
        "force de chose jugee",
        "force de la chose jugee",
        "autorite de chose jugee",
        "autorite de la chose jugee",
        "force of a final judgment",
        "force of res judicata",
        "قوة الشيء المقضي",
        "قوة الامر المقضي",
    ),
}


def _fold(text: str) -> str:
    """Lowercase and strip accents, so "jugée" and "jugee" compare equal."""
    decomposed = unicodedata.normalize("NFD", text or "")
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return unicodedata.normalize("NFC", stripped).lower()


def article_numbers(text: str) -> set[str]:
    """Every article number `text` cites."""
    return {match.group(1).lstrip("0") or "0" for match in _ARTICLE_RE.finditer(text or "")}


def allowed_numbers(citations: list[dict[str, str]] | None) -> set[str]:
    """The article numbers the model was actually given.

    Reads `article_ref` ("Article 564", "564", "art. 1107") and falls back to
    any number in the excerpt, because a chunk that quotes its own article
    heading is still that article.
    """
    allowed: set[str] = set()
    for citation in citations or []:
        ref = str(citation.get("article_ref") or "")
        for number in _NUMBER_RE.findall(ref):
            allowed.add(number.lstrip("0") or "0")
        allowed |= article_numbers(str(citation.get("excerpt") or ""))
    return allowed


def banned_phrases(text: str) -> list[str]:
    """Which forbidden phrasings appear, named by the idea they express."""
    folded = _fold(text)
    return sorted(
        name for name, spellings in BANNED_PHRASES.items()
        if any(_fold(spelling) in folded for spelling in spellings)
    )


@dataclass
class Verdict:
    """Whether generated text may be shown to a user."""

    ok: bool
    unsupported_articles: list[str] = field(default_factory=list)
    banned: list[str] = field(default_factory=list)

    @property
    def reason(self) -> str:
        problems = []
        if self.unsupported_articles:
            problems.append(
                "cited article(s) absent from the retrieved corpus: "
                + ", ".join(self.unsupported_articles)
            )
        if self.banned:
            problems.append("forbidden phrasing: " + ", ".join(self.banned))
        return "; ".join(problems)

    def as_dict(self) -> dict[str, object]:
        return {
            "ok": self.ok,
            "unsupported_articles": self.unsupported_articles,
            "banned": self.banned,
            "reason": self.reason,
        }


def check(text: str, citations: list[dict[str, str]] | None = None) -> Verdict:
    """Verify generated `text` against the `citations` the model was given.

    A failing verdict means the text is discarded, not repaired: a model that
    invented one article is not a model whose remaining sentences have been
    earned. The caller degrades to the deterministic output, which is always
    still there.
    """
    allowed = allowed_numbers(citations)
    unsupported = sorted(article_numbers(text) - allowed, key=lambda n: (len(n), n))
    forbidden = banned_phrases(text)
    return Verdict(
        ok=not unsupported and not forbidden,
        unsupported_articles=unsupported,
        banned=forbidden,
    )
