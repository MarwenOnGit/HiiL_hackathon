import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";
import { generateContract } from "@/lib/server/services/contractGenerator";
import insaf from "@/lib/server/services/insaf";
import { authFromRequest } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body -> {} */ }
  const { relationship_id } = body;
  const relationship = db.getRelationship(relationship_id);
  if (!relationship) return NextResponse.json({ error: "relationship not found — call /api/relationships/demo first" }, { status: 404 });

  const contract = generateContract(relationship);
  db.saveContract(contract);
  const auth = authFromRequest(req);
  if (auth && auth.kind === "msme") {
    db.saveContractOwner(contract.contract_id, auth.user.user_id, "wizard");
  }
  return NextResponse.json({ contract, insaf: insaf.onGenerated() });
}