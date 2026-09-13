// Put the staged scenario back exactly as authored. Clears the in-process
// overlay only — the fixture itself is code, so there is nothing to restore.
// Useful between two runs of the same demo.

import { NextRequest, NextResponse } from "next/server";
import demo from "@/lib/server/demo";
import db from "@/lib/server/db";

export async function POST(_req: NextRequest) {
  demo.reset();
  demo.ensureSeeded();
  // Consent is part of the staged scenario: clearing it puts the guest back in
  // front of the consent screen, which is where a demo needs to start.
  db.clearConsent(demo.CONTRACT_ID, "counterparty");
  db.clearConsent(demo.CONTRACT_ID, "owner");
  return NextResponse.json({
    ok: true,
    contract_id: demo.CONTRACT_ID,
    account: { email: demo.DEMO_USER.email },
    message: "scénario de démonstration réinitialisé"
  });
}
