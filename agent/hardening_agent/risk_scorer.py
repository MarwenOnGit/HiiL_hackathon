"""Ambiguity and asymmetry — the two risk kinds that need no corpus.

The third kind, `unenforceable`, is deliberately absent from this module. A
RiskFlag of that kind cannot be constructed without `legal_refs`, and legal_refs
only exist if retrieval returned something. So an unenforceability finding is
*structurally impossible* without a corpus, which is invariant 7 expressed as a
type constraint rather than as a warning in a docstring.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from core.schemas import RiskFlag
from core.taxonomy import Language, RiskKind

from rag.chunker import normalise


@dataclass
class Finding:
    """A risk flag plus the machinery needed to remediate it."""

    flag: RiskFlag
    matched_text: str
    suggested_fix: str = ""
    # An article a human has read and confirmed governs this defect. Takes
    # precedence over lexical search, which answers "shares vocabulary with"
    # rather than "governs".
    verified_article: str = ""


def score_clause(text: str, profile: dict[str, Any], language: Language) -> list[Finding]:
    haystack = normalise(text)
    findings: list[Finding] = []

    for entry in profile.get("ambiguous_terms", []):
        pattern = entry.get("pattern_ar" if language is Language.AR else "pattern_fr", "")
        if not pattern:
            continue
        if normalise(pattern) in haystack:
            findings.append(Finding(
                flag=RiskFlag(kind=RiskKind.AMBIGUOUS, detail=entry["label_fr"]),
                matched_text=pattern,
                suggested_fix=entry.get("fix_fr", ""),
                verified_article=entry.get("verified_article", ""),
            ))

    for entry in profile.get("asymmetric_patterns", []):
        pattern = entry.get("pattern_fr", "")
        if pattern and normalise(pattern) in haystack:
            findings.append(Finding(
                flag=RiskFlag(kind=RiskKind.ASYMMETRIC, detail=entry["label_fr"]),
                matched_text=pattern,
                verified_article=entry.get("verified_article", ""),
            ))

    return findings
