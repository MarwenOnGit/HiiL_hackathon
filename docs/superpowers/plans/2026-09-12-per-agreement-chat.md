# Per-Agreement Chat Thread Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every executed agreement its own small, two-party discussion thread, reachable by the counterparty through the confirmation token they already have and by the owner from the Dashboard.

**Architecture:** Purely off-chain, layered on top of an already-`executed` on-chain agreement — no Solidity changes, no chain calls anywhere in this feature. Messages live in a new in-memory `threads` Map in `db.js`, keyed by `contract_id`, exactly like every other store in that file. Access control is a small pure-logic module (`threadAuth.js`) so it can be unit-tested without Express: the owner is trusted by URL possession (the prototype has no auth at all), while the counterparty must present the confirmation token that was actually used to confirm *this* contract. Both parties load the same standalone `thread.html` page, which polls for new messages on an interval.

**Tech Stack:** Node 18+ / Express 4 (CommonJS), `node:test` for unit tests, vanilla ES2020 browser JS with no build step and no framework.

**Spec:** `docs/superpowers/specs/2026-09-12-per-agreement-chat-design.md`
(Read also: `docs/superpowers/specs/2026-09-12-msme-platform-extension-overview.md`, Part 1 and Part 2.)

## Global Constraints

- **No Solidity changes.** This feature never touches `contracts/`. It performs zero chain calls — not `createAgreement`, not `sign`, not `verify`.
- **The chain stores fingerprints, never content.** Messages are off-chain only. Do not add a message hash, a transcript anchor, or any new on-chain field.
- **A thread exists only for an executed agreement.** Gate every thread route on `db.getOnchainRecord(contractId)` existing *and* having `executed === true`. There is no inbox, no cross-agreement thread, no thread for a contract that was never confirmed.
- **No authentication is introduced.** The owner side inherits the existing "anyone with the URL" trust model used by every other route in this prototype. Do not add login, sessions, cookies, or API keys.
- **Persistence stays in-memory.** Use the same plain `Map` + plain-function style as the rest of `db.js`. Everything is wiped on process restart; that is a known, accepted limitation, not a bug to fix here.
- **Exact error strings, copied verbatim:**
  - No executed agreement: HTTP 404, `{ "error": "no active agreement for this contract" }`
  - Counterparty token missing/invalid/mismatched: HTTP 403, `{ "error": "not authorized to post to this thread" }`
  - Empty or over-length body: HTTP 400, `{ "error": "message body invalid" }`
  - Unrecognized sender: HTTP 400, `{ "error": "sender must be owner or counterparty" }`
- **Message shape, exactly:** `{ sender: "owner" | "counterparty", body: string, sent_at: string }` where `sent_at` is ISO 8601 (`new Date().toISOString()`).
- **Max body length is 4000 characters.**
- **No new runtime dependencies.** `backend/package.json` dependencies must not change.
- **Reuse the existing visual system.** Use the existing CSS custom properties (`--surface`, `--border`, `--ink`, `--ink-muted`, `--accent`, `--radius-sm`, etc.) and existing classes (`.app`, `.topbar`, `.panel`, `.card`, `.lede`, `.primary-btn`, `.confirm-error`, `.status-pill`). No new colour values, no new font families, no CSS framework.
- **Escape all user-supplied text before inserting it into the DOM.** Message bodies are attacker-controlled in a way contract text is not.
- **Out of scope — do not build:** push/email/SMS notification, file or image attachments, message editing or deletion, a cross-agreement inbox, owner authentication.

## Resolved spec gaps

Two items the spec did not settle, decided with the human partner before planning:

- **A1 — how the counterparty's thread URL gets its `contract_id`.** `GET /api/confirm/:token` currently returns only `{ status }` for any non-pending token, so the browser cannot build `thread.html?contract_id=…`. **Decision:** keep the 404 status code, add `contract_id` to that response body (Task 4). The status-code semantics of the endpoint do not change, so `confirm.js`'s existing `if (!ok)` branch structure stays intact.
- **A2 — where the Dashboard's `since` timestamp comes from.** There is no server-side read state and Decision 3 forbids adding auth. **Decision:** the browser records a per-contract last-viewed ISO timestamp in `localStorage` under the key `insaf-thread-seen-<contract_id>` when the owner opens that thread, and passes it as `since`. The badge is therefore per-browser, which matches a prototype with no user accounts.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `backend/src/db.js` | modify | Adds the `threads` Map and its `appendMessage` / `getMessages` pair. Storage only — no rules. |
| `backend/test/db.threads.test.js` | create | Unit tests for the two new `db.js` functions. |
| `backend/src/services/threadAuth.js` | create | Pure access-control and validation rules. No Express, no chain, no I/O beyond reading `db`. |
| `backend/test/threadAuth.test.js` | create | Unit tests for every branch of the access rules. |
| `backend/src/routes/threads.js` | create | The three HTTP endpoints. Translates rules into status codes; holds no rules of its own. |
| `backend/src/index.js` | modify | Mounts the threads router at `/api/threads`. |
| `backend/src/routes/confirm.js` | modify | Gap A1: adds `contract_id` to the non-pending `GET` body and to the `POST` success body. |
| `frontend/thread.html` | create | Standalone thread page markup. Same shell as `confirm.html`. |
| `frontend/thread.js` | create | Thread page behaviour: load, render, post, poll. Used by **both** roles. |
| `frontend/styles.css` | modify | A small set of message-list classes built from existing tokens. |
| `frontend/confirm.js` | modify | A confirmed token now offers a link into the thread instead of a dead end. |
| `frontend/index.html` | modify | Dashboard gains a "Discussion" column header. |
| `frontend/app.js` | modify | Dashboard renders the per-row discussion link and unread badge. |

