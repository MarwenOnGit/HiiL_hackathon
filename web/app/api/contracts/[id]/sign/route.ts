import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";
import { chainService } from "@/lib/server/chain";
import insaf from "@/lib/server/services/insaf";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = db.getContract(id);
  if (!contract) return NextResponse.json({ error: "contract not found" }, { status: 404 });
  const record = db.getOnchainRecord(contract.contract_id);
  if (!record) return NextResponse.json({ error: "not anchored yet — call /anchor first" }, { status: 400 });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body -> {} */ }
  const role = body.role || "partyA";
  if (!["partyA", "partyB"].includes(role)) return NextResponse.json({ error: "role must be partyA or partyB" }, { status: 400 });

  try {
    const result = await chainService.sign({ agreementId: record.agreement_onchain_id, signerRole: role });
    if (role === "partyA") record.signed_a = true;
    else record.signed_b = true;
    record.executed = result.executed;
    record.last_tx_hash = result.txHash;
    db.saveOnchainRecord(contract.contract_id, record);
    return NextResponse.json({ onchain: record, insaf: insaf.onSigned(role, result.executed) });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "signing failed", detail: err.message }, { status: 500 });
  }
}