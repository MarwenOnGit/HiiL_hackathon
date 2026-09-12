"""Settlement options, monetary and otherwise.

An MSME dispute is usually about a relationship someone wants to keep. A
generator that only ever proposes money misses the options that actually get
accepted — a replacement delivery, a revised schedule, a discount on the next
order — so non-monetary options are produced first and always.

Nothing here is binding. Every option is a proposal for a human to accept, and
the settlement is only enforceable once signed (posture rule 1).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from core.schemas import Fact, SettlementOffer
from core.taxonomy import FactStatus


@dataclass
class Option:
    key: str
    label_fr: str
    monetary: bool
    detail_fr: str
    addresses_clause_ids: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label_fr,
            "monetary": self.monetary,
            "detail": self.detail_fr,
            "addresses_clause_ids": self.addresses_clause_ids,
        }


def generate(
    facts: list[Fact], *, claim_amount: float | None, round_number: int = 1
) -> list[Option]:
    disputed = [f for f in facts if f.status is FactStatus.DISPUTED]
    clause_ids = sorted({cid for f in disputed for cid in f.clause_ids})

    options: list[Option] = [
        Option(
            key="replacement_delivery",
            label_fr="Livraison de remplacement",
            monetary=False,
            detail_fr=(
                "Le fournisseur remplace les unités contestées à ses frais, sous "
                "un délai chiffré convenu, sans paiement supplémentaire."
            ),
            addresses_clause_ids=clause_ids,
        ),
        Option(
            key="revised_schedule",
            label_fr="Échéancier révisé",
            monetary=False,
            detail_fr=(
                "Le paiement est étalé sur un échéancier convenu, en contrepartie "
                "d'un délai de livraison chiffré pour les commandes suivantes."
            ),
            addresses_clause_ids=clause_ids,
        ),
        Option(
            key="next_order_discount",
            label_fr="Remise sur la commande suivante",
            monetary=False,
            detail_fr=(
                "Une remise convenue s'applique à la prochaine commande, ce qui "
                "solde le différend sans transfert de fonds immédiat."
            ),
            addresses_clause_ids=clause_ids,
        ),
    ]

    if claim_amount:
        options.append(Option(
            key="partial_payment",
            label_fr="Règlement partiel immédiat",
            monetary=True,
            detail_fr=(
                f"Versement immédiat d'une fraction convenue des {claim_amount:.0f} TND "
                "en cause, soldant l'ensemble du différend."
            ),
            addresses_clause_ids=clause_ids,
        ))

    return options


def to_offer(options: list[Option], proposer: str, round_number: int) -> SettlementOffer:
    return SettlementOffer(
        terms=[o.label_fr for o in options],
        proposer=proposer,
        round=round_number,
        monetary=any(o.monetary for o in options),
    )
