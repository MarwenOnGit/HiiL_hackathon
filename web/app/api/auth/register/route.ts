import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import db from "@/lib/server/db";
import passwords from "@/lib/server/services/passwords";
import { createSession } from "@/lib/server/services/sessionAuth";
import { setSessionCookie } from "@/lib/server/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

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
  const { email, password, name } = body;
  const normalized = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    return NextResponse.json({ error: "a valid email address is required" }, { status: 400 });
  }
  if (!password || String(password).length < MIN_PASSWORD) {
    return NextResponse.json({ error: `password must be at least ${MIN_PASSWORD} characters` }, { status: 400 });
  }
  if (db.getUserByEmail(normalized)) {
    return NextResponse.json({ error: "an account with this email already exists", hint: "sign in instead" }, { status: 409 });
  }

  const user = {
    user_id: `msme_${crypto.randomBytes(6).toString("hex")}`,
    email: normalized,
    name: String(name || "").trim().slice(0, 80) || "MSME owner",
    avatar: "",
    is_demo: false,
    password_hash: passwords.hash(password),
    created_at: new Date().toISOString()
  };
  db.saveUser(user);

  const session = createSession("msme", { user_id: user.user_id });
  const res = NextResponse.json({ user: sanitize(user) }, { status: 201 });
  setSessionCookie(res, session);
  return res;
}