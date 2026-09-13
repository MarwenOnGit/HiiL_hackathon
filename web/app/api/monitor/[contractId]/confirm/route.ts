// A party confirms a milestone from inside the chat. The agent transitions the
// obligation's state and anchors the confirmation (performed / breached) or
// timestamps it (not_yet); the neutral confirmation line is then appended into
// the thread as an Insaf message so both parties share the same ledger.

import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";
import registry from "@/lib/server/services/contractsRegistry";
import threadAuth from "@/lib/server/services/threadAuth";
import { authFromRequest } from "@/lib/server/session";
import demo from "@/lib/server/demo";

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

  const { obligation_id, outcome } = body;
  if (!obligation_id || !["performed", "not_yet", "breached"].includes(outcome)) {
    return NextResponse.json({ error: "obligation_id and a valid outcome are required" }, { status: 400 });
  }

  // Staged demo: the confirmation lands in the in-process overlay, so the
  // scenario resets cleanly instead of accumulating across demos.
  if (demo.isDemoContract(contractId)) {
    const label = participant === "owner"
      ? demo.scenario.LABELS.p_buyer
      : demo.scenario.LABELS.p_supplier;
    const result = demo.confirmObligation(obligation_id, outcome, label);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, message: result.message, state: result.state, anchored: true });
  }

  try {
    const response = await fetch(
      `${AGENT_URL}/contracts/${encodeURIComponent(contractId)}/obligations/${encodeURIComponent(obligation_id)}/confirm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-insaf-lang": req.headers.get("x-insaf-lang") || "fr" },
        body: JSON.stringify({ outcome, party_id: participant === "owner" ? "p_buyer" : "p_supplier", note: body.note || "" }),
        signal: AbortSignal.timeout(15000)
      }
    );
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
          confirmation_for: data.obligation_id,
          outcome: data.outcome,
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
    console.error("[monitor/confirm]", err.message);
    return NextResponse.json({ error: "the agent service is unreachable", detail: err.message }, { status: 503 });
  }
}