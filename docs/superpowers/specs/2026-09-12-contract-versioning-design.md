# Versioned contract amendments — design

**Status:** scoped, ready for an implementation plan
**Sub-project B of:** `2026-09-12-msme-platform-extension-overview.md` — read that file first.
**Owns:** contracts (one Solidity field) + backend + frontend
**Depends on:** Sub-project A (the per-agreement thread — an amendment is proposed and discussed there before being anchored)

## Problem — and the thing this must never become

The team's original pitch included an "update contract" feature: let the
user change the contract based on the chat discussion. As discussed
directly with the user (see conversation history — this is the point
that was flagged as a potential direct contradiction), **mutating an
already-anchored agreement in place defeats the entire reason anything is
anchored at all.** The whole product's claim is "once both sides accepted
this exact text, neither side can quietly change it." A same-record
"edit" feature, however convenient, is precisely the failure mode the
anchor exists to make detectable and impossible.

**This spec exists to make the *correct* version of "update" concrete
enough that no implementation of it can accidentally become mutation.**
The rule, stated once so every part of this spec can point back to it:

> **An amendment is always a new agreement.** It gets its own hash, its
> own on-chain `createAgreement` call, its own full accept/sign cycle from
> both parties. The only thing that makes it an "amendment" rather than an
> unrelated new agreement is one extra field — `supersedes` — recording
> which prior on-chain agreement id it replaces. Nothing about a prior
> agreement's on-chain record ever changes once written.

## Decisions