---

### Task 1: Thread storage in db.js

**Files:**
- Modify: `backend/src/db.js`
- Test: `backend/test/db.threads.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `db.appendMessage(contractId: string, message: object) -> object` (returns the message it was given) and `db.getMessages(contractId: string) -> Array<object>` (returns `[]` for an unknown contract, never `null` or `undefined`). Both are exported from `backend/src/db.js`'s `module.exports`.

- [ ] **Step 1: Write the failing test**

Create `backend/test/db.threads.test.js`:

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const { appendMessage, getMessages } = require("../src/db");

test("getMessages returns an empty array for a contract with no thread", () => {
  assert.deepEqual(getMessages("contract_none"), []);
});

test("appendMessage stores a message and returns it", () => {
  const msg = { sender: "owner", body: "Hello", sent_at: "2026-09-12T10:00:00.000Z" };
  const returned = appendMessage("contract_m1", msg);
  assert.deepEqual(returned, msg);
  assert.deepEqual(getMessages("contract_m1"), [msg]);
});

test("appendMessage preserves order across multiple messages", () => {
  appendMessage("contract_m2", { sender: "owner", body: "first", sent_at: "2026-09-12T10:00:00.000Z" });
  appendMessage("contract_m2", { sender: "counterparty", body: "second", sent_at: "2026-09-12T10:01:00.000Z" });
  const messages = getMessages("contract_m2");
  assert.equal(messages.length, 2);
  assert.equal(messages[0].body, "first");
  assert.equal(messages[1].body, "second");
});

test("threads are isolated per contract_id", () => {
  appendMessage("contract_m3", { sender: "owner", body: "only mine", sent_at: "2026-09-12T10:00:00.000Z" });
  assert.equal(getMessages("contract_m3").length, 1);
  assert.deepEqual(getMessages("contract_m4"), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `appendMessage is not a function` (it is not exported yet).

- [ ] **Step 3: Write minimal implementation**

In `backend/src/db.js`, add the Map beside the existing four declarations (after the `pendingConfirmations` line):

```javascript
const threads = new Map(); // keyed by contract_id → ordered array of messages
```

Add the function pair after `listConfirmations()` and before `dashboardRows()`:

```javascript
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

Add both names to `module.exports`, after `listConfirmations` and before `dashboardRows`:

```javascript
  appendMessage,
  getMessages,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS — 12 tests total (the 8 pre-existing `confirmationTokens` tests plus these 4), 0 failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db.js backend/test/db.threads.test.js
git commit -m "db: add per-agreement thread message storage"
```

---

### Task 2: Thread access-control rules

**Files:**
- Create: `backend/src/services/threadAuth.js`
- Test: `backend/test/threadAuth.test.js`

**Interfaces:**
- Consumes: `db.getConfirmation(token)` and `confirmationTokens.getStatus(token)` (both already exist on the merged `main`; `getStatus` returns the string `"already_confirmed"` once a token has been marked used).
- Produces: `threadAuth.canPost(sender, contractId, token) -> boolean`, `threadAuth.isValidSender(sender) -> boolean`, `threadAuth.isValidBody(body) -> boolean`, and the constant `threadAuth.MAX_BODY_LENGTH === 4000`.

- [ ] **Step 1: Write the failing test**

Create `backend/test/threadAuth.test.js`:

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const { canPost, isValidSender, isValidBody, MAX_BODY_LENGTH } = require("../src/services/threadAuth");
const { createConfirmation, checkCode, markUsed } = require("../src/services/confirmationTokens");

// Drives a confirmation all the way to "used", which is what turns the
// token into the counterparty's durable key for that contract's thread.
function confirmedTokenFor(contractId) {
  const { token, otp_code } = createConfirmation(contractId);
  checkCode(token, otp_code);
  markUsed(token);
  return token;
}

