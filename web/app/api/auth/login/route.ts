import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/server/db";
import passwords from "@/lib/server/services/passwords";
import { createSession } from "@/lib/server/services/sessionAuth";
import { setSessionCookie } from "@/lib/server/session";

function sanitize(user: any) {
  return {
    user_id: user.user_id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    is_demo: Boolean(user.is_demo)
  };
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body -> {} */ }
  const { email, password } = body;
  const normalized = String(email || "").trim().toLowerCase();
  const user = db.getUserByEmail(normalized);
  if (!user || !passwords.verify(password || "", user.password_hash)) {
    return NextResponse.json({ error: "invalid email or password" }, { status: 401 });
  }

  const session = createSession("msme", { user_id: user.user_id });
  const res = NextResponse.json({ user: sanitize(user) });
  setSessionCookie(res, session);
  return res;
}