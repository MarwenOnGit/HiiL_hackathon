// Agent 2's surface: the shared fact ledger, the shared BATNA, the settlement
// options, and the responses parties give to them.
//
// Both parties read the SAME payload. There is no viewer-dependent field in the
// response, by design — a figure that changed depending on who asked would
// break the neutrality the product is built on. `viewer` is echoed back only so
// the UI knows which "accept" button belongs to the reader.

import { NextRequest, NextResponse } from "next/server";
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

function viewerOf(req: NextRequest, contractId: string, bodyToken?: any): "owner" | "counterparty" | null {
  const auth = authFromRequest(req);
  if (isAuthenticatedOwner(req, auth, contractId)) return "owner";
  if (isConfirmedCounterparty(req, auth, contractId, bodyToken)) return "counterparty";
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  if (!(await registry.contractExecuted(contractId))) {
    return NextResponse.json({ error: "no active agreement for this contract" }, { status: 404 });
  }
  const viewer = viewerOf(req, contractId);
  if (!viewer) {
    return NextResponse.json({ error: "not a participant in this dispute" }, { status: 403 });
  }

  if (demo.isDemoContract(contractId)) {
    return NextResponse.json({ ...demo.disputeReport(), viewer });
  }

  // Live contracts go to the agent's resolver. A dispute has to be opened with
  // statements before there is anything to read, so "none yet" is a normal
  // answer here, not an error.
  try {
    const response = await fetch(`${AGENT_URL}/contracts/${encodeURIComponent(contractId)}/dispute`, {
      headers: { "x-insaf-lang": req.headers.get("x-insaf-lang") || "fr" },
      signal: AbortSignal.timeout(10000)
    });
    const text = await response.text();
    let data: any;
    try { data = text ? JSON.parse(text) : {}; } catch {
      data = { error: "the agent returned a non-JSON response", detail: text.slice(0, 400) };
    }
    if (response.status === 404) {
      return NextResponse.json({ status: "none", viewer }, { status: 200 });
    }
    return NextResponse.json({ ...data, viewer }, { status: response.ok ? 200 : response.status });
  } catch (err: any) {
    console.error("[disputes]", err.message);
    return NextResponse.json(
      { error: "the agent service is unreachable", detail: err.message },
      { status: 503 }
    );
  }
}

// Respond to a settlement option. Accepting is a human act and is recorded as
// one — the system never infers consent, and an option only becomes an
// agreement when BOTH parties have accepted it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  if (!(await registry.contractExecuted(contractId))) {
    return NextResponse.json({ error: "no active agreement for this contract" }, { status: 404 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body -> {} */ }

  const viewer = viewerOf(req, contractId, body?.token);
  if (!viewer) {
    return NextResponse.json({ error: "not a participant in this dispute" }, { status: 403 });
  }

  const { option_id, response } = body;
  if (!option_id || !["accepted", "declined"].includes(response)) {
    return NextResponse.json(
      { error: "option_id and a response of accepted or declined are required" },
      { status: 400 }
    );
  }

  if (!demo.isDemoContract(contractId)) {
    return NextResponse.json(
      { error: "settlement responses are only staged for the demo contract" },
      { status: 501 }
    );
  }

  const partyId = viewer === "owner" ? "p_buyer" : "p_supplier";
  const label = viewer === "owner"
    ? demo.scenario.LABELS.p_buyer
    : demo.scenario.LABELS.p_supplier;

  const result = demo.respondToOption(option_id, partyId, response, label);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    ok: true,
    settled: result.settled,
    message: result.message,
    dispute: demo.disputeReport()
  });
}
