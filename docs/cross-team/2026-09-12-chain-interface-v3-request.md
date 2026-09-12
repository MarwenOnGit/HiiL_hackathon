# Chain interface change request — v1 registry → v3 event log

**To:** whoever owns `contracts/` and `backend/src/services/chainService.js`
**From:** the agent-layer work (`agent/`)
**Status:** request for review. **Nothing in `contracts/` or `backend/` has been
touched.** The agent layer runs against an in-memory fake
(`agent/blockchain_client/fake.py`) and can keep doing so indefinitely, so
nothing here is urgent for *us* — but the live demo needs a real chain, so it
is on your critical path more than ours.

## Why this is a request and not a patch

The registry works, and the two-implementation `ChainService` pattern is the
single best thing in the existing codebase — the agent layer copied it rather
than inventing something. This document exists because the v3 product needs
facts on-chain that the current struct has nowhere to put, and changing a
deployed contract's schema is your call, not ours.

## What changed in the product

v1 anchored **one contract that nobody disputes exists**. v3 uses the chain as
a **tamper-proof event log**: many versions of one contract, linked to their
parents, plus attested obligation and dispute events. Two consequences:

1. An agreement needs to say **what kind of document** it is and **which
   document it descends from**.
2. Things that are not documents — a delivery confirmed, a dispute opened, a
   settlement signed — need to be recordable.

## What we need, precisely

Four operations. Names are ours; match your own conventions freely — the
shapes are what matter.

### 1. `anchor_document`

```
anchor_document(
  document_hash: bytes32,     # keccak256 of the version's text
  doc_type: enum,             # original | hardened | signed | amendment
  parties: address[]|bytes32[],# pseudonymous ids — never display names
  parent_doc_id: uint256|null,# the version this descends from
  metadata: string            # short, opaque; NOT document content
) -> { doc_id, tx_hash }
```

Against today's `createAgreement`, this adds exactly two fields: **`doc_type`**
and **`parent_doc_id`**. Everything else maps onto what you already store.

`doc_type` matters because the anchoring policy differs by kind — a `hardened`
proposal is deliberately **never anchored** ("a proposal is not a fact"), while
`original` is anchored with one signature only, before any analysis, proving
the file existed on that date and Party A held it — explicitly *not* mutual
agreement.

### 2. `attest_event` — the genuinely new surface

```
attest_event(
  contract_id: bytes32|string,
  event_type: enum,           # obligation_performed | obligation_breached
                              # | dispute_opened | dispute_resolved
                              # | dispute_escalated | settlement_signed
  payload_hash: bytes32,      # hash of the off-chain evidence
  signer: pseudonymous id
) -> tx_hash
```

`event_type` must be a closed enum, not a string. "Only event types go
on-chain" is meaningless if the type is a free-text sentence, and a string
field is how contract text eventually arrives.

This is what makes "resolution was attempted before court" provable, which is
the product's central legal claim.

### 3. `fetch_history(contract_id) -> ordered anchors + events`

Everything recorded for one contract, oldest first, **totally ordered** — if
two records share a timestamp, the order must still be unambiguous, because the
ordering *is* the evidence. Block/log index is the natural tiebreak on a real
chain.

Today there is no per-contract grouping at all: chain ids are integers
unrelated to `contract_id`. This probably means an index, not just a getter.

### 4. `fetch_contract(contract_id) -> structured terms`

**This one is not a chain call and should not be built as one.** The chain has
no terms to return. The resolution is: read the latest anchor → pull the text
from off-chain storage → re-hash → compare → return terms, **raising** if the
hashes differ. That mismatch is the tamper detection and the whole point.

We have already built it on our side
(`agent/blockchain_client/resolver.py::ContractResolver.fetch_contract`), so
**you do not need to implement this.** It is listed only so the four names in
the v3 brief are all accounted for. What we need from you is #1–#3.

## Hard constraint, please treat as non-negotiable

**Only hashes, pseudonymous party ids, timestamps and event types go on-chain.**
Never contract text, never evidence, never a chat transcript. The agent layer
enforces this at its boundary and refuses payloads that violate it — including
a `metadata` value over 256 characters, and any metadata key named `text`,
`clauses`, `excerpt`, `evidence` and similar, because the realistic failure mode
is not a decision to store a document but a convenience field quietly growing.
If your `metadata` field ends up wide open, we will still refuse to fill it.

## Three things in the current code worth your attention

These are pre-existing and not caused by v3; you may already know them.

1. **Every agreement shares the same two wallets.** `RELAYER_PRIVATE_KEY_A/B`
   are Hardhat's well-known public test keys, so `partyA`/`partyB` are
   identical for every agreement regardless of who the real parties are. v3's
   "pseudonymous party ids" has no foundation until there is some per-party
   identity — even a derived pseudonym would do. **This is the one item that
   needs a decision from you before #1 is buildable.**
2. **`metadataURI` is a dead placeholder.** It is written as
   `demo://contracts/<id>` and never resolved; no off-chain document store
   exists. v3 needs one, encrypted, and `fetch_contract` above depends on it.
3. **`isExecuted` mock/real divergence.** In `chainService.js`, the mock stores
   `tier` as a string but indexes it as an integer (`CONSENT_TIERS[a.tier]`,
   `a.tier === 3`). It returns the right answer for `REMOTE_OTP_VERIFIED` by
   coincidence, and `getAgreement` returns `tier: undefined` in mock mode. Not
   urgent; worth fixing while you are in the file.

## Migration shape we would suggest

Additive, so nothing that exists stops working:

1. Add `doc_type` and `parent_doc_id` to the `Agreement` struct. A redeploy on
   a local chain costs nothing, and there is no production state to migrate.
2. Add `attest_event` plus its enum and event.
3. Add a per-contract index for `fetch_history`.
4. Extend `ChainService` with the new methods, keeping the existing five intact
   so the current happy path keeps working through the change.

**One decision we have already made on our side, for your awareness:** the
repo's earlier Sub-project B proposed a single `uint256 supersedes` field for
amendments. That has been folded into v3's version lineage — it becomes
`parent_version_id` off-chain and `parent_doc_id` on-chain. Same fact, one
name. You are not being asked for both.

## What we need back

- Yes/no on `doc_type` + `parent_doc_id` being additive to the struct.
- Whether `attest_event` is in scope for you, or whether we should keep it on
  the fake for the demo and show the anchor path only.
- Your answer on per-party identity (item 1 above) — this is the blocker.
- A rough ETA, so we know whether to plan the demo around the fake or the real
  chain.

Until all of that lands, the agent layer stays on the fake and nothing is
blocked on you.
