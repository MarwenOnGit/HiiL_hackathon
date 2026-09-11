# Counterparty confirmation link — design

**Status:** approved, ready for implementation plan
**Owns:** backend (contracts unchanged)

## Problem

The counterparty in an MSME agreement is usually not a platform user — no
account, no wallet. Today, anchoring only ever exercises `UNILATERAL`: the
owner's own relayer signature, with `evidenceHash` hardcoded to `0x0`
everywhere. There is no mechanism to capture and cryptographically anchor
the counterparty's acceptance at all, and no way for them to even see the
contract text without an account.

## Decisions made during brainstorming

1. **Anchor timing:** deferred. The on-chain `createAgreement()` call does
   not happen when the owner clicks "anchor." It happens once, at the
   moment the counterparty accepts — so `evidenceHash` is available from
   the start and the Solidity contract needs no changes (it doesn't support
   attaching evidence to an existing agreement).
2. **OTP delivery:** owner relays it. The backend generates a link + a
   6-digit code; the owner forwards both to the counterparty manually
   (WhatsApp/email — whatever channel they already use). This is **not**
   independent identity verification — it's evidence that "whoever holds
   the link and the code accepted," honestly scoped as such in copy and
   code comments. A provider-backed direct-send (Twilio/WhatsApp Business
   API) is a deliberate v2, out of scope here.
3. **Link lifecycle:** 7-day expiry, single use. Re-visiting an accepted or
   expired link never re-fires acceptance.

## Architecture / data flow

```
Owner reviews & generates contract (unchanged, Steps 1-3 of the wizard)
        │
        ▼
Owner clicks "Get confirmation link" (replaces today's immediate anchor
call on Step 4)
        │
        ▼
Backend creates a pending-confirmation record:
  { token, otp_code, contract_id, expires_at, used: false }
        │
        ▼
Owner forwards the link + code to the counterparty themselves
        │
        ▼
Counterparty opens /confirm.html?token=... — no login, no account
  → sees the contract text, an OTP input, an Accept button
        │
        ▼
Counterparty enters the code, clicks Accept
        │
        ▼
Backend validates token (exists / not expired / not used) and code
(rate-limited: 5 attempts, then the token is burned)
        │
        ▼
Backend builds an evidence record and hashes it:
  evidenceHash = keccak256(JSON.stringify({
    token, contract_id, contract_text_hash, accepted_at
  }))
        │
        ▼
Backend calls chain.createAgreement(contentHash, null, "REMOTE_OTP_VERIFIED",
  evidenceHash, metadataURI) — the deferred anchor
        │
        ▼
Backend immediately calls chain.sign({ signerRole: "partyA" }) in the same
request — the owner's consent was already implicit when they generated and
sent the contract; there is no separate manual "confirm as MSME owner"
step for this path.
        │
        ▼
Only now, once both chain calls succeed, is the token marked used
(a chain failure here leaves the token valid for a safe retry)
        │
        ▼
isExecuted() is now true (REMOTE_OTP_VERIFIED only requires signedA, same
rule as UNILATERAL) — the agreement is live, in one flow, from the
counterparty's one click.
```

Reuses the existing `REMOTE_OTP_VERIFIED` enum value already defined in
`MSMEContractRegistry.sol` — no contract redeploy needed, no ABI change.

## Components

### `backend/src/services/confirmationTokens.js` (new)
Pure logic, no chain/network dependency — the one thing in this feature
worth unit-testing directly.
- `createConfirmation(contractId)` → generates an opaque random token
  (32 bytes, hex) and a 6-digit numeric code, stores
  `{ contract_id, otp_code, expires_at: now + 7d, used: false, attempts: 0 }`
  keyed by token in a new in-memory map (same style as `db.js`), returns
  `{ token, otp_code, expires_at }`.
- `getConfirmation(token)` → record or `null`.
- `checkStatus(token)` → `"pending" | "expired" | "already_confirmed" | "invalid"`.
- `recordFailedAttempt(token)` → increments `attempts`; at 5, marks `used: true`
  (burns the token) so it can't be brute-forced.
- `checkCode(token, submittedCode)` → validates code against
  status/expiry/attempts. On a wrong code, increments `attempts` (burning
  the token at 5) and throws `wrong_code`. On a correct code, does
  **not** mark the token used yet — returns the matched record. Throws
  `invalid`/`expired`/`already_confirmed` as appropriate. Marking a token
  used is a separate, explicit step (`markUsed(token)`) so a chain
  failure after a correct code doesn't burn the counterparty's only
  attempt — see route logic below.

This is new state alongside `relationships`/`contracts`/`agreementsOnchain`
in `db.js` — same in-memory-Map pattern, not a separate persistence layer
(consistent with the rest of the current codebase; the earlier-flagged gap
that all of this vanishes on restart applies here too and is not being
fixed by this feature).

### `backend/src/routes/confirm.js` (new, mounted at `/api/confirm`, unauthenticated)
- `GET /api/confirm/:token` → `{ status, contract_text? }`. Only returns
  `contract_text` when status is `pending` (never leak contract text for
  an invalid token).
