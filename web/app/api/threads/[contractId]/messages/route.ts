// Per-agreement discussion threads (mirrors backend/src/routes/threads.js).
// Only for agreements already executed; owner by ownership, counterparty by
// confirmed token. Messages are off-chain content — nothing here touches the
// chain directly.

import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";
import registry from "@/lib/server/services/contractsRegistry";
import threadAuth from "@/lib/server/services/threadAuth";
import { authFromRequest } from "@/lib/server/session";

async function isExecuted(contractId: string): Promise<boolean> {
  return registry.contractExecuted(contractId);
}

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

function participantLabels(contractId: string) {
  const wizard = db.getContract(contractId);
  if (wizard) {
    const rel = db.getRelationship(wizard.relationship_id);
    return {
      owner: rel ? rel.parties.msme_owner.name : "MSME owner",
      counterparty: rel ? rel.parties.counterparty.name : "Counterparty"
    };
  }
  return { owner: "MSME owner", counterparty: "Counterparty" };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  if (!(await isExecuted(contractId))) {
    return NextResponse.json({ error: "no active agreement for this contract" }, { status: 404 });
  }
  const auth = authFromRequest(req);
  const viewer = isAuthenticatedOwner(req, auth, contractId)
    ? "owner"
    : isConfirmedCounterparty(req, auth, contractId)
      ? "counterparty"
      : null;
  return NextResponse.json({
    messages: db.getMessages(contractId),
    participants: participantLabels(contractId),
    viewer
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  if (!(await isExecuted(contractId))) {
    return NextResponse.json({ error: "no active agreement for this contract" }, { status: 404 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body -> {} */ }
  const { sender, body: messageBody } = body;
  const auth = authFromRequest(req);

  if (sender === "insaf") {
    return NextResponse.json({ error: "insaf messages are posted by the assistant route only" }, { status: 403 });
  }
  if (!threadAuth.isValidSender(sender)) {
    return NextResponse.json({ error: "sender must be owner or counterparty" }, { status: 400 });
  }
  if (!threadAuth.isValidBody(messageBody)) {
    return NextResponse.json({ error: "message body invalid" }, { status: 400 });
  }

  let allowed: boolean;
  if (sender === "owner") {
    allowed = isAuthenticatedOwner(req, auth, contractId);
  } else {
    allowed = isConfirmedCounterparty(req, auth, contractId, body?.token);
  }
  if (!allowed) {
    return NextResponse.json({ error: "not authorized to post to this thread" }, { status: 403 });
  }

  const message = { sender, body: messageBody.trim(), sent_at: new Date().toISOString() };
  db.appendMessage(contractId, message);
  return NextResponse.json({ message }, { status: 201 });
}