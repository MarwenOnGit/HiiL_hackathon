"""Chunking at article and clause boundaries — never fixed token windows.

A legal article is a unit of meaning. Splitting it at token 512 produces a
chunk that cites an article number whose operative sentence lives in the next
chunk, which is how a citation ends up attached to the wrong rule. So the
boundary is structural: a new chunk starts at an article heading, and an
article that is genuinely long stays whole rather than being cut mid-rule.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from core.taxonomy import CorpusType, Language

# "Article 564", "Art. 1458", "Article 1458 bis", and the Arabic "الفصل 564".
_ARTICLE_HEADING = re.compile(
    r"^\s*(?:(?:article|art\.?)\s*(?P<num>[0-9]+(?:\s*(?:bis|ter|quater))?)"
    r"|(?:الفصل)\s*(?P<num_ar>[0-9٠-٩]+))\s*[\.\-–—:]?\s*",
    re.IGNORECASE | re.MULTILINE,
)


@dataclass
class Chunk:
    chunk_id: str
    text: str
    source_doc: str
    article_ref: str
    corpus_type: CorpusType
    language: Language
    metadata: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.text.strip():
            raise ValueError(f"chunk {self.chunk_id} is empty")


def normalise(text: str) -> str:
    """Lowercase and strip accents, for matching only — never for display.

    Tunisian legal text arrives with inconsistent accenting, and a user typing
    "delai" must match "délai".
    """
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def chunk_article_file(
    path: Path, source_doc: str, language: Language, corpus_type: CorpusType
) -> list[Chunk]:
    """Split a normative text file into one chunk per article.

    Text before the first article heading is kept as a preamble chunk rather
    than silently dropped — a corpus file's header often carries the scope note
    that makes the articles interpretable.
    """
    raw = path.read_text(encoding="utf-8")
    matches = list(_ARTICLE_HEADING.finditer(raw))
    chunks: list[Chunk] = []

    if not matches:
        # No article structure at all: keep the file whole rather than
        # inventing boundaries that aren't there.
        body = raw.strip()
        if body:
            chunks.append(Chunk(
                chunk_id=f"{source_doc}::whole",
                text=body, source_doc=source_doc, article_ref="(document)",
                corpus_type=corpus_type, language=language,
            ))
        return chunks

    preamble = raw[: matches[0].start()].strip()
    if preamble:
        chunks.append(Chunk(
            chunk_id=f"{source_doc}::preamble",
            text=preamble, source_doc=source_doc, article_ref="(preamble)",
            corpus_type=corpus_type, language=language,
        ))

    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(raw)
        body = raw[match.start():end].strip()
        if not body:
            continue
        number = match.group("num") or match.group("num_ar") or str(index + 1)
        article_ref = f"art. {' '.join(number.split())}"
        chunks.append(Chunk(
            chunk_id=f"{source_doc}::{article_ref}",
            text=body, source_doc=source_doc, article_ref=article_ref,
            corpus_type=corpus_type, language=language,
        ))
    return chunks


def chunk_clause_library_file(
    path: Path, source_doc: str, language: Language
) -> list[Chunk]:
    """Model clauses, one chunk each, separated by a blank-line-delimited
    heading of the form `## <label>`.
    """
    raw = path.read_text(encoding="utf-8")
    chunks: list[Chunk] = []
    blocks = re.split(r"^##\s*(?P<label>.+)$", raw, flags=re.MULTILINE)
    # re.split with one group yields [pre, label, body, label, body, ...]
    for i in range(1, len(blocks) - 1, 2):
        label = blocks[i].strip()
        body = blocks[i + 1].strip()
        if not body:
            continue
        chunks.append(Chunk(
            chunk_id=f"{source_doc}::{label}",
            text=body, source_doc=source_doc, article_ref=label,
            corpus_type=CorpusType.CLAUSE_LIBRARY, language=language,
        ))
    return chunks
