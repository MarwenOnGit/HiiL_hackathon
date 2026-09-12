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
