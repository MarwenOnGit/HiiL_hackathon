// Consent to the thread being recorded, given by the party joining it.
//
// Recorded as a dated fact rather than a flag: this product's whole premise is
// that what happened is provable later, and "they agreed to this being stored"
// is exactly the kind of thing that has to survive the conversation.

import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";
import registry from "@/lib/server/services/contractsRegistry";
import threadAuth from "@/lib/server/services/threadAuth";
import { authFromRequest } from "@/lib/server/session";

// Bumping this invalidates prior consents and re-asks — the terms changed.
const CONSENT_VERSION = "2026-09-v1";

const REQUIRED = ["record", "share", "terms"];

function viewerOf(req: NextRequest, contractId: string, bodyToken?: string) {
  const auth = authFromRequest(req);
  if (auth && auth.kind === "msme" && registry.ownedBy(contractId, auth.user.user_id)) return "owner";
  if (auth && auth.kind === "guest" && auth.session.contract_id === contractId) return "counterparty";
  const token = bodyToken || req.nextUrl.searchParams.get("token") || "";
  if (threadAuth.canPost("counterparty", contractId, token || undefined, false)) return "counterparty";
  if (!registry.isOwned(contractId)) return "owner";
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  const party = viewerOf(req, contractId);
  if (!party) return NextResponse.json({ error: "not a participant" }, { status: 403 });

  const record = db.getConsent(contractId, party);
  const current = Boolean(record && record.version === CONSENT_VERSION);
  return NextResponse.json({ party, consented: current, version: CONSENT_VERSION, record: current ? record : null });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body -> {} */ }

  const party = viewerOf(req, contractId, body?.token);
  if (!party) return NextResponse.json({ error: "not a participant" }, { status: 403 });

  const scopes: string[] = Array.isArray(body.scopes) ? body.scopes : [];
  const missing = REQUIRED.filter((s) => !scopes.includes(s));
  if (missing.length) {
    return NextResponse.json(
      { error: "consentement incomplet", missing },
      { status: 400 }
    );
  }

  const record = {
    contract_id: contractId,
    party,
    scopes,
    optional_scopes: Array.isArray(body.optional_scopes) ? body.optional_scopes : [],
    version: CONSENT_VERSION,
    consented_at: new Date().toISOString()
  };
  db.saveConsent(contractId, party, record);
  return NextResponse.json({ ok: true, consented: true, record });
}
