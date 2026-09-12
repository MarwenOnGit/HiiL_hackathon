"""Splitting a contract into clauses.

Structural, not semantic: numbered headings, article headings, and titled
blocks. A contract with no structure at all falls back to paragraph blocks
rather than being treated as one giant clause, because a single-clause contract
makes every downstream finding useless.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# "Article 4 - Livraison", "4. Livraison", "IV. Livraison", "ARTICLE 4 :"
_HEADING = re.compile(
    r"^[ \t]*(?:"
    r"(?:article|art\.?)[ \t]*(?P<anum>[0-9IVXivx]+)"
    r"|(?P<num>[0-9]+(?:\.[0-9]+)*)[.)]"
    r"|(?:الفصل|البند)[ \t]*(?P<arnum>[0-9٠-٩]+)"
    r")[ \t]*[-–—:.]?[ \t]*(?P<title>.*)$",
    re.IGNORECASE | re.MULTILINE,
)


@dataclass
class Segment:
    title: str
    text: str
    start: int
    end: int

    @property
    def span(self) -> tuple[int, int]:
        return (self.start, self.end)


def segment(text: str) -> list[Segment]:
    matches = list(_HEADING.finditer(text))
    if len(matches) >= 2:
        return _from_headings(text, matches)
    return _from_paragraphs(text)


def _from_headings(text: str, matches: list[re.Match]) -> list[Segment]:
    segments: list[Segment] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        if not body:
            continue
        title = (match.group("title") or "").strip()
        if not title:
            # A heading with no inline title: take the first line of the body.
            lines = [ln.strip() for ln in body.splitlines() if ln.strip()]
            title = lines[1] if len(lines) > 1 else lines[0] if lines else "(sans titre)"
        segments.append(Segment(title=title[:120], text=body, start=start, end=end))
    return segments


def _from_paragraphs(text: str) -> list[Segment]:
    """No headings — split on blank lines and title each block by its first line."""
    segments: list[Segment] = []
    cursor = 0
    for block in re.split(r"\n[ \t]*\n", text):
        stripped = block.strip()
        start = text.find(block, cursor)
        cursor = start + len(block) if start >= 0 else cursor
        if not stripped:
            continue
        first_line = stripped.splitlines()[0].strip()
        title = first_line[:120] if len(first_line) < 90 else first_line[:60] + "…"
        segments.append(Segment(title=title, text=stripped, start=max(start, 0),
                                end=max(start, 0) + len(block)))
    return segments