1. **Solidity change: exactly one new field, additive only.** Add `uint256 supersedes` to the `Agreement` struct — `type(uint256).max` (or a dedicated sentinel, see below) when an agreement is not an amendment of anything. This is a real, deliberate, minimal contract change — unlike the rejected "store the PDF on-chain" idea, this is exactly the kind of small, load-bearing fact (provenance) that belongs on-chain, because it's cheap, permanent, and exactly the kind of thing someone might later try to misrepresent ("this was always the only version").
2. **An amendment must be proposed and discussed before it's anchored.** It originates as a normal message in Sub-project A's per-agreement thread (e.g., "I'd like to change the delivery schedule to..."), not as a form the owner fills out unilaterally. This spec does not require parsing that discussion automatically — a human (the owner) decides when a proposal in the thread is ready to become a real amendment draft, and triggers the next step explicitly. (A future, more automated version could have an AI suggest turning a thread discussion into a draft — that is out of scope here and would be an extension of Sub-project D, not this one.)
3. **An amendment reuses the exact confirmation-link flow, unchanged.** The counterparty must accept an amendment the same way they accepted the original — same token/code/expiry mechanics, same standalone page, same deferred-anchor-until-accept pattern from `counterparty-confirmation`. This spec does not invent a second consent mechanism; it re-triggers the first one with a `supersedes` pointer attached.
4. **The old agreement is never marked "superseded" on-chain in a way that could be confused with revocation.** `getAgreement()` for the old id still returns exactly what it always returned — `supersedes` lives only on the *new* record, pointing backward. Anyone verifying the old agreement's hash still gets a true "yes, this was agreed to" — because it was, at the time, and that fact doesn't stop being true just because it was later amended. This is important: an amendment is not a retraction.
5. **Which version is "current"** is an off-chain question the backend answers (by chaining `supersedes` pointers, or simpler: storing `superseded_by` on the old contract's off-chain record when the new one is created), not something the smart contract needs to compute — keeps the contract simple and matches the existing pattern of the chain doing minimal work.

## Architecture / data flow

```
Owner and counterparty discuss a change in the agreement's thread
(Sub-project A) — purely off-chain, no special "amendment mode"
        │
        ▼
Owner decides to formalize it: clicks "Propose an amendment" from the
thread view, writes/edits the new contract text (reuses
contractGenerator.js's template shape — this spec does not change how
contract text itself is produced, only what happens once it's ready)
        │
        ▼
Backend computes the new text's keccak256 hash, creates a new "contract"
record (db.saveContract, existing function) with a new contract_id, and
stores supersedes_contract_id pointing at the original contract's id
(off-chain bookkeeping, not yet on-chain)
        │
        ▼
Backend creates a confirmation (confirmationTokens.createConfirmation,
existing, unchanged) for this NEW contract_id — the counterparty gets a
new link/code, exactly like the original agreement's flow
        │
        ▼
Counterparty opens confirm.html, reviews the NEW text (their existing
agreement is untouched and still valid until this moment), accepts
        │
        ▼
Backend's /api/confirm/:token POST handler (existing, from
counterparty-confirmation) calls chain.createAgreement(...) — MODIFIED
to also pass the on-chain id of the agreement being superseded, which the
route reads from the contract's supersedes_contract_id → the ORIGINAL
CONTRACT's onchain record → its agreement_onchain_id
        │
        ▼
New on-chain agreement created with supersedes = <old agreement's
on-chain id>, then signed exactly as before (chain.sign, unchanged) —
the new agreement is now the active one; the old one's on-chain record is
untouched and still independently verifiable
```

## Components

### `contracts/contracts/MSMEContractRegistry.sol` (modified — the one Solidity change in this entire extension effort)

```solidity
struct Agreement {
    bytes32 contentHash;
    address partyA;
    address partyB;
    ConsentTier tier;
    bytes32 evidenceHash;
    string metadataURI;
    uint256 createdAt;
    bool signedA;
    bool signedB;
    uint256 supersedes;   // id of the agreement this one amends, or NO_SUPERSEDE
}

uint256 public constant NO_SUPERSEDE = type(uint256).max;

function createAgreement(
    bytes32 contentHash,
    address partyB,
    ConsentTier tier,
    bytes32 evidenceHash,
    string calldata metadataURI,
    uint256 supersedes   // pass NO_SUPERSEDE for a non-amendment agreement
) external returns (uint256 id) {
    if (supersedes != NO_SUPERSEDE) {
        if (supersedes >= nextId) revert UnknownAgreement();
    }
    id = nextId++;
    agreements[id] = Agreement({
        contentHash: contentHash,
        partyA: msg.sender,
        partyB: partyB,
        tier: tier,
        evidenceHash: evidenceHash,
        metadataURI: metadataURI,
        createdAt: block.timestamp,
        signedA: false,
        signedB: false,
        supersedes: supersedes
    });
    emit AgreementCreated(id, contentHash, msg.sender, tier);
}
```

This is a **breaking ABI change** (the function signature gains a
parameter) — every existing caller of `createAgreement` must be updated
to pass `NO_SUPERSEDE` for a normal (non-amendment) agreement. This means
`backend/src/services/chainService.js`'s `REGISTRY_ABI` array and both
`createAgreement` implementations (mock and real) need the new parameter.
On the `counterparty-confirmation` branch this feature builds on, there
is exactly **one** live caller of `chain.createAgreement`:
`backend/src/routes/confirm.js`'s POST handler (per the overview, Part
1.3, `contracts.js`'s `/anchor` route no longer calls the chain at all —
it only creates a pending confirmation). That one caller needs updating
to pass `NO_SUPERSEDE` for a normal agreement, or the resolved
superseded-agreement id for an amendment (see the `confirm.js` changes
below). **Re-deploy the contract** — this is not
a state migration, it's a fresh deploy with an empty registry (consistent
with how `start.sh` already redeploys fresh every run; there is no
existing on-chain state anywhere in this local-chain-only prototype worth
preserving across a redeploy).

`getAgreement()` and `isExecuted()` are unaffected — the added field just
flows through the existing tuple return.

