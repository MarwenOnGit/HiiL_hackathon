import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = db.getContract(id);
  if (!contract) return NextResponse.json({ error: "contract not found" }, { status: 404 });
  const onchain = db.getOnchainRecord(contract.contract_id);
  return NextResponse.json({ contract, onchain });
}