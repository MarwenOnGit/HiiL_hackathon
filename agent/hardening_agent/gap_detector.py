"""Which required clauses are absent.

Deterministic checklist, run before any judgement. CLAUDE.md is explicit that
this comes first and that a model only sees what the checklist cannot — so this
module never calls one.

A clause counts as present if it was classified as that type *or* if any of its
cues appears anywhere in the document. The second test matters: a badly
segmented contract can bury the payment terms inside the delivery clause, and
reporting "no payment terms" for a contract that plainly has them destroys
trust in every other finding.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from core.schemas import Clause

from rag.chunker import normalise


@dataclass
class Gap:
    requirement_id: str
    label: str
    severity: str
    why: str

    def as_dict(self) -> dict[str, str]:
        return {
            "requirement_id": self.requirement_id,
            "label": self.label,
            "severity": self.severity,
            "why": self.why,
        }


def detect_gaps(
    clauses: list[Clause], full_text: str, profile: dict[str, Any]
) -> list[Gap]:
    haystack = normalise(full_text)
    gaps: list[Gap] = []

    # Deliberately NOT keyed on clause classification. A clause classified as
    # `delivery_deadline` proves the contract talks about delivery — it does not
    # prove the deadline is quantified, which is what the requirement actually
    # is. Treating classification as presence silently deleted the single most
    # valuable finding on the seed contract ("livraison dans un delai
    # raisonnable" has no deadline at all). Only the strict cues decide.
    for entry in profile["required_clauses"]:
        cues = [
            normalise(c)
            for c in (entry.get("cues_fr", []) + entry.get("cues_ar", []))
        ]
        if any(cue and cue in haystack for cue in cues):
            continue
        gaps.append(Gap(
            requirement_id=entry["id"],
            label=entry.get("label_fr", entry["id"]),
            severity=entry.get("severity", "medium"),
            why=entry.get("why_fr", ""),
        ))
    return gaps
