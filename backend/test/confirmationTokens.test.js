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
