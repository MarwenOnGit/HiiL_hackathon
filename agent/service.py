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

import threading

from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from blockchain_client.client import ChainError
from chat_assistant import answer_question
from config import load_profile
from core.contract_store import AppendOnlyViolation
from core.hashing import content_hash
from core.identity import IDENTITY_MODEL, derive_pseudonym
from core.schemas import Party, LegalIdentity
from core.taxonomy import DocType, ReviewStatus
from core.version_manager import LineageError, add_version
from hardening_agent import harden
from hardening_agent.builder import BuildError, build_contract_text, buyer_and_supplier, essentials_meta
from hardening_agent.ingest import get_engine
import narration
from monitor import (
    build_schedule,
    check_in_text,
    confirm_obligation,
    escalate_to_amicable,
    monitor_as_of,
)
from resolution_agent import resolve
from resolution_agent.dispute_intake import NoGoverningVersion
from resolution_agent.fact_reconciler import Statement
from runtime import RUNTIME

app = FastAPI(title="Insaf agent service", version="3.0")


def _refusal(status_code: int, exc: Exception) -> JSONResponse:
    """One shape for every refusal the foundation raises.

    `error` and `detail` carry the same sentence: the Next app reads `error`
    (see web/app/harden/page.tsx) while FastAPI's own HTTPException produces
    `detail`, and a caller should not have to know which layer refused it.
    """
    return JSONResponse(status_code=status_code,
                        content={"error": str(exc), "detail": str(exc)})


# The core layer refuses things on purpose, and the reason it gives IS the
# useful part — "this contract already has versions" tells the user to pick a
# new id, where "Internal Server Error" tells them nothing. Registered on the
# app rather than caught per-handler so the module docstring's promise holds
# for endpoints added later too, which is precisely how /harden, /contracts/
# build and /sign each came to answer a bare 500.
@app.exception_handler(LineageError)
def _lineage_conflict(_request: Request, exc: LineageError) -> JSONResponse:
    # A conflict, not a bad request: the payload is well-formed and the
    # existing lineage is what rejects it (invariant 1).
    return _refusal(409, exc)


@app.exception_handler(AppendOnlyViolation)
def _append_only_conflict(_request: Request, exc: AppendOnlyViolation) -> JSONResponse:
    return _refusal(409, exc)


@app.exception_handler(ChainError)
def _chain_unavailable(_request: Request, exc: ChainError) -> JSONResponse:
    # The chain is a service behind us; its failure is not the caller's fault.
    return _refusal(502, exc)


# One writer at a time. The store is file-backed JSON, and a narration thread
# finishing while a request saves the same contract would have them overwrite
# each other's metadata; each write re-reads the contract first, under this lock.
_NARRATION_LOCK = threading.Lock()

NARRATIVE_KEY = "narrative"
DISPUTE_NARRATIVE_KEY = "dispute_narrative"


def _persist_narrative(contract_id: str, key: str, narrative) -> None:
    """Write a finished narrative onto the contract, whatever else changed."""
    with _NARRATION_LOCK:
        if not RUNTIME.store.exists(contract_id):
            return
        contract = RUNTIME.store.get(contract_id)
        contract.metadata[key] = narrative.as_dict()
        RUNTIME.store.save(contract)


def _start_narration(contract_id: str, key: str, agent: str, data: str,
                     citations: list[dict[str, str]], language: str) -> dict[str, Any]:
    """Kick off narration and return the placeholder for this response."""
    if not RUNTIME.llm_enabled:
        return narration.unavailable(
            RUNTIME.llm_status()["reason"] or "no model backend", language
        ).as_dict()
    narration.narrate_in_background(
        lambda narrative: _persist_narrative(contract_id, key, narrative),
        client=RUNTIME.llm, agent=agent, language=language,
        data=data, citations=citations,
    )
    return narration.pending()


def _with_background_narrative(report) -> dict[str, Any]:
    """Agent 1's report, with narration started rather than waited on.

    `harden()` is deliberately called without `llm=`: that parameter narrates
    inline, which is right for the CLI and the tests and wrong here, where the
    caller is a browser behind a proxy that gives this endpoint ten seconds.
    """
    from hardening_agent.narrative import citations, digest, dominant_language

    payload = report.as_dict()
    payload["narrative"] = _start_narration(
        report.contract.contract_id, NARRATIVE_KEY, "hardening",
        digest(report), citations(report), dominant_language(report),
    )
    return payload


