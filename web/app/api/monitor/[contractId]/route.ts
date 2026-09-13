// The dispute-prevention monitor: exposes the agent's monitoring plan to the
// thread page and, when a milestone is due soon, posts the neutral check-in
// question into the thread as an Insaf message (idempotently — one per
// obligation, never repeated on refresh).
//
// Only participants can read it, and it only exists for agreements already
// executed (hardened + invited counterparty), same gate as the thread.

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  if (!(await registry.contractExecuted(contractId))) {
    return NextResponse.json({ error: "no active agreement for this contract" }, { status: 404 });
  }
  const auth = authFromRequest(req);
  const participant = isAuthenticatedOwner(req, auth, contractId)
    ? "owner"
    : isConfirmedCounterparty(req, auth, contractId)
      ? "counterparty"
      : null;
  if (!participant) {
    return NextResponse.json({ error: "not a participant in this thread" }, { status: 403 });
  }

  // Staged demo: milestones come from the fixture, not the agent.
  if (demo.isDemoContract(contractId)) {
    return NextResponse.json(demo.monitoring());
  }

  let result;
  try {
    const response = await fetch(`${AGENT_URL}/contracts/${encodeURIComponent(contractId)}/monitor`, {
      headers: req.headers,
      signal: AbortSignal.timeout(10000)
    });
    result = await response.json();
    if (!response.ok) {
      return NextResponse.json(result, { status: response.status });
    }
  } catch (err: any) {
    console.error("[monitor]", err.message);
    return NextResponse.json({ error: "the agent service is unreachable", detail: err.message }, { status: 503 });
  }

  const posted = postIdempotentCheckIns(contractId, result);
  return NextResponse.json({ ...result, check_ins_posted: posted });
}

function postIdempotentCheckIns(contractId: string, monitoring: any): string[] {
  if (!monitoring?.active || !Array.isArray(monitoring.milestones)) return [];
  const existing = db.getMessages(contractId);
  // Keyed by obligation AND alert level, not by obligation alone. Asking once
  // per obligation meant the thread warned "due in 3 days" and then went quiet
  // forever — the deadline could pass and the "it is overdue, did it arrive?"
  // question was never put to anyone. Existing messages already carry `alert`,
  // so this reads old threads correctly without a migration.
  const key = (obligationId: string, alert: string | null | undefined) =>
    `${obligationId}:${alert ?? ""}`;
  const already = new Set(
    existing
      .filter((m: any) => m.sender === "insaf" && m.reply_meta?.monitor && m.reply_meta?.checkin_for)
      .map((m: any) => key(m.reply_meta.checkin_for, m.reply_meta.alert))
  );
  const posted: string[] = [];
  for (const ms of monitoring.milestones) {
    if (!ms.check_in || !ms.obligation_id || already.has(key(ms.obligation_id, ms.alert))) continue;
    const message = {
      sender: "insaf",
      body: ms.check_in,
      sent_at: new Date().toISOString(),
      reply_meta: {
        monitor: true,
        checkin_for: ms.obligation_id,
        kind: ms.kind,
        alert: ms.alert,
        rule_based: true,
        grounded: false,
        summoned_by: "Insaf"
      }
    };
    db.appendMessage(contractId, message);
    posted.push(ms.obligation_id);
  }
  return posted;
}