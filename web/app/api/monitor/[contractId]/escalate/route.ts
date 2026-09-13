// Open the amicable-resituation phase from inside the chat: anchored as
// DISPUTE_OPENED, proving a good-faith resolution was attempted before any
// further step. The opening message is shared identically by both parties.

import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";
import registry from "@/lib/server/services/contractsRegistry";
import threadAuth from "@/lib/server/services/threadAuth";
import { authFromRequest } from "@/lib/server/session";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://127.0.0.1:5001";

function isAuthenticatedOwner(req: NextRequest, auth: any, contractId: string): boolean {
  if (auth && auth.kind === "msme" && registry.ownedBy(contractId, auth.user.user_id)) {
    return true;
  }
  return !registry.isOwned(contractId);
}

function isConfirmedCounterparty(req: NextRequest, auth: any, contractId: string, bodyToken?: any): boolean {
  if (auth && auth.kind === "guest" && auth.session.contract_id === contractId) {
    return true;
  }
  const token = bodyToken || req.nextUrl.searchParams.get("token") || "";
  return threadAuth.canPost("counterparty", contractId, token || undefined, false);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  if (!(await registry.contractExecuted(contractId))) {
    return NextResponse.json({ error: "no active agreement for this contract" }, { status: 404 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body -> {} */ }
  const auth = authFromRequest(req);

  let participant: string;
  if (isAuthenticatedOwner(req, auth, contractId)) {
    participant = "owner";
  } else if (isConfirmedCounterparty(req, auth, contractId, body?.token)) {
    participant = "counterparty";
  } else {
    return NextResponse.json({ error: "not a participant in this thread" }, { status: 403 });
  }

  try {
    const response = await fetch(`${AGENT_URL}/contracts/${encodeURIComponent(contractId)}/escalate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-insaf-lang": req.headers.get("x-insaf-lang") || "fr" },
      body: JSON.stringify({ obligation_ids: Array.isArray(body.obligation_ids) ? body.obligation_ids : [], note: body.note || "" }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    if (data.line) {
      const message = {
        sender: "insaf",
        body: data.line,
        sent_at: new Date().toISOString(),
        reply_meta: {
          monitor: true,
          amicable: true,
          anchored: Boolean(data.anchored),
          rule_based: true,
          grounded: false,
          summoned_by: participant
        }
      };
      db.appendMessage(contractId, message);
      return NextResponse.json({ ...data, message }, { status: 200 });
    }
    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error("[monitor/escalate]", err.message);
    return NextResponse.json({ error: "the agent service is unreachable", detail: err.message }, { status: 503 });
  }
}