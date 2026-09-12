"""Process-wide singletons: store, chain, retriever.

One place to construct them so the service, the CLI and the smoke test all run
against identical wiring — a demo that behaves differently through the UI than
through the CLI is a demo you cannot debug under time pressure.
"""

from __future__ import annotations

import os
from pathlib import Path

from blockchain_client import ContractResolver, InMemoryChain
from core.contract_store import JsonFileStore
from rag import Retriever, build_index
from rag.chunker import chunk_article_file, chunk_clause_library_file
from core.taxonomy import CorpusType, Language

AGENT_ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("AGENT_DATA_DIR", AGENT_ROOT / "data"))
CORPUS_DIR = Path(os.environ.get("AGENT_CORPUS_DIR", AGENT_ROOT / "rag" / "corpus"))

_CORPUS_TYPES = {
    "normative": CorpusType.NORMATIVE,
    "clause_library": CorpusType.CLAUSE_LIBRARY,
    "evaluative": CorpusType.EVALUATIVE,
}


def load_corpus(index) -> dict[str, int]:
    """Index whatever is on disk. An empty corpus is a valid state."""
    counts: dict[str, int] = {}
    for language in (Language.FR, Language.AR):
        for folder, corpus_type in _CORPUS_TYPES.items():
            directory = CORPUS_DIR / language.value / folder
            if not directory.is_dir():
                continue
            chunks = []
            for path in sorted(directory.glob("*")):
                if path.suffix.lower() not in {".txt", ".md"}:
                    continue
                if corpus_type is CorpusType.CLAUSE_LIBRARY:
                    chunks.extend(chunk_clause_library_file(path, path.stem, language))
                else:
                    chunks.extend(chunk_article_file(path, path.stem, language, corpus_type))
            if chunks:
                index.add(chunks)
            counts[f"{language.value}/{folder}"] = len(chunks)
    return counts


class Runtime:
    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.store = JsonFileStore(DATA_DIR)
        self.chain = InMemoryChain()
        self.index = build_index()
        self.corpus_counts = load_corpus(self.index)
        self.retriever = Retriever(self.index)
        self.resolver = ContractResolver(self.chain, self.store)

    @property
    def corpus_size(self) -> int:
        return len(self.index)

    def reset(self) -> None:
        for path in DATA_DIR.glob("*.json"):
            path.unlink()
        self.chain = InMemoryChain()
        self.resolver = ContractResolver(self.chain, self.store)


RUNTIME = Runtime()