### `backend/src/services/chainService.js` (modified)
Both `createAgreement` implementations gain a `supersedes` parameter
(default/sentinel `null`/`NO_SUPERSEDE` for a non-amendment call — pick
one sentinel representation and use it consistently between JS and
Solidity: recommend passing `ethers.MaxUint256` from JS to match
`type(uint256).max` on the Solidity side exactly, rather than inventing a
different JS-side sentinel value that needs translation).

### `backend/src/db.js` (modified)
Contracts gain an optional `supersedes_contract_id` field (set at
creation time when an amendment is proposed, `null` otherwise — this is
off-chain bookkeeping connecting the *off-chain* contract records before
either side of the amendment is anchored; the on-chain `supersedes` link
is the durable, tamper-evident version of the same fact, set once the
amendment is actually accepted).

### `backend/src/routes/contracts.js` (modified) or a new `amendments.js` route
`POST /api/contracts/:id/propose-amendment` — body `{ contract_text }`
(or reuses `contractGenerator.js` with modified clause inputs — this
spec doesn't mandate how the new text is authored, only what happens once
it exists). Requires the target contract to already be `executed`
on-chain (you can't amend something that was never accepted). Creates
the new contract record with `supersedes_contract_id` set, computes its
hash, and immediately calls `confirmationTokens.createConfirmation` for
it — response shape mirrors the existing `/anchor` response exactly
(`{ confirmation: {...}, insaf }`), since from the counterparty's side an
amendment confirmation is indistinguishable in mechanics from an original
one.

### `backend/src/routes/confirm.js` (modified)
The POST handler's `chain.createAgreement(...)` call gains the
`supersedes` argument, resolved by looking up
`contract.supersedes_contract_id` → `db.getOnchainRecord(thatContractId).agreement_onchain_id`
if set, else the sentinel for "not an amendment."

## Data model addition

```
// contracts (existing Map, gains one optional field)
{
  ...existing contract fields...,
  supersedes_contract_id: string | null
}
```

## Error handling

| Case | Response |
|---|---|
| Propose an amendment for a contract that was never executed on-chain | 400, `{ error: "cannot amend an agreement that was never confirmed" }` |
| Propose an amendment for a contract that itself has already been superseded (i.e., someone tries to amend an old version instead of the current one) | 409, `{ error: "a newer version of this agreement already exists", current_contract_id: "..." }` — the backend must track and check this, since amending a stale version would fork the amendment chain |
| `createAgreement`'s `supersedes` argument references an id `>= nextId` on-chain | Solidity reverts `UnknownAgreement` (already an existing error in the contract) — surfaces as a 500 from the route exactly like any other chain revert today |

## Testing

- Hardhat test additions to `contracts/test/MSMEContractRegistry.test.js`: creating an agreement with `supersedes = NO_SUPERSEDE` behaves exactly as every existing test already expects (regression coverage for the ABI change); creating one with a valid `supersedes` value stores it correctly and leaves the superseded agreement's own fields completely unchanged; `supersedes` pointing at a nonexistent id reverts.
- Backend unit test for the "can't amend a stale version" check (pure logic, given a fixture of contract records).
- Manual end-to-end: anchor an agreement, propose an amendment, confirm it as the counterparty, verify on-chain (via a small script, same pattern as the counterparty-confirmation feature's own end-to-end verification) that the new agreement's `supersedes` field correctly points at the old one's id, and that `getAgreement()` on the OLD id still returns its original, unchanged data.

## Out of scope (explicit)

- No automatic parsing of the thread discussion into a proposed amendment — a human decides what changes and writes/triggers the new text.
- No chain of more than one amendment is specifically tested here, but the design supports it (each new agreement's `supersedes` points at whatever the immediately-prior version's on-chain id was) — don't add artificial restrictions against amending an amendment, but also don't build UI for walking a long chain of versions unless asked.
- No way to reject/decline a proposed amendment distinct from simply not accepting the link (mirrors the existing confirmation flow's own accept-only scope).
- No change to `ConsentTier` handling — an amendment goes through the same tier logic as any other agreement.
