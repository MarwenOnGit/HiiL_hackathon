# Counterparty Confirmation Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a counterparty with no platform account review a generated contract and cryptographically-evidenced accept it via a one-time link + code, deferring the on-chain anchor until that acceptance happens.

**Architecture:** The existing "Anchor this agreement" action no longer calls `chain.createAgreement` directly. It now creates a pending confirmation record (opaque token + 6-digit code, 7-day expiry, in-memory). A new public, unauthenticated page (`frontend/confirm.html`) lets the counterparty read the contract text and submit the code. On a correct code, the backend builds an evidence hash from the acceptance event, calls `chain.createAgreement(..., "REMOTE_OTP_VERIFIED", evidenceHash, ...)` and then `chain.sign({ signerRole: "partyA" })` in the same request — both existing `ChainService` methods, unchanged.

**Tech Stack:** Node.js/Express (existing backend), plain HTML/CSS/JS (existing frontend), Node's built-in `node:test` + `node:assert` for the one unit-tested module (no new npm dependency).

**Spec:** `docs/superpowers/specs/2026-09-12-counterparty-confirmation-design.md`

## Global Constraints

- No changes to `contracts/contracts/MSMEContractRegistry.sol` or its ABI — reuse the existing `REMOTE_OTP_VERIFIED` enum value (index 2).
- No new npm dependencies. Testing `confirmationTokens.js` uses Node's built-in `node:test`/`node:assert` (Node 18+, confirmed present: v20.20.2).
- New in-memory state lives in `db.js` alongside `relationships`/`contracts`/`agreementsOnchain`, same plain-`Map` pattern — no new persistence layer.
- Link lifecycle: exactly 7-day expiry (`7 * 24 * 60 * 60 * 1000` ms), single use, burned (treated as already-confirmed) after 5 wrong-code attempts.
- The OTP is relayed by the owner, not sent by the platform — no messaging provider, no SMS/email integration. Copy must say this honestly (e.g. "send this to your counterparty yourself"), matching the existing `insaf.js` voice (calm, plain-language, no overclaiming — see the "not a cryptographic signature" framing from the design doc).
- A chain-call failure after a correct code must **not** burn the token or count as a wrong attempt — the counterparty must be able to safely retry.
- Follow existing code style exactly: CommonJS (`require`/`module.exports`), no semicolon-free style, routes throw/catch the same way `contracts.js` already does, frontend has zero build step and zero new script tags beyond plain `<script src="...">`.

---

### Task 1: `db.js` — pending-confirmation storage + dashboard tier fix

**Files:**
- Modify: `backend/src/db.js`

**Interfaces:**
- Produces: `db.saveConfirmation(token, record)` → returns `record`. `db.getConfirmation(token)` → returns the stored record or `null`.
- Consumes: nothing new.

