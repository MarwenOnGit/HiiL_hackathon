// Per-agreement discussion threads. See
// docs/superpowers/specs/2026-09-12-per-agreement-chat-design.md.
// A thread exists only for an agreement that is already executed — across
// BOTH worlds (wizard on-chain record, or hardened contract the agent signed).
// Messages are off-chain content, exactly like the contract text itself;
// nothing in this file touches the chain directly.

const express = require("express");
const db = require("../db");
const registry = require("../services/contractsRegistry");
const threadAuth = require("../services/threadAuth");

const router = express.Router();

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://127.0.0.1:5001";

// Every thread route is gated on the agreement actually being in force.
async function requireExecutedAgreement(req, res, next) {
  const executed = await registry.contractExecuted(req.params.contractId);
  if (!executed) {
    return res.status(404).json({ error: "no active agreement for this contract" });
  }
  next();
}

// Ownership posture, balancing the new auth layer with the legacy happy path:
//  - owned contract → the requesting session must be that owner
//  - legacy (unowned) contract → any app user may act as owner (v1 behaviour)
function isAuthenticatedOwner(req, contractId) {
  if (req.auth && req.auth.kind === "msme" && registry.ownedBy(contractId, req.auth.user.user_id)) {
    return true;
  }
  return !registry.isOwned(contractId);
}

function isConfirmedCounterparty(req, contractId) {
  // v3 guest session: the counterparty enrolled via the invite, cookie carries
  // (contract_id, confirmation_token). Preferred — the browser never needs to
  // re-supply the raw token.
  if (req.auth && req.auth.kind === "guest" && req.auth.session.contract_id === contractId) {
    return true;
  }
  // Legacy static thread page: the raw token travels in body/query.
  const token = (req.body && req.body.token) || (req.query && req.query.token);
  return threadAuth.canPost("counterparty", contractId, token);
}

router.get("/:contractId/messages", requireExecutedAgreement, (req, res) => {
  const contractId = req.params.contractId;
  const viewer = isAuthenticatedOwner(req, contractId)
    ? "owner"
    : isConfirmedCounterparty(req, contractId)
      ? "counterparty"
      : null;
  res.json({
    messages: db.getMessages(contractId),
    participants: participantLabels(contractId),
    viewer
  });
});

router.post("/:contractId/messages", requireExecutedAgreement, (req, res) => {
  const contractId = req.params.contractId;
  const { sender, body } = req.body || {};

  if (sender === "insaf") {
    return res.status(403).json({ error: "insaf messages are posted by the assistant route only" });
  }
  if (!threadAuth.isValidSender(sender)) {
    return res.status(400).json({ error: "sender must be owner or counterparty" });
  }
  if (!threadAuth.isValidBody(body)) {
    return res.status(400).json({ error: "message body invalid" });
  }

  let allowed;
  if (sender === "owner") {
    allowed = isAuthenticatedOwner(req, contractId);
  } else {
    allowed = isConfirmedCounterparty(req, contractId);
  }
  if (!allowed) {
    return res.status(403).json({ error: "not authorized to post to this thread" });
  }

  const message = { sender, body: body.trim(), sent_at: new Date().toISOString() };
  db.appendMessage(contractId, message);
  res.status(201).json({ message });
});

// "Call Insaf into the chat": the assistant's reply is written INTO the
// thread so both parties see the same, neutral answer. Only this server-side
// route can append sender="insaf" messages — a plain POST above rejects them.
router.post("/:contractId/assistant", requireExecutedAgreement, async (req, res) => {
  const contractId = req.params.contractId;
  const question = (req.body && req.body.question) || "";

  let participant;
  if (isAuthenticatedOwner(req, contractId)) {
    participant = "owner";
  } else if (isConfirmedCounterparty(req, contractId)) {
    participant = "counterparty";
  } else {
    return res.status(403).json({ error: "not a participant in this thread" });
  }
  if (!threadAuth.isValidBody(question)) {
    return res.status(400).json({ error: "question body invalid" });
  }

  try {
    const response = await fetch(`${AGENT_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract_id: contractId, question: question.trim() }),
      signal: AbortSignal.timeout(20000)
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.detail || data.error || "assistant failed" });
    }
    const reply = data.reply || {};
    const withCitations = renderCitations(reply);
    const message = {
      sender: "insaf",
      body: withCitations,
      sent_at: new Date().toISOString(),
      reply_meta: {
        summoned_by: participant,
        rule_based: Boolean(reply.rule_based),
        grounded: Boolean(reply.grounded_legal)
      }
    };
    db.appendMessage(contractId, message);
    res.status(201).json({ message, reply });
  } catch (err) {
    console.error("[assistant]", err.message);
    res.status(503).json({ error: "the agent service is unreachable", detail: err.message });
  }
});

// Powers the Dashboard badge. `since` is supplied by the browser from
// localStorage; the owner is now authenticated, but read-state stays client
// side to keep this route cheap and dependency-free.
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

function renderCitations(reply) {
  const citations = reply.citations || [];
  const note = reply.no_legal_basis_note || "";
  let text = reply.answer || "";
  if (citations.length) {
    text += "\n\nSources retrieved:";
    for (const c of citations) {
      text += `\n- ${c.source_doc} ${c.article_ref} (${c.mode})`;
    }
  }
  if (note) text += `\n\n${note}`;
  return text;
}

function participantLabels(contractId) {
  const wizard = db.getContract(contractId);
  if (wizard) {
    const rel = db.getRelationship(wizard.relationship_id);
    return {
      owner: rel ? rel.parties.msme_owner.name : "MSME owner",
      counterparty: rel ? rel.parties.counterparty.name : "Counterparty"
    };
  }
  return { owner: "MSME owner", counterparty: "Counterparty" };
}

module.exports = router;