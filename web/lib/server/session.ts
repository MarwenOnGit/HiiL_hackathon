// Session resolution for Next route handlers — the App-Router replacement for
// Express's sessionMiddleware. Replicates its exact semantics: parse the
// insaf_session cookie, look the session up, honour expiry, resolve MSME users
// by id. Never rejects a request on its own — handlers decide via requireMsme.

import { NextRequest, NextResponse } from "next/server";
import sessionAuth from "@/lib/server/services/sessionAuth";
import db from "@/lib/server/db";

type Auth =
  | { kind: "msme"; user: any; session: any }
  | { kind: "guest"; session: any }
  | null;

export function authFromRequest(req: NextRequest): Auth {
  const cookies = sessionAuth.parseCookies(req.headers.get("cookie") || "") as Record<string, string>;
  const token = cookies[sessionAuth.SESSION_COOKIE];
  const session = token ? db.getSession(token) : null;
  if (!session || Date.parse(session.expires_at) <= Date.now()) return null;
  if (session.kind === "msme") {
    const user = db.getUserById(session.user_id);
    return user ? { kind: "msme", user, session } : null;
  }
  return { kind: "guest", session };
}

export function requireMsme(auth: Auth) {
  return auth && auth.kind === "msme" ? auth : null;
}

export function msmeRequiredResponse() {
  return NextResponse.json(
    { error: "authentication required", hint: "sign in with Google first" },
    { status: 401 }
  );
}

export function setSessionCookie(res: NextResponse, session: any) {
  res.headers.set("Set-Cookie", sessionAuth.sessionCookieHeader(session));
}

export function clearSessionCookie(res: NextResponse) {
  res.headers.set("Set-Cookie", sessionAuth.clearCookieHeader());
}