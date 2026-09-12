import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";
import registry from "@/lib/server/services/contractsRegistry";

export async function GET(req: NextRequest, { params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  const executed = await registry.contractExecuted(contractId);
  if (!executed) {
    return NextResponse.json({ error: "no active agreement for this contract" }, { status: 404 });
  }
  const messages = db.getMessages(contractId);
  const since = req.nextUrl.searchParams.get("since");
  if (!since) return NextResponse.json({ count: messages.length });

  const sinceMs = Date.parse(since);
  if (Number.isNaN(sinceMs)) {
    return NextResponse.json({ error: "since must be an ISO 8601 timestamp" }, { status: 400 });
  }
  const count = messages.filter((m: any) => Date.parse(m.sent_at) > sinceMs).length;
  return NextResponse.json({ count });
}