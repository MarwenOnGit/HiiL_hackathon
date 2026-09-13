import { NextRequest, NextResponse } from "next/server";
import sessionAuth from "@/lib/server/services/sessionAuth";
import db from "@/lib/server/db";
import { clearSessionCookie } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  const cookies = sessionAuth.parseCookies(req.headers.get("cookie") || "") as Record<string, string>;
  const token = cookies[sessionAuth.SESSION_COOKIE] || null;
  if (token) db.deleteSession(token);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}