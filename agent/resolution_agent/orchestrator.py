"""Runs Agent 2 end to end.

intake (governing version by event date) -> reconcile facts -> map to clauses
-> estimate BATNA -> generate options -> open a negotiation round.

Never analyses the contract (invariant 5): it reads the version Agent 1 built
and reasons over facts and obligations.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from blockchain_client.client import BlockchainClient, EventType
from core.schemas import ContractObject, Fact, Obligation
from core.taxonomy import FactStatus

from .clause_mapper import map_facts
from .dispute_intake import Intake, open_dispute
from .entitlement_estimator import BatnaEstimate, estimate
from .fact_reconciler import Statement, reconcile, summarise
from .negotiation_loop import Negotiation
from .settlement_generator import Option, generate


@dataclass
class DisputeReport:
    intake: Intake
    facts: list[Fact]
    batna: BatnaEstimate
    options: list[Option]
    negotiation: Negotiation
    attest_tx: str | None = None
    caveats: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "dispute_id": self.intake.dispute.dispute_id,
            "contract_id": self.intake.dispute.contract_id,
            "governing_version": {
                "version_id": self.intake.version.version_id,
                "doc_type": str(self.intake.version.doc_type),
                "explanation": self.intake.explanation_fr,
            },
            "fact_ledger": {
                "summary": summarise(self.facts),
                "facts": [
                    {
                        "fact": f.fact,
                        "status": str(f.status),
                        "clause_ids": f.clause_ids,
                        "source_evidence": f.source_evidence,
                    }
                    for f in self.facts
                ],
                "note": (
                    "« non étayé » signifie qu'aucun élément n'a été produit, "
                    "pas qu'une partie a tort. Les deux parties voient ce même "
                    "tableau."
                ),
            },
            "batna": self.batna.as_dict(),
            "settlement_options": [o.as_dict() for o in self.options],
            "negotiation": self.negotiation.as_dict(),
            "anchor": {"attest_tx": self.attest_tx},
            "neutrality": {
                "shared_ledger": True,
                "shared_batna": True,
                "note": (
                    "Analyse neutre : aucun conseil n'est donné à l'une des "
                    "parties contre l'autre."
                ),
            },
        }


def resolve(
    *,
    contract: ContractObject,
    dispute_id: str,
    event_date: datetime,
    claims: list[str],
    statements: list[Statement],
    obligations: list[Obligation] | None = None,
    contested: bool = True,
    claim_amount: float | None = None,
    chain: BlockchainClient | None = None,
) -> DisputeReport:
    intake = open_dispute(
        contract, dispute_id=dispute_id, event_date=event_date, claims=claims
    )

    facts = reconcile(statements, obligations or [])
    facts = map_facts(facts, intake.version)
    intake.dispute.fact_ledger = facts

    batna = estimate(contested=contested, claim_amount=claim_amount)
    options = generate(facts, claim_amount=claim_amount)

    negotiation = Negotiation()
    negotiation.propose("system", options)

    attest_tx = None
    if chain is not None:
        # Proof that resolution was attempted before court — the product's
        # central legal claim, and the reason this event is anchored at all.
        import hashlib
        payload = hashlib.sha256(
            "|".join(sorted(f.fact for f in facts)).encode("utf-8")
        ).hexdigest()
        record = chain.attest_event(
            contract.contract_id, EventType.DISPUTE_OPENED, f"0x{payload}",
            contract.parties[0].pseudonym if contract.parties else "pseudo_unknown",
        )
        attest_tx = record.tx_hash

    return DisputeReport(
        intake=intake,
        facts=facts,
        batna=batna,
        options=options,
        negotiation=negotiation,
        attest_tx=attest_tx,
        caveats=batna.caveats,
    )
