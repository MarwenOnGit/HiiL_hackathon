"""In-memory chain, good enough to develop the whole agent layer against.

Same validation as any real implementation, so code that works here does not
discover invariant-3 violations at cutover. Ordering, parent links and
per-contract history all behave; what it does not simulate is cost, latency,
reorgs or a failed transaction.

`contract_id` deliberately arrives as metadata rather than as a first-class
column: on a real chain the anchor is keyed by its own doc_id, and grouping
anchors by contract is an indexing concern. Keeping that shape here means the
agent layer is not written against a convenience the real chain won't have.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from core.taxonomy import DocType

from .client import (
    AnchorRecord,
    AttestationRecord,
    ChainError,
    EventType,
    validate_hash,
    validate_metadata,
    validate_parties,
)

CONTRACT_ID_KEY = "contract_id"


class InMemoryChain:
    """A fake with real validation. `mode` mirrors the Node side's convention."""

    mode = "fake"

    def __init__(self) -> None:
        self._anchors: list[AnchorRecord] = []
        self._events: list[AttestationRecord] = []
        self._next_doc = 0

    # ---------- writes ----------

    def anchor_document(
        self,
        document_hash: str,
        doc_type: DocType,
        parties: list[str],
        parent_doc_id: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> AnchorRecord:
        document_hash = validate_hash(document_hash, "document_hash")
        party_tuple = validate_parties(parties)
        clean_metadata = validate_metadata(metadata)
        doc_type = DocType(doc_type)

        if parent_doc_id is not None and self._anchor(parent_doc_id) is None:
            raise ChainError(f"parent_doc_id {parent_doc_id} has never been anchored")

        doc_id = f"doc_{self._next_doc:04d}"
        self._next_doc += 1
        record = AnchorRecord(
            doc_id=doc_id,
            tx_hash=self._tx_hash("anchor", doc_id, document_hash),
            document_hash=document_hash,
            doc_type=doc_type,
            parties=party_tuple,
            parent_doc_id=parent_doc_id,
            timestamp=datetime.now(timezone.utc),
            metadata=clean_metadata,
        )
        self._anchors.append(record)
        return record

    def attest_event(
        self,
        contract_id: str,
        event_type: EventType,
        payload_hash: str,
        signer: str,
    ) -> AttestationRecord:
        payload_hash = validate_hash(payload_hash, "payload_hash")
        (signer,) = validate_parties([signer])
        event_type = EventType(event_type)
        if not contract_id:
            raise ChainError("contract_id is required")

        record = AttestationRecord(
            tx_hash=self._tx_hash("event", contract_id, payload_hash),
            contract_id=contract_id,
            event_type=event_type,
            payload_hash=payload_hash,
            signer=signer,
            timestamp=datetime.now(timezone.utc),
        )
        self._events.append(record)
        return record

    # ---------- reads ----------

    def fetch_history(self, contract_id: str) -> list[AnchorRecord | AttestationRecord]:
        """Anchors and events for one contract, oldest first.

        Timestamps can collide at in-memory speed, so insertion order breaks
        ties — the history must be totally ordered to be evidence of a sequence.
        """
        items: list[tuple[datetime, int, AnchorRecord | AttestationRecord]] = []
        for index, anchor in enumerate(self._anchors):
            if anchor.metadata.get(CONTRACT_ID_KEY) == contract_id:
                items.append((anchor.timestamp, index, anchor))
        offset = len(self._anchors)
        for index, event in enumerate(self._events):
            if event.contract_id == contract_id:
                items.append((event.timestamp, offset + index, event))
        items.sort(key=lambda row: (row[0], row[1]))
        return [row[2] for row in items]

    def fetch_latest_anchor(self, contract_id: str) -> AnchorRecord | None:
        anchors = [
            a for a in self._anchors
            if a.metadata.get(CONTRACT_ID_KEY) == contract_id
        ]
        return anchors[-1] if anchors else None

    def _anchor(self, doc_id: str) -> AnchorRecord | None:
        return next((a for a in self._anchors if a.doc_id == doc_id), None)

    @staticmethod
    def _tx_hash(*parts: str) -> str:
        digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
        return f"0x{digest}"
