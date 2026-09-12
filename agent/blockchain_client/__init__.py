"""The chain seam: an interface, an in-memory fake, and the resolver that turns
an anchor back into verified terms.

Deliberately independent of the colleague's Node `ChainService`. Nothing here
touches `contracts/` or `backend/`. The agent layer develops against the fake
until the on-chain schema is renegotiated, so chain readiness never blocks
agent work.
"""

from .client import (
    AnchorRecord,
    AttestationRecord,
    BlockchainClient,
    ChainError,
    OnChainPayloadRejected,
    EventType,
)
from .fake import InMemoryChain
from .resolver import ContractResolver, TamperDetected

__all__ = [
    "AnchorRecord", "AttestationRecord", "BlockchainClient", "ChainError",
    "OnChainPayloadRejected", "EventType", "InMemoryChain", "ContractResolver",
    "TamperDetected",
]
