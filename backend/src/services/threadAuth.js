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
