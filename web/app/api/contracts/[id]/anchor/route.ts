import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";
import confirmationTokens from "@/lib/server/services/confirmationTokens";
import insaf from "@/lib/server/services/insaf";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = db.getContract(id);
  if (!contract) return NextResponse.json({ error: "contract not found" }, { status: 404 });
  if (db.getOnchainRecord(contract.contract_id)) {
    return NextResponse.json({ error: "already anchored", onchain: db.getOnchainRecord(contract.contract_id) }, { status: 409 });
  }

  const existing = confirmationTokens.findActiveByContract(contract.contract_id);
  const { token, otp_code, expires_at } = existing || confirmationTokens.createConfirmation(contract.contract_id);
  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const confirm_url = `${baseUrl}/invite?token=${token}`;

  return NextResponse.json({
    confirmation: { token, otp_code, expires_at, confirm_url },
    insaf: insaf.onConfirmationCreated()
  });
}