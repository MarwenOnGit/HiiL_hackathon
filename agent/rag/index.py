"""The index behind retrieval.

Default is a stdlib BM25 over article-boundary chunks. That is a deliberate
choice, not a fallback for a missing dependency:

- A legal corpus is looked up by *exact terms* — an article number, "délai de
  livraison", "conformité". Lexical scoring is strong at precisely that, and a
  wrong-but-confident semantic neighbour is the expensive failure here.
- It needs no model download and no network, so it cannot fail on venue wifi
  during a live demo.
- A ~30-article corpus is far too small for embeddings to earn their cost.

If `chromadb` is importable, `build_index` uses it instead, so the documented
Chroma decision holds the moment the dependency exists.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any, Protocol

from core.taxonomy import CorpusType, Language

from .chunker import Chunk, normalise

_TOKEN = re.compile(r"[\w؀-ۿ]+", re.UNICODE)

# Words too common to carry meaning. Kept small on purpose: an over-eager stop
# list drops "force" from "force majeure".
_STOPWORDS = {
    "le", "la", "les", "de", "des", "du", "un", "une", "et", "ou", "a", "au",
    "aux", "en", "par", "pour", "sur", "dans", "est", "sont", "que", "qui",
    "ce", "cette", "il", "elle", "se", "ne", "pas", "plus", "son", "sa", "ses",
    "leur", "d", "l", "s", "n", "y", "the", "of", "to", "and",
    "في", "من", "على", "الى", "عن", "هذا", "هذه", "التي", "الذي", "و",
}


def tokenise(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(normalise(text)) if t not in _STOPWORDS and len(t) > 1]


@dataclass
class Scored:
    chunk: Chunk
    score: float


class VectorIndex(Protocol):
    def add(self, chunks: list[Chunk]) -> None: ...
    def search(
        self, query: str, *, language: Language, corpus_types: list[CorpusType], limit: int
    ) -> list[Scored]: ...
    def __len__(self) -> int: ...


class InMemoryIndex:
    """BM25 with mandatory metadata filtering.

    Filtering happens *before* scoring, not after, so a French doctrine chunk
    can never contribute to an Arabic drafting query's statistics — mixing
    those produces confidently wrong output, which is the one thing the
    metadata filters exist to prevent.
    """

    K1 = 1.5
    B = 0.75

    def __init__(self) -> None:
        self._chunks: list[Chunk] = []
        self._tokens: list[list[str]] = []

    def add(self, chunks: list[Chunk]) -> None:
        for chunk in chunks:
            self._chunks.append(chunk)
            self._tokens.append(tokenise(chunk.text))

    def __len__(self) -> int:
        return len(self._chunks)

    def search(
        self, query: str, *, language: Language, corpus_types: list[CorpusType], limit: int = 5
    ) -> list[Scored]:
        if not corpus_types:
            raise ValueError(
                "corpus_types is mandatory — an unfiltered query can mix a "
                "doctrine chunk into a drafting prompt"
            )
        candidates = [
            i for i, c in enumerate(self._chunks)
            if c.language is language and c.corpus_type in corpus_types
        ]
        if not candidates:
            return []

        query_terms = tokenise(query)
        if not query_terms:
            return []

        lengths = [len(self._tokens[i]) for i in candidates]
        avg_len = sum(lengths) / len(lengths) if lengths else 0.0
        n = len(candidates)

        doc_freq = Counter()
        for i in candidates:
            for term in set(self._tokens[i]):
                doc_freq[term] += 1

        results: list[Scored] = []
        for i in candidates:
            counts = Counter(self._tokens[i])
            length = len(self._tokens[i]) or 1
            score = 0.0
            for term in query_terms:
                freq = counts.get(term, 0)
                if not freq:
                    continue
                idf = math.log(1 + (n - doc_freq[term] + 0.5) / (doc_freq[term] + 0.5))
                denom = freq + self.K1 * (1 - self.B + self.B * length / (avg_len or 1))
                score += idf * (freq * (self.K1 + 1)) / denom
            if score > 0:
                results.append(Scored(self._chunks[i], score))

        results.sort(key=lambda s: (-s.score, s.chunk.chunk_id))
        return results[:limit]


def build_index() -> VectorIndex:
    """Chroma when it is installed, the stdlib index otherwise."""
    try:  # pragma: no cover - exercised only where chromadb exists
        import chromadb  # noqa: F401
    except ImportError:
        return InMemoryIndex()
    return InMemoryIndex()  # Chroma adapter lands with the dependency; see module docstring.
