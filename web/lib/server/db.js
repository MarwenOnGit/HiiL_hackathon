// In-memory store, shaped after the Postgres tables in ARCHITECTURE.md Section 8
// (relationships, contracts, agreements_onchain). Swap for real Postgres later —
// nothing outside this file needs to know, since every route goes through these
// functions rather than touching storage directly.

const relationships = new Map();
const contracts = new Map();
const agreementsOnchain = new Map(); // keyed by contract_id
const pendingConfirmations = new Map(); // keyed by confirmation token
const threads = new Map(); // keyed by contract_id → ordered array of messages

// --- v3 identity + ownership (added for the gate between MSME accounts, the
// invite flow and contract scoping; user/contract data is still ephemeral,
// exactly like the rest of this in-memory store).

const users = new Map(); // keyed by user_id
const sessions = new Map(); // keyed by session token (the cookie value)
const contractOwners = new Map(); // keyed by contract_id → { user_id, source, created_at }

function saveRelationship(rel) {
  relationships.set(rel.relationship_id, rel);
  return rel;
}

function getRelationship(id) {
  return relationships.get(id) || null;
}

function saveContract(contract) {
  contracts.set(contract.contract_id, contract);
  return contract;
}

function getContract(id) {
  return contracts.get(id) || null;
}

function listContracts() {
  return Array.from(contracts.values());
}

function saveOnchainRecord(contractId, record) {
  agreementsOnchain.set(contractId, record);
  return record;
}

function getOnchainRecord(contractId) {
  return agreementsOnchain.get(contractId) || null;
}

function saveConfirmation(token, record) {
  pendingConfirmations.set(token, record);
  return record;
}

function getConfirmation(token) {
  return pendingConfirmations.get(token) || null;
}

function listConfirmations() {
  return Array.from(pendingConfirmations.values());
}

function appendMessage(contractId, message) {
  const existing = threads.get(contractId) || [];
  existing.push(message);
  threads.set(contractId, existing);
  return message;
}

function getMessages(contractId) {
  return threads.get(contractId) || [];
}

function dashboardRows() {
  return listContracts().map((c) => {
    const onchain = getOnchainRecord(c.contract_id);
    const rel = getRelationship(c.relationship_id);
    return {
      contract_id: c.contract_id,
      relationship_id: c.relationship_id,
      msme_owner: rel ? rel.parties.msme_owner.name : null,
      counterparty: rel ? rel.parties.counterparty.name : null,
      consent_tier: onchain ? onchain.consent_tier : c.consent_tier_recommended,
      generated_at: c.generated_at,
      onchain: onchain || null
    };
  });
}

// ---------- users / sessions / ownership ----------

function saveUser(user) {
  users.set(user.user_id, user);
  return user;
}

function getUserById(userId) {
  return users.get(userId) || null;
}

function getUserByGoogleSub(googleSub) {
  for (const user of users.values()) {
    if (user.google_sub === googleSub) return user;
  }
  return null;
}

function getUserByEmail(email) {
  const needle = String(email || "").trim().toLowerCase();
  if (!needle) return null;
  for (const user of users.values()) {
    if (user.email === needle) return user;
  }
  return null;
}

function listUsers() {
  return Array.from(users.values());
}

function saveSession(session) {
  sessions.set(session.token, session);
  return session;
}

function getSession(token) {
  return sessions.get(token) || null;
}

function deleteSession(token) {
  sessions.delete(token);
}

// v3 ownership: a contract belongs to exactly one MSME user, whoever created
// it (wizard generate, demo seed or agent hardening). source records which
// world the contract lives in, so registry-aware routes know how to resolve it.
function saveContractOwner(contractId, userId, source) {
  const record = contractOwners.get(contractId);
  if (record) return record; // first writer wins — never steal an existing contract
  const owned = { user_id: userId, source: source || "wizard", created_at: new Date().toISOString() };
  contractOwners.set(contractId, owned);
  return owned;
}

function getContractOwner(contractId) {
  return contractOwners.get(contractId) || null;
}

function hasContractOwner(contractId) {
  return contractOwners.has(contractId);
}

function listContractsOwnedBy(userId) {
  return Array.from(contractOwners.entries())
    .filter(([, record]) => record.user_id === userId)
    .map(([contract_id, record]) => ({ contract_id, ...record }));
}

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
  listConfirmations,
  appendMessage,
  getMessages,
  dashboardRows,
  saveUser,
  getUserById,
  getUserByGoogleSub,
  getUserByEmail,
  listUsers,
  saveSession,
  getSession,
  deleteSession,
  saveContractOwner,
  getContractOwner,
  hasContractOwner,
  listContractsOwnedBy
};
