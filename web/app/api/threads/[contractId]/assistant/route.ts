// "Call Insaf into the chat": proxies to the agent service and writes the
// neutral, grounded reply INTO the thread so both parties see the same answer.
// Only this route can append sender="insaf" messages.

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

function renderCitations(reply: any) {
  const citations = reply.citations || [];
  const note = reply.no_legal_basis_note || "";
  let text = reply.answer || "";
  if (citations.length) {
    text += "\n\nSources retrieved:";
    for (const c of citations) {
      text += `\n- ${c.source_doc} ${c.article_ref} (${c.mode})`;
    }
  }
  if (note) text += `\n\n${note}`;
  return text;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  const executed = await registry.contractExecuted(contractId);
  if (!executed) {
    return NextResponse.json({ error: "no active agreement for this contract" }, { status: 404 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body -> {} */ }
  const question = body.question || "";
  const auth = authFromRequest(req);

  let participant: string;
  if (isAuthenticatedOwner(req, auth, contractId)) {
    participant = "owner";
  } else if (isConfirmedCounterparty(req, auth, contractId, body?.token)) {
    participant = "counterparty";
  } else {
    return NextResponse.json({ error: "not a participant in this thread" }, { status: 403 });
  }
  if (!threadAuth.isValidBody(question)) {
    return NextResponse.json({ error: "question body invalid" }, { status: 400 });
  }

  try {
    const response = await fetch(`${AGENT_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract_id: contractId, question: question.trim() }),
      signal: AbortSignal.timeout(20000)
    });
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data.detail || data.error || "assistant failed" }, { status: response.status });
    }
    const reply = data.reply || {};
    const withCitations = renderCitations(reply);
    const message = {
      sender: "insaf",
      body: withCitations,
      sent_at: new Date().toISOString(),
      reply_meta: {
        summoned_by: participant,
        rule_based: Boolean(reply.rule_based),
        grounded: Boolean(reply.grounded_legal)
      }
    };
    db.appendMessage(contractId, message);
    return NextResponse.json({ message, reply }, { status: 201 });
  } catch (err: any) {
    console.error("[assistant]", err.message);
    return NextResponse.json({ error: "the agent service is unreachable", detail: err.message }, { status: 503 });
  }
}