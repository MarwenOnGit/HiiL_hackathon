// Guest-side acceptance: checks the one-time code on a pending invite, then —
// for a wizard contract — creates the agreement on-chain (partyA signs;
// acceptance + code captured consent off-chain). Mirrors
// backend/src/routes/invites.js POST /:token/accept exactly.

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import db from "@/lib/server/db";
import registry from "@/lib/server/services/contractsRegistry";
import confirmationTokens from "@/lib/server/services/confirmationTokens";
import { chainService } from "@/lib/server/chain";

export async function POST(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId: token } = await params;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body -> {} */ }

  const status = confirmationTokens.getStatus(token);
  const record = db.getConfirmation(token);

  if (status === "invalid" || !record) {
    return NextResponse.json({ status: "invalid", contract_id: null }, { status: 404 });
  }
  if (status === "expired") {
    return NextResponse.json({ status: "expired", contract_id: record.contract_id }, { status: 404 });
  }

  if (status === "pending") {
    try {
      confirmationTokens.checkCode(token, body.otp_code || "");
    } catch (err) {
      if (!(err instanceof confirmationTokens.ConfirmationError)) throw err;
      const httpStatus = err.code === "wrong_code" ? 400 : 404;
      return NextResponse.json(
        { status: err.code, contract_id: record.contract_id, ...err.extra },
        { status: httpStatus }
      );
    }
  }

  const contractId = record.contract_id;

  let atChainSkipped = false;
  const contract = db.getContract(contractId);
  if (contract) {
    if (db.getOnchainRecord(contractId)) {
      confirmationTokens.markUsed(token);
      atChainSkipped = true;
    } else {
      const relationship = db.getRelationship(contract.relationship_id);
      const evidence = {
        token,
        contract_id: contractId,
        contract_text_hash: contract.contract_text_hash,
        accepted_at: new Date().toISOString()
      };
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(evidence)));
      try {
        const created = await chainService.createAgreement({
          contentHash: contract.contract_text_hash,
          partyBAddress: (relationship && relationship.parties.counterparty.on_chain_address) || null,
          tier: "REMOTE_OTP_VERIFIED",
          evidenceHash,
          metadataURI: `demo://contracts/${contractId}`
        });
        const signedA = await chainService.sign({ agreementId: created.agreementId, signerRole: "partyA" });
        const onchainRecord = {
          agreement_onchain_id: created.agreementId,
          tx_hash: created.txHash,
          block_number: created.blockNumber,
          consent_tier: "REMOTE_OTP_VERIFIED",
          chain_mode: chainService.mode,
          signed_a: true,
          signed_b: false,
          executed: Boolean(signedA && signedA.executed),
          last_tx_hash: signedA.txHash
        };
        db.saveOnchainRecord(contractId, onchainRecord);
      } catch (err: any) {
        console.error(err);
        return NextResponse.json({ error: "anchoring failed after acceptance", detail: err.message }, { status: 500 });
      }
      confirmationTokens.markUsed(token);
    }
  } else {
    confirmationTokens.markUsed(token);
  }

  const executed = await registry.contractExecuted(contractId);
  return NextResponse.json({
    ok: true,
    contract_id: contractId,
    executed,
    at_chain_skipped: atChainSkipped,
    redirect: `/thread?contract_id=${encodeURIComponent(contractId)}&token=${encodeURIComponent(token)}`
  });
}