"""Retrieval over the legal corpus.

Two modes, two languages, metadata filters mandatory. The single most important
behaviour in this package is what happens when nothing relevant is found: it
returns an explicit empty result with a reason, never a weak match dressed up
as a citation. Invariant 7 is enforced here as a scoring floor.
"""

from .chunker import Chunk, chunk_article_file, chunk_clause_library_file
from .index import InMemoryIndex, VectorIndex, build_index
from .retriever import Retriever, RetrievalResult, Hit, NoLegalBasis

__all__ = [
    "Chunk", "chunk_article_file", "chunk_clause_library_file",
    "InMemoryIndex", "VectorIndex", "build_index",
    "Retriever", "RetrievalResult", "Hit", "NoLegalBasis",
]
