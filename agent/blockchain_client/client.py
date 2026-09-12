"""What the chain is allowed to hold, and the operations over it.

Invariant 3 is enforced here rather than trusted: `anchor_document` and
`attest_event` validate their payloads and refuse anything that looks like
document content. The realistic mistake is not someone deciding to put a
contract on-chain — it is a convenience field growing until the clause text is
riding along inside `metadata`. So metadata values are length-capped and a set
of content-carrying key names is refused outright.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

from core.taxonomy import DocType, StrEnum

_HASH_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")

# A hash, a pseudonym, a timestamp and an event type are all short. Anything
# longer arriving as "metadata" is document content wearing a disguise.
MAX_METADATA_VALUE_CHARS = 256

# Key names that mean someone is about to put content on the chain.
_CONTENT_KEYS = {
    "text", "contract_text", "body", "clause", "clauses", "excerpt", "content",
    "full_text", "document", "evidence", "transcript", "message", "messages",
}


class ChainError(Exception):
    pass


class OnChainPayloadRejected(ChainError):
    """The payload would have put content on-chain (invariant 3)."""


class EventType(StrEnum):
    """The only facts the chain records about a contract's life.

    An enum, not a free string, because "only event types go on-chain" is
    meaningless if the type is an arbitrary sentence.
    """

    OBLIGATION_PERFORMED = "obligation_performed"
    OBLIGATION_BREACHED = "obligation_breached"
    DISPUTE_OPENED = "dispute_opened"
    DISPUTE_RESOLVED = "dispute_resolved"
    DISPUTE_ESCALATED = "dispute_escalated"
    SETTLEMENT_SIGNED = "settlement_signed"


@dataclass(frozen=True)
class AnchorRecord:
    doc_id: str
    tx_hash: str
    document_hash: str
    doc_type: DocType
    parties: tuple[str, ...]          # pseudonyms only
    parent_doc_id: str | None
    timestamp: datetime
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class AttestationRecord:
    tx_hash: str
    contract_id: str
    event_type: EventType
    payload_hash: str
    signer: str                       # pseudonym
    timestamp: datetime


class BlockchainClient(Protocol):
    """The chain operations. Note what is absent: there is no `fetch_contract`
    here, because resolving terms needs off-chain text that the chain cannot
    see. That composition lives in `resolver.ContractResolver`.
    """

    mode: str

    def anchor_document(
        self,
        document_hash: str,
        doc_type: DocType,
        parties: list[str],
        parent_doc_id: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> AnchorRecord: ...

    def attest_event(
        self,
        contract_id: str,
        event_type: EventType,
        payload_hash: str,
        signer: str,
    ) -> AttestationRecord: ...

    def fetch_history(self, contract_id: str) -> list[AnchorRecord | AttestationRecord]: ...

    def fetch_latest_anchor(self, contract_id: str) -> AnchorRecord | None: ...


# ---------- shared payload validation ----------


def validate_hash(value: str, label: str) -> str:
    if not isinstance(value, str) or not _HASH_RE.match(value):
        raise OnChainPayloadRejected(
            f"{label} must be a 0x-prefixed 32-byte hex hash; got {value!r}. "
            "The chain stores fingerprints, never content (invariant 3)."
        )
    return value.lower()


def validate_parties(parties: list[str]) -> tuple[str, ...]:
    if not parties:
        raise OnChainPayloadRejected("at least one party pseudonym is required")
    for party in parties:
        if not isinstance(party, str) or not party:
            raise OnChainPayloadRejected(f"party must be a non-empty string; got {party!r}")
        # A pseudonym is opaque: an id, a hash, a uuid. A display name has
        # spaces in it. Whitespace is a far better discriminator than a length
        # guess — "Ines Trabelsi — Atelier Trabelsi" is only 32 characters.
        if any(ch.isspace() for ch in party):
            raise OnChainPayloadRejected(
                f"party {party!r} contains whitespace, so it is a display name "
                "rather than a pseudonym — pass the pseudonymous id, never a "
                "human-readable name (invariant 3)"
            )
        if len(party) > 64:
            raise OnChainPayloadRejected(
                f"party {party!r} is too long to be a pseudonym (invariant 3)"
            )
    return tuple(parties)


def validate_metadata(metadata: dict[str, str] | None) -> dict[str, str]:
    if not metadata:
        return {}
    clean: dict[str, str] = {}
    for key, value in metadata.items():
        if key.lower() in _CONTENT_KEYS:
            raise OnChainPayloadRejected(
                f"metadata key {key!r} carries document content — the chain "
                "holds only hashes, pseudonymous ids, timestamps and event "
                "types (invariant 3)"
            )
        if not isinstance(value, str):
            raise OnChainPayloadRejected(
                f"metadata value for {key!r} must be a string; got {type(value).__name__}"
            )
        if len(value) > MAX_METADATA_VALUE_CHARS:
            raise OnChainPayloadRejected(
                f"metadata value for {key!r} is {len(value)} chars, over the "
                f"{MAX_METADATA_VALUE_CHARS}-char cap — this is how contract "
                "text ends up on-chain by accident (invariant 3)"
            )
        clean[key] = value
    return clean
