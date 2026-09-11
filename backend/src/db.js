// In-memory store, shaped after the Postgres tables in ARCHITECTURE.md Section 8
// (relationships, contracts, agreements_onchain). Swap for real Postgres later —
// nothing outside this file needs to know, since every route goes through these
// functions rather than touching storage directly.

const relationships = new Map();
const contracts = new Map();
const agreementsOnchain = new Map(); // keyed by contract_id
const pendingConfirmations = new Map(); // keyed by confirmation token

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
  dashboardRows
};
