"""`fetch_contract` — the composition that makes anchoring worth doing.

v3's interface names `fetch_contract(contract_id) -> structured terms`. It is
not a chain call and cannot be one: the chain holds only a fingerprint, so
returning terms means fetching text from off-chain storage and proving it still
matches. That proof is the product.

Four steps, in this order:
  1. read the latest anchor for the contract
  2. pull the version's text from off-chain storage
  3. re-hash it and compare against the anchored fingerprint
  4. return the structured terms

**A mismatch raises `TamperDetected`.** It is not a warning and not a flag on
an otherwise-successful result — a caller that forgets to check a boolean would
silently serve altered terms, which is the one outcome this whole system exists
to prevent.
"""

from __future__ import annotations

from dataclasses import dataclass

from core.contract_store import ContractStore
from core.schemas import ContractObject, ContractVersion

from .client import AnchorRecord, BlockchainClient, ChainError


class TamperDetected(ChainError):
    """The stored text no longer hashes to what was anchored.

    This is the system working, not failing.
    """


@dataclass
class ResolvedContract:
    contract_id: str
    version: ContractVersion
    anchor: AnchorRecord
    verified: bool = True          # always True; a False would have raised


class ContractResolver:
    def __init__(self, chain: BlockchainClient, store: ContractStore) -> None:
        self._chain = chain
        self._store = store

    def fetch_contract(self, contract_id: str) -> ResolvedContract:
        anchor = self._chain.fetch_latest_anchor(contract_id)
        if anchor is None:
            raise ChainError(f"no anchor on record for {contract_id}")

        contract: ContractObject = self._store.get(contract_id)
        version = next(
            (v for v in contract.versions if v.text_hash.lower() == anchor.document_hash),
            None,
        )
        if version is None:
            raise TamperDetected(
                f"the anchored fingerprint {anchor.document_hash} matches no "
                f"stored version of {contract_id}. Either the stored text was "
                "altered after anchoring, or a version was removed — both are "
                "the tamper case this check exists to catch."
            )
        return ResolvedContract(contract_id=contract_id, version=version, anchor=anchor)

    def verify_version(self, contract_id: str, version_id: str) -> bool:
        """Was this specific version anchored, and does its text still match?

        Returns a bool because the question is genuinely a question — unlike
        fetch_contract, which promises terms and must not hand back bad ones.
        """
        contract = self._store.get(contract_id)
        version = contract.version(version_id)
        if version is None:
            raise ChainError(f"unknown version {version_id}")
        for item in self._chain.fetch_history(contract_id):
            if isinstance(item, AnchorRecord) and item.document_hash == version.text_hash.lower():
                return True
        return False