**Context:** `db.js` currently holds three `Map`s (`relationships`, `contracts`, `agreementsOnchain`) with a `save*`/`get*` pair each, plus `dashboardRows()`. Add a fourth `Map` the same way. Separately, `dashboardRows()` currently reports `consent_tier: c.consent_tier_recommended` (the contract's original recommendation) — once Task 4 lands, the tier actually anchored on-chain can differ from that recommendation (every confirmation-link agreement anchors as `REMOTE_OTP_VERIFIED` regardless of what was recommended at generation time), so the dashboard would show a stale/wrong tier. Fix it to prefer the real on-chain tier when one exists.

- [ ] **Step 1: Add the `pendingConfirmations` map and its accessors**

In `backend/src/db.js`, change:

```javascript
const relationships = new Map();
const contracts = new Map();
const agreementsOnchain = new Map(); // keyed by contract_id
```

to:

```javascript
const relationships = new Map();
const contracts = new Map();
const agreementsOnchain = new Map(); // keyed by contract_id
const pendingConfirmations = new Map(); // keyed by confirmation token
```

Then, right after the `getOnchainRecord` function (currently lines 37-39), add:

```javascript
function saveConfirmation(token, record) {
  pendingConfirmations.set(token, record);
  return record;
}

function getConfirmation(token) {
  return pendingConfirmations.get(token) || null;
}
```

- [ ] **Step 2: Fix `dashboardRows()` to prefer the actual on-chain tier**

Change:

```javascript
      consent_tier: c.consent_tier_recommended,
```

to:

```javascript
      consent_tier: onchain ? onchain.consent_tier : c.consent_tier_recommended,
```

(`onchain` is already in scope — it's computed one line above via `getOnchainRecord(c.contract_id)`.)

- [ ] **Step 3: Export the two new functions**

Change the `module.exports` block from:

```javascript
module.exports = {
  saveRelationship,
  getRelationship,
  saveContract,
  getContract,
  listContracts,
  saveOnchainRecord,
  getOnchainRecord,
  dashboardRows
};
```

to:

```javascript
module.exports = {
  saveRelationship,
  getRelationship,
  saveContract,
  getContract,
  listContracts,
  saveOnchainRecord,
  getOnchainRecord,
  saveConfirmation,
  getConfirmation,
  dashboardRows
};
```

- [ ] **Step 4: Manual sanity check**

Run:

```bash
cd backend && node -e "
const db = require('./src/db');
const rec = db.saveConfirmation('tok123', { contract_id: 'c1', used: false });
console.log(db.getConfirmation('tok123'));
console.log(db.getConfirmation('missing'));
"
```

Expected output:
```
{ contract_id: 'c1', used: false }
null
```

- [ ] **Step 5: Commit**

```bash
cd /home/dexter/hackathon
git add backend/src/db.js
git commit -m "db: add pending-confirmation storage, fix dashboard tier to use on-chain value

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ovLUCpMjopQkQkQZUZHJS"
```

---

### Task 2: `confirmationTokens.js` — token/OTP logic, TDD with `node:test`

**Files:**
- Create: `backend/src/services/confirmationTokens.js`
- Create: `backend/test/confirmationTokens.test.js`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `db.saveConfirmation(token, record)`, `db.getConfirmation(token)` (Task 1).
- Produces:
  - `createConfirmation(contractId, opts?)` → `{ token: string, otp_code: string, expires_at: number }`. `opts.ttlMs` (default 7 days) overrides the expiry window — exists purely so tests can create an already-expired record.
  - `getStatus(token)` → `"pending" | "expired" | "already_confirmed" | "invalid"`.
  - `checkCode(token, submittedCode)` → returns the stored record on a correct code (does **not** mark it used). Throws `ConfirmationError` with `.code` set to `"invalid" | "expired" | "already_confirmed" | "wrong_code"` otherwise; a `"wrong_code"` error also carries `.extra.attemptsRemaining`.
  - `markUsed(token)` → marks the record used; no return value.
  - `ConfirmationError` (exported class) and `MAX_ATTEMPTS` (exported constant, `5`) — Task 5's route needs both to map errors to HTTP responses.

**Context:** This is the one module the design doc calls out for real automated tests, since it's pure logic with no chain/network dependency. `backend/package.json` currently has no `test` script and no test dependency — add one using Node's built-in runner (no new npm package).

- [ ] **Step 1: Add the test script to `package.json`**

In `backend/package.json`, change:

```json
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
```

to:

```json
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "node --test test/"
  },
```

- [ ] **Step 2: Write the failing tests**

Create `backend/test/confirmationTokens.test.js`:

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createConfirmation,
  getStatus,
  checkCode,
  markUsed,
  ConfirmationError,
  MAX_ATTEMPTS
} = require("../src/services/confirmationTokens");

test("createConfirmation returns a pending token with a 6-digit code", () => {
  const { token, otp_code, expires_at } = createConfirmation("contract_t1");
  assert.equal(typeof token, "string");
  assert.match(otp_code, /^\d{6}$/);
  assert.equal(getStatus(token), "pending");
  assert.ok(expires_at > Date.now());
});

test("getStatus returns invalid for an unknown token", () => {
  assert.equal(getStatus("not-a-real-token"), "invalid");
});

test("checkCode succeeds with the correct code and does not mark it used", () => {
  const { token, otp_code } = createConfirmation("contract_t2");
  const record = checkCode(token, otp_code);
  assert.equal(record.contract_id, "contract_t2");
  assert.equal(getStatus(token), "pending"); // markUsed is a separate step
});

test("checkCode throws wrong_code on an incorrect code and reports attempts remaining", () => {
  const { token } = createConfirmation("contract_t3");
  assert.throws(
    () => checkCode(token, "000000"),
    (err) => {
      assert.ok(err instanceof ConfirmationError);
      assert.equal(err.code, "wrong_code");
      assert.equal(err.extra.attemptsRemaining, MAX_ATTEMPTS - 1);
      return true;
    }
  );
});

test("burns the token after MAX_ATTEMPTS wrong codes", () => {
  const { token, otp_code } = createConfirmation("contract_t4");
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      checkCode(token, "000000");
    } catch (_) {
      // expected on every wrong attempt
    }
  }
  assert.equal(getStatus(token), "already_confirmed");
  assert.throws(
    () => checkCode(token, otp_code),
    (err) => err.code === "already_confirmed"
  );
});

test("markUsed flips status to already_confirmed", () => {
  const { token } = createConfirmation("contract_t5");
  markUsed(token);
  assert.equal(getStatus(token), "already_confirmed");
});

test("checkCode throws already_confirmed once markUsed has run, even with the right code", () => {
  const { token, otp_code } = createConfirmation("contract_t6");
  markUsed(token);
  assert.throws(
    () => checkCode(token, otp_code),
    (err) => err.code === "already_confirmed"
  );
});

