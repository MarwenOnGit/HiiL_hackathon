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
