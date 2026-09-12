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
    token,
    contract_id: contractId,
    otp_code: generateCode(),
    expires_at: Date.now() + ttlMs,
    used: false,
    burned: false,
    attempts: 0
  };
  db.saveConfirmation(token, record);
  return { token, otp_code: record.otp_code, expires_at: record.expires_at };
}

// Finds a still-live (not used, not burned, not expired) confirmation
// already issued for this contract, so /anchor can hand the counterparty
// the same link/code again instead of minting a second valid token for the
// same contract (see 2026-09-12 final-review Finding 1).
function findActiveByContract(contractId) {
  const records = db.listConfirmations();
  const record = records.find(
    (r) => r.contract_id === contractId && !r.used && !r.burned && Date.now() <= r.expires_at
  );
  if (!record) return null;
  return { token: record.token, otp_code: record.otp_code, expires_at: record.expires_at };
}

function getStatus(token) {
  const record = db.getConfirmation(token);
  if (!record) return "invalid";
  if (record.used) return "already_confirmed";
  if (record.burned) return "expired";
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
      record.burned = true; // burn the token — no more guesses; reports as "expired", not "already_confirmed"
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
  findActiveByContract,
  getStatus,
  checkCode,
  markUsed,
  ConfirmationError,
  MAX_ATTEMPTS
};
