"""BATNA — what each side is walking away to if they litigate.

Three rules from the liability posture, all enforced here:

**Every number carries its source and is shown as a range.** The published
figure is a point estimate of a *standardised* case; presenting it as a
prediction about this case would be false precision. So it is widened into a
band and the band is what the caller gets.

**Contested and uncontested debts branch.** An uncontested debt has a faster
route, and an agent that quotes the ordinary-procedure figures at someone who
could use it is overselling settlement. The uncontested branch therefore
*declines to give figures* rather than inventing optimistic ones.

**Both parties receive identical output.** There is no claimant view and no
respondent view — one estimate, shown to both.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from config import load_batna_reference


@dataclass
class Range:
    low: float
    high: float
    unit: str

    def as_dict(self) -> dict[str, Any]:
        return {"low": round(self.low, 1), "high": round(self.high, 1), "unit": self.unit}


@dataclass
class BatnaEstimate:
    contested: bool
    path_label: str
    source: str
    scope: str
    note: str
    duration: Range | None = None
    cost_percent: Range | None = None
    cost_amount: Range | None = None
    claim_amount: float | None = None
    caveats: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "contested": self.contested,
            "path_label": self.path_label,
            "source": self.source,
            "scope": self.scope,
            "note": self.note,
            "duration_days": self.duration.as_dict() if self.duration else None,
            "cost_percent": self.cost_percent.as_dict() if self.cost_percent else None,
            "cost_amount": self.cost_amount.as_dict() if self.cost_amount else None,
            "claim_amount": self.claim_amount,
            "caveats": self.caveats,
        }


def estimate(*, contested: bool, claim_amount: float | None = None) -> BatnaEstimate:
    config = load_batna_reference()
    reference = config["reference"]
    path = config["paths"]["contested" if contested else "uncontested"]

    common_caveats = [
        "Chiffres standardisés de première instance ; un appel s'ajoute.",
        "Estimation indicative, non un pronostic sur cette affaire.",
        "Les deux parties reçoivent exactement la même estimation.",
    ]

    if not path["uses_reference_figures"]:
        # Deliberately no numbers: we say a faster route exists without
        # fabricating a duration for it.
        return BatnaEstimate(
            contested=contested,
            path_label=path["label_fr"],
            source=reference["source"],
            scope=reference["scope"],
            note=path["note_fr"],
            claim_amount=claim_amount,
            caveats=common_caveats + [
                "Aucun chiffre n'est avancé pour cette voie : aucune source "
                "publiée n'a été retenue pour l'étayer."
            ],
        )

    band = float(reference["uncertainty_band"])
    days = float(reference["duration_days"])
    pct = float(reference["cost_percent_of_claim"])

    duration = Range(days * (1 - band), days * (1 + band), "jours")
    cost_percent = Range(pct * (1 - band), pct * (1 + band), "% de la créance")
    cost_amount = None
    if claim_amount:
        cost_amount = Range(
            claim_amount * cost_percent.low / 100,
            claim_amount * cost_percent.high / 100,
            "TND",
        )

    return BatnaEstimate(
        contested=contested,
        path_label=path["label_fr"],
        source=reference["source"],
        scope=reference["scope"],
        note=path["note_fr"],
        duration=duration,
        cost_percent=cost_percent,
        cost_amount=cost_amount,
        claim_amount=claim_amount,
        caveats=common_caveats,
    )