test("owner can always post, with no token", () => {
  assert.equal(canPost("owner", "contract_a1", undefined), true);
});

test("counterparty can post with a used token matching the contract", () => {
  const token = confirmedTokenFor("contract_a2");
  assert.equal(canPost("counterparty", "contract_a2", token), true);
});

test("counterparty cannot post with a token confirmed for a different contract", () => {
  const token = confirmedTokenFor("contract_a3");
  assert.equal(canPost("counterparty", "contract_other", token), false);
});

test("counterparty cannot post with a still-pending (unused) token", () => {
  const { token } = createConfirmation("contract_a4");
  assert.equal(canPost("counterparty", "contract_a4", token), false);
});

test("counterparty cannot post without a token", () => {
  assert.equal(canPost("counterparty", "contract_a5", undefined), false);
});

test("counterparty cannot post with an unknown token", () => {
  assert.equal(canPost("counterparty", "contract_a6", "not-a-real-token"), false);
});

test("an unrecognized sender can never post", () => {
  const token = confirmedTokenFor("contract_a7");
  assert.equal(canPost("admin", "contract_a7", token), false);
});

test("isValidSender accepts only owner and counterparty", () => {
  assert.equal(isValidSender("owner"), true);
  assert.equal(isValidSender("counterparty"), true);
  assert.equal(isValidSender("admin"), false);
  assert.equal(isValidSender(undefined), false);
});

