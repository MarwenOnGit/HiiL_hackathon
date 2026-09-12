"""Attach each fact to the clauses of the governing version that speak to it.

Uses the stable clause_id, so a mapping made against v1 still means something
after the clause is rewritten in v3 — which is the entire reason invariant 2
exists.
"""

from __future__ import annotations

from core.schemas import ContractVersion, Fact

from rag.index import tokenise

RELEVANT = 0.12


def map_facts(facts: list[Fact], version: ContractVersion) -> list[Fact]:
    clause_tokens = {c.clause_id: set(tokenise(c.text)) for c in version.clauses}
    for fact in facts:
        tokens = set(tokenise(fact.fact))
        if not tokens:
            continue
        scored = [
            (cid, len(tokens & words) / len(tokens))
            for cid, words in clause_tokens.items()
            if words
        ]
        fact.clause_ids = [
            cid for cid, score in sorted(scored, key=lambda kv: -kv[1])
            if score >= RELEVANT
        ][:3]
    return facts
