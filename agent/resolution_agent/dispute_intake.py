"""Opening a dispute against the version that actually governed it.

The mistake this module exists to prevent: resolving against the *latest*
version. A dispute about a June delivery is governed by whatever was in force
in June, even if the contract was amended in September. Getting this wrong
means arguing about terms that did not apply.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from core.schemas import ContractObject, ContractVersion, DisputeRecord
from core.version_manager import effective_to, governing_version_at


class NoGoverningVersion(Exception):
    """Nothing was in force on the event date — the dispute cannot be framed."""


@dataclass
class Intake:
    dispute: DisputeRecord
    version: ContractVersion
    window: tuple[datetime, datetime | None]

    @property
    def explanation_fr(self) -> str:
        start, end = self.window
        tail = f"jusqu'au {end.date()}" if end else "toujours en vigueur"
        return (
            f"Version applicable : {self.version.version_id} "
            f"({self.version.doc_type}), en vigueur du {start.date()} {tail}. "
            "Choisie d'après la date des faits, et non la version la plus récente."
        )


def open_dispute(
    contract: ContractObject, *, dispute_id: str, event_date: datetime, claims: list[str]
) -> Intake:
    version = governing_version_at(contract, event_date)
    if version is None:
        raise NoGoverningVersion(
            f"no version of {contract.contract_id} was in force on "
            f"{event_date.isoformat()} — the earliest takes effect later"
        )
    return Intake(
        dispute=DisputeRecord(
            dispute_id=dispute_id,
            contract_id=contract.contract_id,
            governing_version_id=version.version_id,
            claims=list(claims),
        ),
        version=version,
        window=(version.effective_from, effective_to(contract, version.version_id)),
    )
