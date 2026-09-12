const test = require("node:test");
const assert = require("node:assert/strict");
const { canPost, isValidSender, isValidBody, MAX_BODY_LENGTH } = require("../src/services/threadAuth");
const { createConfirmation, checkCode, markUsed } = require("../src/services/confirmationTokens");
const db = require("../src/db");

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

test("a used token stays a thread key after its TTL expires", () => {
  const token = confirmedTokenFor("contract_a8");
  db.getConfirmation(token).expires_at = Date.now() - 1000;
  assert.equal(canPost("counterparty", "contract_a8", token), true);
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
