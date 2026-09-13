// In-memory store, shaped after the Postgres tables in ARCHITECTURE.md Section 8
// (relationships, contracts, agreements_onchain). Swap for real Postgres later —
// nothing outside this file needs to know, since every route goes through these
// functions rather than touching storage directly.
//
// Two hard constraints shape this store:
//
// 1. ONE store per process. Next build webpacks a relative require into every
//    route chunk, so "require('../db')" is NOT a shared singleton — each route
//    embeds its own private copy of this module. That is why auth worked in one
//    route and the very next request answered "authentication required": the
//    session was written into an instance the other route could never see. The
//    Maps therefore live on `globalThis` — every webpack copy touches the same
//    objects, so the registry behaves like a single store again.
//
// 2. Durability across restarts and hot reloads. Next dev re-instantiates
//    module state constantly; a memory-only store orphans every cookie the
//    browser holds. Every mutation rewrites an atomic JSON snapshot
//    (write-temp-then-rename), and boot hydrates the Maps from it. The snapshot
//    path is anchored on process.cwd() rather than __dirname, because the
//    bundled copies seen above resolve __dirname to different directories.

const fs = require("fs");
const path = require("path");

function dataFilePath() {
  if (process.env.WEB_DB_FILE) return process.env.WEB_DB_FILE;
  return path.join(process.cwd(), "lib", "server", "data", "db-state.json");
}
const DATA_FILE = dataFilePath();

function ensureStore() {
  const key = "__insaf_db_state__";
  if (!globalThis[key]) {
    globalThis[key] = {
      booted: false,
      relationships: new Map(),
      contracts: new Map(),
      agreementsOnchain: new Map(), // keyed by contract_id
      pendingConfirmations: new Map(), // keyed by confirmation token
      threads: new Map(), // keyed by contract_id → ordered array of messages
      users: new Map(), // keyed by user_id
      sessions: new Map(), // keyed by session token (the cookie value)
      contractOwners: new Map(), // keyed by contract_id → { user_id, source, created_at }
      consents: new Map(), // keyed by `${contract_id}:${party}` → consent record
    };
  }
  return globalThis[key];
}

const store = ensureStore();

function toObj(map) {
  return Object.fromEntries(map);
}

function toMap(obj) {
  const map = new Map();
  if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) map.set(key, value);
  }
  return map;
}

// The snapshot always carries the FULL store, whichever collection just
// changed: this file is the recovery point for a restart, so a session write
// must not evict yesterday's relationships from it.
const ALL_KEYS = [
  "relationships", "contracts", "agreementsOnchain", "pendingConfirmations",
  "threads", "users", "sessions", "contractOwners", "consents",
];

function persist() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const state = {};
  for (const key of ALL_KEYS) state[key] = toObj(store[key]);
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
  fs.renameSync(tmp, DATA_FILE);
}

// Hydrate from the recovery snapshot. One global flag so that whatever webpack
// copy is re-evaluated later (hot reload, another route chunk) sees "already
// booted" and keeps the shared in-memory state untouched.
function load() {
  if (store.booted) return;
  store.booted = true;
  let raw;
  try {
    raw = fs.readFileSync(DATA_FILE, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return; // first boot — start empty
    console.warn("[db] could not read " + DATA_FILE + ":", err.message);
    return;
  }
  try {
    const state = JSON.parse(raw);
    for (const key of ALL_KEYS) {
      toMap(state[key]).forEach((v, k) => store[key].set(k, v));
    }
  } catch (err) {
    console.warn("[db] " + DATA_FILE + " is corrupt; starting empty:", err.message);
    return;
  }
  // Tidy: drop already-expired sessions so the snapshot only carries live
  // tokens. Safety is unaffected — sessionMiddleware also checks expiry.
  const now = Date.now();
  for (const [token, session] of store.sessions) {
    if (session.expires_at && Date.parse(session.expires_at) < now) store.sessions.delete(token);
  }
}

load();

const relationships = store.relationships;
const contracts = store.contracts;
const agreementsOnchain = store.agreementsOnchain;
const pendingConfirmations = store.pendingConfirmations;
const threads = store.threads;
const users = store.users;
const sessions = store.sessions;
const contractOwners = store.contractOwners;
const consents = store.consents;

function saveRelationship(rel) {
  relationships.set(rel.relationship_id, rel);
  persist();
  return rel;
}

function getRelationship(id) {
  return relationships.get(id) || null;
}

function saveContract(contract) {
  contracts.set(contract.contract_id, contract);
  persist();
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
  persist();
  return record;
}

function getOnchainRecord(contractId) {
  return agreementsOnchain.get(contractId) || null;
}

function saveConfirmation(token, record) {
  pendingConfirmations.set(token, record);
  persist();
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
  persist();
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
  persist();
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
  persist();
  return session;
}

function getSession(token) {
  return sessions.get(token) || null;
}

function deleteSession(token) {
  sessions.delete(token);
  persist();
}

// v3 ownership: a contract belongs to exactly one MSME user, whoever created
// it (wizard generate, demo seed or agent hardening). source records which
// world the contract lives in, so registry-aware routes know how to resolve it.
// Recorded consent for a thread participant. Kept as an append-only fact with
// its own timestamp: the point of asking is to be able to show, later, exactly
// what was agreed to and when.
function consentKey(contractId, party) {
  return `${contractId}:${party}`;
}

function saveConsent(contractId, party, record) {
  consents.set(consentKey(contractId, party), record);
  persist();
  return record;
}

function getConsent(contractId, party) {
  return consents.get(consentKey(contractId, party)) || null;
}

function clearConsent(contractId, party) {
  consents.delete(consentKey(contractId, party));
  persist();
}

function saveContractOwner(contractId, userId, source) {
  const record = contractOwners.get(contractId);
  if (record) return record; // first writer wins — never steal an existing contract
  const owned = { user_id: userId, source: source || "wizard", created_at: new Date().toISOString() };
  contractOwners.set(contractId, owned);
  persist();
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
  saveConsent,
  getConsent,
  clearConsent,
  saveContractOwner,
  getContractOwner,
  hasContractOwner,
  listContractsOwnedBy
};