test("checkCode throws expired once the ttl has passed", () => {
  const { token } = createConfirmation("contract_t7", { ttlMs: -1000 });
  assert.equal(getStatus(token), "expired");
  assert.throws(
    () => checkCode(token, "000000"),
    (err) => err.code === "expired"
  );
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && npm test`
Expected: fails with `Cannot find module '../src/services/confirmationTokens'`.

- [ ] **Step 4: Implement `confirmationTokens.js`**

Create `backend/src/services/confirmationTokens.js`:

```javascript
// Pending-confirmation tokens for the counterparty-acceptance flow (see
// docs/superpowers/specs/2026-09-12-counterparty-confirmation-design.md).
// Pure logic, no chain/network dependency — the storage itself lives in
// db.js, same in-memory-Map pattern as everything else there.

const crypto = require("crypto");
const db = require("../db");

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ATTEMPTS = 5;

class ConfirmationError extends Error {
  constructor(code, extra) {
    super(code);
    this.code = code; // "invalid" | "expired" | "already_confirmed" | "wrong_code"
    this.extra = extra || {};
  }
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

// opts.ttlMs overrides the default 7-day window — used by tests to create
// an already-expired record without waiting a week.
function createConfirmation(contractId, opts = {}) {
  const ttlMs = opts.ttlMs === undefined ? DEFAULT_TTL_MS : opts.ttlMs;
  const token = generateToken();
  const record = {
    contract_id: contractId,
    otp_code: generateCode(),
    expires_at: Date.now() + ttlMs,
    used: false,
    attempts: 0
  };
  db.saveConfirmation(token, record);
  return { token, otp_code: record.otp_code, expires_at: record.expires_at };
}

function getStatus(token) {
  const record = db.getConfirmation(token);
  if (!record) return "invalid";
  if (record.used) return "already_confirmed";
  if (Date.now() > record.expires_at) return "expired";
  return "pending";
}

// Validates submittedCode against the stored record. On a correct code,
// returns the record WITHOUT marking it used — the caller (the /confirm
// route) only calls markUsed() once whatever it needs the code for (the
// on-chain anchor + sign calls) has actually succeeded, so a chain
// failure never burns the counterparty's token or attempt count.
function checkCode(token, submittedCode) {
  const status = getStatus(token);
  if (status !== "pending") throw new ConfirmationError(status);

  const record = db.getConfirmation(token);
  if (record.otp_code !== String(submittedCode)) {
    record.attempts += 1;
    if (record.attempts >= MAX_ATTEMPTS) {
      record.used = true; // burn the token — no more guesses
    }
    db.saveConfirmation(token, record);
    throw new ConfirmationError("wrong_code", {
      attemptsRemaining: Math.max(0, MAX_ATTEMPTS - record.attempts)
    });
  }

  return record;
}

function markUsed(token) {
  const record = db.getConfirmation(token);
  if (!record) return;
  record.used = true;
  db.saveConfirmation(token, record);
}

module.exports = {
  createConfirmation,
  getStatus,
  checkCode,
  markUsed,
  ConfirmationError,
  MAX_ATTEMPTS
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npm test`
Expected: all 7 tests pass, 0 failures.

- [ ] **Step 6: Commit**

```bash
cd /home/dexter/hackathon
git add backend/package.json backend/src/services/confirmationTokens.js backend/test/confirmationTokens.test.js
git commit -m "backend: add confirmationTokens service with unit tests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ovLUCpMjopQkQkQZUZHJS"
```

---

### Task 3: `insaf.js` — confirmation-link copy

**Files:**
- Modify: `backend/src/services/insaf.js`

**Interfaces:**
- Produces: `insaf.onConfirmationCreated()` → string. Consumed by Task 4's modified `/anchor` route.

- [ ] **Step 1: Add the new message function**

In `backend/src/services/insaf.js`, after `onAnchored` (currently lines 25-27), add:

```javascript
function onConfirmationCreated() {
  return "Link's ready. Send it — and the code — to your counterparty yourself. The moment they accept, this gets anchored and signed in one step, no extra confirmation needed from you.";
}
```

- [ ] **Step 2: Export it**

Change:

```javascript
module.exports = { onExtraction, onGenerated, onAnchoring, onAnchored, onSigned, idle };
```

to:

```javascript
module.exports = { onExtraction, onGenerated, onAnchoring, onAnchored, onConfirmationCreated, onSigned, idle };
```

- [ ] **Step 3: Manual sanity check**

Run: `cd backend && node -e "console.log(require('./src/services/insaf').onConfirmationCreated())"`
Expected: prints the new sentence with no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/dexter/hackathon
git add backend/src/services/insaf.js
git commit -m "backend: add onConfirmationCreated copy for the confirmation-link step

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ovLUCpMjopQkQkQZUZHJS"
```

---

### Task 4: `contracts.js` — `/anchor` creates a confirmation instead of anchoring directly

**Files:**
- Modify: `backend/src/routes/contracts.js`

**Interfaces:**
- Consumes: `confirmationTokens.createConfirmation(contractId)` (Task 2), `insaf.onConfirmationCreated()` (Task 3).
- Produces: `POST /api/contracts/:id/anchor` now responds `{ confirmation: { token, otp_code, expires_at, confirm_url }, insaf }` instead of `{ onchain, insaf }`. Consumed by Task 6's frontend changes.

**Context:** The current handler (lines 25-61) calls `chain.createAgreement` immediately and saves an onchain record. Replace the body of that one route only — `/:id/sign` and `/:id/status` (lines 63-100) are untouched; they remain valid routes, just no longer called from the primary UI flow (Task 6 removes the two sign buttons).

- [ ] **Step 1: Add the new require at the top of the file**

Change:

```javascript
const express = require("express");
const db = require("../db");
const { generateContract } = require("../services/contractGenerator");
const insaf = require("../services/insaf");
```

to:

```javascript
const express = require("express");
const db = require("../db");
const { generateContract } = require("../services/contractGenerator");
const insaf = require("../services/insaf");
const confirmationTokens = require("../services/confirmationTokens");
```

- [ ] **Step 2: Replace the `/anchor` handler**

Replace the entire existing handler:

```javascript
router.post("/:id/anchor", async (req, res) => {
  const contract = db.getContract(req.params.id);
  if (!contract) return res.status(404).json({ error: "contract not found" });
  if (db.getOnchainRecord(contract.contract_id)) {
    return res.status(409).json({ error: "already anchored", onchain: db.getOnchainRecord(contract.contract_id) });
  }

  const relationship = db.getRelationship(contract.relationship_id);
  const consentTier = (req.body && req.body.consent_tier) || contract.consent_tier_recommended;
  const chain = req.app.locals.chainService;

  try {
    const result = await chain.createAgreement({
      contentHash: contract.contract_text_hash,
      partyBAddress: relationship.parties.counterparty.on_chain_address || null,
      tier: consentTier,
      evidenceHash: null,
      metadataURI: `demo://contracts/${contract.contract_id}`
    });

    const record = {
      agreement_onchain_id: result.agreementId,
      tx_hash: result.txHash,
      block_number: result.blockNumber,
      consent_tier: consentTier,
      chain_mode: chain.mode,
      signed_a: false,
      signed_b: false,
      executed: false
    };
    db.saveOnchainRecord(contract.contract_id, record);
    res.json({ onchain: record, insaf: insaf.onAnchored(result) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "chain anchoring failed", detail: err.message });
  }
});
```

with:

```javascript
router.post("/:id/anchor", (req, res) => {
  const contract = db.getContract(req.params.id);
  if (!contract) return res.status(404).json({ error: "contract not found" });
  if (db.getOnchainRecord(contract.contract_id)) {
    return res.status(409).json({ error: "already anchored", onchain: db.getOnchainRecord(contract.contract_id) });
  }

  const { token, otp_code, expires_at } = confirmationTokens.createConfirmation(contract.contract_id);
  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const confirm_url = `${baseUrl}/confirm.html?token=${token}`;

  res.json({
    confirmation: { token, otp_code, expires_at, confirm_url },
    insaf: insaf.onConfirmationCreated()
  });
});
```

- [ ] **Step 3: Manual verification with the backend running**

Run `./start.sh mock` in one terminal (mock mode is enough here — this route never touches the chain), then in another:

```bash
curl -s -X POST http://localhost:4000/api/relationships/demo | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).relationship.relationship_id))"
curl -s -X POST http://localhost:4000/api/contracts/generate -H 'Content-Type: application/json' -d '{"relationship_id":"rel_demo_001"}' > /tmp/contract.json
CONTRACT_ID=$(node -e "console.log(require('/tmp/contract.json').contract.contract_id)")
curl -s -X POST "http://localhost:4000/api/contracts/${CONTRACT_ID}/anchor"
```

Expected: a JSON response shaped `{"confirmation":{"token":"...","otp_code":"123456","expires_at":...,"confirm_url":"http://localhost:4000/confirm.html?token=..."},"insaf":"Link's ready...."}` — no `onchain` field, no chain call made.

- [ ] **Step 4: Commit**

```bash
cd /home/dexter/hackathon
git add backend/src/routes/contracts.js
git commit -m "backend: /anchor now creates a confirmation link instead of anchoring immediately

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ovLUCpMjopQkQkQZUZHJS"
```

---

### Task 5: `confirm.js` route — the counterparty-facing API

**Files:**
- Create: `backend/src/routes/confirm.js`
- Modify: `backend/src/index.js`

**Interfaces:**
- Consumes: `confirmationTokens.{getStatus, checkCode, markUsed, ConfirmationError}` (Task 2), `db.{getConfirmation, getContract, getRelationship, saveOnchainRecord}` (existing + Task 1), `insaf.onSigned` (existing), `req.app.locals.chainService` (existing `ChainService`, unchanged).
- Produces: `GET /api/confirm/:token` → `{ status: "pending", contract_text }` or `{ status: "expired"|"already_confirmed"|"invalid" }`. `POST /api/confirm/:token` with `{ otp_code }` → on success `{ onchain, insaf }` (same shape the old `/anchor` used to return); on failure `{ status, attemptsRemaining? }` with 400 (`wrong_code`) or 404 (everything else). Consumed by Task 7's `confirm.js` frontend.

- [ ] **Step 1: Create the route file**

Create `backend/src/routes/confirm.js`:

```javascript
// Public, unauthenticated routes for a counterparty who has no platform
// account. See docs/superpowers/specs/2026-09-12-counterparty-confirmation-design.md.
// Never mounted behind auth — do not add anything here that assumes a
// logged-in user.