test("isValidBody rejects empty, whitespace-only, non-string and over-length bodies", () => {
  assert.equal(isValidBody("hello"), true);
  assert.equal(isValidBody(""), false);
  assert.equal(isValidBody("   "), false);
  assert.equal(isValidBody(undefined), false);
  assert.equal(isValidBody(123), false);
  assert.equal(isValidBody("x".repeat(MAX_BODY_LENGTH)), true);
  assert.equal(isValidBody("x".repeat(MAX_BODY_LENGTH + 1)), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module '../src/services/threadAuth'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/services/threadAuth.js`:

```javascript
// Access-control and validation rules for per-agreement discussion threads.
// See docs/superpowers/specs/2026-09-12-per-agreement-chat-design.md,
// Decisions 2 and 3. Pure logic — no Express, no chain — so every branch
// below is unit-testable directly.

const db = require("../db");
const confirmationTokens = require("./confirmationTokens");

const MAX_BODY_LENGTH = 4000;

// The owner is not authenticated anywhere in this prototype (Decision 3):
// anyone who can reach the Dashboard can post as the owner, exactly like
// every other route today. The counterparty must present the confirmation
// token that actually confirmed THIS contract (Decision 2) — a token that
// is still pending, or that belongs to a different contract, is not a key
// to this thread.
function canPost(sender, contractId, token) {
  if (sender === "owner") return true;
  if (sender !== "counterparty") return false;
  if (!token) return false;
  if (confirmationTokens.getStatus(token) !== "already_confirmed") return false;
  const record = db.getConfirmation(token);
  return Boolean(record) && record.contract_id === contractId;
}

function isValidSender(sender) {
  return sender === "owner" || sender === "counterparty";
}

function isValidBody(body) {
  if (typeof body !== "string") return false;
  if (body.trim().length === 0) return false;
  return body.length <= MAX_BODY_LENGTH;
}

module.exports = { canPost, isValidSender, isValidBody, MAX_BODY_LENGTH };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS — 21 tests total, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/threadAuth.js backend/test/threadAuth.test.js
git commit -m "backend: add thread access-control rules"
```

---

### Task 3: Thread HTTP routes

**Files:**
- Create: `backend/src/routes/threads.js`
- Modify: `backend/src/index.js`

**Interfaces:**
- Consumes: `db.getOnchainRecord`, `db.getMessages`, `db.appendMessage` (Task 1); `threadAuth.canPost`, `threadAuth.isValidSender`, `threadAuth.isValidBody` (Task 2).
- Produces: three endpoints mounted at `/api/threads` —
  - `GET /api/threads/:contractId/messages` → `200 { messages: [...] }`
  - `POST /api/threads/:contractId/messages` → `201 { message: {...} }`
  - `GET /api/threads/:contractId/unread-count?since=<ISO>` → `200 { count: number }`

- [ ] **Step 1: Write the implementation**

There is no HTTP-level test harness anywhere in this backend (the only automated tests are pure-logic unit tests), and this plan does not introduce one — the rules these routes enforce are already covered by Task 2's tests, and the routes themselves are verified by the curl checks in Step 2 plus the end-to-end walkthrough in Task 6.

Create `backend/src/routes/threads.js`:

```javascript
// Per-agreement discussion threads. See
// docs/superpowers/specs/2026-09-12-per-agreement-chat-design.md.
// A thread exists only for an agreement that is already executed on-chain —
// there is no inbox and no cross-agreement thread (Decision 1). Nothing in
// this file touches the chain: messages are off-chain content, exactly like
// the contract text itself.

const express = require("express");
const db = require("../db");
const threadAuth = require("../services/threadAuth");

const router = express.Router();

// Every thread route is gated on the agreement actually being executed.
function requireExecutedAgreement(req, res, next) {
  const record = db.getOnchainRecord(req.params.contractId);
  if (!record || !record.executed) {
    return res.status(404).json({ error: "no active agreement for this contract" });
  }
  next();
}

router.get("/:contractId/messages", requireExecutedAgreement, (req, res) => {
  res.json({ messages: db.getMessages(req.params.contractId) });
});

router.post("/:contractId/messages", requireExecutedAgreement, (req, res) => {
  const contractId = req.params.contractId;
  const { sender, body, token } = req.body || {};

  if (!threadAuth.isValidSender(sender)) {
    return res.status(400).json({ error: "sender must be owner or counterparty" });
  }
  if (!threadAuth.isValidBody(body)) {
    return res.status(400).json({ error: "message body invalid" });
  }
  if (!threadAuth.canPost(sender, contractId, token)) {
    return res.status(403).json({ error: "not authorized to post to this thread" });
  }

  const message = { sender, body: body.trim(), sent_at: new Date().toISOString() };
  db.appendMessage(contractId, message);
  res.status(201).json({ message });
});

// Powers the Dashboard badge. `since` is supplied by the browser from
// localStorage (see the plan's resolved gap A2) — there is no server-side
// read state, because there is no authenticated owner to hang it on.
router.get("/:contractId/unread-count", requireExecutedAgreement, (req, res) => {
  const messages = db.getMessages(req.params.contractId);
  const since = req.query.since;
  if (!since) return res.json({ count: messages.length });

  const sinceMs = Date.parse(since);
  if (Number.isNaN(sinceMs)) {
    return res.status(400).json({ error: "since must be an ISO 8601 timestamp" });
  }
  const count = messages.filter((m) => Date.parse(m.sent_at) > sinceMs).length;
  res.json({ count });
});

module.exports = router;
```

In `backend/src/index.js`, add the require beside the other route requires (after the `confirmRouter` line):

```javascript
const threadsRouter = require("./routes/threads");
```

and mount it after the `/api/confirm` mount, before the static-file middleware:

```javascript
app.use("/api/threads", threadsRouter);
```

- [ ] **Step 2: Verify the routes respond correctly**

Start the server in mock chain mode and exercise the gate. Run each command and check the output matches:

```bash
cd backend && CHAIN_MODE=mock node src/index.js &
sleep 2
# Unknown contract — the executed-agreement gate must reject it
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000/api/threads/nope/messages
# Expected: 404
curl -s http://localhost:4000/api/threads/nope/messages
# Expected: {"error":"no active agreement for this contract"}
kill %1
```

Expected: `404` and the exact error string above.

- [ ] **Step 3: Run the full test suite**

Run: `cd backend && npm test`
Expected: PASS — 21 tests, 0 failures (this task adds no new tests; it must not break existing ones).

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/threads.js backend/src/index.js
git commit -m "backend: add per-agreement thread routes"
```

---

### Task 4: Expose contract_id on the confirmation endpoint (gap A1)

**Files:**
- Modify: `backend/src/routes/confirm.js`

**Interfaces:**
- Consumes: `db.getConfirmation(token)` (already exists).
- Produces: `GET /api/confirm/:token` for a non-pending token now returns `404 { status, contract_id }` where `contract_id` is the confirmation's contract or `null` for an unknown token. `POST /api/confirm/:token` on success now returns `{ onchain, insaf, contract_id }`.

**Context:** this is the resolved gap A1. Without it the counterparty's browser knows its token but not which contract the token belongs to, so it cannot build the thread URL. The 404 status code is deliberately unchanged so `frontend/confirm.js`'s existing `if (!ok)` branch structure keeps working. This file is owned by the counterparty-confirmation feature — change only what is written below.

- [ ] **Step 1: Write the implementation**

In `backend/src/routes/confirm.js`, replace the early return in the `GET` handler. Find:

```javascript
router.get("/:token", (req, res) => {
  const status = confirmationTokens.getStatus(req.params.token);
  if (status !== "pending") return res.status(404).json({ status });
```

Replace with:

```javascript
router.get("/:token", (req, res) => {
  const status = confirmationTokens.getStatus(req.params.token);
  if (status !== "pending") {
    // A confirmed token stays usable as the counterparty's durable key to
    // this one agreement's discussion thread (per-agreement-chat design,
    // Decision 2), so the caller needs to know which contract it belongs
    // to. Status code is unchanged — only the body gains a field.
    const record = db.getConfirmation(req.params.token);
    return res.status(404).json({ status, contract_id: record ? record.contract_id : null });
  }
```

In the same file's `POST` handler, find the success response:

```javascript
    res.json({ onchain: onchainRecord, insaf: insaf.onSigned("partyA", signed.executed) });
```

Replace with:

```javascript
    res.json({
      onchain: onchainRecord,
      insaf: insaf.onSigned("partyA", signed.executed),
      contract_id: contract.contract_id
    });
```

- [ ] **Step 2: Verify the GET change**

```bash
cd backend && CHAIN_MODE=mock node src/index.js &
sleep 2
curl -s http://localhost:4000/api/confirm/not-a-real-token
# Expected: {"status":"invalid","contract_id":null}
kill %1
```

Expected: exactly that JSON — `contract_id` present and `null`, status code still 404.

- [ ] **Step 3: Run the full test suite**

Run: `cd backend && npm test`
Expected: PASS — 21 tests, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/confirm.js
git commit -m "backend: return contract_id from the confirmation endpoint"
```

---

### Task 5: The standalone thread page

**Files:**
- Create: `frontend/thread.html`
- Create: `frontend/thread.js`
- Modify: `frontend/styles.css`

**Interfaces:**
- Consumes: `GET /api/threads/:contractId/messages` and `POST /api/threads/:contractId/messages` (Task 3).
- Produces: a page at `thread.html` accepting the query parameters `contract_id` (required), `role` (`owner` | `counterparty`, defaults to `owner`), and `token` (required only when `role=counterparty`). When `role=owner`, it writes the current ISO timestamp to `localStorage` under `insaf-thread-seen-<contract_id>` on every successful load — this is what Task 6's badge reads.

- [ ] **Step 1: Add the message-list styles**

Append to `frontend/styles.css`, after the `.dash-error td` rule and before the `.skeleton-bar` block:

```css
.message-list { display: flex; flex-direction: column; gap: 12px; max-height: 420px; overflow-y: auto; }
.message { border-left: 2px solid var(--border); padding: 2px 0 2px 11px; }
.message-mine { border-left-color: var(--accent); }
.message-meta { font: 500 11px 'IBM Plex Mono', monospace; color: var(--ink-muted); margin-bottom: 3px; }
.message-body { font-size: 13.5px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.thread-empty { color: var(--ink-muted); font-size: 13.5px; text-align: center; padding: 18px 0; margin: 0; }
.message-input {
  width: 100%;
  box-sizing: border-box;
  font: 400 13.5px 'IBM Plex Sans', system-ui, sans-serif;
  color: var(--ink);
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  resize: vertical;
  margin-bottom: 10px;
}
.message-input:focus { outline: none; border-color: var(--accent); }
.thread-badge {
  display: inline-block;
  margin-left: 6px;
  font: 600 10.5px 'IBM Plex Mono', monospace;
  background: var(--accent);
  color: white;
  border-radius: 999px;
  padding: 1px 6px;
}
.thread-link { color: var(--accent); text-decoration: none; font-size: 12.5px; }
.thread-link:hover { text-decoration: underline; }
/* .primary-btn sets no display, so an <a> carrying it would stay inline and
   render its padding wrong. Task 6 uses exactly that for "Open the discussion". */
a.primary-btn { display: inline-block; text-decoration: none; }
```

- [ ] **Step 2: Create the page markup**

Create `frontend/thread.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agreement discussion — Insaf</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<link rel="stylesheet" href="styles.css">
<script>
  (function () {
    var saved = localStorage.getItem("insaf-theme");
    document.documentElement.dataset.theme = saved === "dark" ? "dark" : "light";
  })();
</script>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <div class="brand-text">
          <strong>Insaf</strong>
          <span>agreement discussion</span>
        </div>
      </div>
    </header>
    <main class="content">
      <section class="panel" id="thread-panel">
        <h1 id="thread-title">Loading…</h1>
        <p class="lede" id="thread-lede"></p>
        <div class="card" id="thread-card" hidden>
          <div class="message-list" id="message-list"></div>
        </div>
        <div class="card" id="compose-card" hidden>
          <textarea id="message-input" class="message-input" rows="3" maxlength="4000" placeholder="Write a message about this agreement…"></textarea>
          <button class="primary-btn" id="send-btn">Send</button>
          <p class="confirm-error" id="thread-error"></p>
        </div>
      </section>
    </main>
  </div>
  <script src="thread.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create the page behaviour**

Create `frontend/thread.js`:

```javascript
// Standalone per-agreement discussion thread, used by BOTH parties. See
// ../docs/superpowers/specs/2026-09-12-per-agreement-chat-design.md.
// The owner arrives from the Dashboard (role=owner, no token); the
// counterparty arrives from their confirmation link (role=counterparty,
// token=<the token that confirmed this agreement>). No dependency on
// app.js — same standalone pattern as confirm.js.

const API = "/api";
const params = new URLSearchParams(window.location.search);
const contractId = params.get("contract_id");
const role = params.get("role") === "counterparty" ? "counterparty" : "owner";
const token = params.get("token");
const POLL_INTERVAL_MS = 4000;

let pollTimer = null;
let lastRenderedCount = -1;

function el(id) {
  return document.getElementById(id);
}

async function callApi(path, options) {
  let res;
  try {
    res = await fetch(API + path, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
  } catch (err) {
    return { ok: false, networkError: true, body: {} };
  }
  const body = await res.json();
  return { ok: res.ok, networkError: false, body };
}

// Message bodies are typed by the other party — never interpolate them raw.
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function formatTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

// The owner's badge on the Dashboard is driven entirely from the browser
// (there is no server-side read state), so opening the thread is what
// marks it seen.
function markSeen() {
  if (role !== "owner") return;
  try {
    localStorage.setItem(`insaf-thread-seen-${contractId}`, new Date().toISOString());
  } catch (err) {
    /* private mode or blocked storage — the badge just stays visible */
  }
}

function renderUnavailable(message) {
  el("thread-title").textContent = "No discussion available";
  el("thread-lede").textContent = message;
  el("thread-card").hidden = true;
  el("compose-card").hidden = true;
}

function renderMessages(messages) {
  if (messages.length === lastRenderedCount) return;
  lastRenderedCount = messages.length;
  const list = el("message-list");
  if (!messages.length) {
    list.innerHTML = `<p class="thread-empty">No messages yet — say something about this agreement.</p>`;
    return;
  }
  list.innerHTML = messages
    .map((m) => {
      const mine = m.sender === role;
      const who = m.sender === "owner" ? "MSME owner" : "Counterparty";
      return `<div class="message ${mine ? "message-mine" : ""}">
        <div class="message-meta">${escapeHtml(who)} · ${escapeHtml(formatTime(m.sent_at))}</div>
        <div class="message-body">${escapeHtml(m.body)}</div>
      </div>`;
    })
    .join("");
  list.scrollTop = list.scrollHeight;
}

async function loadMessages() {
  const { ok, body, networkError } = await callApi(`/threads/${encodeURIComponent(contractId)}/messages`);
  if (!ok) {
    // A transient network blip must not wipe a thread the user is reading.
    if (networkError) return;
    stopPolling();
    return renderUnavailable(body.error || "This agreement doesn't have an active discussion.");
  }
  el("thread-title").textContent = "Agreement discussion";
  el("thread-lede").textContent = `Messages about contract ${contractId}. Both sides see the same thread.`;
  el("thread-card").hidden = false;
  el("compose-card").hidden = false;
  renderMessages(body.messages);
  markSeen();
}

async function onSend() {
  const input = el("message-input");
  const errorEl = el("thread-error");
  const button = el("send-btn");
  const text = input.value.trim();
  errorEl.textContent = "";
  if (!text) return;
  button.disabled = true;

  const payload = { sender: role, body: text };
  if (role === "counterparty") payload.token = token;

  const { ok, body, networkError } = await callApi(`/threads/${encodeURIComponent(contractId)}/messages`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  button.disabled = false;
  if (ok) {
    input.value = "";
    await loadMessages();
    return;
  }
  errorEl.textContent = networkError
    ? "Couldn't reach the server — please try again."
    : body.error || "Couldn't send that message.";
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(loadMessages, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function init() {
  if (!contractId) return renderUnavailable("No agreement was specified.");
  el("send-btn").addEventListener("click", onSend);
  await loadMessages();
  startPolling();
  // Don't keep polling a tab nobody is looking at.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopPolling();
    } else {
      loadMessages();
      startPolling();
    }
  });
}

init();
```

- [ ] **Step 4: Verify the page loads and gates correctly**

```bash
cd backend && CHAIN_MODE=mock node src/index.js &
sleep 2
curl -s -o /dev/null -w 'thread.html %{http_code}\n' http://localhost:4000/thread.html
curl -s -o /dev/null -w 'thread.js %{http_code}\n' http://localhost:4000/thread.js
kill %1
```

Expected: `thread.html 200` and `thread.js 200`.

Then open `http://localhost:4000/thread.html?contract_id=nope&role=owner` in a browser.
Expected: the "No discussion available" heading with the message `no active agreement for this contract`, no compose box, and no console errors.

- [ ] **Step 5: Run the full test suite**

Run: `cd backend && npm test`
Expected: PASS — 21 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add frontend/thread.html frontend/thread.js frontend/styles.css
git commit -m "frontend: add standalone per-agreement thread page"
```

---

### Task 6: Wire both entry points into the thread

**Files:**
- Modify: `frontend/confirm.js`
- Modify: `frontend/index.html`
- Modify: `frontend/app.js`

**Interfaces:**
- Consumes: `contract_id` from `GET`/`POST /api/confirm/:token` (Task 4); `GET /api/threads/:contractId/unread-count?since=<ISO>` (Task 3); the `insaf-thread-seen-<contract_id>` localStorage key written by `thread.js` (Task 5).
- Produces: no new interfaces — this is the last task.

- [ ] **Step 1: Give a confirmed token a way into its thread**

In `frontend/confirm.js`, replace the whole `renderAlreadyConfirmed` function:

```javascript
function renderAlreadyConfirmed() {
  el("confirm-title").textContent = "Already confirmed";
  el("confirm-lede").textContent = "This agreement was already confirmed. You can close this page.";
  el("confirm-card").hidden = true;
}
```

with a version that offers the discussion thread — Decision 2's whole point is that the token stays useful after confirmation:

```javascript
function renderAlreadyConfirmed(contractId) {
  el("confirm-title").textContent = "Already confirmed";
  const card = el("confirm-card");
  if (!contractId) {
    el("confirm-lede").textContent = "This agreement was already confirmed. You can close this page.";
    card.hidden = true;
    return;
  }
  el("confirm-lede").textContent = "This agreement is confirmed. You can still use this link to discuss it with the other party.";
  card.hidden = false;
  const href = `thread.html?contract_id=${encodeURIComponent(contractId)}&role=counterparty&token=${encodeURIComponent(token)}`;
  card.innerHTML = `<a class="primary-btn" id="open-thread-btn" href="${href}">Open the discussion</a>`;
}
```

Replace `renderSuccess` so a fresh confirmation offers the same door:

```javascript
function renderSuccess() {
  el("confirm-title").textContent = "Confirmed";
  el("confirm-lede").textContent = "Thanks — this agreement is now anchored and active. You can close this page.";
  el("confirm-card").hidden = true;
}
```

becomes:

```javascript
function renderSuccess(contractId) {
  el("confirm-title").textContent = "Confirmed";
  const card = el("confirm-card");
  if (!contractId) {
    el("confirm-lede").textContent = "Thanks — this agreement is now anchored and active. You can close this page.";
    card.hidden = true;
    return;
  }
  el("confirm-lede").textContent = "Thanks — this agreement is now anchored and active. You can use this same link any time to discuss it.";
  card.hidden = false;
  const href = `thread.html?contract_id=${encodeURIComponent(contractId)}&role=counterparty&token=${encodeURIComponent(token)}`;
  card.innerHTML = `<a class="primary-btn" id="open-thread-btn" href="${href}">Open the discussion</a>`;
}
```

Update the three call sites to pass the contract id through. In `onAccept`, find:

```javascript
  if (ok) {
    renderSuccess();
    return;
  }
```

replace with:

```javascript
  if (ok) {
    renderSuccess(body.contract_id);
    return;
  }
```

and in the same function find:

```javascript
  } else if (body.status === "already_confirmed") {
    renderAlreadyConfirmed();
  }
```

replace with:

```javascript
  } else if (body.status === "already_confirmed") {
    renderAlreadyConfirmed(body.contract_id);
  }
```

In `init`, find:

```javascript
    if (body.status === "already_confirmed") return renderAlreadyConfirmed();
```

replace with:

```javascript
    if (body.status === "already_confirmed") return renderAlreadyConfirmed(body.contract_id);
```

- [ ] **Step 2: Add the Dashboard column header**

In `frontend/index.html`, find the dashboard table header row:

```html
            <tr><th>Contract</th><th>MSME owner</th><th>Counterparty</th><th>Tier</th><th>Status</th></tr>
```

replace with:

```html
            <tr><th>Contract</th><th>MSME owner</th><th>Counterparty</th><th>Tier</th><th>Status</th><th>Discussion</th></tr>
```

- [ ] **Step 3: Render the discussion link and badge**

In `frontend/app.js`, add these two helpers immediately above `async function loadDashboard() {`:

```javascript
// The badge is driven entirely from this browser: thread.js stamps a
// last-seen time when the owner opens a thread, and we ask the server how
// many messages arrived after it. No server-side read state exists,
// because there is no authenticated owner to attach it to.
function threadLastSeen(contractId) {
  try {
    return localStorage.getItem(`insaf-thread-seen-${contractId}`);
  } catch (e) {
    return null;
  }
}

async function fetchUnreadCount(contractId) {
  const since = threadLastSeen(contractId);
  const qs = since ? `?since=${encodeURIComponent(since)}` : "";
  try {
    const { count } = await api(`/threads/${encodeURIComponent(contractId)}/unread-count${qs}`);
    return count;
  } catch (e) {
    return 0;
  }
}
```

In `loadDashboard`, the three `colspan="5"` occurrences must become `colspan="6"` now that the table has six columns. Find and update each:

```javascript
    .map(() => `<tr><td colspan="5"><div class="skeleton-bar"></div></td></tr>`)
```
becomes
```javascript
    .map(() => `<tr><td colspan="6"><div class="skeleton-bar"></div></td></tr>`)
```

```javascript
      tbody.innerHTML = `<tr class="dash-empty"><td colspan="5">Nothing anchored yet — walk through steps 1-4 first.</td></tr>`;
```
becomes
```javascript
      tbody.innerHTML = `<tr class="dash-empty"><td colspan="6">Nothing anchored yet — walk through steps 1-4 first.</td></tr>`;
```

```javascript
    tbody.innerHTML = `<tr class="dash-error"><td colspan="5">Couldn't load the dashboard.</td></tr>`;
```
becomes
```javascript
    tbody.innerHTML = `<tr class="dash-error"><td colspan="6">Couldn't load the dashboard.</td></tr>`;
```

In the same function, the row template gains a sixth cell. Find:

```javascript
        return `<tr>
          <td>${r.contract_id}</td>
          <td>${r.msme_owner || "—"}</td>
          <td>${r.counterparty || "—"}</td>
          <td>${r.consent_tier}</td>
          <td><span class="status-pill ${statusClass}">${statusText}</span></td>
        </tr>`;
```

replace with:

```javascript
        const discussion = executed
          ? `<a class="thread-link" href="thread.html?contract_id=${encodeURIComponent(r.contract_id)}&role=owner">Open discussion</a><span class="thread-badge" id="badge-${r.contract_id}" hidden></span>`
          : "—";
        return `<tr>
          <td>${r.contract_id}</td>
          <td>${r.msme_owner || "—"}</td>
          <td>${r.counterparty || "—"}</td>
          <td>${r.consent_tier}</td>
          <td><span class="status-pill ${statusClass}">${statusText}</span></td>
          <td>${discussion}</td>
        </tr>`;
```

Finally, fill the badges after the table is rendered. Immediately after the `.join("");` that assigns `tbody.innerHTML` in the success path, add:

```javascript
    // Badges load after the table so a slow thread lookup never delays it.
    for (const r of rows) {
      if (!(r.onchain && r.onchain.executed)) continue;
      fetchUnreadCount(r.contract_id).then((count) => {
        const badge = document.getElementById(`badge-${r.contract_id}`);
        if (!badge || !count) return;
        badge.textContent = count;
        badge.hidden = false;
      });
    }
```

- [ ] **Step 4: Run the full test suite**

Run: `cd backend && npm test`
Expected: PASS — 21 tests, 0 failures.

- [ ] **Step 5: Manual end-to-end walkthrough**

Start the server in mock chain mode:

```bash
cd backend && CHAIN_MODE=mock node src/index.js
```

Then, in a browser at `http://localhost:4000`:

1. Step 1 → "Upload WhatsApp export" → Step 2 → Step 3 "Generate contract" → Step 4 "Get a confirmation link". Copy the link and the 6-digit code.
2. Open the confirmation link in a second browser context (a private window). Enter the code, accept.
   Expected: the "Confirmed" screen now shows an **"Open the discussion"** button.
3. Click it.
   Expected: the thread page loads, empty, with a compose box.
4. Post a message as the counterparty.
   Expected: it appears, labelled "Counterparty".
5. Back in the first window, go to Step 5 (Dashboard).
   Expected: the row shows "Open discussion" with a **badge showing 1**.
6. Click "Open discussion".
   Expected: the thread page shows the counterparty's message, labelled "Counterparty".
7. Post a reply as the owner, and watch the counterparty's still-open tab.
   Expected: the reply appears there within ~4 seconds, without a reload.
8. Reload the Dashboard.
   Expected: the badge is gone (opening the thread stamped it seen).
9. Re-open the counterparty's confirmation link from scratch.
   Expected: "Already confirmed" plus the "Open the discussion" button — not a dead end.

Record the result of each numbered step in the report.

- [ ] **Step 6: Commit**

```bash
git add frontend/confirm.js frontend/index.html frontend/app.js
git commit -m "frontend: reach the thread from the dashboard and confirmation link"
```