- `POST /api/confirm/:token` with `{ otp_code }` → calls
  `confirmationTokens.checkCode(token, otp_code)` first. On a code
  mismatch or bad token state, returns the specific status (`expired` /
  `already_confirmed` / `wrong_code` with remaining-attempts count /
  `invalid`) with an appropriate HTTP code (404 for
  invalid/expired/already_confirmed, 400 for wrong_code) — nothing
  on-chain happens yet. On a correct code: builds the evidence hash,
  calls `chain.createAgreement(...)` then `chain.sign({ signerRole:
  "partyA" })`. Only once both succeed does it call
  `confirmationTokens.markUsed(token)`, save the onchain record via
  `db.saveOnchainRecord` exactly as today's anchor route does, and return
  `{ onchain, insaf }` (reusing `insaf.onAnchored`/`onSigned` copy). If
  either chain call throws, the token is **not** marked used and
  `attempts` is untouched — the counterparty can safely retry with the
  same correct code once the underlying chain problem is fixed.

### `backend/src/routes/contracts.js` (modified)
`POST /:id/anchor` no longer calls `chain.createAgreement` directly. It
now calls `confirmationTokens.createConfirmation(contract.contract_id)`
and returns `{ token, otp_code, expires_at, confirm_url }` instead of an
`onchain` record. (`confirm_url` is `${PUBLIC_BASE_URL}/confirm.html?token=...`;
`PUBLIC_BASE_URL` defaults to `http://localhost:4000` via a new optional
env var, falling back to constructing it from the request if unset — good
enough for the local-demo scope this whole project is already limited to.)

### `frontend/confirm.html` + `frontend/confirm.js` (new)
Standalone page, not part of the 5-step wizard — reuses `styles.css` and
the `.card`/`.contract-text`/`.primary-btn` styles already there. Reads
`?token=` from the URL, calls `GET /api/confirm/:token` on load:
- `pending` → renders contract text, an OTP input, an Accept button.
- `expired` / `already_confirmed` / `invalid` → renders a plain message,
  no form.
On Accept, calls `POST /api/confirm/:token`, shows success (mirroring the
existing anchor-success copy) or the specific error inline (wrong code —
allow retry; anything else — no retry, matches the read-only states above).

### `frontend/index.html` + `frontend/app.js` (modified, Step 4)
"Anchor this agreement" button's handler changes: instead of rendering an
on-chain record immediately, it calls the modified `/anchor` endpoint,
then renders a new state on the card — the confirmation link, the code,
and a "waiting on counterparty" status — with a copy-friendly display of
both (a real send-it-yourself flow, not a mailto/wa.me auto-send, per the
owner-relays-it decision). No polling is added in this pass: the owner
checks the Dashboard (Step 5) to see whether it's flipped to `executed`
once the counterparty has confirmed — refreshing that view manually is
already how the dashboard works today.

## Data model addition

```
pendingConfirmations: Map<token, {
  contract_id: string,
  otp_code: string,       // 6 digits, zero-padded
  expires_at: number,     // epoch ms
  used: boolean,
  attempts: number
}>
```

## Error handling

| Case | confirm page shows | HTTP status |
|---|---|---|
| Token doesn't exist | "This link isn't valid." | 404 |
| Token expired | "This link has expired — ask the MSME owner to send a new one." | 404 |
| Already used | "This agreement was already confirmed on \<date\>." | 404 |
| Wrong code | Inline error, retry allowed, shows attempts remaining | 400 |
| 5th wrong attempt | Token burned; same as "expired" from then on | 400 then 404 |
| Chain call fails after code accepted | "Something went wrong anchoring this — the MSME owner has been notified" (token stays unused so a retry is possible) — mirrors today's existing anchor error handling in `contracts.js` | 500 |

## Testing

- Unit tests for `confirmationTokens.js`: creation, correct-code success,
  wrong-code with attempt counting, expiry, already-used, 5-attempts
  burn. Pure logic, no chain/network — the one part of this feature that
  gets real automated coverage, unlike the rest of the current codebase.
- Manual end-to-end click-through: generate a contract, click "Get
  confirmation link," open the link in an incognito/no-session context
  (simulating the counterparty having no account), accept with the wrong
  code once, then the right code, confirm the Dashboard shows `executed`
  with tier `REMOTE_OTP_VERIFIED` and a non-zero `evidenceHash`.

## Out of scope (explicit)

- No decline/negotiate flow — accept-only.
- No real messaging provider (SMS/WhatsApp Business API) — that's the
  "platform sends it directly" variant, deliberately deferred.
- No Solidity contract changes.
- No fix to the pre-existing gaps flagged earlier (in-memory-only
  persistence, no real document storage behind `metadataURI`,
  `FULL_PLATFORM`/`IN_PERSON_WITNESSED` still unreachable) — this feature
  only completes the `REMOTE_OTP_VERIFIED` path.
