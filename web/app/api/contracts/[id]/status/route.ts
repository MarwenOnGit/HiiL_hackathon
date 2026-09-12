import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";
import { chainService } from "@/lib/server/chain";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = db.getContract(id);
  if (!contract) return NextResponse.json({ error: "contract not found" }, { status: 404 });
  const record = db.getOnchainRecord(contract.contract_id);
  if (!record) return NextResponse.json({ status: "not_anchored" });

  try {
    const executed = await chainService.isExecuted(record.agreement_onchain_id);
    return NextResponse.json({ status: executed ? "executed" : "pending", onchain: record });
  } catch (err) {
    return NextResponse.json({ status: record.executed ? "executed" : "pending", onchain: record });
  }
}