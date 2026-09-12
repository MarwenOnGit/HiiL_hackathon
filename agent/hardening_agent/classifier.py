"""Which required clause is this, and what language is it in.

Cue matching against the profile, accent- and case-insensitive. Deliberately
not a model: classification must be identical on every run, and a checklist
that drifts makes the gap report untrustworthy.
"""

from __future__ import annotations

from typing import Any

from core.taxonomy import Language

from rag.chunker import normalise

UNCLASSIFIED = "unclassified"


def _cues_for(entry: dict[str, Any], language: Language) -> list[str]:
    """Strict presence cues plus the loose topic cues.

    The classifier is allowed both; the gap detector is allowed only the strict
    set. See the comment at the top of the profile for why conflating them
    deletes true findings.
    """
    suffix = "ar" if language is Language.AR else "fr"
    return [
        normalise(c)
        for c in (entry.get(f"cues_{suffix}", []) + entry.get(f"topic_cues_{suffix}", []))
    ]


def classify(text: str, profile: dict[str, Any], language: Language) -> str:
    """Best-matching required-clause id, or UNCLASSIFIED.

    Scored by how many distinct cues hit, so a clause mentioning both
    "livraison" and "jours ouvrables" is classified as the delivery deadline
    rather than as whichever rule happened to be listed first.
    """
    haystack = normalise(text)
    # A clause's heading names its subject far more reliably than its body:
    # "Article 4 - Livraison" is decisive, while the word "fournisseur" inside
    # the body is noise that appears in every clause. So a cue found in the
    # first line counts for more than one found anywhere else.
    first_line = normalise(text.splitlines()[0]) if text.strip() else ""

    best_id, best_score = UNCLASSIFIED, 0.0
    for entry in profile["required_clauses"]:
        cues = _cues_for(entry, language)
        score = 0.0
        for cue in cues:
            if not cue:
                continue
            if cue in first_line:
                score += 3.0
            elif cue in haystack:
                score += 1.0
        if score > best_score:
            best_id, best_score = entry["id"], score
    return best_id
