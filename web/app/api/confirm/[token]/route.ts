import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import db from "@/lib/server/db";
import confirmationTokens from "@/lib/server/services/confirmationTokens";
import insaf from "@/lib/server/services/insaf";
import { chainService } from "@/lib/server/chain";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const status = confirmationTokens.getStatus(token);
  if (status !== "pending") {
    const record = db.getConfirmation(token);
    return NextResponse.json({ status, contract_id: record ? record.contract_id : null }, { status: 404 });
  }

  const record = db.getConfirmation(token);
  const contract = db.getContract(record.contract_id);
  if (!contract) return NextResponse.json({ status: "invalid" }, { status: 404 });

  return NextResponse.json({ status: "pending", contract_text: contract.contract_text });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body -> {} */ }
  const submittedCode = body.otp_code || "";

  let record: any;
  try {
    record = confirmationTokens.checkCode(token, submittedCode);
  } catch (err) {
    if (!(err instanceof confirmationTokens.ConfirmationError)) throw err;
    const httpStatus = err.code === "wrong_code" ? 400 : 404;
    const existing = db.getConfirmation(token);
    return NextResponse.json(
      { status: err.code, contract_id: existing ? existing.contract_id : null, ...err.extra },
      { status: httpStatus }
    );
  }

  const contract = db.getContract(record.contract_id);
  if (!contract) return NextResponse.json({ status: "invalid" }, { status: 404 });
  const relationship = db.getRelationship(contract.relationship_id);

  if (db.getOnchainRecord(contract.contract_id)) {
    confirmationTokens.markUsed(token);
    return NextResponse.json(
      { status: "already_confirmed", contract_id: contract.contract_id },
      { status: 409 }
    );
  }

  const evidence = {
    token,
    contract_id: contract.contract_id,
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
      metadataURI: `demo://contracts/${contract.contract_id}`
    });
    const signed = await chainService.sign({ agreementId: created.agreementId, signerRole: "partyA" });

    const onchainRecord = {
      agreement_onchain_id: created.agreementId,
      tx_hash: created.txHash,
      block_number: created.blockNumber,
      consent_tier: "REMOTE_OTP_VERIFIED",
      chain_mode: chainService.mode,
      signed_a: true,
      signed_b: false,
      executed: signed.executed,
      last_tx_hash: signed.txHash
    };
    db.saveOnchainRecord(contract.contract_id, onchainRecord);
    confirmationTokens.markUsed(token);

    return NextResponse.json({
      onchain: onchainRecord,
      insaf: insaf.onSigned("partyA", signed.executed),
      contract_id: contract.contract_id
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "anchoring failed after acceptance", detail: err.message }, { status: 500 });
  }
}