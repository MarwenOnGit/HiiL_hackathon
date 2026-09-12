# Insaf platform extension — overview & current state

**Purpose of this document:** the single entry point for any AI coding agent
(or human) picking up work on this repo after this point. It has two jobs:
(1) state precisely what exists in the codebase *right now*, so no agent
re-derives it wrong or assumes something is built that isn't, and (2) lay
out the four sub-projects that extend the platform toward the "chat +
dispute resolution" direction the team discussed, in the order they should
be built, with the reasoning for why the scope was cut where it was cut.

**How to use this document:** read this file in full before touching any
of the four sub-project specs it references. Each sub-project spec is
self-contained and can be handed to a different agent/session, but all
four assume the current-state section below as ground truth. If anything
in a sub-project spec conflicts with this document, this document — being
the most recently verified against the actual repo — wins; flag the
conflict rather than silently picking one.

---

## Part 1 — Current state of the repo (verified 2026-09-12)

### 1.1 Where the code actually lives — read this carefully

**There are two branches, and they are NOT the same codebase:**

| Branch | What's on it |
|---|---|
| `main` | The original v1 prototype (see `README.md`, `ARCHITECTURE.md`) — WhatsApp-export ingestion, template-based contract generation, on-chain anchoring, manual two-button signing. Plus two documentation-only commits: the design spec and implementation plan for the confirmation-link feature (see below). |
| `counterparty-confirmation` (a local worktree at `.worktrees/counterparty-confirmation`, **not yet merged into `main`**) | Everything on `main`, **plus** a fully implemented, reviewed, and tested "counterparty confirmation link" feature — see 1.3 below. |

**If you are an AI agent starting fresh:** check which branch you're on
(`git branch --show-current`) before assuming any of section 1.3 exists.
If you're on `main`, the confirmation-link feature described below is
**not present** — you're looking at the pre-confirmation-link codebase,
and the "Anchor this agreement" button still immediately anchors on-chain
with two manual sign buttons (the old behavior). If you're on
`counterparty-confirmation`, section 1.3 is live.

The four sub-projects in Part 2 of this document all build **on top of**
the `counterparty-confirmation` branch's code, not `main`'s. Merge that
branch first (or work from it directly) before starting any of them.

### 1.2 The base platform (present on both branches)

A 24-hour-hackathon MSME agreement prototype. Golden path: connect a
conversation (WhatsApp export upload; Gmail/Outlook OAuth is UI-only,
unimplemented) → an extraction stub returns one canned demo relationship
→ a template-based generator (zero LLM calls) drafts a contract → the
backend anchors the contract's `keccak256` hash on a local Hardhat chain
via a Solidity registry contract → both parties confirm → a dashboard
lists everything anchored this session.

**Repo layout:**
```
/contracts   Solidity registry (MSMEContractRegistry.sol) + Hardhat tests/deploy
/backend     Node/Express — routes, in-memory "DB", chain service, contract generator
/frontend    Static HTML/CSS/JS, no build step, served by the backend
```

**Backend files (both branches):**
- `backend/src/index.js` — Express app entry point; mounts routers, serves `frontend/` statically, creates the `ChainService` singleton at startup from `CHAIN_MODE`.
- `backend/src/db.js` — the entire "database": four (five, on `counterparty-confirmation`) plain in-memory `Map`s with `save*`/`get*` function pairs. **Everything is wiped on process restart.** No Postgres, no file persistence, despite `ARCHITECTURE.md` §8 designing a Postgres schema for exactly this — that schema was never implemented.
- `backend/src/routes/relationships.js` — `POST /api/relationships/demo` returns a hardcoded canned relationship (`backend/src/data/demoRelationship.js`) standing in for the real extraction agent; `GET /api/relationships/:id`.
- `backend/src/routes/contracts.js` — `POST /:id/generate` (template-based, `contractGenerator.js`), `GET /:id`, `POST /:id/anchor`, `POST /:id/sign`, `GET /:id/status`. **The behavior of `/anchor` differs between the two branches — see 1.3.**
- `backend/src/routes/dashboard.js` — `GET /api/dashboard`, backed by `db.dashboardRows()`.
- `backend/src/services/chainService.js` — the `ChainService` abstraction: one interface, two implementations (`mock`, an in-memory fake; `real`, `ethers.js` against the local chain), selected once at startup by `CHAIN_MODE`. On `counterparty-confirmation`, the real implementation's `JsonRpcProvider` is constructed with `{ cacheTimeout: -1 }` — a fix for a real nonce-caching bug discovered during that feature's end-to-end testing (see 1.3).
- `backend/src/services/contractGenerator.js` — builds contract text from fixed clause templates, computes its `keccak256` hash, recommends a consent tier (`FULL_PLATFORM` if the counterparty has an `on_chain_address`, else `UNILATERAL` — these are currently the only two tiers ever produced).
- `backend/src/services/insaf.js` — every string the "Insaf" assistant persona says, one function per step, centralized so copy lives in one place.

