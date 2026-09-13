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

# A term appearing in more than this share of the candidate set carries no
# selective signal. "tout", "moment", "pourra" are as common in a civil code as
# stopwords are in prose, and counting them as evidence is how a query about
# unilateral termination cited an article about goods sold by weight: the chunk
# genuinely shared four words, none of which meant anything.
#
# Coverage is therefore measured over SIGNAL terms only — the ones selective
# enough that sharing them is actually evidence of aboutness.
MAX_SIGNAL_DF = 0.10

# One shared selective word is a coincidence; two is evidence. A query sharing
# only "quantite" with an article about deposit registers, or only "duree" with
# an article about sharecropping partnerships, produced a confident citation to
# something completely unrelated. Requiring two independent signal terms killed
# both without losing the citations that were actually right.
#
# The consequence is deliberate: fewer clauses get a legal basis, and the rest
# honestly report that none was found. That is the correct trade — a wrong
# citation in front of a legal jury costs more than a missing one.
MIN_SIGNAL_MATCHES = 2

# Document frequency is a statistic, and a statistic needs a sample. On a
# candidate set of two or three chunks every term appears in "100% of
# documents" and the selectivity filter deletes all signal, so retrieval
# returns nothing at all. Below this size, treat every query term as selective
# and let coverage alone decide.
MIN_CORPUS_FOR_DF = 20


@dataclass
class Hit:
    text: str
    source_doc: str
    article_ref: str
    corpus_type: CorpusType
    language: Language
    score: float
    matched_terms: list[str] = field(default_factory=list)

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

    def by_article_ref(
        self, article_ref: str, *, language: Language, corpus_types: list[CorpusType]
    ) -> Hit | None:
        """Fetch one article by reference — for hand-verified pins.

        Lexical search is good at "shares vocabulary" and bad at "governs this
        defect", which is why a human-verified anchor beats it for the handful
        of findings that matter most. The pin names the article; the TEXT still
        comes from the corpus, so nothing is fabricated and a wrong pin is
        visible the moment someone reads the excerpt.
        """
        wanted = article_ref.strip().lower()
        for chunk in getattr(self._index, "_chunks", []):
            if chunk.language is not language or chunk.corpus_type not in corpus_types:
                continue
            ref = chunk.article_ref.split(" (")[0].strip().lower()
            if ref == wanted:
                return Hit(
                    text=chunk.text, source_doc=chunk.source_doc,
                    article_ref=chunk.article_ref, corpus_type=chunk.corpus_type,
                    language=chunk.language, score=float("inf"),
                    matched_terms=["(vérifié à la main)"],
                )
        return None

    def _signal_terms(
        self, terms: set[str], language: Language, corpus_types: list[CorpusType]
    ) -> set[str]:
        """Query terms selective enough that sharing one is real evidence."""
        candidates = [
            c for c in getattr(self._index, "_chunks", [])
            if c.language is language and c.corpus_type in corpus_types
        ]
        total = len(candidates)
        if total == 0:
            return set()
        if total < MIN_CORPUS_FOR_DF:
            return set(terms)
        selective: set[str] = set()
        for term in terms:
            hits = sum(1 for c in candidates if term in set(tokenise(c.text)))
            if hits and hits / total <= MAX_SIGNAL_DF:
                selective.add(term)
        return selective

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
        signal = self._signal_terms(terms, language, corpus_types)

        strong: list[Scored] = []
        best_coverage = 0.0
        best_matches = 0
        matched_by_chunk: dict[str, list[str]] = {}
        for scored in raw:
            chunk_terms = set(tokenise(scored.chunk.text))
            matched = signal & chunk_terms
            coverage = len(matched) / len(signal) if signal else 0.0
            best_coverage = max(best_coverage, coverage)
            best_matches = max(best_matches, len(matched))
            if len(matched) >= MIN_SIGNAL_MATCHES and coverage >= MIN_COVERAGE:
                matched_by_chunk[scored.chunk.chunk_id] = sorted(matched)
                strong.append(scored)
        strong = strong[:limit]

        if not strong:
            size = len(self._index)
            if size == 0:
                reason = "the corpus is empty — nothing has been indexed"
            elif not signal:
                reason = (
                    "the query contains no term selective enough to cite on — "
                    "every word in it is common across the corpus"
                )
            elif not raw:
                reason = (
                    f"no chunk in the {mode.value} corpus for {language.value} "
                    "shares any meaningful term with the query"
                )
            elif best_matches < MIN_SIGNAL_MATCHES:
                reason = (
                    f"the best match shared only {best_matches} selective term "
                    f"with the query ({MIN_SIGNAL_MATCHES} required) — a single "
                    "shared word is a coincidence, not a legal basis"
                )
            else:
                reason = (
                    f"the best match covered {best_coverage:.0%} of the query's "
                    f"selective terms, below the {MIN_COVERAGE:.0%} floor — too "
                    "weak to cite as a legal basis"
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
                    matched_terms=matched_by_chunk.get(s.chunk.chunk_id, []),
                )
                for s in strong
            ],
        )