const express = require("express");
const { ethers } = require("ethers");
const db = require("../db");
const confirmationTokens = require("../services/confirmationTokens");
const insaf = require("../services/insaf");

const router = express.Router();

router.get("/:token", (req, res) => {
  const status = confirmationTokens.getStatus(req.params.token);
  if (status !== "pending") return res.status(404).json({ status });

  const record = db.getConfirmation(req.params.token);
  const contract = db.getContract(record.contract_id);
  if (!contract) return res.status(404).json({ status: "invalid" });

  res.json({ status: "pending", contract_text: contract.contract_text });
});

router.post("/:token", async (req, res) => {
  const token = req.params.token;
  const submittedCode = (req.body && req.body.otp_code) || "";

  let record;
  try {
    record = confirmationTokens.checkCode(token, submittedCode);
  } catch (err) {
    if (!(err instanceof confirmationTokens.ConfirmationError)) throw err;
    const httpStatus = err.code === "wrong_code" ? 400 : 404;
    return res.status(httpStatus).json({ status: err.code, ...err.extra });
  }

  const contract = db.getContract(record.contract_id);
  if (!contract) return res.status(404).json({ status: "invalid" });
  const relationship = db.getRelationship(contract.relationship_id);
  const chain = req.app.locals.chainService;

  const evidence = {
    token,
    contract_id: contract.contract_id,
    contract_text_hash: contract.contract_text_hash,
    accepted_at: new Date().toISOString()
  };
  const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(evidence)));

  try {
    const created = await chain.createAgreement({
      contentHash: contract.contract_text_hash,
      partyBAddress: (relationship && relationship.parties.counterparty.on_chain_address) || null,
      tier: "REMOTE_OTP_VERIFIED",
      evidenceHash,
      metadataURI: `demo://contracts/${contract.contract_id}`
    });
    const signed = await chain.sign({ agreementId: created.agreementId, signerRole: "partyA" });

    const onchainRecord = {
      agreement_onchain_id: created.agreementId,
      tx_hash: created.txHash,
      block_number: created.blockNumber,
      consent_tier: "REMOTE_OTP_VERIFIED",
      chain_mode: chain.mode,
      signed_a: true,
      signed_b: false,
      executed: signed.executed,
      last_tx_hash: signed.txHash
    };
    db.saveOnchainRecord(contract.contract_id, onchainRecord);
    confirmationTokens.markUsed(token);

    res.json({ onchain: onchainRecord, insaf: insaf.onSigned("partyA", signed.executed) });
  } catch (err) {
    // Deliberately do NOT call markUsed here — checkCode already verified
    // the code was correct, and a chain hiccup must not cost the
    // counterparty their one confirmation attempt. Retrying the same
    // request with the same correct code will work once the chain is up.
    console.error(err);
    res.status(500).json({ error: "anchoring failed after acceptance", detail: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount the router in `index.js`**

Change:

```javascript
const { createChainService } = require("./services/chainService");
const relationshipsRouter = require("./routes/relationships");
const contractsRouter = require("./routes/contracts");
const dashboardRouter = require("./routes/dashboard");
const insaf = require("./services/insaf");
```

to:

```javascript
const { createChainService } = require("./services/chainService");
const relationshipsRouter = require("./routes/relationships");
const contractsRouter = require("./routes/contracts");
const dashboardRouter = require("./routes/dashboard");
const confirmRouter = require("./routes/confirm");
const insaf = require("./services/insaf");
```

and change:

```javascript
app.use("/api/relationships", relationshipsRouter);
app.use("/api/contracts", contractsRouter);
app.use("/api/dashboard", dashboardRouter);
```

to:

```javascript
app.use("/api/relationships", relationshipsRouter);
app.use("/api/contracts", contractsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/confirm", confirmRouter);
```

- [ ] **Step 3: Manual verification with the backend running**

With `./start.sh mock` still running and `CONTRACT_ID` from Task 4's verification (re-run those `curl` commands if that terminal was closed):

```bash
curl -s -X POST "http://localhost:4000/api/contracts/${CONTRACT_ID}/anchor" > /tmp/confirmation.json
TOKEN=$(node -e "console.log(require('/tmp/confirmation.json').confirmation.token)")
CODE=$(node -e "console.log(require('/tmp/confirmation.json').confirmation.otp_code)")

echo "--- GET with wrong token ---"
curl -s http://localhost:4000/api/confirm/not-a-real-token
echo
echo "--- GET pending ---"
curl -s "http://localhost:4000/api/confirm/${TOKEN}"
echo
echo "--- POST wrong code ---"
curl -s -X POST "http://localhost:4000/api/confirm/${TOKEN}" -H 'Content-Type: application/json' -d '{"otp_code":"000000"}'
echo
echo "--- POST correct code ---"
curl -s -X POST "http://localhost:4000/api/confirm/${TOKEN}" -H 'Content-Type: application/json' -d "{\"otp_code\":\"${CODE}\"}"
echo
echo "--- POST again with the same (now used) code ---"
curl -s -X POST "http://localhost:4000/api/confirm/${TOKEN}" -H 'Content-Type: application/json' -d "{\"otp_code\":\"${CODE}\"}"
```

Expected, in order: `{"status":"invalid"}`; `{"status":"pending","contract_text":"AGREEMENT..."}`; `{"status":"wrong_code","attemptsRemaining":4}`; `{"onchain":{"agreement_onchain_id":0,...,"consent_tier":"REMOTE_OTP_VERIFIED","executed":true,...},"insaf":"Fully confirmed on both sides. This agreement is active."}`; `{"status":"already_confirmed"}`.

- [ ] **Step 4: Commit**

```bash
cd /home/dexter/hackathon
git add backend/src/routes/confirm.js backend/src/index.js
git commit -m "backend: add public /api/confirm routes for counterparty acceptance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ovLUCpMjopQkQkQZUZHJS"
```

---

### Task 6: Frontend — Step 4 shows a confirmation link instead of sign buttons

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/app.js`
- Modify: `frontend/styles.css`

**Interfaces:**
- Consumes: `POST /api/contracts/:id/anchor` now returning `{ confirmation, insaf }` (Task 4).
- Produces: no new interfaces consumed elsewhere; this is the terminal UI for the owner's side of the flow.

**Context:** Step 4 currently shows on-chain fields plus two manual "Confirm as..." buttons. Under the new flow, clicking "Anchor this agreement" (on Step 3) generates a confirmation link/code to forward — there is nothing left for the owner to manually sign, since `partyA`'s signature now happens automatically inside the `/confirm` accept flow (Task 5).

- [ ] **Step 1: Update the Step 4 heading, copy, and remove the sign-row markup**

In `frontend/index.html`, replace:

```html
      <!-- STEP 4 — Anchor & sign -->
      <section class="panel" data-panel="anchor" hidden>
        <h1>Anchor &amp; confirm</h1>
        <p class="lede">The agreement's fingerprint goes on-chain so its wording can't be quietly changed later.</p>
        <div class="card" id="anchor-card"></div>
        <div class="sign-row">
          <button class="secondary-btn" id="btn-sign-a" disabled>Confirm as MSME owner</button>
          <button class="secondary-btn" id="btn-sign-b" disabled>Confirm as counterparty (demo)</button>
        </div>
      </section>
```

with:

```html
      <!-- STEP 4 — Get a confirmation link -->
      <section class="panel" data-panel="anchor" hidden>
        <h1>Get a confirmation link</h1>
        <p class="lede">Generate a one-time link and code for your counterparty. The moment they accept it, this gets anchored and signed on-chain automatically — there's no separate confirmation step for you.</p>
        <div class="card" id="anchor-card"></div>
      </section>
```

- [ ] **Step 2: Rename the step-nav label for accuracy**

In `frontend/index.html`, change:

```html
        <button class="step" data-step="anchor"><span class="step-index">4</span>Anchor &amp; Sign</button>
```

to:

```html
        <button class="step" data-step="anchor"><span class="step-index">4</span>Confirm</button>
```

(The `data-step="anchor"`/`data-panel="anchor"` internal keys stay as-is — `app.js`'s `STEP_ORDER` and selectors reference them; only the visible label changes.)

- [ ] **Step 3: Replace the Step-3-to-Step-4 handler and rendering in `app.js`**

In `frontend/app.js`, replace:

```javascript
document.getElementById("btn-to-anchor").addEventListener("click", async () => {
  showStep("anchor");
  setInsaf("Anchoring this on-chain…", "working");
  try {
    const { onchain, insaf } = await api(`/contracts/${state.contract.contract_id}/anchor`, { method: "POST" });
    state.onchain = onchain;
    renderAnchor(onchain);
    setInsaf(insaf, "success");
    document.querySelector('.step[data-step="contract"]').classList.add("done");
    document.getElementById("btn-sign-a").disabled = false;
    document.getElementById("btn-sign-b").disabled = false;
  } catch (e) {
    setInsaf("Anchoring failed — " + e.message, "error");
  }
});

// ---------- STEP 4: anchor & sign ----------
function renderAnchor(onchain) {
  const statusClass = onchain.executed ? "status-executed" : "status-pending";
  const statusText = onchain.executed ? "executed" : "pending";
  document.getElementById("anchor-card").innerHTML = `
    <div class="field-row"><span class="field-label">Agreement ID (on-chain)</span><span class="field-value">#${onchain.agreement_onchain_id}</span></div>
    <div class="field-row"><span class="field-label">Consent tier</span><span class="field-value">${onchain.consent_tier}</span></div>
    <div class="field-row"><span class="field-label">Chain mode</span><span class="field-value">${onchain.chain_mode}</span></div>
    <div class="field-row"><span class="field-label">Tx hash</span><span class="field-value"><span class="hash-tag">${onchain.tx_hash}</span></span></div>
    <div class="field-row"><span class="field-label">Status</span><span class="field-value"><span class="status-pill ${statusClass}">${statusText}</span></span></div>
  `;
}

async function sign(role, btnId) {
  setInsaf("Recording that confirmation…", "working");
  try {
    const { onchain, insaf } = await api(`/contracts/${state.contract.contract_id}/sign`, {
      method: "POST",
      body: JSON.stringify({ role })
    });
    state.onchain = onchain;
    renderAnchor(onchain);
    setInsaf(insaf, onchain.executed ? "success" : "idle");
    document.getElementById(btnId).disabled = true;
    if (onchain.executed) {
      document.getElementById("btn-sign-a").disabled = true;
      document.getElementById("btn-sign-b").disabled = true;
    }
  } catch (e) {
    setInsaf("Couldn't record that confirmation — " + e.message, "error");
  }
}
document.getElementById("btn-sign-a").addEventListener("click", () => sign("partyA", "btn-sign-a"));
document.getElementById("btn-sign-b").addEventListener("click", () => sign("partyB", "btn-sign-b"));
```

with:

```javascript
document.getElementById("btn-to-anchor").addEventListener("click", async () => {
  showStep("anchor");
  setInsaf("Generating a confirmation link…", "working");
  try {
    const { confirmation, insaf } = await api(`/contracts/${state.contract.contract_id}/anchor`, { method: "POST" });
    state.confirmation = confirmation;
    renderConfirmation(confirmation);
    setInsaf(insaf, "success");
    document.querySelector('.step[data-step="contract"]').classList.add("done");
  } catch (e) {
    setInsaf("Couldn't generate a confirmation link — " + e.message, "error");
  }
});

// ---------- STEP 4: confirmation link ----------
function renderConfirmation(confirmation) {
  document.getElementById("anchor-card").innerHTML = `
    <div class="field-row"><span class="field-label">Confirmation link</span><span class="field-value"><span class="hash-tag">${confirmation.confirm_url}</span></span></div>
    <div class="field-row"><span class="field-label">Code</span><span class="field-value">${confirmation.otp_code}</span></div>
    <div class="field-row"><span class="field-label">Expires</span><span class="field-value">${new Date(confirmation.expires_at).toLocaleString()}</span></div>
    <h3 style="margin:16px 0 6px;font-size:13px;color:var(--ink-muted)">What happens next</h3>
    <p class="evidence-text">Send this link and code to your counterparty yourself — WhatsApp, email, whatever you already use with them. Once they open the link and accept, this agreement is anchored and signed automatically. Check the Dashboard to see it go live.</p>
  `;
}
```

- [ ] **Step 4: Remove the now-unused `.sign-row` CSS rule**

In `frontend/styles.css`, remove this line (it has no remaining markup to style, since Step 3 deleted the buttons that used it):

```css
.sign-row { display: flex; gap: 10px; flex-wrap: wrap; }
```

- [ ] **Step 5: Manual verification in the browser**

Start the backend (`./start.sh mock` is enough), open `http://localhost:4000`, click through Connect → Review → Contract → "Anchor this agreement." Expected: Step 4 now shows "Get a confirmation link" as the heading, a card with a confirm link, a 6-digit code, an expiry timestamp, and explanatory text — no "Confirm as..." buttons anywhere, no console errors.

- [ ] **Step 6: Commit**

```bash
cd /home/dexter/hackathon
git add frontend/index.html frontend/app.js frontend/styles.css
git commit -m "frontend: Step 4 shows a confirmation link instead of manual sign buttons

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ovLUCpMjopQkQkQZUZHJS"
```

---

### Task 7: Frontend — the counterparty-facing `confirm.html` page

**Files:**
- Create: `frontend/confirm.html`
- Create: `frontend/confirm.js`
- Modify: `frontend/styles.css`

**Interfaces:**
- Consumes: `GET /api/confirm/:token`, `POST /api/confirm/:token` (Task 5).
- Produces: none consumed elsewhere — this is the page a person with no account opens from the link Task 6 generates.

**Context:** This page must work standing alone, with no login and no dependency on `app.js`'s state — it's opened by someone who has never seen the rest of the app. It reuses the existing design system (`styles.css`'s `.card`, `.contract-text`, `.primary-btn`, `.field-row` classes) but needs its own small script. It's served automatically by the existing `express.static(frontendDir)` in `index.js` — no backend routing change needed for the static files themselves.

- [ ] **Step 1: Add two small CSS rules for the OTP input and inline error text**

In `frontend/styles.css`, after the `.hash-tag` block (currently lines 225-233), add:

```css
.otp-input {
  display: block;
  width: 100%;
  max-width: 220px;
  padding: 10px 12px;
  font: 600 16px 'IBM Plex Mono', monospace;
  letter-spacing: 0.15em;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--ink);
  margin: 8px 0 14px;
}
.confirm-error {
  color: var(--danger);
  font-size: 13px;
  margin-top: 10px;
  min-height: 1.2em;
}
```

- [ ] **Step 2: Create `confirm.html`**

Create `frontend/confirm.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Confirm agreement — Insaf</title>
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
          <span>confirm an agreement</span>
        </div>
      </div>
    </header>
    <main class="content">
      <section class="panel" id="confirm-panel">
        <h1 id="confirm-title">Loading…</h1>
        <p class="lede" id="confirm-lede"></p>
        <div class="card" id="confirm-card" hidden></div>
      </section>
    </main>
  </div>
  <script src="confirm.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `confirm.js`**

Create `frontend/confirm.js`:

```javascript
// Standalone page for a counterparty with no platform account — no
// dependency on app.js or its state. See
// ../docs/superpowers/specs/2026-09-12-counterparty-confirmation-design.md.

const API = "/api";
const token = new URLSearchParams(window.location.search).get("token");

function el(id) {
  return document.getElementById(id);
}

async function callApi(path, options) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const body = await res.json();
  return { ok: res.ok, body };
}

function renderInvalid(message) {
  el("confirm-title").textContent = "This link isn't valid";
  el("confirm-lede").textContent = message;
  el("confirm-card").hidden = true;
}

function renderExpired() {
  el("confirm-title").textContent = "This link has expired";
  el("confirm-lede").textContent = "Ask the MSME owner to send a new confirmation link.";
  el("confirm-card").hidden = true;
}

function renderAlreadyConfirmed() {
  el("confirm-title").textContent = "Already confirmed";
  el("confirm-lede").textContent = "This agreement was already confirmed. You can close this page.";
  el("confirm-card").hidden = true;
}

function renderSuccess() {
  el("confirm-title").textContent = "Confirmed";
  el("confirm-lede").textContent = "Thanks — this agreement is now anchored and active. You can close this page.";
  el("confirm-card").hidden = true;
}

function renderPending(contractText) {
  el("confirm-title").textContent = "Review and confirm this agreement";
  el("confirm-lede").textContent = "Read the agreement below, then enter the code you were sent to confirm you accept it.";
  const card = el("confirm-card");
  card.hidden = false;
  card.innerHTML = `
    <div class="contract-text">${contractText}</div>
    <div class="field-row" style="margin-top:16px;border-bottom:none">
      <label for="otp-input" class="field-label">Confirmation code</label>
    </div>
    <input id="otp-input" class="otp-input" type="text" inputmode="numeric" maxlength="6" placeholder="6-digit code">
    <button class="primary-btn" id="accept-btn">Accept these terms</button>
    <p class="confirm-error" id="confirm-error"></p>
  `;
  el("accept-btn").addEventListener("click", onAccept);
}

async function onAccept() {
  const code = el("otp-input").value.trim();
  const errorEl = el("confirm-error");
  const button = el("accept-btn");
  errorEl.textContent = "";
  button.disabled = true;

  const { ok, body } = await callApi(`/confirm/${token}`, {
    method: "POST",
    body: JSON.stringify({ otp_code: code })
  });

  if (ok) {
    renderSuccess();
    return;
  }

  button.disabled = false;
  if (body.status === "wrong_code") {
    errorEl.textContent = `That code doesn't match. ${body.attemptsRemaining} attempt(s) left.`;
  } else if (body.status === "expired") {
    renderExpired();
  } else if (body.status === "already_confirmed") {
    renderAlreadyConfirmed();
  } else {
    errorEl.textContent = "Something went wrong confirming this — please try again.";
  }
}

async function init() {
  if (!token) {
    renderInvalid("No confirmation token was provided.");
    return;
  }
  const { ok, body } = await callApi(`/confirm/${token}`);
  if (!ok) {
    if (body.status === "expired") return renderExpired();
    if (body.status === "already_confirmed") return renderAlreadyConfirmed();
    return renderInvalid("This link doesn't match a pending confirmation.");
  }
  renderPending(body.contract_text);
}

init();
```

- [ ] **Step 4: Manual verification in the browser**

With the backend running, run through Task 6's Step 5 verification to get a fresh confirmation link, then open that `confirm_url` in a **new private/incognito window** (simulating the counterparty having no session). Expected: the contract text renders read-only, an OTP input and "Accept these terms" button appear. Enter a wrong 6-digit code — expect an inline error with "5 attempt(s) left" (attempts decrement on repeat). Enter the correct code — expect "Confirmed" with no form. Reload the same URL — expect "Already confirmed."

- [ ] **Step 5: Commit**

```bash
cd /home/dexter/hackathon
git add frontend/confirm.html frontend/confirm.js frontend/styles.css
git commit -m "frontend: add standalone counterparty confirmation page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015ovLUCpMjopQkQkQZUZHJS"
```

---

### Task 8: End-to-end verification against the real chain

**Files:** none (verification only).

**Interfaces:** none — this task exercises everything built in Tasks 1-7 together, against `CHAIN_MODE=real` this time (Tasks 4/5's manual checks used mock mode).

- [ ] **Step 1: Start the full real-chain stack**

```bash
cd /home/dexter/hackathon
./start.sh
```

Wait for `MSME backend listening on http://localhost:4000` and `Chain mode: real`.

- [ ] **Step 2: Run the backend unit tests one more time against the final code**

```bash
cd backend && npm test
```

Expected: all `confirmationTokens.test.js` tests still pass (7 tests, 0 failures) — confirms nothing in Tasks 3-7 broke Task 2's module.

- [ ] **Step 3: Full click-through as the MSME owner**

Open `http://localhost:4000`. Connect → Review → "Looks right — draft a contract" → "Anchor this agreement." Confirm Step 4 shows a confirm link, a 6-digit code, and an expiry — copy both.

- [ ] **Step 4: Full click-through as the counterparty**

Open the copied confirm link in a private/incognito window. Confirm the contract text matches Step 3's generated agreement exactly. Enter the wrong code once, confirm the inline "attempts left" message. Enter the correct code, confirm the "Confirmed" screen appears.

- [ ] **Step 5: Verify the on-chain result directly**

Back in the owner's window, open the Dashboard (Step 5). Confirm the row shows tier `REMOTE_OTP_VERIFIED` and status `executed` (green). Then, to confirm the evidence hash actually made it on-chain non-zero (not visible in the UI), run:

```bash
cd backend && node -e "
require('dotenv').config();
const { ethers } = require('ethers');
const deployment = require('./src/chain/deployment.json');
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const abi = ['function getAgreement(uint256 id) view returns (tuple(bytes32 contentHash, address partyA, address partyB, uint8 tier, bytes32 evidenceHash, string metadataURI, uint256 createdAt, bool signedA, bool signedB))'];
const registry = new ethers.Contract(deployment.address, abi, provider);
registry.getAgreement(0).then((a) => {
  console.log('tier:', a.tier, '(2 = REMOTE_OTP_VERIFIED)');
  console.log('evidenceHash:', a.evidenceHash);
  console.log('signedA:', a.signedA, 'signedB:', a.signedB);
});
"
```

Expected: `tier: 2 (2 = REMOTE_OTP_VERIFIED)`, a non-zero 32-byte `evidenceHash` (not `0x000...000`), `signedA: true`, `signedB: false`.

- [ ] **Step 6: Confirm the failure-mode safeguards**

Generate one more contract + confirmation link (repeat Step 3). This time, submit the wrong code 5 times in a row against `POST /api/confirm/:token` via curl (reusing the pattern from Task 5 Step 3). Expected: the 5th response shows `attemptsRemaining: 0`; a 6th request (even with the correct code) returns `{"status":"already_confirmed"}` — the token is burned.

- [ ] **Step 7: Final commit (if any fixes were needed during verification)**

If Steps 1-6 all pass with no code changes needed, there is nothing to commit here. If a fix was required, commit it with a message describing exactly what broke and why, following the same attribution footer used throughout this plan.
