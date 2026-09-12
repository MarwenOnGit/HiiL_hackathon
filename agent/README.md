# `agent/` — the v3 AI layer

Python, stdlib-only in `core/`. Run the tests with no install step:

```bash
cd agent && python3 -m unittest discover -s tests -q
```

## Why this lives here and not in `/agent-service`

`ARCHITECTURE.md` §4 reserved `/agent-service` for a teammate's Python service.
No Python exists in this repo or on any remote branch, so there was nothing to
port and nothing to duplicate — but the folder is deliberately left uncreated
rather than claimed, so that if a teammate does have unpushed work there is one
obvious place for it and only one agent codebase in the end.

## Layout

```
core/             foundation — imports no provider SDK, no agent module
  taxonomy.py       closed vocabularies (doc types, risk kinds, obligation states)
  schemas.py        the shared contract object; enforces citation-or-nothing
  version_manager.py  lineage, governing-version-by-date, clause-level diff
  contract_store.py   file-backed JSON behind a store interface
  llm_client.py       the single seam every model call passes through
```

Still to come: `blockchain_client/` (interface + in-memory fake), `rag/`,
`hardening_agent/`, `resolution_agent/`, `config/`.

## The three things that are structural, not conventional

**You cannot overwrite a version.** `version_manager` has no update and no
delete — only `add_version`. `JsonFileStore.save()` independently refuses any
write that drops a version or alters a stored one's text, hash, dates or clause
text. Invariant 1 is a shape, not a rule to remember.

**You cannot state law without citing it.** `LegalRef` rejects construction
without a `source_doc` and an `excerpt`, and a `RiskFlag` of kind
`unenforceable` rejects construction with no `legal_refs`. Invariant 7 fails at
the constructor, not in review.

**There is one model boundary.** Nothing outside `core/llm_client.py` may
import a provider SDK. The default client raises `LLMUnavailable` rather than
returning plausible text, so an unconfigured backend is a handled outcome
instead of quietly ungrounded output.
