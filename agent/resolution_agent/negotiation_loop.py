"""Rounds of offers, and the gate that stops short of anything binding.

The loop records positions and narrows options. It never accepts on a party's
behalf and never marks a settlement concluded: `ready_to_draft` is the furthest
it goes, and drafting itself carries a lawyer-review flag.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .settlement_generator import Option


@dataclass
class Round:
    number: int
    proposer: str
    options: list[Option]
    accepted_keys: list[str] = field(default_factory=list)
    rejected_keys: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "round": self.number,
            "proposer": self.proposer,
            "options": [o.as_dict() for o in self.options],
            "accepted": self.accepted_keys,
            "rejected": self.rejected_keys,
        }


@dataclass
class Negotiation:
    rounds: list[Round] = field(default_factory=list)
    lawyer_review_required: bool = True

    def propose(self, proposer: str, options: list[Option]) -> Round:
        rnd = Round(number=len(self.rounds) + 1, proposer=proposer, options=options)
        self.rounds.append(rnd)
        return rnd

    def respond(self, *, accepted: list[str], rejected: list[str]) -> Round:
        if not self.rounds:
            raise ValueError("nothing has been proposed yet")
        current = self.rounds[-1]
        current.accepted_keys = list(accepted)
        current.rejected_keys = list(rejected)
        return current

    @property
    def converged_on(self) -> list[str]:
        return self.rounds[-1].accepted_keys if self.rounds else []

    @property
    def ready_to_draft(self) -> bool:
        """Both sides have landed on something. Still not an agreement."""
        return bool(self.converged_on)

    def as_dict(self) -> dict[str, Any]:
        return {
            "rounds": [r.as_dict() for r in self.rounds],
            "converged_on": self.converged_on,
            "ready_to_draft": self.ready_to_draft,
            # Rule 1: nothing here is binding until a human signs.
            "binding": False,
            "lawyer_review_required": self.lawyer_review_required,
            "human_gate_note": (
                "Aucune de ces options n'engage les parties. Un règlement ne "
                "produit d'effet qu'une fois signé par les deux parties ; il "
                "constitue alors un accord transactionnel contraignant entre "
                "elles."
            ),
        }
