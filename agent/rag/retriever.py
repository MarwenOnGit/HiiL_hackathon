"""Retrieval, and the honest empty result.

This module is where invariant 7 is actually enforced. Two rules:

**A weak match is not a citation.** Lexical scoring always returns *something*
for a non-empty corpus, and a chunk that shares one common word with the query
is not a legal basis. Scores below `MIN_SCORE` are discarded, so "nothing
relevant" is a real outcome rather than a bad hit.

**An empty result is a value, not an exception.** `NoLegalBasis` carries the
query, the mode, and *why* it was empty — an empty corpus reads differently to
a populated corpus with no match, and a user deserves to know which. Callers
render it; they never substitute generated text for it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from core.schemas import LegalRef
from core.taxonomy import CorpusType, Language

from .index import Scored, VectorIndex, tokenise


class Mode(str, Enum):
    """What the caller is asking.

    NORMATIVE — "what must this clause say" (statute + model clauses).
    EVALUATIVE — "what happens if we fight" (doctrine, outcomes, quantum).

    They never share a result set. A doctrine passage about litigation odds is
    not drafting guidance, and presenting it as such is how a plausible,
    wrong clause gets written.
    """

    NORMATIVE = "normative"
    EVALUATIVE = "evaluative"


_MODE_CORPORA = {
    Mode.NORMATIVE: [CorpusType.NORMATIVE, CorpusType.CLAUSE_LIBRARY],
    Mode.EVALUATIVE: [CorpusType.EVALUATIVE],
}

# Relevance is measured as *term coverage*, not as an absolute BM25 score.
#
# BM25's idf term shrinks as the corpus shrinks: on a filtered set of one
# document the top hit scored 0.575, so an absolute 0.8 floor rejected a
# perfect match. A ~30-article corpus would have hit the same wall, and the
# failure mode is silent — correct citations quietly disappearing.
#
# Coverage asks the question we actually mean: does this chunk contain enough
# of what was asked about to be cited as a basis for it? That is independent of
# how big the corpus is.
#
# Raise it if citations look thin; never lower it to make a demo look fuller.
MIN_COVERAGE = 0.5


@dataclass
class Hit:
    text: str
    source_doc: str
    article_ref: str
    corpus_type: CorpusType
    language: Language
    score: float

    def to_legal_ref(self) -> LegalRef:
        """Every citation in the system is born here, from a real chunk.

        There is no other constructor path in normal use, which is what makes
        a fabricated article reference structurally impossible rather than
        merely discouraged.
        """
        return LegalRef(
            source_doc=self.source_doc,
            article_ref=self.article_ref,
            excerpt=self.text[:600],
            corpus_type=self.corpus_type,
            language=self.language,
        )


@dataclass
class NoLegalBasis:
    """A correct result, not a failure.

    Rendered to the user as "no legal basis found for this clause". The
    `reason` distinguishes an empty corpus from a populated one with no match,
    because the remedy differs: load the corpus, versus accept that the corpus
    says nothing about this.
    """

    query: str
    mode: Mode
    language: Language
    reason: str
    corpus_size: int

    @property
    def message_fr(self) -> str:
        if self.corpus_size == 0:
            return (
                "Aucune base légale citée : le corpus juridique n'est pas encore "
                "chargé. Cette analyse ne repose donc sur aucun texte."
            )
        return (
            "Aucune base légale pertinente trouvée dans le corpus pour ce point. "
            "L'observation ci-dessus est une observation de rédaction, pas une "
            "affirmation juridique."
        )

    @property
    def message_ar(self) -> str:
        if self.corpus_size == 0:
            return "لا يوجد أساس قانوني مذكور: لم يتم تحميل المدونة القانونية بعد."
        return "لم يتم العثور على أساس قانوني مناسب في المدونة بخصوص هذه النقطة."


@dataclass
class RetrievalResult:
    query: str
    mode: Mode
    language: Language
    hits: list[Hit] = field(default_factory=list)
    empty: NoLegalBasis | None = None

    @property
    def grounded(self) -> bool:
        return bool(self.hits)

    def legal_refs(self) -> list[LegalRef]:
        return [h.to_legal_ref() for h in self.hits]


class Retriever:
    def __init__(self, index: VectorIndex) -> None:
        self._index = index

    def retrieve(
        self,
        query: str,
        *,
        mode: Mode,
        language: Language,
        limit: int = 3,
    ) -> RetrievalResult:
        corpus_types = _MODE_CORPORA[mode]
        raw: list[Scored] = self._index.search(
            query, language=language, corpus_types=corpus_types, limit=limit * 3
        )
        terms = set(tokenise(query))
        strong: list[Scored] = []
        best_coverage = 0.0
        for scored in raw:
            coverage = (
                len(terms & set(tokenise(scored.chunk.text))) / len(terms)
                if terms else 0.0
            )
            best_coverage = max(best_coverage, coverage)
            if coverage >= MIN_COVERAGE:
                strong.append(scored)
        strong = strong[:limit]

        if not strong:
            size = len(self._index)
            if size == 0:
                reason = "the corpus is empty — nothing has been indexed"
            elif not raw:
                reason = (
                    f"no chunk in the {mode.value} corpus for {language.value} "
                    "shares any meaningful term with the query"
                )
            else:
                reason = (
                    f"the best match covered {best_coverage:.0%} of the query's "
                    f"terms, below the {MIN_COVERAGE:.0%} floor — too weak to "
                    "cite as a legal basis"
                )
            return RetrievalResult(
                query=query, mode=mode, language=language,
                empty=NoLegalBasis(
                    query=query, mode=mode, language=language,
                    reason=reason, corpus_size=size,
                ),
            )

        return RetrievalResult(
            query=query, mode=mode, language=language,
            hits=[
                Hit(
                    text=s.chunk.text,
                    source_doc=s.chunk.source_doc,
                    article_ref=s.chunk.article_ref,
                    corpus_type=s.chunk.corpus_type,
                    language=s.chunk.language,
                    score=round(s.score, 3),
                )
                for s in strong
            ],
        )
