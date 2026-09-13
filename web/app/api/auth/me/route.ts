import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";
import { authFromRequest } from "@/lib/server/session";

function sanitize(user: any) {
  return {
    user_id: user.user_id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    is_demo: Boolean(user.is_demo)
  };
}

export async function GET(req: NextRequest) {
  const auth = authFromRequest(req);
  if (!auth) {
    return NextResponse.json({ authenticated: false });
  }
  if (auth.kind === "msme") {
    const owned = db.listContractsOwnedBy(auth.user.user_id);
    const threads = owned.filter((o: any) => db.getMessages(o.contract_id).length > 0);
    return NextResponse.json({
      authenticated: true,
      kind: "msme",
      user: sanitize(auth.user),
      summary: { contracts_count: owned.length, threads_count: threads.length }
    });
  }
  // No longer minted, but harmless to resolve any that predate this change.
  const record = db.getConfirmation(auth.session.confirmation_token);
  return NextResponse.json({
    authenticated: true,
    kind: "guest",
    guest: {
      contract_id: auth.session.contract_id,
      display_name: auth.session.display_name || (record ? record.guest_display_name : null)
    }
  });
}