const express = require("express");
const db = require("../db");
const { generateContract } = require("../services/contractGenerator");
const insaf = require("../services/insaf");

const router = express.Router();

router.post("/generate", (req, res) => {
  const { relationship_id } = req.body || {};
  const relationship = db.getRelationship(relationship_id);
  if (!relationship) return res.status(404).json({ error: "relationship not found — call /api/relationships/demo first" });

  const contract = generateContract(relationship);
  db.saveContract(contract);
  res.json({ contract, insaf: insaf.onGenerated() });
});

router.get("/:id", (req, res) => {
  const contract = db.getContract(req.params.id);
  if (!contract) return res.status(404).json({ error: "contract not found" });
  const onchain = db.getOnchainRecord(contract.contract_id);
  res.json({ contract, onchain });
});

router.post("/:id/anchor", async (req, res) => {
  const contract = db.getContract(req.params.id);
  if (!contract) return res.status(404).json({ error: "contract not found" });
  if (db.getOnchainRecord(contract.contract_id)) {
    return res.status(409).json({ error: "already anchored", onchain: db.getOnchainRecord(contract.contract_id) });
  }

  const relationship = db.getRelationship(contract.relationship_id);
  const consentTier = (req.body && req.body.consent_tier) || contract.consent_tier_recommended;
  const chain = req.app.locals.chainService;

  try {
    const result = await chain.createAgreement({
      contentHash: contract.contract_text_hash,
      partyBAddress: relationship.parties.counterparty.on_chain_address || null,
      tier: consentTier,
      evidenceHash: null,
      metadataURI: `demo://contracts/${contract.contract_id}`
    });

    const record = {
      agreement_onchain_id: result.agreementId,
      tx_hash: result.txHash,
      block_number: result.blockNumber,
      consent_tier: consentTier,
      chain_mode: chain.mode,
      signed_a: false,
      signed_b: false,
      executed: false
    };
    db.saveOnchainRecord(contract.contract_id, record);
    res.json({ onchain: record, insaf: insaf.onAnchored(result) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "chain anchoring failed", detail: err.message });
  }
});

router.post("/:id/sign", async (req, res) => {
  const contract = db.getContract(req.params.id);
  if (!contract) return res.status(404).json({ error: "contract not found" });
  const record = db.getOnchainRecord(contract.contract_id);
  if (!record) return res.status(400).json({ error: "not anchored yet — call /anchor first" });

  const role = (req.body && req.body.role) || "partyA";
  if (!["partyA", "partyB"].includes(role)) return res.status(400).json({ error: "role must be partyA or partyB" });

  const chain = req.app.locals.chainService;
  try {
    const result = await chain.sign({ agreementId: record.agreement_onchain_id, signerRole: role });
    if (role === "partyA") record.signed_a = true;
    else record.signed_b = true;
    record.executed = result.executed;
    record.last_tx_hash = result.txHash;
    db.saveOnchainRecord(contract.contract_id, record);
    res.json({ onchain: record, insaf: insaf.onSigned(role, result.executed) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "signing failed", detail: err.message });
  }
});

router.get("/:id/status", async (req, res) => {
  const contract = db.getContract(req.params.id);
  if (!contract) return res.status(404).json({ error: "contract not found" });
  const record = db.getOnchainRecord(contract.contract_id);
  if (!record) return res.json({ status: "not_anchored" });

  const chain = req.app.locals.chainService;
  try {
    const executed = await chain.isExecuted(record.agreement_onchain_id);
    res.json({ status: executed ? "executed" : "pending", onchain: record });
  } catch (err) {
    res.json({ status: record.executed ? "executed" : "pending", onchain: record });
  }
});

module.exports = router;
