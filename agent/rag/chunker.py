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

# Real corpora write article headings in more than one way, sometimes inside
# the same file. The Tunisian COC markdown uses BOTH:
#
#   **Article 564.**\- La vente est...        (bold, inline, mid-line)
#   Article 1107                              (line start, unbolded)
#
# The first version of this pattern only anchored at line start, so the 1106
# bold headings never matched and everything before the first line-start
# heading — 355 KB — collapsed into a single "preamble" chunk. That one chunk
# contained nearly every word in the corpus, so it matched *any* query at full
# term coverage and became the citation for unrelated questions. Retrieval that
# confidently cites the wrong article is worse than retrieval that finds
# nothing, so this pattern accepts both shapes.
#
# "premier" is matched because the first article of a French code is written
# out rather than numbered.
_ARTICLE_HEADING = re.compile(
    r"(?:"
    # bold, anywhere: **Article 564.**  /  **Article premier.**
    r"\*\*\s*(?:article|art\.?)\s*(?P<num>premier|[0-9]+(?:\s*(?:bis|ter|quater))?)\s*\.?\s*\*\*"
    r"|"
    # line start, with or without bold: Article 1107
    r"(?m:^)\s*\*{0,2}(?:article|art\.?)\s*(?P<num2>premier|[0-9]+(?:\s*(?:bis|ter|quater))?)\b"
    r"|"
    # Arabic
    r"(?m:^)\s*(?:الفصل)\s*(?P<num_ar>[0-9٠-٩]+)"
    r")",
    re.IGNORECASE,
)

# No chunk may exceed this. A chunk far larger than an article is either a
# parsing failure or an unstructured document, and in both cases it matches
# everything and poisons retrieval. Splitting is a safety net that works
# regardless of what a future corpus file looks like.
MAX_CHUNK_CHARS = 3000


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
            chunks.extend(_split_oversized(Chunk(
                chunk_id=f"{source_doc}::whole",
                text=body, source_doc=source_doc, article_ref="(document)",
                corpus_type=corpus_type, language=language,
            )))
        return chunks

    preamble = raw[: matches[0].start()].strip()
    if preamble:
        chunks.extend(_split_oversized(Chunk(
            chunk_id=f"{source_doc}::preamble",
            text=preamble, source_doc=source_doc, article_ref="(preamble)",
            corpus_type=corpus_type, language=language,
        )))

    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(raw)
        body = raw[match.start():end].strip()
        if not body:
            continue
        number = (
            match.group("num") or match.group("num2")
            or match.group("num_ar") or str(index + 1)
        )
        article_ref = f"art. {' '.join(number.split())}"
        chunks.extend(_split_oversized(Chunk(
            chunk_id=f"{source_doc}::{article_ref}",
            text=body, source_doc=source_doc, article_ref=article_ref,
            corpus_type=corpus_type, language=language,
        )))
    return chunks


def _split_oversized(chunk: Chunk) -> list[Chunk]:
    """Break a chunk that is too long to be one article, at paragraph breaks.

    Each piece keeps the article reference and gains a part suffix, so a
    citation still points at the right article while the retrievable unit stays
    small enough to mean something.
    """
    if len(chunk.text) <= MAX_CHUNK_CHARS:
        return [chunk]

    pieces: list[str] = []
    current = ""
    for paragraph in re.split(r"\n\s*\n", chunk.text):
        if current and len(current) + len(paragraph) + 2 > MAX_CHUNK_CHARS:
            pieces.append(current.strip())
            current = paragraph
        else:
            current = f"{current}\n\n{paragraph}" if current else paragraph
    if current.strip():
        pieces.append(current.strip())

    # A single paragraph longer than the cap still has to be broken somewhere.
    final: list[str] = []
    for piece in pieces:
        while len(piece) > MAX_CHUNK_CHARS:
            final.append(piece[:MAX_CHUNK_CHARS])
            piece = piece[MAX_CHUNK_CHARS:]
        if piece.strip():
            final.append(piece)

    return [
        Chunk(
            chunk_id=f"{chunk.chunk_id}#{i + 1}",
            text=text,
            source_doc=chunk.source_doc,
            article_ref=(
                chunk.article_ref if len(final) == 1
                else f"{chunk.article_ref} ({i + 1}/{len(final)})"
            ),
            corpus_type=chunk.corpus_type,
            language=chunk.language,
        )
        for i, text in enumerate(final)
    ]


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
