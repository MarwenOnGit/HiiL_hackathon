# CLAUDE.md — Hack4Justice commercial justice tool

This file is the durable context for this repo. Read it fully before changing anything.

## Situation

This repo already contains a working backend, frontend and blockchain layer built by a colleague
against an **earlier version of the product** (v1). The product direction has since changed
substantially (v3). Your job is twofold:

1. **Build the AI agent layer from scratch** (the `agent/` package). This is new work.
2. **Migrate the existing backend / frontend / blockchain code** so the whole application matches
   v3 and runs stably end to end.

The existing code is a colleague's work, not throwaway. Treat it as an asset to adapt, not a draft
to replace.

## What changed from v1 to v3

| Area | v1 (what the existing code assumes) | v3 (what we need) |
|---|---|---|
| Agent 1 | Generates a contract **from scratch** out of WhatsApp/email threads | Ingests an **existing contract** and hardens it: finds gaps, ambiguity, unenforceable terms, proposes redlines |
| Agent 2 | Builds a **court dossier** to prepare a party for litigation | **Resolves the dispute before court**: reconciles facts between both parties, estimates each side's court outcome, drives a binding settlement. Court dossier is a fallback only |
| Contract identity | One contract, one record | One `contract_id` forever, **many versions** (original → hardened → signed → amendment), append-only, nothing deleted |
| Blockchain role | Stores a contract nobody disputes exists | **Tamper-proof event log**: anchors document versions with parent links, attests obligation events, dispute lifecycle, settlements |
| Parties | Single user | **Two parties**, second joins by scoped expiring token |
| Blockchain interface | `deploy_contract`, `fetch_contract` — **see Audit correction 1 below; this is not what the code actually has** | `anchor_document(hash, doc_type, parties, parent_doc_id, metadata)`, `attest_event(...)`, `fetch_contract(id)`, `fetch_history(id)` |

## Non-negotiable invariants

These are architectural decisions already made. Do not relitigate them in code.

1. **One contract, many versions, one identity.** `contract_id` is permanent. Versions are
   append-only with `parent_version_id`. **Never delete or overwrite a version** — a superseded
   version still governs the events that happened during its window, and Agent 2 must be able to
   resolve *which version was in force on a given date*.
2. **Clause IDs are stable across versions.** A clause that gets rewritten keeps its `clause_id`.
   This is what makes clause-level diffs and Agent 2's clause mapping work.
3. **Only hashes, pseudonymous party IDs, timestamps and event types go on-chain.** Full contract
   text and evidence live in encrypted off-chain storage. Never send contract text to the chain.
4. **Human gate before anything binding.** Accepting redlines and signing a settlement are human
   actions. The system never infers consent.
5. **Agent 2 never analyses a contract.** It reads the object Agent 1 built. If you find yourself
   re-parsing a PDF inside `resolution_agent/`, something is wrong.
6. **Every user input must improve the output; none may be a precondition for producing one.**
   Contract type, clause structure, governing version, what changed after lawyer review — all
   derived, never asked. With zero obligation confirmations the system still works; more facts
   simply land in `unsupported`.
7. **Never fabricate law.** Every legal claim, article reference or clause rationale must come from
   a retrieved RAG chunk. If retrieval returns nothing relevant, say so rather than generating a
   plausible-sounding COC article. This is the single worst failure mode this product can have.
8. **Language is data, not logic.** All FR/AR prompts live in `config/prompts.py`. Switching
   language must never require touching agent code. Detect language at **clause** granularity, not
   document.

## Architecture

Two agents over one shared contract object.

**Agent 1 — hardening.** `ingest → segment → classify → [anchor v1] → gap_detect → risk_score →
dispute_predict → remediate → [human accepts] → reconcile (if lawyer edited) → [anchor signed] →
extract obligations → monitor`

**Agent 2 — resolution.** `intake (select governing version by event date) → [token link to other
party] → reconcile facts (agreed/disputed/unsupported) → map to clauses → estimate BATNA → generate
settlement options → negotiation rounds → draft settlement → [anchor] ; escalate to court dossier
only if no agreement`

**RAG.** Two retrieval modes over two languages: *normative* (what the clause must say — COC,
OHADA, model clause library) and *evaluative* (what happens if we fight — doctrine, outcomes,
quantum). Chunk at clause/article boundaries, never fixed token windows. Metadata filters
(`language`, `corpus_type`, `source_doc`, `article_ref`) are mandatory — mixing a French doctrine
chunk into an Arabic drafting prompt produces confidently wrong output.

**Risk taxonomy.** Three distinct failure modes needing three different remedies:
- `unenforceable` — contradicts a mandatory/public-order COC provision. Must fix.
- `ambiguous` — "reasonable delay", "agreed quality". The dispute factory for SMEs. Fix by adding
  objective criteria.
