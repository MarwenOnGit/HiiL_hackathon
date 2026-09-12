"""Index the legal corpus and report exactly what was found.

Run after adding files to rag/corpus/. Prints per language and corpus type, so
a corpus that silently landed in the wrong folder is visible immediately — a
file under fr/evaluative will never answer a normative French query, and
without this output that looks like a retrieval bug.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rag import build_index  # noqa: E402
from runtime import CORPUS_DIR, load_corpus  # noqa: E402


def main() -> int:
    index = build_index()
    counts = load_corpus(index)
    total = sum(counts.values())

    print(f"corpus root: {CORPUS_DIR}")
    for key in sorted(counts):
        marker = " " if counts[key] else "!"
        print(f"  {marker} {key:<24} {counts[key]:>4} chunks")
    print(f"  total: {total} chunks")

    if total == 0:
        print()
        print("The corpus is empty. That is a valid state: every legal finding")
        print("will render as 'no legal basis retrieved', which is a correct")
        print("result, not a broken one. Add files per rag/corpus/README.md.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
