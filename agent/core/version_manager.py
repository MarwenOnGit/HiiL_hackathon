"""Version lineage: create, resolve-by-date, and diff.

This module is the guardian of CLAUDE.md invariants 1 and 2. Three design
choices make those invariants structural rather than something callers must
remember:

**Versions are immutable once created.** There is no update and no delete in
this module's API — only `add_version`. Invariant 1 ("never delete or overwrite
a version") is therefore not a rule to follow but a shape you cannot escape.

**`effective_to` is never stored, only derived.** A version's window closes
when its successor takes force. Storing it would mean writing to an existing
version at the moment the next one is signed. Derived, so nothing is written
twice.

**`status` is derived too.** A version is PROPOSED while it has no
`effective_from`, SUPERSEDED once a successor has taken force, IN_FORCE
otherwise. `status_of()` always recomputes; the stored field is a serialisation
convenience that this module is the sole writer of. Logic never trusts it.

A consequence worth stating, because it matches the anchoring policy rather
than fighting it: a PROPOSED version never becomes IN_FORCE. A hardened
proposal stays proposed forever, and signing produces a *new* version whose
parent is that proposal. "A proposal is not a fact."
"""

from __future__ import annotations

import re
from datetime import datetime
from difflib import SequenceMatcher
from typing import Iterable

from .schemas import (
    Clause,
    ContractObject,
    ContractVersion,
    require_aware,
    utc_now,
)
from .taxonomy import DocType, ReviewStatus, VersionStatus

_CLAUSE_ID_RE = re.compile(r"^cl_(\d+)$")
_VERSION_ID_RE = re.compile(r"^v(\d+)$")


class LineageError(Exception):
    """The lineage would become unusable — a cycle, a missing parent, a
    duplicate id, or a second version taking force at the same instant."""


# ---------- id allocation ----------


def next_clause_id(contract: ContractObject) -> str:
    """Allocate a clause id that has never been used by this contract.

    Monotonic, never reused, and never renumbered — inserting a clause in the
    middle of a rewritten contract gives it the next free number rather than
    shifting its neighbours. That is what keeps invariant 2 true: a clause_id
    identifies the same clause for the life of the contract, so a clause-level
    diff and Agent 2's clause mapping both stay meaningful across a rewrite.

    Sequential rather than random so a demo reproduces identically each run.
    """
    highest = 0
    for version in contract.versions:
        for clause in version.clauses:
            match = _CLAUSE_ID_RE.match(clause.clause_id)
            if match:
                highest = max(highest, int(match.group(1)))
    return f"cl_{highest + 1:04d}"


def allocate_clause_ids(contract: ContractObject, clauses: Iterable[Clause]) -> list[Clause]:
    """Fill in any blank clause_id, leaving existing ones untouched.

    Carrying a clause_id forward is how a rewrite stays traceable, so callers
    building a hardened version should copy the id from the clause they are
    rewriting and leave it set. Only genuinely new clauses arrive with no id.
    """
    result = []
    highest = 0
    for version in contract.versions:
        for clause in version.clauses:
            match = _CLAUSE_ID_RE.match(clause.clause_id)
            if match:
                highest = max(highest, int(match.group(1)))
    for clause in clauses:
        if not clause.clause_id:
            highest += 1
            clause.clause_id = f"cl_{highest:04d}"
        result.append(clause)
    return result


def next_version_id(contract: ContractObject) -> str:
    highest = 0
    for version in contract.versions:
        match = _VERSION_ID_RE.match(version.version_id)
        if match:
            highest = max(highest, int(match.group(1)))
    return f"v{highest + 1:03d}"


# ---------- creation ----------