- `asymmetric` — enforceable but lopsided. Flag for awareness; never silently rewrite.

**Obligation state machine.** `pending → overdue_unconfirmed → performed | breached | waived |
cured`. Silence is a recorded, timestamped fact — absence of confirmation is evidence, not a gap.

## Data model

```python
Clause          { clause_id (STABLE), type, language, text, span, risk_flags[], legal_refs[], obligations[] }
Obligation      { obligor, obligee, action, trigger, due_date, evidence_required, state }
ContractVersion { version_id, parent_version_id, doc_type, status, effective_from, effective_to,
                  review_status, clauses[], text_hash, anchor_tx }
ContractObject  { contract_id (PERMANENT), metadata, parties[], versions[], obligations[] }
DisputeRecord   { contract_id, governing_version_id, claims[], fact_ledger, rounds[], status }
FactLedger      { fact, source_evidence, status }        # agreed | disputed | unsupported
SettlementOffer { terms[], proposer, acceptability_scores, round }
```

`doc_type`: `original | hardened | signed | amendment`
`status`: `proposed | in_force | superseded`
`review_status`: `none | party_accepted | lawyer_validated`

## Anchoring policy

| Moment | Anchored? | Note |
|---|---|---|
| v1 original, at upload | Yes | Before any analysis. One signature only — proves the file existed on this date and Party A held it, not mutual agreement |
| v2 hardened proposal | **No** | A proposal is not a fact. Drafts stay off-chain |
| v3 signed | Yes | Both signatures, `parent_doc_id` = v2 |
| Obligation attestation | Yes | Delivery confirmed, payment received |
| Dispute opened / resolved / escalated | Yes | Proof resolution was attempted before court |
| Settlement | Yes | Both signatures, references disputed `clause_id`s |

## Legal handling rules

- Jurisdiction: Tunisian Code des obligations et des contrats, OHADA framework.
- A settlement is a *transaction* under COC Title XI (arts. 1458–1477); art. 1458 is definitional.
  **Do not write "force of a final judgment" anywhere in code, copy or UI** — that phrasing is
  unverified for Tunisia. Use: "binding settlement enforceable between the parties".
- BATNA reference figures (World Bank Doing Business 2020, Tunisia): 565 days, 21.8% of claim value.
  Treat as first-instance standardised figures; appeals are on top. Put these in config, not
  hardcoded in prompts, so they can be corrected.
- The BATNA estimator must branch on **contested vs merely unpaid** debt: uncontested claims have a
  fast-track injunction of payment path with a much better outcome, and the agent must say so rather
  than overselling settlement.
- Deadline alerts are **neutral status, never accusation**: "Obligation due 12 March, no
  confirmation recorded" — never "you are in breach". A formal *mise en demeure* is a separate,
  explicit human decision by the creditor, with a generated letter.
- Liability gate, configurable per deployment: risk analysis → no gate; redlines → explicit logged
  acceptance; settlement → lawyer review flag before signature.

## Agent 2 liability posture

Agent 2 (resolution/settlement) was explicitly rejected in an earlier scoping round — see
`docs/superpowers/specs/2026-09-12-msme-platform-extension-overview.md`, Part 2, reason 4. That
rejection has since been **overridden deliberately, eyes open**. The posture is narrower than
"we do negotiation", and these five rules are binding on all code, prompts and copy:

1. **The system never decides anything binding.** It produces estimates and options; every binding
   act is a human signature. Frame all copy accordingly.
2. **Neutral by design.** Both parties see the SAME fact ledger and the SAME BATNA figures. No
   advocacy language anywhere in prompts or UI. **If a string would read differently depending on
   which party sees it, that is a bug.**
3. **Every BATNA number must be traceable to a published source**, presented as a range, with the
   source shown. No invented figures, no false precision.
4. **Settlement drafting carries a lawyer-review flag before signature** (configurable gate).
5. **Never use "force of a final judgment"** — unverified for Tunisia. Use "binding settlement
   enforceable between the parties".

## Tech decisions already made

- Vector DB: **Chroma** (in-process, no server). pgvector only if Postgres is already in the stack.
- Chain: **Hardhat local** for dev, **Polygon Amoy testnet** for the demo.
- LLM backend: deferred. All calls go through `core/llm_client.py` — a single swappable interface.
  Never call an SDK directly from agent code.
- OCR: undecided and **highest technical risk**. `hardening_agent/ingest.py` must be written behind
  an interface with at least two implementations, so the engine can be swapped after benchmarking.
- Persistence: **file-backed JSON**, keeping `backend/src/db.js`'s existing function shape, behind a
  store interface so Postgres is a later swap. Do not build that abstraction beyond one
  implementation now.
