# Per-agreement chat thread — design

**Status:** scoped, ready for an implementation plan
**Sub-project A of:** `2026-09-12-msme-platform-extension-overview.md` — read that file first.
**Owns:** backend + frontend (no Solidity changes)
**Depends on:** the `counterparty-confirmation` branch merged (reuses its token/link machinery)

## Problem

Once an agreement is anchored, the MSME owner and the counterparty have no
shared, in-app place to talk about it. Today, everything after acceptance
happens back on WhatsApp/email, invisible to the platform — so there is
no evidence trail for a later dispute, no way for the owner to be told
"the counterparty replied," and no natural home for a future amendment
proposal (Sub-project B) or a dispute report (Sub-project D) to reference.

Building a general chat platform to solve this was rejected (see the
overview, Part 2, reason 1) — it asks both parties to migrate their whole
communication habit. The fix that doesn't ask that: give **each anchored
agreement its own small discussion thread**, reachable by the counterparty
through the same no-account pattern already built for confirmation, used
only for things that are actually about that agreement.

## Decisions

1. **Scope: per-agreement, not general-purpose.** A thread exists only
   once an agreement is `executed` (i.e., has an `onchain` record with
   `executed: true` — see `db.js`'s `saveOnchainRecord`). There is no
   "inbox" concept, no thread that spans multiple agreements or the whole
   relationship. This is the single decision that keeps this from becoming
   the general chat platform that was rejected.
2. **Counterparty access: extend the confirmation link, don't invent a new one.** The token that confirmed the agreement (`confirmationTokens.js`) becomes, after use, a **durable** identifier for that counterparty's access to that one thread — not a new login, not a persistent multi-agreement account. Opening `frontend/confirm.html?token=<the same token>` after confirmation shows the thread instead of the (now-terminal) "Confirmed" screen. No new credential is issued; the existing single-use-for-anchoring token is repurposed as a long-lived-but-scoped thread key once it's `used`.
3. **Owner access:** the owner is not authenticated at all yet anywhere in this codebase (there's no login system full stop — `demoRelationship.js`'s `msme_owner.user_id` is a hardcoded string, never checked against anything). The owner's side of the thread is reached from the existing Dashboard (Step 5), which already lists every contract — add a per-row "Open discussion" link. This sub-project does **not** add authentication; it inherits the "anyone with the URL" trust model the rest of the prototype already has, consistently.
4. **Persistence:** same in-memory-`Map` pattern as everything else in `db.js` (a `threads` Map keyed by `contract_id`, each holding an ordered array of messages). This is a **known, explicit continuation** of the existing "wiped on restart" limitation — not a new regression, and not something this sub-project is scoped to fix (see the overview's Part 1.3 persistence gap; fixing that is a separate, cross-cutting concern bigger than this feature).
5. **Notification:** solving "the owner finds out a new message arrived" in full (email/SMS/push) is out of scope here — that's the notification-subsystem gap raised earlier in this project's history and deserves its own design. What this sub-project *does* provide: a `GET /api/threads/:contractId/unread-count`-style cheap check the Dashboard can call so a badge appears next time the owner loads the Dashboard, closing the "in-app, next-visit" gap (option 2 from that earlier discussion) without building the "real push" option. If/when a real notification subsystem is built, it should call the same underlying message-append point this sub-project defines rather than being bolted on separately.

## Architecture / data flow

```
Agreement reaches executed:true (via /api/confirm/:token, existing)
        │
        ▼
Both the owner (via Dashboard → "Open discussion") and the counterparty
(via re-opening their confirmation link, now showing the thread instead
of "Confirmed") land on the same per-agreement thread view
        │
        ▼
Either party posts a message: POST /api/threads/:contractId/messages
  { sender: "owner" | "counterparty", body: string }
        │
        ▼
Backend appends { sender, body, sent_at } to db's threads Map, keyed by
contract_id — no chain interaction at all; this is off-chain, exactly
like the contract text itself
        │
        ▼
Both views poll GET /api/threads/:contractId/messages (simple interval
poll, no WebSocket infrastructure — consistent with "no polling was worth
building" being reconsidered now that there's an actual persistent view
to poll from, unlike the one-shot Step 4 screen this project earlier
decided not to poll from)
```

Nothing here touches the smart contract. The thread is purely an
off-chain feature layered on top of an `executed` agreement — a
deliberate mirror of how the contract text itself already works (real
content lives off-chain; the chain only anchors fingerprints of the things
that matter to prove weren't altered — see Sub-project B for how an
amendment proposal *born* in this thread eventually gets its own anchor).

## Components

### `backend/src/db.js` (modified)
Add a fifth/sixth Map (whichever number it is once merged with
`counterparty-confirmation`'s own `pendingConfirmations` addition):
```javascript
const threads = new Map(); // keyed by contract_id → array of messages

function appendMessage(contractId, message) {
  const existing = threads.get(contractId) || [];
  existing.push(message);
  threads.set(contractId, existing);
  return message;
}

function getMessages(contractId) {
  return threads.get(contractId) || [];
}
```
Same plain-function, no-class style as every other pair in this file.

### `backend/src/routes/threads.js` (new)
- `GET /api/threads/:contractId/messages` — returns `{ messages: [...] }`. Requires the underlying contract to have an `executed: true` onchain record (`db.getOnchainRecord`); otherwise `404 { error: "no active agreement for this contract" }` — a thread cannot exist for an agreement that was never confirmed.
- `POST /api/threads/:contractId/messages` — body `{ sender, body, token? }`. `sender` must be `"owner"` or `"counterparty"`. **Access control, given there's no real auth system:** if `sender === "counterparty"`, the request must include `token`, and it must match a `used` (i.e., previously-confirmed) confirmation record for this `contract_id` (`confirmationTokens.getStatus(token) === "already_confirmed"` **and** `db.getConfirmation(token).contract_id === contractId`) — this is the "durable key" from Decision 2. If `sender === "owner"`, no token is required (matches Decision 3's inherited trust model — anyone who can reach the Dashboard can post as the owner, same as anyone who can reach any other route today). Validates `body` is a non-empty string, reasonable max length (e.g. 4000 chars) to keep this from becoming an attachment/file system by accident.
- `GET /api/threads/:contractId/unread-count?since=<timestamp>` — returns `{ count }` of messages with `sent_at` after `since`. Powers the Dashboard badge from Decision 5.

### `frontend/thread.html` + `frontend/thread.js` (new, standalone — same pattern as `confirm.html`/`confirm.js`)
Reachable two ways:
- From the Dashboard, a new "Open discussion" link per row: `thread.html?contract_id=<id>&role=owner`.
- From a confirmed confirmation link: once `confirm.js`'s `init()` sees status `already_confirmed` for a token whose contract has an executed agreement, instead of the current terminal "Confirmed" screen, redirect/link to `thread.html?contract_id=<id>&role=counterparty&token=<token>`.

Renders the message list (sender-labeled, timestamped, simplest possible
chat UI reusing `.card`/`.field-row`-style existing classes — no new
visual system), a text input + Send button, and polls
`GET /api/threads/:contractId/messages` every few seconds while the page
is open. Posting includes `token` only when `role=counterparty`.

### `frontend/index.html`/`app.js` (modified) and `frontend/app.js`'s dashboard renderer
Add the "Open discussion" link per row (only for rows where
`onchain.executed` is true — no thread for a not-yet-confirmed
agreement), and a small unread-count badge fetched via the new endpoint
when the Dashboard step is shown.

## Data model addition

```
threads: Map<contract_id, Array<{
  sender: "owner" | "counterparty",
  body: string,
  sent_at: string   // ISO 8601
}>>
```

## Error handling

| Case | Response |
|---|---|
| `GET`/`POST` for a `contract_id` with no executed agreement | 404, `{ error: "no active agreement for this contract" }` |
| `POST` with `sender: "counterparty"` and a missing/invalid/mismatched `token` | 403, `{ error: "not authorized to post to this thread" }` |
| `POST` with an empty or over-length `body` | 400, `{ error: "message body invalid" }` |
| `POST` with an unrecognized `sender` value | 400, `{ error: "sender must be owner or counterparty" }` |

## Testing

- Unit tests for the `db.js` additions (`appendMessage`/`getMessages`), same lightweight style as the existing `confirmationTokens.test.js` — no new dependency needed, plain `node:test`.
- A focused unit test (or a small pure-logic extraction, e.g. `threadAuth.js`, if the access-control check above grows non-trivial) covering: owner can always post; counterparty can post only with a token that's `used` and matches the contract; a confirmed-elsewhere token for a *different* contract is rejected.
- Manual end-to-end: confirm an agreement (existing flow), open the thread as both parties in two separate browser contexts, exchange messages, confirm both views converge via polling, confirm the Dashboard badge appears after a message from the other side.

## Out of scope (explicit)

- No real push/email/SMS notification — this sub-project only closes the "badge on next Dashboard visit" gap, per Decision 5.
- No file/image attachments — text messages only.
- No thread deletion or editing.
- No general-purpose (cross-agreement) inbox.
- No real authentication for the owner side — inherits the existing prototype-wide trust model rather than introducing a new one just for this feature.
