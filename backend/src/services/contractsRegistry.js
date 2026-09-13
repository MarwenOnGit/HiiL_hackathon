// The one place the backend asks "whose contract is this, is it signed, does
// it have a thread" — across BOTH contract worlds:
//
//   wizard   — contracts minted by /api/contracts/generate, stored in db.js
//   hardened — contracts analysed by the agent service (:5001), owned by the
//              MSME user who created them here but stored over there
//
// Every consumer (dashboard, threads, invites, assistant) goes through this
// file instead of peeking into both stores, so the seam has exactly one place
// to tolerate the agent being down.

const db = require("../db");

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://127.0.0.1:5001";
const AGENT_LIST_TTL_MS = 10 * 1000;

let agentListCache = null; // { at: number, data: {contracts:[...], count} | crashed }
let healthCache = null; // { at: number, available: boolean }

function isAgentUp() {
  const now = Date.now();
  if (healthCache && now - healthCache.at < 5000) return healthCache.available;
  healthCache = { at: now, available: false };
  // Never crash a request because the agent is down — callers tolerate null.
  fetch(`${AGENT_URL}/health`, { signal: AbortSignal.timeout(2000) })
    .then((res) => res.json())
    .then((body) => { healthCache.available = Boolean(body && body.ok); })
    .catch(() => { healthCache.available = false; });
  return healthCache.available;
}

async function fetchAgentJson(path, timeoutMs = 4000) {
  const res = await fetch(`${AGENT_URL}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`agent ${path} -> ${res.status}`);
  return res.json();
}

async function agentList() {
  const now = Date.now();
  if (agentListCache && now - agentListCache.at < AGENT_LIST_TTL_MS) {
    return agentListCache.data;
  }
  const data = await fetchAgentJson("/contracts");
  agentListCache = { at: now, data };
  return data;
}

function clearAgentListCache() {
  agentListCache = null;
  healthCache = null;
}

function source(contractId) {
  if (db.getContract(contractId)) return "wizard";
  return null; // agent membership is async; callers use hasAgentContract()
}

async function hasAgentContract(contractId) {
  try {
    const data = await agentList();
    return Boolean(data.contracts.find((c) => c.contract_id === contractId));
  } catch (err) {
    return false;
  }
}

function isOwned(contractId) {
  return db.hasContractOwner(contractId);
}

function owner(contractId) {
  return db.getContractOwner(contractId);
}

function ownedBy(contractId, userId) {
  const record = db.getContractOwner(contractId);
  return Boolean(record && record.user_id === userId);
}

async function agentSigned(contractId) {
  try {
    const data = await fetchAgentJson(`/contracts/${encodeURIComponent(contractId)}`);
    return Boolean(
      data.versions && data.versions.some((v) => v.doc_type === "signed" && v.anchor_tx)
    );
  } catch (err) {
    return false;
  }
}

async function contractExecuted(contractId) {
  if (db.getContract(contractId)) {
    const record = db.getOnchainRecord(contractId);
    return Boolean(record && record.executed);
  }
  if (await hasAgentContract(contractId)) {
    return agentSigned(contractId);
  }
  return false;
}

async function listMine(userId) {
  const owned = listContractsOwnedBy(userId);
  let agentIndex = new Map();
  try {
    const data = await agentList();
    agentIndex = new Map(data.contracts.map((c) => [c.contract_id, c]));
  } catch (err) {
    /* agent down — wizard rows still render */
  }

  const rows = [];
  for (const record of owned) {
    const contractId = record.contract_id;
    const wizard = db.getContract(contractId);
    const relationship = wizard ? db.getRelationship(wizard.relationship_id) : null;
    const onchain = db.getOnchainRecord(contractId);
    const agent = agentIndex.get(contractId);
    const messages = db.getMessages(contractId);
    const invite = inboxInviteFor(contractId);

    rows.push({
      contract_id: contractId,
      source: record.source,
      msme_owner: relationship ? relationship.parties.msme_owner.name : (agent ? agent.parties[0].display_name : null),
      counterparty: relationship ? relationship.parties.counterparty.name : (agent ? agent.parties[1].display_name : null),
      generated_at: (wizard && wizard.generated_at) || record.created_at,
      version_count: (wizard ? 1 : 0) + (agent ? agent.version_count : 0),
      consent_tier: onchain ? onchain.consent_tier : (wizard ? wizard.consent_tier_recommended : null),
      signed: (onchain && onchain.executed) || (agent ? agent.signed : false),
      onchain: onchain || null,
      thread_message_count: messages.length,
      thread_last_sent_at: messages.length ? messages[messages.length - 1].sent_at : null,
      invite_active: Boolean(invite),
      invite_expires_at: invite ? invite.expires_at : null
    });
  }
  return rows;
}

function inboxInviteFor(contractId) {
  // mirrors /api/contracts/:id/anchor: reuse the live token when one exists
  const existing = db.listConfirmations().find(
    (r) => r.contract_id === contractId && !r.used && !r.burned && Date.now() <= r.expires_at
  );
  return existing ? { token: existing.token, expires_at: existing.expires_at } : null;
}

function listContractsOwnedBy(userId) {
  return db.listContractsOwnedBy(userId);
}

module.exports = {
  isAgentUp,
  agentList,
  hasAgentContract,
  source,
  isOwned,
  owner,
  ownedBy,
  agentSigned,
  contractExecuted,
  listMine,
  clearAgentListCache,
  inboxInviteFor
};