**Contracts (both branches, unchanged by everything in this document):**
- `contracts/contracts/MSMEContractRegistry.sol` — one registry deployed once. `Agreement` struct: `contentHash`, `partyA`, `partyB`, `tier` (`ConsentTier` enum: `UNILATERAL`, `IN_PERSON_WITNESSED`, `REMOTE_OTP_VERIFIED`, `FULL_PLATFORM`), `evidenceHash`, `metadataURI` (currently a non-resolvable `demo://` placeholder — no real off-chain document store exists), `createdAt`, `signedA`, `signedB`. `createAgreement()`, `sign()`, `verify()`, `getAgreement()`, `isExecuted()`. `isExecuted()` requires only `signedA` for every tier except `FULL_PLATFORM`, which requires both.
- Two hardcoded Hardhat well-known test wallets (`RELAYER_PRIVATE_KEY_A`/`_B` in `backend/.env`) act as the platform's relayer (partyA, pays all gas) and a demo "counterparty with a wallet" (partyB) — **every agreement in the system today shares these same two addresses regardless of which real MSME owner or counterparty is involved.** There is no per-user on-chain identity.

**Frontend (both branches):** `frontend/index.html`/`app.js`/`styles.css` — a single-page 5-step wizard (Connect → Review → Contract → Anchor → Dashboard), light/dark theme toggle, no framework, no build step, served directly by Express.

### 1.3 What `counterparty-confirmation` adds on top of the base

Full design: `docs/superpowers/specs/2026-09-12-counterparty-confirmation-design.md`. Full implementation record: 10 commits, `7a43dba..d20aaf3` on that branch (see `git log` for the exact list — the ledger that tracked review/fix rounds was deleted after a clean final review, per process; git history is the permanent record).

**What it does:** the counterparty (who has no platform account) can now actually accept an agreement, not just have `UNILATERAL` rubber-stamped by the owner alone. Flow: owner clicks "Get a confirmation link" (previously this button anchored on-chain immediately) → backend generates a one-time token + 6-digit code, 7-day expiry, single-use, burned after 5 wrong attempts → owner manually forwards both to the counterparty (WhatsApp/email — deliberately not automated; no messaging provider is wired up) → counterparty opens a **standalone, unauthenticated page** (`frontend/confirm.html`/`confirm.js`), reads the contract text, enters the code → on a correct code, the backend performs the **actual** on-chain `createAgreement()` + `sign()` calls (deferred from when the owner clicked the button) using tier `REMOTE_OTP_VERIFIED` and a real `evidenceHash` built from `keccak256({token, contract_id, contract_text_hash, accepted_at})`.

**New/changed files on this branch:**
- `backend/src/services/confirmationTokens.js` (new) — pure logic: token/code generation, expiry, the `checkCode`/`markUsed` separation (a correct code does *not* immediately burn the token — only a `markUsed` call, made after both chain calls succeed, does; this is what lets a chain failure be safely retried). 8 unit tests, `backend/test/confirmationTokens.test.js` — the *only* automated tests anywhere in the backend.
- `backend/src/db.js` — gained a fifth Map (`pendingConfirmations`) and `findActiveByContract()`/`listConfirmations()` helpers (added during the fix round below).
- `backend/src/routes/contracts.js` — `/anchor` no longer calls the chain; it creates/reuses a pending confirmation.
- `backend/src/routes/confirm.js` (new) — the public, unauthenticated API the counterparty's page calls: `GET /:token` (status + contract text if pending), `POST /:token` (submit the code; on success, performs the deferred anchor+sign).
- `frontend/confirm.html` + `frontend/confirm.js` (new) — the standalone counterparty page. Zero dependency on `app.js` or the rest of the wizard.
- `frontend/index.html`/`app.js` — Step 4 of the wizard now displays the confirmation link/code instead of two manual sign buttons.

