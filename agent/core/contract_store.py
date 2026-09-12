"""Persistence for contract objects.

File-backed JSON, one file per contract, behind a narrow interface so Postgres
is a later swap. Deliberately one implementation — the interface exists so the
agents never import a storage detail, not to support a second backend today.

The store is the last line of defence for invariant 1. `version_manager` makes
overwriting a version impossible through its own API, but a caller could still
hand `save()` a contract object whose version list has been tampered with in
memory. `save()` compares against what is already on disk and refuses any write
that drops a version or alters an existing one's immutable fields.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Protocol

from .schemas import ContractObject, contract_from_dict, contract_to_dict


class StoreError(Exception):
    pass


class AppendOnlyViolation(StoreError):
    """A save would have destroyed or rewritten history (invariant 1)."""


class ContractStore(Protocol):
    def exists(self, contract_id: str) -> bool: ...
    def get(self, contract_id: str) -> ContractObject: ...
    def save(self, contract: ContractObject) -> None: ...
    def list_ids(self) -> list[str]: ...


# Fields that define what a version *is*. Changing any of them rewrites
# history. `status` is excluded on purpose: it is derived, and version_manager
# refreshes the cached copy on every append.
_IMMUTABLE_VERSION_FIELDS = (
    "parent_version_id", "doc_type", "effective_from", "text_hash", "created_at",
)


class JsonFileStore:
    """One `<contract_id>.json` per contract under `root`.

    Writes are atomic: a temp file in the same directory, then `os.replace`.
    A crash mid-write therefore leaves the previous complete file intact rather
    than a truncated one — which for an append-only history is the difference
    between "lost the last change" and "lost the contract".
    """

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, contract_id: str) -> Path:
        if not contract_id or "/" in contract_id or contract_id.startswith("."):
            raise StoreError(f"unsafe contract_id {contract_id!r}")
        return self.root / f"{contract_id}.json"

    def exists(self, contract_id: str) -> bool:
        return self._path(contract_id).is_file()

    def get(self, contract_id: str) -> ContractObject:
        path = self._path(contract_id)
        if not path.is_file():
            raise StoreError(f"no stored contract {contract_id}")
        return contract_from_dict(json.loads(path.read_text(encoding="utf-8")))

    def save(self, contract: ContractObject) -> None:
        path = self._path(contract.contract_id)
        if path.is_file():
            self._assert_append_only(self.get(contract.contract_id), contract)

        payload = json.dumps(contract_to_dict(contract), indent=2, ensure_ascii=False)
        handle = tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=self.root, delete=False, suffix=".tmp"
        )
        try:
            with handle as fh:
                fh.write(payload)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(handle.name, path)
        except BaseException:
            Path(handle.name).unlink(missing_ok=True)
            raise

    def list_ids(self) -> list[str]:
        return sorted(p.stem for p in self.root.glob("*.json"))

    @staticmethod
    def _assert_append_only(stored: ContractObject, incoming: ContractObject) -> None:
        if stored.contract_id != incoming.contract_id:
            raise AppendOnlyViolation("contract_id is permanent and cannot change")

        incoming_by_id = {v.version_id: v for v in incoming.versions}
        for old in stored.versions:
            new = incoming_by_id.get(old.version_id)
            if new is None:
                raise AppendOnlyViolation(
                    f"version {old.version_id} is missing from the incoming "
                    "contract — a superseded version still governs the events "
                    "in its window and is never deleted (invariant 1)"
                )
            for attr in _IMMUTABLE_VERSION_FIELDS:
                if getattr(old, attr) != getattr(new, attr):
                    raise AppendOnlyViolation(
                        f"version {old.version_id}.{attr} changed from "
                        f"{getattr(old, attr)!r} to {getattr(new, attr)!r} — "
                        "existing versions are immutable (invariant 1)"
                    )
            old_clauses = {c.clause_id: c.text for c in old.clauses}
            new_clauses = {c.clause_id: c.text for c in new.clauses}
            for clause_id, text in old_clauses.items():
                if clause_id not in new_clauses:
                    raise AppendOnlyViolation(
                        f"clause {clause_id} vanished from stored version "
                        f"{old.version_id}"
                    )
                if new_clauses[clause_id] != text:
                    raise AppendOnlyViolation(
                        f"clause {clause_id} text changed inside already-stored "
                        f"version {old.version_id} — a rewrite belongs in a new "
                        "version, keeping the same clause_id (invariant 2)"
                    )