- `fetch_contract(contract_id)` is **off-chain by hash**. On-chain holds only
  `{hash, doc_type, parties, parent_doc_id, timestamp}`. The call (a) reads the latest anchor,
  (b) pulls text from encrypted off-chain storage, (c) re-hashes and verifies the fingerprint,
  (d) returns structured terms. **A hash mismatch raises — that mismatch IS the tamper detection
  and it is the whole point.** No contradiction with invariant 3.

## Working rules for this session

- **Audit before you change.** Do not modify the colleague's code until you have read it and
  produced a written migration plan for review.
- **Never break the build.** After each phase, the app must start and the existing happy path must
  still work. Small commits, one concern each.
- **Preserve the colleague's code style and structure** even where you would have chosen
  differently. Consistency beats your preference here.
- **Stub before you integrate.** The blockchain client gets a working in-memory fake first, so agent
  work is never blocked on the chain being ready.
- **Ask rather than assume** on anything that changes a cross-team interface, deletes existing
  functionality, or touches the on-chain schema.
- This is a hackathon. Depth on one contract type (supply) beats breadth across four. No premature
  abstraction, no speculative config, no test suites for code that does not exist yet.

---

## Audit corrections (2026-09-12)

Findings from the pre-migration audit that contradict the text above. The body of this file is
preserved as authored; these corrections take precedence where they conflict.

**1. The v1 blockchain interface row is wrong.** There is no `deploy_contract` and no
`fetch_contract` anywhere in this repo. What actually exists:

- Solidity (`contracts/contracts/MSMEContractRegistry.sol`): `createAgreement(bytes32 contentHash,
  address partyB, ConsentTier tier, bytes32 evidenceHash, string metadataURI) → uint256`, `sign(uint256)`,
  `verify(uint256, bytes32) → bool`, `getAgreement(uint256) → Agreement`, `isExecuted(uint256) → bool`.
- Backend (`backend/src/services/chainService.js`): raw ethers.js, **not** a REST wrapper, behind a
  `ChainService` interface with `mock` and `real` implementations selected by `CHAIN_MODE`.

**2. Ingestion does not exist.** `POST /api/relationships/demo` reads no request body and no file;
it returns hardcoded data from `backend/src/data/demoRelationship.js`. There is no multipart
handling anywhere in the backend. v3's `hardening_agent/ingest.py` is greenfield, not a migration.

**3. There is no per-user on-chain identity.** `RELAYER_PRIVATE_KEY_A/B` are two of Hardhat's
well-known public test keys, and **every agreement shares the same `partyA`/`partyB` addresses**
regardless of who the real parties are. Invariant 3's "pseudonymous party IDs" has no foundation yet.

**4. `metadataURI` is a dead placeholder** (`demo://contracts/<id>`), never resolved. No off-chain
document store exists, encrypted or otherwise — invariant 3 depends on one being built.

**5. The repo contains more than v1.** A per-agreement chat thread feature is merged (commit
`9727651`), and it already provides v3's "second party joins by scoped expiring token": see
`backend/src/services/confirmationTokens.js` and `threadAuth.js`. Reuse it; do not rebuild it.

**6. `ARCHITECTURE.md` still describes v1/v2** and declares itself the source of truth. It is being
updated in a separate, reviewable PR because a teammate reads that file.

**7. `ContractVersion.effective_to` is derived, never stored.** A version's window
closes when its successor takes force. Storing it would mean writing to an existing
version at the moment the next one is signed — exactly what invariant 1 forbids.
`version_manager.effective_to(contract, version_id)` computes it from the lineage,
walking past undated proposals, so nothing is ever written twice.

**8. `status` is derived too; the stored field is a cache.** A version is `proposed`
while it has no `effective_from`, `superseded` once a successor takes force, and
`in_force` otherwise. `version_manager.status_of()` always recomputes and never reads
the stored field, so a stale or hand-edited value cannot change behaviour.
`version_manager` is the field's only writer. A consequence that matches the anchoring
policy rather than fighting it: **a proposed version never becomes in-force.** A
hardened proposal stays proposed forever, and signing creates a *new* version whose
parent is that proposal — "a proposal is not a fact."

**9. Obligations live on their clause and nowhere else.** The data model lists
`obligations[]` on both `Clause` and `ContractObject`; two copies of one list drift
apart. `ContractObject.obligations()` is an accessor that walks the clauses.

**10. Sub-project D (dispute recommender) is retired as a separate piece**, deferred
not deleted. v3's `resolution_agent/` subsumes it; D's recommend-don't-act grounding
discipline survives as the Agent 2 liability posture above.

**11. The agent layer is `agent/` (Python) at the repo root**, and `/agent-service`
is deliberately left uncreated — see `agent/README.md`. No Python existed in this repo
or on any remote branch, so nothing was ported and nothing duplicated.
