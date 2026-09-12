"""The agent service — the Python half of the seam ARCHITECTURE.md §3 describes.

Node calls this over HTTP. Every handler is defensive about its inputs and
returns a structured error rather than a stack trace, because the caller is a
live demo.
"""

from __future__ import annotations

import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from blockchain_client.client import ChainError
from config import load_profile
from core.schemas import Party
from core.taxonomy import DocType, ReviewStatus
from core.version_manager import add_version
from hardening_agent import harden
from hardening_agent.ingest import get_engine
from resolution_agent import resolve
from resolution_agent.dispute_intake import NoGoverningVersion
from resolution_agent.fact_reconciler import Statement
from runtime import RUNTIME

app = FastAPI(title="Insaf agent service", version="3.0")

DEFAULT_PARTIES = [
    Party("p_buyer", "msme_owner", "Atelier Trabelsi", "pseudo_buyer"),
    Party("p_supplier", "counterparty", "Bois du Nord", "pseudo_supplier"),
]


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "chain_mode": RUNTIME.chain.mode,
        "corpus_size": RUNTIME.corpus_size,
        "corpus_breakdown": RUNTIME.corpus_counts,
        # Stated plainly so the UI never implies findings were legally checked.
        "grounding_available": RUNTIME.corpus_size > 0,
    }


