// Server-side Google OAuth for the v3 UI — no SDK; raw HTTPS endpoints only,
// because a hackathon demo shouldn't depend on a package that isn't there yet
// (same logic as the "raw ethers" rule in the existing chainService).
//
// Credential-free mode: with GOOGLE_CLIENT_ID/SECRET unset, the app falls back
// to a clearly-labelled demo user so the whole flow demoes on venue wifi. That
// is a developer convenience, not a silent downgrade — /api/auth/me always
// reports the account's `is_demo` status.

const crypto = require("crypto");
const db = require("../db");
const { createSession, sessionCookieHeader } = require("./sessionAuth");

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

const states = new Map(); // state param -> { created_at } (in-memory CSRF guard)
const STATE_TTL_MS = 10 * 60 * 1000;

function hasCredentials() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// The redirect MUST match Google's registered callback exactly (by value), so
// it is built from PUBLIC_BASE_URL — the origin the demo snippet points at —
// and delivered same-origin so the browser never sees a different port.
function callbackUrl() {
  const base = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
  return `${base}/api/auth/callback`;
}

function newState(redirectPath) {
  const state = crypto.randomBytes(24).toString("hex");
  states.set(state, { redirect_path: redirectPath || "/dashboard", created_at: Date.now() });
  return state;
}

function consumeState(state) {
  const record = states.get(state);
  if (!record) return null;
  states.delete(state);
  if (Date.now() - record.created_at > STATE_TTL_MS) return null;
  return record.redirect_path;
}

function authUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account"
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: callbackUrl(),
    grant_type: "authorization_code"
  });
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`token exchange failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return response.json();
}

async function fetchProfile(accessToken) {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`userinfo failed (${response.status})`);
  return response.json();
}

// Upserts a user by google_sub, returns the user record.
function upsertUser(profile) {
  const existing = db.getUserByGoogleSub(profile.sub);
  if (existing) {
    existing.email = profile.email || existing.email;
    existing.name = profile.name || existing.name;
    existing.avatar = profile.picture || existing.avatar;
    return db.saveUser(existing);
  }
  const user = {
    user_id: `msme_${profile.sub}`,
    google_sub: profile.sub,
    email: profile.email || "",
    name: profile.name || "Google user",
    avatar: profile.picture || "",
    is_demo: false,
    created_at: new Date().toISOString()
  };
  return db.saveUser(user);
}

// Demo fallback account, clearly labelled. Panics safe: no real OAuth
// exchange anywhere.
function demoUser() {
  let existing = db.getUserByGoogleSub("demo@insaf.local");
  if (existing) return existing;
  const user = {
    user_id: "msme_demo",
    google_sub: "demo@insaf.local",
    email: "demo@insaf.local",
    name: "Demo Owner",
    avatar: "",
    is_demo: true,
    created_at: new Date().toISOString()
  };
  return db.saveUser(user);
}

function startSessionFor(user) {
  return createSession("msme", { user_id: user.user_id });
}

module.exports = {
  hasCredentials,
  callbackUrl,
  authUrl,
  newState,
  consumeState,
  exchangeCode,
  fetchProfile,
  upsertUser,
  demoUser,
  startSessionFor,
  sessionCookieHeader
};