def add_version(
    contract: ContractObject,
    *,
    doc_type: DocType,
    text_hash: str,
    clauses: list[Clause] | None = None,
    parent_version_id: str | None = None,
    effective_from: datetime | None = None,
    review_status: ReviewStatus = ReviewStatus.NONE,
    anchor_tx: str | None = None,
    version_id: str | None = None,
) -> ContractVersion:
    """Append a version. The only mutating operation in this module.

    `effective_from` set means the version takes force from that instant;
    omitted means it is a proposal. Raises LineageError rather than accepting
    anything that would make the lineage unresolvable.
    """
    clauses = clauses or []
    version_id = version_id or next_version_id(contract)

    if contract.version(version_id) is not None:
        raise LineageError(
            f"version {version_id} already exists — versions are append-only "
            "and never overwritten (invariant 1)"
        )

    if parent_version_id is not None and contract.version(parent_version_id) is None:
        raise LineageError(f"parent version {parent_version_id} does not exist")

    if doc_type is DocType.ORIGINAL:
        if parent_version_id is not None:
            raise LineageError("an original version cannot have a parent")
        if contract.versions:
            raise LineageError(
                "this contract already has versions — a second original would "
                "start a rival lineage under the same contract_id"
            )
    elif parent_version_id is None:
        raise LineageError(f"a {doc_type} version must name its parent")

    if effective_from is not None:
        effective_from = require_aware(effective_from, "effective_from")
        clash = next(
            (
                v for v in contract.versions
                if v.effective_from is not None and v.effective_from == effective_from
            ),
            None,
        )
        if clash is not None:
            raise LineageError(
                f"version {clash.version_id} already takes force at "
                f"{effective_from.isoformat()} — two versions in force at the "
                "same instant makes governing-version resolution ambiguous"
            )
        # Compare against the nearest *dated* ancestor, not the immediate parent.
        # A proposal in the chain has no date of its own, and skipping the check
        # on that account would let a version be backdated to before the
        # lineage it descends from ever took force.
        anchor_ancestor = _nearest_dated_ancestor(contract, parent_version_id)
        if anchor_ancestor is not None and effective_from < anchor_ancestor.effective_from:
            raise LineageError(
                "a version cannot take force before its parent did "
                f"({effective_from.isoformat()} < "
                f"{anchor_ancestor.effective_from.isoformat()}, from ancestor "
                f"{anchor_ancestor.version_id})"
            )

    version = ContractVersion(
        version_id=version_id,
        parent_version_id=parent_version_id,
        doc_type=doc_type,
        status=VersionStatus.PROPOSED,  # recomputed below; status_of is the authority
        effective_from=effective_from,
        text_hash=text_hash,
        review_status=review_status,
        clauses=allocate_clause_ids(contract, clauses),
        anchor_tx=anchor_tx,
        created_at=utc_now(),
    )
    contract.versions.append(version)
    _refresh_cached_statuses(contract)
    return version


# ---------- derived lifecycle ----------


def status_of(contract: ContractObject, version_id: str) -> VersionStatus:
    """Recompute a version's status from its own dates and its lineage.

    Never reads the stored `status` field, so a stale or hand-edited value
    cannot change behaviour.
    """
    version = _require(contract, version_id)
    if version.effective_from is None:
        return VersionStatus.PROPOSED
    return (
        VersionStatus.SUPERSEDED
        if _successor_in_force(contract, version) is not None
        else VersionStatus.IN_FORCE
    )


def effective_to(contract: ContractObject, version_id: str) -> datetime | None:
    """When this version stopped governing. None means it still does.

    Derived, never stored — see the module docstring.
    """
    version = _require(contract, version_id)
    if version.effective_from is None:
        return None
    successor = _successor_in_force(contract, version)
    return None if successor is None else successor.effective_from


def _successor_in_force(
    contract: ContractObject, version: ContractVersion
) -> ContractVersion | None:
    """The earliest descendant that took force after this version did.

    Walks descendants rather than only direct children, so a proposal sitting
    between two signed versions does not break the chain: original → hardened
    (proposed, no date) → signed (in force) still closes the original's window.
    """
    if version.effective_from is None:
        return None
    best: ContractVersion | None = None
    for candidate in _descendants(contract, version.version_id):
        if candidate.effective_from is None:
            continue
        if candidate.effective_from <= version.effective_from:
            continue
        if best is None or candidate.effective_from < best.effective_from:
            best = candidate
    return best


def _nearest_dated_ancestor(
    contract: ContractObject, version_id: str | None
) -> ContractVersion | None:
    """Walk up until a version with an `effective_from` is found.

    Used when validating a new version's date: the constraint is that it cannot
    predate the lineage it descends from, and undated proposals in between must
    not hide that constraint.
    """
    seen: set[str] = set()
    current = version_id
    while current is not None:
        if current in seen:
            raise LineageError(f"cycle in lineage at {current}")
        seen.add(current)
        version = contract.version(current)
        if version is None:
            return None
        if version.effective_from is not None:
            return version
        current = version.parent_version_id
    return None


