// Invitation flow for the v3 UI — the successor to the public /confirm pages.
// Mirrors backend/src/routes/invites.js: GET = public token lookup, POST =
// owner mint (requireMsme + ownership gate). Same shapes out.

import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";
import registry from "@/lib/server/services/contractsRegistry";
import confirmationTokens from "@/lib/server/services/confirmationTokens";
import { authFromRequest, msmeRequiredResponse } from "@/lib/server/session";

function frontendOrigin() {
  return process.env.PUBLIC_BASE_URL || "http://localhost:4000";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  const auth = authFromRequest(req);
  if (!auth || auth.kind !== "msme") return msmeRequiredResponse();
  if (!registry.ownedBy(contractId, auth.user.user_id)) {
    return NextResponse.json({ error: "this contract does not belong to the signed-in user" }, { status: 403 });
  }
  const existing = confirmationTokens.findActiveByContract(contractId);
  const { token, otp_code, expires_at } = existing || confirmationTokens.createConfirmation(contractId);
  return NextResponse.json({
    invite: {
      token,
      otp_code,
      expires_at,
      invite_url: `${frontendOrigin()}/invite?token=${token}`
    }
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId: token } = await params;
  const status = confirmationTokens.getStatus(token);
  const record = db.getConfirmation(token);
  if (status === "invalid") {
    return NextResponse.json({ status, contract_id: null }, { status: 404 });
  }
  const contractId = record.contract_id;
  const contract = db.getContract(contractId);
  const relationship = contract ? db.getRelationship(contract.relationship_id) : null;

  return NextResponse.json({
    status,
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
}