**Known, deliberately-accepted gaps on this branch** (do not "fix" these without a real reason — they were evaluated and parked):
1. A chain failure between `createAgreement` succeeding and `sign` failing can orphan an on-chain agreement (no idempotency across that specific two-call boundary). Accepted: fixing it needs a data-model change beyond this feature's scope; the risk pre-dates this feature.
2. The `{ cacheTimeout: -1 }` fix to the shared `ChainService`'s real provider (fixing a genuine nonce-caching bug this feature's back-to-back chain calls exposed) is broader in scope than the one call site that needed it — every real-chain-mode caller is affected. Accepted: no correctness downside was found; verified directly against `/anchor`, `/sign`, `/status`.
3. A narrow true-concurrency (not double-click — that's fixed) race remains in the double-anchor guard added during the final review's fix round. Accepted: requires a proper lock to close, disproportionate for a single-process local-demo backend.

**What this branch still does *not* have**, and which the four sub-projects below build toward: no persistence beyond process lifetime, no notification to the owner when the counterparty accepts (the owner must manually check the dashboard), no real off-chain document storage (the `metadataURI` placeholder is never resolved), no way to amend an anchored agreement, no PDF ingestion path, and Agent 3 (monitoring/dispute recommendation) is entirely unbuilt.

---

## Part 2 — Why the scope is cut where it's cut

The team considered, and explicitly rejected for now, building a full
two-sided in-house chat platform where MSMEs and their counterparties
would migrate all business communication into this app, with PDF
contracts stored directly on-chain, structured contract data queryable
from the chain, an "update contract" feature that mutates an anchored
agreement in place, and an AI that actively mediates live negotiation
between two parties over a breach.

**That was rejected for four specific, load-bearing reasons — an agent
extending this platform must not casually reintroduce any of them:**

1. **Adoption cost.** `ARCHITECTURE.md` §5 already made this call explicitly: there is no way to make a counterparty adopt a new communication tool for their entire relationship with an MSME, and asking them to try is a bigger risk than meeting them on WhatsApp/email. A general-purpose in-house chat app repeats the mistake this document already avoided once.
2. **On-chain storage economics and design.** Blockchains are for tamper-evident fingerprints, not document storage or queryable structured data. Storing a PDF's bytes, or restructuring the `Agreement` struct so an AI can "retrieve everything from the chain," inverts the hash-anchoring pattern this whole system is built on and that is explicitly why `contentHash`/`evidenceHash` exist instead of full text fields.
3. **Tamper-evidence integrity.** An "update contract" feature that mutates the meaning of an already-anchored, already-signed agreement defeats the entire reason the product anchors anything at all. The only form of "update" that doesn't contradict the premise is **versioning**: a new agreement, a new anchor, a fresh accept/sign cycle, with an explicit on-chain link back to what it supersedes.
4. **Liability surface.** The existing design for the monitoring/dispute agent (`ARCHITECTURE.md` §6.4) is deliberately one-directional: it recommends to the MSME owner, cites retrieved legal text, and carries an explicit honesty/confidence disclaimer. An AI that actively negotiates between two parties over money and a contract breach is a materially larger legal-liability step, not a natural extension, and should not be built without the team explicitly deciding to take on that liability with eyes open.

> **OVERRIDDEN 2026-09-12 — eyes open.** The team has now explicitly taken on
> that liability. v3's Agent 2 (resolution) does reconcile facts between both
> parties, estimate each side's court outcome, and drive a settlement. This
> paragraph is superseded, **not** by dropping the concern, but by replacing it
> with a narrower posture that is binding on all code, prompts and UI copy:
>
> 1. The system never decides anything binding — it produces estimates and
>    options; every binding act is a human signature.
> 2. Neutral by design: both parties see the SAME fact ledger and the SAME BATNA
>    figures. No advocacy language. If a string would read differently depending
>    on which party sees it, that is a bug.
> 3. Every BATNA number traceable to a published source, shown as a range, with
>    the source displayed. No invented figures, no false precision.
> 4. Settlement drafting carries a lawyer-review flag before signature
>    (configurable gate).
> 5. Never "force of a final judgment" — unverified for Tunisia. Use "binding
>    settlement enforceable between the parties".
>
> See `CLAUDE.md` ("Agent 2 liability posture") and the Known limitations block
> in `2026-09-12-per-agreement-chat-design.md`. Reasons 1-3 of this Part 2 still
> stand unchanged.

**The middle ground — what actually gets built instead — keeps the value
from the bigger pitch while avoiding all four of the above:**

- Instead of a general chat platform: a **discussion thread scoped to one agreement**, opened only after that agreement is anchored, reachable by the counterparty through the same no-account, link-based access pattern already built for confirmation (Sub-project A).
- Instead of an "update" that mutates: **versioned amendments** — a new anchor, a new confirmation cycle, one new Solidity field linking versions together (Sub-project B).
- Instead of storing PDFs on-chain: **PDF as a second ingestion path**, hashed and anchored exactly like generated contract text already is (Sub-project C).
- Instead of an AI that negotiates: an AI that **drafts a suggested message for the owner to review and choose to send**, grounded in the per-agreement thread and retrieved legal text — the recommend-don't-act shape `ARCHITECTURE.md` §6.4 already specified, now with a real input to ground it in (Sub-project D).

## Part 3 — The four sub-projects, and the order to build them

> **STATUS 2026-09-12.** A is built and merged (`9727651`). The product has since
> moved to v3 (see `CLAUDE.md`), and the remaining three are resolved as:
> **B (versioning)** — folded into `core/version_manager.py`; its single
> `supersedes` field migrates mechanically into `parent_version_id`. No longer a
> separate sub-project.
> **C (PDF ingestion)** — superseded by `hardening_agent/ingest.py`; port anything
> usable, then retire the spec.
> **D (dispute recommender)** — status not yet decided; see the open question in
> the audit. Deferred, not deleted.
> Nothing here is deleted: anything off the demo path is deferred.

Each has its own full spec (written the same day as this overview, same
level of detail as the counterparty-confirmation spec they extend).
**Build in this order — each one meaningfully de-risks or unblocks the
next:**

| # | Sub-project | Spec file | Depends on | Why this order |
|---|---|---|---|---|
| A | Per-agreement chat thread + persistent link access | `2026-09-12-per-agreement-chat-design.md` | `counterparty-confirmation` branch merged | Foundational — B and D both need somewhere for messages to live before they can reference them. Also the piece that actually solves the "owner never finds out the counterparty responded" gap raised earlier, since a shared thread makes in-app notification natural. |
| B | Versioned contract amendments | `2026-09-12-contract-versioning-design.md` | A (an amendment proposal is discussed in the thread before being anchored) | The riskiest piece to get wrong (it's the one place a mistake would repeat the tamper-evidence failure the whole system exists to prevent) — sequencing it after A means it can reuse A's thread and access-control machinery instead of inventing its own. |
| C | PDF ingestion path | `2026-09-12-pdf-ingestion-design.md` | Nothing above — independent | Purely additive to the existing ingestion step (Step 1 of the wizard); can be built in parallel with A/B by a second agent/session if team capacity allows. Sequenced last here only because it's the least architecturally entangled with the others, not because it's less valuable. |
| D | Dispute-resolution recommender (Agent 3) | `2026-09-12-dispute-recommender-design.md` | A (needs the thread's message history to ground its recommendations), and ideally the `/legal-corpus` retrieval piece from `ARCHITECTURE.md` §6.4 if the RAG teammate has it ready | Last because it's the most speculative on retrieval quality and is explicitly designed to degrade gracefully (recommend nothing rather than hallucinate) if the legal corpus isn't ready — see its spec's error-handling section. |

**Decomposition rule for whoever picks this up:** each sub-project spec
is independently buildable and independently demoable — don't start
implementing across two of them at once without finishing one first, and
don't let "it would be nice if D could also do X from C" pull scope
backward into an earlier sub-project. If a sub-project's own spec and
this overview ever disagree on a boundary, the sub-project's own spec is
more detailed and wins for its own scope — but flag the disagreement
back into this file rather than silently resolving it twice in two
places.

## Part 4 — Instructions for any AI coding agent working from this document

(Mirrors `ARCHITECTURE.md` §12, extended for this round of work.)

- Read Part 1 in full before writing any code — know which branch you're on and what already exists there.
- Never treat a "known, deliberately-accepted gap" (1.3) as a bug to silently fix as a drive-by — if you think one needs fixing, say so and why, don't just change it.
- Each sub-project spec names its own file structure, data model, error handling, and testing plan in the same depth as `2026-09-12-counterparty-confirmation-design.md` — read a sub-project's spec in full before touching any file it names.
- Preserve the hash-anchoring pattern everywhere: **the chain stores fingerprints and small enums/flags, never documents or free-form structured content.** Any design that proposes putting a document, a chat transcript, or "everything the AI needs" on-chain is a design to reject or push back on, not implement.
- Preserve the recommend-don't-act pattern for every AI-facing feature: an AI drafts, cites its grounding, and states its confidence; a human decides whether to act. This applies to Sub-project D in full, and to any future extension of it.
- If a sub-project's scope turns out to be bigger than its spec once you're implementing it, stop and say so rather than quietly cutting corners to fit — these specs were written to be buildable as scoped, and hidden complexity is a signal to re-scope, not to rush.