def _lang(request: Request | None) -> str:
    """The UI language for generated copy, defaulting to French.

    `request` is optional because one caller genuinely has no header to offer:
    /admin/advance is posted by the demo clock as JSON with no UI context.
    Language is data, not logic (invariant 8) — a caller that says nothing
    about language gets the default, never an error.
    """
    header = request.headers.get("x-insaf-lang") if request is not None else None
    lang = (header or "fr").lower()
    return lang if lang in ("fr", "ar") else "fr"


DEFAULT_PARTIES = [
    Party("p_buyer", "msme_owner", "Atelier Trabelsi",
          derive_pseudonym("p_buyer")),
    Party("p_supplier", "counterparty", "Bois du Nord",
          derive_pseudonym("p_supplier")),
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
        # Stated so nothing downstream has to guess how much a party
        # identifier is worth. It is pseudonymous, not authenticated.
        "identity": IDENTITY_MODEL,
        # Same discipline for the model backend: whether prose is generated,
        # by which model, and if not, why not. Never the key.
        "llm": RUNTIME.llm_status(),
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
    return _with_background_narrative(report)


class AcceptBody(BaseModel):
    accepted_clause_ids: list[str] = []
    lawyer_validated: bool = False


class IdentityIn(BaseModel):
    person_type: str = "physique"
    given_name: str = ""
    family_name: str = ""
    address: str = ""
    cin: str | None = None
    legal_form: str | None = None
    matricule: str | None = None


class PartyIn(BaseModel):
    role: str
    display_name: str = ""
    identity: IdentityIn | None = None


class EssentialsIn(BaseModel):
    objet_possible: str = ""
    objet_specifique: str = ""
    objet_quantite: str = ""
    objet_valorisation: str = ""
    capacite: str = ""
    consentement: str = ""
    cause: str = ""


class UserClauseIn(BaseModel):
    title: str = ""
    text: str = ""


class BuildBody(BaseModel):
    contract_id: str
    language: str = "fr"
    profile: str = "supply"
    parties: list[PartyIn] = []
    essentials: EssentialsIn = Field(default_factory=EssentialsIn)
    clauses: list[UserClauseIn] = []
    effective_from: str | None = None


def _to_legal_identity(identity: IdentityIn | None) -> LegalIdentity | None:
    if identity is None:
        return None
    return LegalIdentity(
        person_type=identity.person_type,
        given_name=identity.given_name,
        family_name=identity.family_name,
        address=identity.address,
        cin=identity.cin,
        legal_form=identity.legal_form,
        matricule=identity.matricule,
    )


def _steered_party(party: PartyIn, role: str, party_id: str) -> Party:
    identity = _to_legal_identity(party.identity)
    display_name = (party.display_name or "").strip() or (
        identity.full_name if identity else ""
    ) or "Partie"
    return Party(
        party_id=party_id,
        role=role,
        display_name=display_name,
        pseudonym=derive_pseudonym(party_id),
        identity=identity,
    )


@app.post("/contracts/build")
def build_contract(body: BuildBody) -> dict[str, Any]:
    """The structured builder: compose a contract from user-entered fields,
    then run the anomaly-detection pipeline on it — same gaps, same
    recommendations, same obligations as for an uploaded document. Findings
    never alter the composed document."""
    if not body.contract_id:
        raise HTTPException(status_code=400, detail="contract_id is required")
    if len(body.parties) < 2:
        raise HTTPException(status_code=400, detail="provide the two parties (buyer and supplier)")

    buyer_in, supplier_in = buyer_and_supplier(
        [p.model_dump() for p in body.parties]
    )
    buyer = PartyIn(**buyer_in)
    supplier = PartyIn(**supplier_in)

    essentials = body.essentials.model_dump()
    try:
        document = build_contract_text(
            language=body.language,
            parties=[p.model_dump() for p in body.parties],
            essentials=essentials,
            clauses=[c.model_dump() for c in body.clauses],
        )
    except BuildError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    parties = [
        _steered_party(buyer, "msme_owner", "p_buyer"),
        _steered_party(supplier, "counterparty", "p_supplier"),
    ]

    report = harden(
        text=document,
        contract_id=body.contract_id,
        parties=parties,
        profile=load_profile(body.profile),
        retriever=RUNTIME.retriever,
        chain=RUNTIME.chain,
        store=RUNTIME.store,
        effective_from=_parse_when(body.effective_from),
        metadata={"essentials": essentials_meta(essentials)},
    )
    return {
        "report": _with_background_narrative(report),
        "built_text": document,
        "parties": [
            {"party_id": p.party_id, "role": p.role, "display_name": p.display_name}
            for p in parties
        ],
    }


@app.post("/contracts/{contract_id}/accept")
def acknowledge_report(contract_id: str, body: AcceptBody) -> dict[str, Any]:
    """Human acknowledgment of the findings. Nothing is written.

    Agent 1 does anomaly detection — it never alters the contract. This
    endpoint records that a human read the report and chose to move on as-is.
    No version is created, nothing is anchored, and no text changes: signing
    below concerns the contract exactly as filed.
    """
    if not RUNTIME.store.exists(contract_id):
        raise HTTPException(status_code=404, detail="unknown contract")
    contract = RUNTIME.store.get(contract_id)
    latest = contract.versions[-1]
    return {
        "acknowledged": True,
        "version_id": latest.version_id,
        "parent_version_id": latest.parent_version_id,
        "doc_type": str(latest.doc_type),
        # The property that defines this behaviour: the AI applied nothing.
        "version_created": False,
        "applied": False,
        "accepted_clause_ids": body.accepted_clause_ids,
        "anchored": False,
        "note": (
            "Accusé de réception enregistré. L'IA ne modifie jamais le contrat : "
            "aucune version n'a été créée et aucun texte n'a changé. La signature "
            "portera sur le contrat tel qu'il a été déposé."
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

    import copy
    clauses = [copy.deepcopy(c) for c in parent.clauses]
    text_hash = content_hash(parent.text_hash + contract_id + "signed")

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
    # The signed version carries the contract exactly as filed: the AI applied
    # nothing, so the parent is the original. If a human has since edited the
    # contract, the parent is that human-edited version instead — in all cases
    # the off-chain parent is whatever version was in force. On-chain the link
    # points at the nearest ANCHORED ancestor; a human-edited proposal that was
    # never signed is deliberately unanchored and so has no doc_id (off-chain
    # lineage and on-chain provenance are both complete; different granularity).
    previous = RUNTIME.chain.fetch_latest_anchor(contract_id)
    metadata = {"contract_id": contract_id}
    # The signed commitment references the audit it was signed against.
    if contract.metadata.get("analysis_fingerprint"):
        metadata["analysis_fingerprint"] = contract.metadata["analysis_fingerprint"]
    record = RUNTIME.chain.anchor_document(
        text_hash, DocType.SIGNED,
        [p.pseudonym for p in contract.parties],
        parent_doc_id=previous.doc_id if previous else None,
        metadata=metadata,
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
def get_contract(contract_id: str, request: Request) -> dict[str, Any]:
    if not RUNTIME.store.exists(contract_id):
        raise HTTPException(status_code=404, detail="unknown contract")
    contract = RUNTIME.store.get(contract_id)
    from core.version_manager import effective_to, status_of
    obligations = [
        {
            "obligation_id": o.obligation_id,
            "clause_id": o.clause_id,
            "obligor": o.obligor,
            "obligee": o.obligee,
            "action": o.action,
            "trigger": o.trigger,
            "due_date": o.due_date.isoformat() if o.due_date else None,
            "evidence_required": o.evidence_required,
            "state": str(o.state),
            "kind": o.kind,
            "date_reference": o.date_reference,
            "delay_days": o.delay_days,
        }
        for o in contract.obligations()
    ]
    monitoring = monitoring_for(contract, request=request) if contract.metadata.get("analysis_fingerprint") else {
        "active": False,
        "reason": "no agent analysis yet",
        "milestones": [],
    }
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
        "obligations": obligations,
        "obligation_count": len(obligations),
        "monitoring": monitoring,
        # Written by the narration thread once it finishes. Absent means it is
        # still running, was never started, or was discarded — `narrative`
        # carries which.
        "narrative": contract.metadata.get(NARRATIVE_KEY)
        or narration.pending("no narrative recorded for this contract"),
        "dispute_narrative": contract.metadata.get(DISPUTE_NARRATIVE_KEY),
    }


def monitoring_for(contract, request: Request | None = None) -> dict[str, Any]:
    """The dispute-prevention view of a contract: what the chat banner should
    show. Wizard contracts that never ran the agent pipeline say so instead of
    pretending to have a plan (invariant 6 — absence is a fact)."""
    if not contract.metadata.get("analysis_fingerprint"):
        return {"active": False, "reason": "no agent analysis yet"}
    lang = _lang(request)
    now = monitor_as_of(contract)
    milestones = build_schedule(contract, now)
    return {
        "active": True,
        "as_of": now.isoformat(),
        "phase": contract.metadata.get("phase", "monitoring"),
        "phase_reference": contract.metadata.get("amicable_opened_at"),
        "milestones": [
            {
                "milestone_id": m.milestone_id,
                "obligation_id": m.obligation_id,
                "clause_id": m.clause_id,
                "kind": m.kind,
                "action": m.action,
                "obligor_label": m.obligor_label,
                "obligee_label": m.obligee_label,
                "trigger_text": m.trigger_text,
                "due_date": m.due_date.isoformat() if m.due_date else None,
                "date_reference": m.date_reference,
                "evidence_required": m.evidence_required,
                "state": str(m.state),
                "days_until": m.days_until if m.days_until is not None else None,
                "alert": m.alert if m.alert is not None else None,
                # The check-in question itself, ready to post into the thread —
                # single source of copy lives in config/monitor.py (invariant 8).
                "check_in": check_in_text(m, lang) if m.alert and m.due_date else "",
            }
            for m in milestones
        ],
    }


@app.get("/contracts/{contract_id}/monitor")
def monitor(contract_id: str, request: Request) -> dict[str, Any]:
    if not RUNTIME.store.exists(contract_id):
        raise HTTPException(status_code=404, detail="unknown contract")
    return monitoring_for(RUNTIME.store.get(contract_id), request)


class ConfirmBody(BaseModel):
    outcome: str              # "performed" | "not_yet" | "breached"
    party_id: str | None = None
    note: str = ""


class EscalateBody(BaseModel):
    obligation_ids: list[str] = []
    note: str = ""


class AdvanceBody(BaseModel):
    contract_id: str
    days: int


@app.post("/contracts/{contract_id}/obligations/{obligation_id}/confirm")
def confirm(contract_id: str, obligation_id: str, body: ConfirmBody, request: Request) -> dict[str, Any]:
    """A party confirms a milestone inside the chat. The confirmation is a
    recorded, anchored fact (performed / breached) or a timestamped
    observation (not_yet) — precisely the discipline of the obligation state
    machine: silence, too, is a fact, never missed."""
    lang = _lang(request)
    if not RUNTIME.store.exists(contract_id):
        raise HTTPException(status_code=404, detail="unknown contract")
    contract = RUNTIME.store.get(contract_id)
    try:
        return confirm_obligation(
            contract,
            obligation_id,
            body.outcome,
            chain=RUNTIME.chain,
            store=RUNTIME.store,
            party_id=body.party_id,
            lang=lang,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ChainError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/contracts/{contract_id}/escalate")
def escalate(contract_id: str, body: EscalateBody, request: Request) -> dict[str, Any]:
    """A missed milestone escalates into the amicable phase — attempted
    resolution, anchored as DISPUTE_OPENED before anything further."""
    lang = _lang(request)
    if not RUNTIME.store.exists(contract_id):
        raise HTTPException(status_code=404, detail="unknown contract")
    contract = RUNTIME.store.get(contract_id)
    return escalate_to_amicable(
        contract,
        obligation_ids=body.obligation_ids,
        chain=RUNTIME.chain,
        store=RUNTIME.store,
        lang=lang,
    )


@app.post("/admin/advance")
def admin_advance(body: AdvanceBody, request: Request) -> dict[str, Any]:
    """Demo-only time machine: shifts the monitoring *view* N days forward so
    the check-in flow can be demonstrated. It never writes to version history
    or the chain — an offset is not an event (invariant 1)."""
    if not RUNTIME.store.exists(body.contract_id):
        raise HTTPException(status_code=404, detail="unknown contract")
    contract = RUNTIME.store.get(body.contract_id)
    if body.days == 0:
        contract.metadata.pop("monitor_offset_days", None)
    else:
        # Accumulate. Assigning meant the "+4 jours" button pinned the clock at
        # day 4 however often it was pressed, so a deadline could never pass
        # and the breach → amicable half of the flow was unreachable from the
        # UI. Zero still means "back to today".
        try:
            current = int(contract.metadata.get("monitor_offset_days", 0) or 0)
        except (TypeError, ValueError):
            current = 0
        contract.metadata["monitor_offset_days"] = current + int(body.days)
    RUNTIME.store.save(contract)
    return monitoring_for(contract, request)


@app.get("/contracts/{contract_id}/narrative")
def narrative(contract_id: str) -> dict[str, Any]:
    """The generated prose for a contract, once the narration thread lands it.

    Separate from the analysis response because the two have different clocks:
    findings are ready in milliseconds, prose takes seconds that vary with how
    OpenRouter routes the request. A caller polls this instead of holding the
    analysis open.
    """
    if not RUNTIME.store.exists(contract_id):
        raise HTTPException(status_code=404, detail="unknown contract")
    contract = RUNTIME.store.get(contract_id)
    stored = contract.metadata.get(NARRATIVE_KEY)
    return {
        "contract_id": contract_id,
        "narrative": stored or narration.pending(
            "no narrative recorded yet" if RUNTIME.llm_enabled
            else RUNTIME.llm_status()["reason"]
        ),
        "dispute_narrative": contract.metadata.get(DISPUTE_NARRATIVE_KEY),
        # So a poller knows whether waiting is worthwhile at all.
        "backend_enabled": RUNTIME.llm_enabled,
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
                    else {"event_type": str(item.event_type), "signer": item.signer,
                          "payload_hash": item.payload_hash}
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
def open_dispute(body: DisputeBody, request: Request) -> dict[str, Any]:
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

    from resolution_agent.narrative import digest as dispute_digest

    payload = report.as_dict()
    payload["narrative"] = _start_narration(
        body.contract_id, DISPUTE_NARRATIVE_KEY, "resolution",
        dispute_digest(report), [], _lang(request),
    )
    return payload


@app.post("/admin/reset")
def reset() -> dict[str, Any]:
    RUNTIME.reset()
    return {"ok": True, "message": "store and chain cleared"}


@app.get("/contracts")
def list_contracts() -> dict[str, Any]:
    """Inventory of everything the agent store knows. Powering the owner's
    dashboard list without asking the store for a closed endpoint that would
    need its own permissions story."""
    out = []
    for contract_id in RUNTIME.store.list_ids():
        contract = RUNTIME.store.get(contract_id)
        signed = any(v.doc_type is DocType.SIGNED and v.anchor_tx for v in contract.versions)
        out.append({
            "contract_id": contract.contract_id,
            "parties": [
                {"party_id": p.party_id, "role": p.role, "display_name": p.display_name}
                for p in contract.parties
            ],
            "signed": signed,
            "version_count": len(contract.versions),
            "clause_count": (
                len(contract.versions[-1].clauses) if contract.versions else 0
            ),
        })
    return {"contracts": out, "count": len(out)}


class AskBody(BaseModel):
    contract_id: str
    question: str


@app.post("/ask")
def ask_contract(body: AskBody) -> dict[str, Any]:
    """The in-chat assistant. Grounded on the contract object the agents built
    and on retrieval — never on invented law."""
    if not body.question or not body.question.strip():
        raise HTTPException(status_code=400, detail="question is required")
    if not RUNTIME.store.exists(body.contract_id):
        raise HTTPException(status_code=404, detail="unknown contract")
    contract = RUNTIME.store.get(body.contract_id)
    reply = answer_question(
        contract, body.question, RUNTIME.retriever,
        llm=RUNTIME.llm,
        # Bounded: this call blocks an HTTP client that is itself on a clock.
        timeout=RUNTIME.llm_settings.get("sync_timeout_seconds", 15),
    )
    return {
        "contract_id": body.contract_id,
        "reply": reply.as_dict(),
    }
