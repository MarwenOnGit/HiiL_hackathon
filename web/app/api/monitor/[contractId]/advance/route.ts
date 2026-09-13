// Demo-only time machine: "Simuler +4 jours" shifts the agent's monitoring
// *view* forward so the check-in flow can be demonstrated. Owner-only, and it
// never writes version history or the chain — an offset is not an event.

import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";
import registry from "@/lib/server/services/contractsRegistry";
import { authFromRequest } from "@/lib/server/session";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://127.0.0.1:5001";

function isAuthenticatedOwner(req: NextRequest, auth: any, contractId: string): boolean {
  if (auth && auth.kind === "msme" && registry.ownedBy(contractId, auth.user.user_id)) {
    return true;
  }
  return !registry.isOwned(contractId);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  if (!(await registry.contractExecuted(contractId))) {
    return NextResponse.json({ error: "no active agreement for this contract" }, { status: 404 });
  }
  const auth = authFromRequest(req);
  if (!isAuthenticatedOwner(req, auth, contractId)) {
    return NextResponse.json({ error: "only the owner can advance the demo clock" }, { status: 403 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body -> {} */ }
  const days = Number.isFinite(Number(body?.days)) ? Number(body.days) : 1;

  try {
    const response = await fetch(`${AGENT_URL}/admin/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract_id: contractId, days }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.ok ? 200 : response.status });
  } catch (err: any) {
    console.error("[monitor/advance]", err.message);
    return NextResponse.json({ error: "the agent service is unreachable", detail: err.message }, { status: 503 });
  }
}