"""The shared contract object both agents read and write.

Stdlib dataclasses on purpose: this module must import and its tests must run
with zero installed packages, so the foundation is testable before Chroma or
any LLM SDK exists.

Two deliberate departures from the data model in CLAUDE.md, both recorded in
its audit-corrections section:

1. `ContractVersion` has no stored `effective_to`. It is derived from the
   lineage (a version's window closes when its successor takes force). Storing
   it would mean writing to an existing version when the next one is signed,
   which is exactly what invariant 1 forbids. Derived, nothing is ever
   overwritten.
2. Obligations live on their clause and nowhere else. CLAUDE.md lists
   `obligations[]` on both `Clause` and `ContractObject`; two copies of the
   same list drift. `ContractObject` exposes them through an accessor instead.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Iterator

from .taxonomy import (
    DocType,
    FactStatus,
    Language,
    ObligationState,
    ReviewStatus,
    RiskKind,
    VersionStatus,
    CorpusType,
)

# ---------- time ----------
# Everything is tz-aware UTC in memory and ISO 8601 on disk. A naive datetime
# is rejected rather than silently assumed to be UTC: "which version governed
# on this date" is the product's core question and a timezone guess there is a
# wrong answer delivered confidently.


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def require_aware(value: datetime, label: str) -> datetime:
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        raise ValueError(f"{label} must be timezone-aware; got naive {value!r}")
    return value.astimezone(timezone.utc)


def iso(value: datetime | None) -> str | None:
    return None if value is None else require_aware(value, "datetime").isoformat()


def parse_iso(value: str | None) -> datetime | None:
    if value is None:
        return None
    parsed = datetime.fromisoformat(value)
    return require_aware(parsed, "datetime")


# ---------- grounding ----------


@dataclass
class LegalRef:
    """A pointer to text that was actually retrieved.

    Invariant 7 lives or dies here. Every legal claim carries one of these, and
    every one of these carries the chunk it came from — so a reviewer can check
    the citation against the corpus. There is no constructor path that produces
    a LegalRef without a source, which is what stops a model-invented COC
    article from ever looking like a real one.
    """

    source_doc: str
    article_ref: str
    excerpt: str
    corpus_type: CorpusType
    language: Language

    def __post_init__(self) -> None:
        if not self.source_doc or not self.excerpt:
            raise ValueError(
                "LegalRef requires source_doc and excerpt — a citation with no "
                "retrieved text behind it is exactly what invariant 7 forbids"
            )


@dataclass
class RiskFlag:
    kind: RiskKind
    detail: str
    legal_refs: list[LegalRef] = field(default_factory=list)

    def __post_init__(self) -> None:
        # An UNENFORCEABLE claim asserts the clause contradicts law, so it must
        # cite the law. AMBIGUOUS and ASYMMETRIC are judgements about drafting
        # quality and stand on their own.
        if self.kind is RiskKind.UNENFORCEABLE and not self.legal_refs:
            raise ValueError(
                "an unenforceable finding must cite the provision it "
                "contradicts (invariant 7)"
            )


# ---------- contract content ----------


@dataclass
class Obligation:
    obligation_id: str
    clause_id: str
    obligor: str            # party_id
    obligee: str            # party_id
    action: str
    trigger: str
    due_date: datetime | None
    evidence_required: str | None = None
    state: ObligationState = ObligationState.PENDING
    state_changed_at: datetime | None = None
    # Monitoring facts (Phase "dispute-prevention"): what kind of duty this is,
    # where the due date comes from, and the numeric delay parsed from the
    # trigger. `date_reference` is honest about provenance — an absolute date
    # written in the clause versus a derived estimate must never be shown as
    # the same thing.
    kind: str = "obligation"        # "delivery" | "payment" | ...
    date_reference: str = "unknown" # "absolute" | "estimated" | "event_linked" | "unknown"
    delay_days: int | None = None   # "30 jours" -> 30; None when not quantified


@dataclass
class Milestone:
    """One dated duty on the monitoring plan — a derived view over an
    obligation, never a stored copy (obligations have one home: their clause).

    Rebuilt at read time by the monitor, so it can never drift out of step
    with the ledger it summarises.
    """

    milestone_id: str              # == obligation_id
    obligation_id: str
    clause_id: str
    kind: str
    action: str
    obligor_label: str
    obligee_label: str
    trigger_text: str
    due_date: datetime | None
    date_reference: str            # as on Obligation
    evidence_required: str | None
    state: ObligationState
    days_until: int | None = None  # computed against the monitoring date
    alert: str | None = None       # "due_soon" | "due" | "overdue_unconfirmed" | None


@dataclass
class Clause:
    clause_id: str          # STABLE across versions — survives a rewrite
    type: str
    language: Language
    text: str
    span: tuple[int, int] | None = None
    risk_flags: list[RiskFlag] = field(default_factory=list)
    legal_refs: list[LegalRef] = field(default_factory=list)
    obligations: list[Obligation] = field(default_factory=list)


@dataclass
class ContractVersion:
    version_id: str
    parent_version_id: str | None
    doc_type: DocType
    status: VersionStatus
    effective_from: datetime | None          # None while PROPOSED
    text_hash: str
    review_status: ReviewStatus = ReviewStatus.NONE
    clauses: list[Clause] = field(default_factory=list)
    anchor_tx: str | None = None
    created_at: datetime = field(default_factory=utc_now)

    def clause(self, clause_id: str) -> Clause | None:
        return next((c for c in self.clauses if c.clause_id == clause_id), None)

    @property
    def clause_ids(self) -> list[str]:
        return [c.clause_id for c in self.clauses]


@dataclass
class LegalIdentity:
    """CIVIL identity, off-chain by design (invariant 3).

    CIN, matricule and address stay on the ContractObject and the encrypted
    document store; the chain only ever sees the party pseudonym. `person_type`
    is "physique" (CIN) or "morale" (legal form + matricule fiscale).
    """

    person_type: str              # "physique" | "morale"
    given_name: str               # prénom — or the raison sociale for a morale
    family_name: str              # nom — or the sigle for a morale
    address: str = ""
    cin: str | None = None        # personne physique
    legal_form: str | None = None # personne morale: SARL / SUARL / SA / SNC / GIE
    matricule: str | None = None  # personne morale: matricule fiscale

    @property
    def full_name(self) -> str:
        parts = [p for p in (self.given_name, self.family_name) if p and p.strip()]
        return " ".join(parts).strip()


@dataclass
class Party:
    party_id: str
    role: str                     # "msme_owner" | "counterparty"
    display_name: str
    pseudonym: str                # the only party value that may reach the chain
    identity: LegalIdentity | None = None


@dataclass
class ContractObject:
    contract_id: str              # PERMANENT
    parties: list[Party] = field(default_factory=list)
    versions: list[ContractVersion] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def version(self, version_id: str) -> ContractVersion | None:
        return next((v for v in self.versions if v.version_id == version_id), None)

    def children_of(self, version_id: str) -> list[ContractVersion]:
        return [v for v in self.versions if v.parent_version_id == version_id]

    def obligations(self) -> Iterator[Obligation]:
        """Every obligation across every version, in version order.

        Obligations have one home — their clause. This walks them rather than
        keeping a second list that could drift out of step.
        """
        for version in self.versions:
            for clause in version.clauses:
                yield from clause.obligations


# ---------- dispute side (Agent 2) ----------


@dataclass
class Fact:
    fact: str
    status: FactStatus = FactStatus.UNSUPPORTED
    source_evidence: list[str] = field(default_factory=list)
    clause_ids: list[str] = field(default_factory=list)


@dataclass
class SettlementOffer:
    terms: list[str]
    proposer: str                 # party_id
    round: int
    acceptability_scores: dict[str, float] = field(default_factory=dict)
    monetary: bool = True


@dataclass
class DisputeRecord:
    dispute_id: str
    contract_id: str
    governing_version_id: str     # resolved by event date, not "latest"
    claims: list[str] = field(default_factory=list)
    fact_ledger: list[Fact] = field(default_factory=list)
    rounds: list[SettlementOffer] = field(default_factory=list)
    status: str = "open"
    opened_at: datetime = field(default_factory=utc_now)


# ---------- serialisation ----------
# Hand-rolled rather than a library: the only non-trivial cases are datetimes
# and the clause span tuple, and keeping it here means core/ stays install-free.

_DATETIME_KEYS = {
    "effective_from", "created_at", "due_date", "state_changed_at", "opened_at",
}


def to_jsonable(value: Any) -> Any:
    if isinstance(value, datetime):
        return iso(value)
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, dict):
        return {k: to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_jsonable(v) for v in value]
    return value


def contract_to_dict(contract: ContractObject) -> dict[str, Any]:
    return to_jsonable(asdict(contract))


def _clause_from_dict(raw: dict[str, Any]) -> Clause:
    span = raw.get("span")
    return Clause(
        clause_id=raw["clause_id"],
        type=raw["type"],
        language=Language(raw["language"]),
        text=raw["text"],
        span=tuple(span) if span else None,
        risk_flags=[
            RiskFlag(
                kind=RiskKind(f["kind"]),
                detail=f["detail"],
                legal_refs=[_legal_ref_from_dict(r) for r in f.get("legal_refs", [])],
            )
            for f in raw.get("risk_flags", [])
        ],
        legal_refs=[_legal_ref_from_dict(r) for r in raw.get("legal_refs", [])],
        obligations=[
            Obligation(
                obligation_id=o["obligation_id"],
                clause_id=o["clause_id"],
                obligor=o["obligor"],
                obligee=o["obligee"],
                action=o["action"],
                trigger=o["trigger"],
                due_date=parse_iso(o.get("due_date")),
                evidence_required=o.get("evidence_required"),
                state=ObligationState(o.get("state", "pending")),
                state_changed_at=parse_iso(o.get("state_changed_at")),
                kind=o.get("kind", "obligation"),
                date_reference=o.get("date_reference", "unknown"),
                delay_days=o.get("delay_days"),
            )
            for o in raw.get("obligations", [])
        ],
    )


def _party_from_dict(raw: dict[str, Any]) -> Party:
    identity = raw.get("identity")
    return Party(
        party_id=raw["party_id"],
        role=raw["role"],
        display_name=raw["display_name"],
        pseudonym=raw["pseudonym"],
        identity=LegalIdentity(**identity) if identity else None,
    )


def _legal_ref_from_dict(raw: dict[str, Any]) -> LegalRef:
    return LegalRef(
        source_doc=raw["source_doc"],
        article_ref=raw["article_ref"],
        excerpt=raw["excerpt"],
        corpus_type=CorpusType(raw["corpus_type"]),
        language=Language(raw["language"]),
    )


def contract_from_dict(raw: dict[str, Any]) -> ContractObject:
    return ContractObject(
        contract_id=raw["contract_id"],
        parties=[_party_from_dict(p) for p in raw.get("parties", [])],
        versions=[
            ContractVersion(
                version_id=v["version_id"],
                parent_version_id=v.get("parent_version_id"),
                doc_type=DocType(v["doc_type"]),
                status=VersionStatus(v["status"]),
                effective_from=parse_iso(v.get("effective_from")),
                text_hash=v["text_hash"],
                review_status=ReviewStatus(v.get("review_status", "none")),
                clauses=[_clause_from_dict(c) for c in v.get("clauses", [])],
                anchor_tx=v.get("anchor_tx"),
                created_at=parse_iso(v["created_at"]) or utc_now(),
            )
            for v in raw.get("versions", [])
        ],
        metadata=raw.get("metadata", {}),
    )
