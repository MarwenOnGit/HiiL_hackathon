// Invitation flow for the v3 UI — the successor to the public /confirm pages.
//
// A signed-in MSME owner mints an invite for one of THEIR contracts: a token
// plus a 6-digit OTP, 7-day TTL (the confirmationTokens mechanics). The party
// is sent the invite URL and the token IS their identity — opening the thread
// link with the token in the address bar identifies them for that one
// contract, with no login and no session (see /api/threads). The OTP is the
// one-time human confirmation that the token holder is really the invitee; it
// is checked once, at acceptance, and never again.
//
// Chain behaviour: for a wizard-contract, the counterparty clicking "Accept"
// is what creates the agreement (partyA signs — acceptance + code captured
// consent off-chain), so the thread opens the moment they accept. For a
// hardened contract (agent world) there is no second registry to create;
// acceptance just confirms their enrolment, and the thread opens once the
// owner has signed the hardened version.

const express = require("express");
const { ethers } = require("ethers");
const db = require("../db");
const registry = require("../services/contractsRegistry");
const confirmationTokens = require("../services/confirmationTokens");
const { requireMsme } = require("../services/sessionAuth");

const router = express.Router();

function frontendOrigin() {
  return process.env.PUBLIC_BASE_URL || "http://localhost:4000";
}

// ---- owner side: create / reuse an invite -------------------------------

router.post("/:contractId", requireMsme, (req, res) => {
  const contractId = req.params.contractId;
  if (!registry.ownedBy(contractId, req.auth.user.user_id)) {
    return res.status(403).json({ error: "this contract does not belong to the signed-in user" });
  }
  const existing = confirmationTokens.findActiveByContract(contractId);
  const { token, otp_code, expires_at } = existing || confirmationTokens.createConfirmation(contractId);
  res.json({
    invite: {
      token,
      otp_code,
      expires_at,
      // The link is the credential — opening it is how the party joins.
      invite_url: `${frontendOrigin()}/invite?token=${token}`
    }
  });
});

// ---- guest side: look the invitation up --------------------------------

router.get("/:token", (req, res) => {
  const token = req.params.token;
  const status = confirmationTokens.getStatus(token);
  const record = db.getConfirmation(token);
  if (status === "invalid") {
    return res.status(404).json({ status, contract_id: null });
  }
  const contractId = record.contract_id;
  const contract = db.getContract(contractId);
  const relationship = contract ? db.getRelationship(contract.relationship_id) : null;

  res.json({
    status, // pending | already_confirmed | expired
    contract_id: contractId,
    need_accept: status === "pending",
    otp_required: status === "pending",
    source: contract ? "wizard" : "hardened",
    contract: contract
      ? {
          parties: {
            owner: relationship ? relationship.parties.msme_owner.name : "MSME owner",
            counterparty: relationship ? relationship.parties.counterparty.name : "Counterparty"
          },
          contract_text: contract.contract_text
        }
      : null
  });
});

// ---- guest side: accept the invitation ---------------------------------

router.post("/:token/accept", async (req, res) => {
  const token = req.params.token;
  const status = confirmationTokens.getStatus(token);
  const record = db.getConfirmation(token);

  if (status === "invalid" || !record) {
    return res.status(404).json({ status: "invalid", contract_id: null });
  }
  if (status === "expired") {
    return res.status(404).json({ status: "expired", contract_id: record.contract_id });
  }

  // A pending invitation needs the one-time code from the owner. An
  // already_confirmed token is a returning party's durable credential — no
  // code replay needed (confirm.html semantics).
  if (status === "pending") {
    try {
      confirmationTokens.checkCode(token, (req.body && req.body.otp_code) || "");
    } catch (err) {
      if (!(err instanceof confirmationTokens.ConfirmationError)) throw err;
      const httpStatus = err.code === "wrong_code" ? 400 : 404;
      return res.status(httpStatus).json({
        status: err.code,
        contract_id: record.contract_id,
        ...err.extra
      });
    }
  }

  const contractId = record.contract_id;

  let atChainSkipped = false;
  const contract = db.getContract(contractId);
  if (contract) {
    if (db.getOnchainRecord(contractId)) {
      // Already anchored — the counterpay accepted before; nothing to redo.
      confirmationTokens.markUsed(token);
      atChainSkipped = true;
    } else {
      const chain = req.app.locals.chainService;
      const relationship = db.getRelationship(contract.relationship_id);
      const evidence = {
        token,
        contract_id: contractId,
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
          metadataURI: `demo://contracts/${contractId}`
        });
        // REMOTE_OTP_VERIFIED executes on partyA's signature alone — the
        // counterparty's consent was captured by clicking Accept. There is
        // deliberately NO partyB signature here: the agreement's partyB is
        // address(0) (relationships carry no on-chain address in this demo),
        // and any sign from a relayer wallet would (correctly) revert with
        // NotAParty. Signing partyB is the FULL_PLATFORM path.
        const signedA = await chain.sign({ agreementId: created.agreementId, signerRole: "partyA" });
        const onchainRecord = {
          agreement_onchain_id: created.agreementId,
          tx_hash: created.txHash,
          block_number: created.blockNumber,
          consent_tier: "REMOTE_OTP_VERIFIED",
          chain_mode: chain.mode,
          signed_a: true,
          signed_b: false,
          executed: Boolean(signedA && signedA.executed),
          last_tx_hash: signedA.txHash
        };
        db.saveOnchainRecord(contractId, onchainRecord);
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "anchoring failed after acceptance", detail: err.message });
      }
      confirmationTokens.markUsed(token);
    }
  } else {
    // hardened contract: nothing on-chain to create here; the owner's sign does it.
    confirmationTokens.markUsed(token);
  }

  const executed = await registry.contractExecuted(contractId);
  res.json({
    ok: true,
    contract_id: contractId,
    executed,
    at_chain_skipped: atChainSkipped,
    // The token travels in the redirect so the thread page can identify the
    // counterparty — it never needed a session.
    redirect: `/thread?contract_id=${encodeURIComponent(contractId)}&token=${encodeURIComponent(token)}`
  });
});

module.exports = router;