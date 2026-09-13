// Session-based auth for the v3 UI. This app is the single owner of
// identity: MSME users authenticate through Google OAuth, guests through the
// confirmation token that already confirmed their one contract. All of it is
// packaged as one opaque httpOnly cookie; the Next frontend never sees (or
// needs) the token itself.
//
// Mounted as app-level middleware that only *parses* the cookie and hangs
// `req.auth` on the request — it never rejects a request. Individual routes
// that need a real identity call requireMsme/requireGuest/requireParticipant.

const crypto = require("crypto");
const db = require("../db");

const SESSION_COOKIE = "insaf_session";
const MSME_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const GUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch (err) {
      out[key] = value;
    }
  }
  return out;
}

function newSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Record shape for a session.
//  MSME: { token, kind: "msme", user_id, created_at, expires_at }
//  GUEST: { token, kind: "guest", contract_id, confirmation_token,
//           display_name, created_at, expires_at }
function createSession(kind, payload) {
  const token = newSessionToken();
  const now = Date.now();
  const ttl = kind === "msme" ? MSME_TTL_MS : GUEST_TTL_MS;
  const session = {
    token,
    kind,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttl).toISOString(),
    ...payload
  };
  db.saveSession(session);
  return session;
}

function sessionCookieHeader(session, options = {}) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(session.token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/"
  ];
  if (!options.noExpiry) {
    parts.push(`Max-Age=${Math.round((Date.parse(session.expires_at) - Date.now()) / 1000)}`);
  }
  return parts.join("; ");
}

function clearCookieHeader() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

// Applies the current session (if any) as req.auth. Never fails the request —
// anonymous callers just get req.auth = null.
function sessionMiddleware(req, res, next) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const session = token ? db.getSession(token) : null;
  if (session && Date.parse(session.expires_at) > Date.now()) {
    if (session.kind === "msme") {
      const user = db.getUserById(session.user_id);
      req.auth = user
        ? { kind: "msme", user, session }
        : null;
    } else if (session.kind === "guest") {
      req.auth = { kind: "guest", session };
    }
  }
  next();
}

function requireMsme(req, res, next) {
  if (!req.auth || req.auth.kind !== "msme") {
    return res.status(401).json({ error: "authentication required", hint: "sign in with Google first" });
  }
  next();
}

module.exports = {
  SESSION_COOKIE,
  parseCookies,
  newSessionToken,
  createSession,
  sessionCookieHeader,
  clearCookieHeader,
  sessionMiddleware,
  requireMsme
};