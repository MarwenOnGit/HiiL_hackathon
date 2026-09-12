import { NextRequest, NextResponse } from "next/server";
import registry from "@/lib/server/services/contractsRegistry";
import { chainService } from "@/lib/server/chain";
import { authFromRequest, msmeRequiredResponse } from "@/lib/server/session";

export async function GET(req: NextRequest) {
  const auth = authFromRequest(req);
  if (!auth || auth.kind !== "msme") return msmeRequiredResponse();
  const rows = await registry.listMine(auth.user.user_id);
  return NextResponse.json({ rows, chain_mode: chainService.mode });
}