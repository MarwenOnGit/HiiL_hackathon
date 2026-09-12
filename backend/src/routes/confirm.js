// Public, unauthenticated routes for a counterparty who has no platform
// account. See docs/superpowers/specs/2026-09-12-counterparty-confirmation-design.md.
// Never mounted behind auth — do not add anything here that assumes a
// logged-in user.

const express = require("express");
const { ethers } = require("ethers");
const db = require("../db");
const confirmationTokens = require("../services/confirmationTokens");
const insaf = require("../services/insaf");

const router = express.Router();

router.get("/:token", (req, res) => {
  const status = confirmationTokens.getStatus(req.params.token);
  if (status !== "pending") return res.status(404).json({ status });

  const record = db.getConfirmation(req.params.token);
  const contract = db.getContract(record.contract_id);
  if (!contract) return res.status(404).json({ status: "invalid" });

  res.json({ status: "pending", contract_text: contract.contract_text });
});

router.post("/:token", async (req, res) => {
  const token = req.params.token;
  const submittedCode = (req.body && req.body.otp_code) || "";

  let record;
  try {
    record = confirmationTokens.checkCode(token, submittedCode);
  } catch (err) {
    if (!(err instanceof confirmationTokens.ConfirmationError)) throw err;
    const httpStatus = err.code === "wrong_code" ? 400 : 404;
    return res.status(httpStatus).json({ status: err.code, ...err.extra });
  }

  const contract = db.getContract(record.contract_id);
  if (!contract) return res.status(404).json({ status: "invalid" });
  const relationship = db.getRelationship(contract.relationship_id);
  const chain = req.app.locals.chainService;

  // This contract was already anchored on-chain via a different token
  // (e.g. the owner clicked "Anchor" twice before this fix, or forwarded a
  // stale link). This token's code was correct, but there is nothing left
  // for it to do — never call the chain a second time for the same contract.
  if (db.getOnchainRecord(contract.contract_id)) {
    confirmationTokens.markUsed(token);
    return res.status(409).json({ status: "already_confirmed" });
  }

  const evidence = {
    token,
    contract_id: contract.contract_id,
    contract_text_hash: contract.contract_text_hash,
    accepted_at: new Date().toISOString()
  };
  const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(evidence)));

  try {
    const created = await chain.createAgreement({
      contentHash: contract.contract_text_hash,
      partyBAddress: (relationship && relationship.parties.counterparty.on_chain_address) || null,
      tier: "REMOTE_OTP_VERIFIED",
      evidenceHash,
      metadataURI: `demo://contracts/${contract.contract_id}`
    });
    const signed = await chain.sign({ agreementId: created.agreementId, signerRole: "partyA" });

    const onchainRecord = {
      agreement_onchain_id: created.agreementId,
      tx_hash: created.txHash,
      block_number: created.blockNumber,
      consent_tier: "REMOTE_OTP_VERIFIED",
      chain_mode: chain.mode,
      signed_a: true,
      signed_b: false,
      executed: signed.executed,
      last_tx_hash: signed.txHash
    };
    db.saveOnchainRecord(contract.contract_id, onchainRecord);
    confirmationTokens.markUsed(token);

    res.json({ onchain: onchainRecord, insaf: insaf.onSigned("partyA", signed.executed) });
  } catch (err) {
    // Deliberately do NOT call markUsed here — checkCode already verified
    // the code was correct, and a chain hiccup must not cost the
    // counterparty their one confirmation attempt. Retrying the same
    // request with the same correct code will work once the chain is up.
    console.error(err);
    res.status(500).json({ error: "anchoring failed after acceptance", detail: err.message });
  }
});

module.exports = router;