@app.post("/harden")
async def harden_endpoint(
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    contract_id: str = Form(default="contract_demo_001"),
    profile: str = Form(default="supply"),
    effective_from: str | None = Form(default=None),
) -> dict[str, Any]:
    if file is not None:
        suffix = Path(file.filename or "upload.txt").suffix or ".txt"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
            handle.write(await file.read())
            temp_path = Path(handle.name)
        try:
            document = get_engine(temp_path).extract(temp_path)
        except ValueError as exc:
            raise HTTPException(status_code=415, detail=str(exc)) from exc
        finally:
            temp_path.unlink(missing_ok=True)
        if not document.usable:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "could not read this document",
                    "needs_ocr": document.needs_ocr,
                    "warnings": document.warnings,
                },
            )
        body = document.text
    elif text:
        body = text
    else:
        raise HTTPException(status_code=400, detail="provide a file or text")

    try:
        report = harden(
            text=body,
            contract_id=contract_id,
            parties=DEFAULT_PARTIES,
            profile=load_profile(profile),
            retriever=RUNTIME.retriever,
            chain=RUNTIME.chain,
            store=RUNTIME.store,
            effective_from=_parse_when(effective_from),
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return report.as_dict()


class AcceptBody(BaseModel):
    accepted_clause_ids: list[str] = []
    lawyer_validated: bool = False


@app.post("/contracts/{contract_id}/accept")
def accept_redlines(contract_id: str, body: AcceptBody) -> dict[str, Any]:
    """The human gate. Accepting redlines is a human act (invariant 4).

    Produces a hardened PROPOSAL — deliberately not anchored, because a
    proposal is not a fact.
    """
    if not RUNTIME.store.exists(contract_id):
        raise HTTPException(status_code=404, detail="unknown contract")
    contract = RUNTIME.store.get(contract_id)
    latest = contract.versions[-1]

    import copy
    clauses = [copy.deepcopy(c) for c in latest.clauses]  # same clause_ids, by design
    hardened = add_version(
        contract,
        doc_type=DocType.HARDENED,
        text_hash=latest.text_hash,
        clauses=clauses,
        parent_version_id=latest.version_id,
        review_status=(
            ReviewStatus.LAWYER_VALIDATED if body.lawyer_validated
            else ReviewStatus.PARTY_ACCEPTED
        ),
    )
    RUNTIME.store.save(contract)
    return {
        "version_id": hardened.version_id,
        "parent_version_id": hardened.parent_version_id,
        "doc_type": str(hardened.doc_type),
        "status": str(hardened.status),
        "review_status": str(hardened.review_status),
        "accepted_clause_ids": body.accepted_clause_ids,
        "anchored": False,
        "note": (
            "Proposition enregistrée, non ancrée : une proposition n'est pas "
            "un fait. L'ancrage intervient à la signature."
        ),
    }


def _parse_when(value: str | None) -> datetime:
    """Backdating exists so the seeded demo has a real history to reason over."""
    if not value:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


class SignBody(BaseModel):
    lawyer_validated: bool = False
    effective_from: str | None = None


@app.post("/contracts/{contract_id}/sign")
def sign(contract_id: str, body: SignBody) -> dict[str, Any]:
    """Both parties have signed: a new version takes force and is anchored."""
    if not RUNTIME.store.exists(contract_id):
        raise HTTPException(status_code=404, detail="unknown contract")
    contract = RUNTIME.store.get(contract_id)
    parent = contract.versions[-1]

    import copy, hashlib
    clauses = [copy.deepcopy(c) for c in parent.clauses]
    text_hash = "0x" + hashlib.sha256(
        (parent.text_hash + contract_id + "signed").encode()
    ).hexdigest()

    signed = add_version(
        contract,
        doc_type=DocType.SIGNED,
        text_hash=text_hash,
        clauses=clauses,
        parent_version_id=parent.version_id,
        effective_from=_parse_when(body.effective_from),
        review_status=(
            ReviewStatus.LAWYER_VALIDATED if body.lawyer_validated
            else ReviewStatus.PARTY_ACCEPTED
        ),
    )
    # The off-chain parent is v2 (the hardened proposal), but v2 was
    # deliberately never anchored — "a proposal is not a fact" — so it has no
    # doc_id to point at. On-chain the link must therefore reach the nearest
    # ANCHORED ancestor, which is the original. Off-chain lineage and on-chain
    # provenance are both complete; they just have different granularity.
    previous = RUNTIME.chain.fetch_latest_anchor(contract_id)
    record = RUNTIME.chain.anchor_document(
        text_hash, DocType.SIGNED,
        [p.pseudonym for p in contract.parties],
        parent_doc_id=previous.doc_id if previous else None,
        metadata={"contract_id": contract_id},
    )
    signed.anchor_tx = record.tx_hash
    RUNTIME.store.save(contract)
    return {
        "version_id": signed.version_id,
        "parent_version_id": signed.parent_version_id,
        "anchored": True,
        "doc_id": record.doc_id,
        "tx_hash": record.tx_hash,
        "effective_from": signed.effective_from.isoformat(),
    }


@app.get("/contracts/{contract_id}")
def get_contract(contract_id: str) -> dict[str, Any]:
    if not RUNTIME.store.exists(contract_id):
        raise HTTPException(status_code=404, detail="unknown contract")
    contract = RUNTIME.store.get(contract_id)
    from core.version_manager import effective_to, status_of
    return {
        "contract_id": contract.contract_id,
        "parties": [
            {"party_id": p.party_id, "role": p.role, "display_name": p.display_name}
            for p in contract.parties
        ],
        "versions": [
            {
                "version_id": v.version_id,
                "parent_version_id": v.parent_version_id,
                "doc_type": str(v.doc_type),
                "status": str(status_of(contract, v.version_id)),
                "review_status": str(v.review_status),
                "effective_from": v.effective_from.isoformat() if v.effective_from else None,
                "effective_to": (
                    effective_to(contract, v.version_id).isoformat()
                    if effective_to(contract, v.version_id) else None
                ),
                "clause_count": len(v.clauses),
                "anchor_tx": v.anchor_tx,
            }
            for v in contract.versions
        ],
    }


@app.get("/contracts/{contract_id}/history")
def history(contract_id: str) -> dict[str, Any]:
    items = RUNTIME.chain.fetch_history(contract_id)
    return {
        "contract_id": contract_id,
        "entries": [
            {
                "kind": type(item).__name__,
                "tx_hash": item.tx_hash,
                "timestamp": item.timestamp.isoformat(),
                "detail": (
                    {"doc_id": item.doc_id, "doc_type": str(item.doc_type),
                     "parent_doc_id": item.parent_doc_id}
                    if type(item).__name__ == "AnchorRecord"
                    else {"event_type": str(item.event_type), "signer": item.signer}
                ),
            }
            for item in items
        ],
    }


@app.get("/contracts/{contract_id}/verify")
def verify(contract_id: str) -> dict[str, Any]:
    """Tamper check. A mismatch is the system working."""
    try:
        resolved = RUNTIME.resolver.fetch_contract(contract_id)
    except ChainError as exc:
        return {"verified": False, "error": str(exc)}
    return {
        "verified": True,
        "version_id": resolved.version.version_id,
        "text_hash": resolved.version.text_hash,
        "anchor_doc_id": resolved.anchor.doc_id,
    }


class StatementIn(BaseModel):
    party_id: str
    text: str
    evidence_refs: list[str] = []


class DisputeBody(BaseModel):
    contract_id: str
    dispute_id: str = "dispute_001"
    event_date: str
    claims: list[str] = []
    statements: list[StatementIn]
    contested: bool = True
    claim_amount: float | None = None


@app.post("/disputes")
def open_dispute(body: DisputeBody) -> dict[str, Any]:
    if not RUNTIME.store.exists(body.contract_id):
        raise HTTPException(status_code=404, detail="unknown contract")
    contract = RUNTIME.store.get(body.contract_id)
    try:
        event_date = datetime.fromisoformat(body.event_date)
        if event_date.tzinfo is None:
            event_date = event_date.replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="event_date must be ISO 8601") from exc

    obligations = list(contract.obligations())
    try:
        report = resolve(
            contract=contract,
            dispute_id=body.dispute_id,
            event_date=event_date,
            claims=body.claims,
            statements=[
                Statement(s.party_id, s.text, s.evidence_refs) for s in body.statements
            ],
            obligations=obligations,
            contested=body.contested,
            claim_amount=body.claim_amount,
            chain=RUNTIME.chain,
        )
    except NoGoverningVersion as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return report.as_dict()


@app.post("/admin/reset")
def reset() -> dict[str, Any]:
    RUNTIME.reset()
    return {"ok": True, "message": "store and chain cleared"}
