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

All of `blockchain_client/`, `rag/`, `hardening_agent/`, `resolution_agent/`
and `config/` now exist; see the model backend section below for the layer added
on top of them.

## The model backend

Deterministic by default. Add a key and the agents additionally *narrate* their
findings; remove it and they go back to rule-based output. Both are supported
modes and `GET /health` says which one is live.

```bash
cp .env.example .env          # then paste an OpenRouter key into it
# OPENROUTER_API_KEY=sk-or-...
```

Provider is OpenRouter (`config/llm.yaml`), model defaults to
`deepseek/deepseek-chat` — cheap enough to call on every hardening run.
Override with `OPENROUTER_MODEL`, or set `AGENT_LLM_ENABLED=0` to force
deterministic mode with a key still present.

The wiring, in one line each:

```
config/prompts.py      system prompts for both agents + the assistant, FR and AR
core/llm_client.py     OpenRouterClient over stdlib urllib; NullLLMClient with no key
core/grounding.py      rejects invented articles and forbidden phrasings
narration.py           calls the model, runs the check, degrades with a stated reason
*/narrative.py         each agent's digest of its own findings
```

**Narration is asynchronous, and that is not an optimisation.** One narrative
measured between 9 and 38 seconds against OpenRouter for the *same* prompt —
the variance is routing, not output length — while the Next proxy gives
`/contracts/build` and `/disputes` ten seconds. So the analysis endpoints
return their findings immediately with `narrative.pending: true`, a thread
writes the prose onto the contract, and `GET /contracts/{id}/narrative` (or
`GET /contracts/{id}`) serves it once it lands. Measured after the change:
`/contracts/build` 0.06s, prose ~12s later.

`/ask` is the exception — there the prose *is* the answer, so it runs inline
under `sync_timeout_seconds` (15s, inside its caller's 20s) and falls back to
the deterministic digest if the model overruns.

**The model narrates; it never sources.** Everything it may say is already in
the prompt: the structured digest and the retrieved excerpts. It does not see
the document — only a bounded quote of the clauses that were flagged — and it
runs *after* anchoring, so it cannot influence what was analysed, hashed or put
on-chain. If it invents an article, the narrative is discarded whole rather than
repaired, and the deterministic report underneath is returned unchanged. Every
outcome is reported: `narrative.available` is false with a `reason`, so "no key"
and "caught inventing an article" are distinguishable from the outside.

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
