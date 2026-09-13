// Proxy to the Python agent service (ARCHITECTURE.md Section 3 — "the seam"),
// App Router catch-all proxy to the Python agent service on :5001.
// Every call crosses a process boundary to a service that can be slow,
// restarting, or absent; each request carries a timeout and a graceful JSON
// failure path — never a hung request, never a stack trace.

import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";
import registry from "@/lib/server/services/contractsRegistry";
import { authFromRequest } from "@/lib/server/session";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://127.0.0.1:5001";
const TIMEOUTS = { harden: 30000, default: 10000, health: 3000 };

function unavailable(err: any, hint?: string) {
  console.error("[agent]", err.message);
  const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
  return NextResponse.json(
    {
      error: timedOut ? "the agent service timed out" : "the agent service is unreachable",
      detail: err.message,
      hint: hint || `Is it running? Expected at ${AGENT_URL}. Start it with ./start.sh, or run the demo without analysis.`,
      agent_available: false
    },
    { status: 503 }
  );
}

async function callAgent(
  path: string,
  opts: { method?: string; body?: any; headers?: any; timeout?: number } = {}
) {
  const response = await fetch(`${AGENT_URL}${path}`, {
    method: opts.method || "GET",
    body: opts.body,
    headers: opts.headers,
    signal: AbortSignal.timeout(opts.timeout || TIMEOUTS.default)
  });
  const text = await response.text();
  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (e) {
    parsed = { error: "agent returned a non-JSON response", detail: text.slice(0, 400) };
  }
  return { ok: response.ok, status: response.status, body: parsed };
}

// Narrow passthrough table — only these prefixes are forwarded, so the proxy
// can never become an open relay into the agent service.
function forwardTarget(method: string, path: string[]): string | null {
  const m = path[0];
  const rest = path.slice(1);
  if (rest.length === 0) {
    if (method === "GET" && m === "contracts") return "/contracts";
    if (method === "POST" && m === "ask") return "/ask";
    if (method === "POST" && m === "disputes") return "/disputes";
    return null;
  }
  if (rest.length === 1) {
    if (method === "POST" && m === "contracts") {
      if (rest[0] === "build") return "/contracts/build";
      return `/contracts/${rest[0]}/accept`;
    }
    if (method === "GET" && m === "contracts") return `/contracts/${rest[0]}`;
    return null;
  }
  if (m === "contracts" && rest[1] === "history") return `/contracts/${rest[0]}/history`;
  if (m === "contracts" && rest[1] === "verify") return `/contracts/${rest[0]}/verify`;
  if (m === "contracts" && rest[1] === "sign" && method === "POST") return `/contracts/${rest[0]}/sign`;
  if (m === "contracts" && rest[1] === "accept" && method === "POST") return `/contracts/${rest[0]}/accept`;
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;

  if (path.length === 1 && path[0] === "health") {
    try {
      const { body } = await callAgent("/health", { timeout: TIMEOUTS.health });
      return NextResponse.json({ agent_available: true, ...body });
    } catch (err: any) {
      return NextResponse.json({
        agent_available: false,
        corpus_size: 0,
        grounding_available: false,
        detail: err.message
      });
    }
  }

  const target = forwardTarget("GET", path);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const { ok, status, body } = await callAgent(target);
    return NextResponse.json(body, { status: ok ? 200 : status });
  } catch (err: any) {
    return unavailable(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;

  if (path.length === 1 && path[0] === "harden") {
    try {
      const formData = await req.formData();
      const file = formData.get("file");
      const text = formData.get("text");

      const form = new FormData();
      if (file && typeof file === "object" && "size" in file) {
        if (file.size > 8 * 1024 * 1024) {
          return NextResponse.json({ error: "file too large — 8MB limit" }, { status: 413 });
        }
        form.append("file", new Blob([await file.arrayBuffer()]), file.name || "contract.txt");
      } else if (text) {
        form.append("text", String(text));
      } else {
        return NextResponse.json({ error: "upload a file or post text" }, { status: 400 });
      }
      form.append("contract_id", (formData.get("contract_id") as string) || `contract_${Date.now()}`);
      form.append("profile", (formData.get("profile") as string) || "supply");

      const { ok, status, body } = await callAgent("/harden", {
        method: "POST",
        body: form,
        timeout: TIMEOUTS.harden
      });
      const auth = authFromRequest(req);
      if (ok && auth && auth.kind === "msme") {
        db.saveContractOwner(body.contract_id, auth.user.user_id, "hardened");
        registry.clearAgentListCache();
      }
      return NextResponse.json(body, { status: ok ? 200 : status });
    } catch (err: any) {
      return unavailable(err);
    }
  }

  const target = forwardTarget("POST", path);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body -> {} */ }
  try {
    const { ok, status: bodyStatus, body: agentBody } = await callAgent(target, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });
    // A build creates a contract in the agent store owned by whoever built it,
    // exactly like the /harden upload path does further up.
    if (ok && path[0] === "contracts" && path[1] === "build") {
      const auth = authFromRequest(req);
      if (auth && auth.kind === "msme" && agentBody?.report?.contract_id) {
        db.saveContractOwner(agentBody.report.contract_id, auth.user.user_id, "hardened");
        registry.clearAgentListCache();
      }
    }
    return NextResponse.json(agentBody, { status: ok ? 200 : bodyStatus });
  } catch (err: any) {
    return unavailable(err);
  }
}