def _descendants(contract: ContractObject, version_id: str) -> list[ContractVersion]:
    out: list[ContractVersion] = []
    frontier = [version_id]
    seen = {version_id}
    while frontier:
        current = frontier.pop()
        for child in contract.children_of(current):
            if child.version_id in seen:
                continue
            seen.add(child.version_id)
            out.append(child)
            frontier.append(child.version_id)
    return out


def _refresh_cached_statuses(contract: ContractObject) -> None:
    """Keep the serialised `status` field equal to the derived value.

    This module is its only writer. Logic uses status_of().
    """
    for version in contract.versions:
        version.status = status_of(contract, version.version_id)


# ---------- the product's core question ----------


def governing_version_at(
    contract: ContractObject, when: datetime
) -> ContractVersion | None:
    """Which version was in force on a given date.

    This is the question Agent 2 must answer before it reasons about anything:
    a dispute about a June delivery is governed by whatever was in force in
    June, not by the latest amendment. Resolving it as "latest" is the mistake
    this function exists to prevent.

    Proposals are excluded by construction — they have no `effective_from`, so
    they can never win. A proposal never governed anything.
    """
    when = require_aware(when, "when")
    best: ContractVersion | None = None
    for version in contract.versions:
        start = version.effective_from
        if start is None or start > when:
            continue
        end = effective_to(contract, version.version_id)
        if end is not None and when >= end:
            continue
        # Half-open [start, end): the incoming version owns the boundary instant.
        if best is None or start > best.effective_from:
            best = version
    return best


def lineage(contract: ContractObject, version_id: str) -> list[ContractVersion]:
    """Root-first path to this version. Raises on a cycle."""
    chain: list[ContractVersion] = []
    seen: set[str] = set()
    current: str | None = version_id
    while current is not None:
        if current in seen:
            raise LineageError(f"cycle in lineage at {current}")
        seen.add(current)
        version = _require(contract, current)
        chain.append(version)
        current = version.parent_version_id
    chain.reverse()
    return chain


# ---------- clause-level diff ----------


class ClauseDiff:
    """Clause-by-clause difference between two versions, matched by clause_id.

    Matching on the stable id rather than on position or text similarity is the
    whole point of invariant 2: a clause that was rewritten shows up as
    MODIFIED with both texts, not as one removal plus one unrelated addition.
    """

    def __init__(
        self,
        added: list[str],
        removed: list[str],
        modified: list[tuple[str, str, str]],
        unchanged: list[str],
    ) -> None:
        self.added = added
        self.removed = removed
        self.modified = modified          # (clause_id, before, after)
        self.unchanged = unchanged

    @property
    def changed_clause_ids(self) -> list[str]:
        return sorted(self.added + self.removed + [m[0] for m in self.modified])

    def similarity(self, clause_id: str) -> float | None:
        """How much of a modified clause survived, 0.0-1.0."""
        for cid, before, after in self.modified:
            if cid == clause_id:
                return SequenceMatcher(None, before, after).ratio()
        return None

    def __repr__(self) -> str:
        return (
            f"ClauseDiff(added={len(self.added)}, removed={len(self.removed)}, "
            f"modified={len(self.modified)}, unchanged={len(self.unchanged)})"
        )


def diff_versions(contract: ContractObject, before_id: str, after_id: str) -> ClauseDiff:
    before = _require(contract, before_id)
    after = _require(contract, after_id)

    before_map = {c.clause_id: c for c in before.clauses}
    after_map = {c.clause_id: c for c in after.clauses}

    added = sorted(set(after_map) - set(before_map))
    removed = sorted(set(before_map) - set(after_map))
    modified: list[tuple[str, str, str]] = []
    unchanged: list[str] = []

    for clause_id in sorted(set(before_map) & set(after_map)):
        old_text = before_map[clause_id].text
        new_text = after_map[clause_id].text
        if old_text == new_text:
            unchanged.append(clause_id)
        else:
            modified.append((clause_id, old_text, new_text))

    return ClauseDiff(added, removed, modified, unchanged)


def _require(contract: ContractObject, version_id: str) -> ContractVersion:
    version = contract.version(version_id)
    if version is None:
        raise LineageError(f"unknown version {version_id}")
    return version
