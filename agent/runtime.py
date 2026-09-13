"""Process-wide singletons: store, chain, retriever.

One place to construct them so the service, the CLI and the smoke test all run
against identical wiring — a demo that behaves differently through the UI than
through the CLI is a demo you cannot debug under time pressure.
"""

from __future__ import annotations

import os
from pathlib import Path

from blockchain_client import ContractResolver, InMemoryChain
from config import load_llm_settings
from core.contract_store import JsonFileStore
from core.llm_client import build_client
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
        self.chain = InMemoryChain(persist_path=DATA_DIR / "chain.json")
        self.index = build_index()
        self.corpus_counts = load_corpus(self.index)
        self.retriever = Retriever(self.index)
        self.resolver = ContractResolver(self.chain, self.store)
        # Built once. A deployment with no API key gets NullLLMClient and runs
        # fully deterministic — a supported mode, reported by /health rather
        # than discovered when a narrative silently fails to appear.
        self.llm_settings = load_llm_settings()
        self.llm = build_client(self.llm_settings)

    @property
    def llm_enabled(self) -> bool:
        return bool(self.llm_settings.get("enabled"))

    def llm_status(self) -> dict:
        """What /health may say about the model backend. Never the key."""
        describe = getattr(self.llm, "describe", None)
        status = {
            "enabled": self.llm_enabled,
            "client": type(self.llm).__name__,
            # Stated so the UI never has to infer why prose is missing.
            "reason": "" if self.llm_enabled else (
                f"no API key in ${self.llm_settings.get('api_key_env', 'OPENROUTER_API_KEY')}"
                " — agents run deterministic (rule-based) and say so"
            ),
        }
        if describe is not None:
            status.update(describe())
        else:
            status["provider"] = None
            status["model"] = None
        return status

    @property
    def corpus_size(self) -> int:
        return len(self.index)

    def reset(self) -> None:
        for path in DATA_DIR.glob("*.json"):
            path.unlink()
        self.chain = InMemoryChain(persist_path=DATA_DIR / "chain.json")
        self.resolver = ContractResolver(self.chain, self.store)


RUNTIME = Runtime()
