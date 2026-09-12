// Session endpoints for the v3 UI: email + password as the MSME sign-in
// (register / login), a clearly-labelled demo fallback, and /me + /logout so
// the frontend (and its route guards) always know who is signed in.
// Counterparties never pass through here — an invitation token in the thread
// link is their identity (see /api/invites and /api/threads).

const crypto = require("crypto");
const express = require("express");
const db = require("../db");
const passwords = require("../services/passwords");
const oauth = require("../services/googleOAuth");
const {
  createSession,
  sessionCookieHeader,
  clearCookieHeader
} = require("../services/sessionAuth");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function sanitize(user) {
  return {
    user_id: user.user_id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    is_demo: Boolean(user.is_demo)
  };
}

router.post("/register", (req, res) => {
  const { email, password, name } = req.body || {};
  const normalized = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    return res.status(400).json({ error: "a valid email address is required" });
  }
  if (!password || String(password).length < MIN_PASSWORD) {
    return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD} characters` });
  }
  if (db.getUserByEmail(normalized)) {
    return res.status(409).json({ error: "an account with this email already exists", hint: "sign in instead" });
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
  res.setHeader("Set-Cookie", sessionCookieHeader(session));
  res.status(201).json({ user: sanitize(user) });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  const normalized = String(email || "").trim().toLowerCase();
  const user = db.getUserByEmail(normalized);
  // Same error for unknown email and wrong password — no account enumeration.
  if (!user || !passwords.verify(password || "", user.password_hash)) {
    return res.status(401).json({ error: "invalid email or password" });
  }

  const session = createSession("msme", { user_id: user.user_id });
  res.setHeader("Set-Cookie", sessionCookieHeader(session));
  res.json({ user: sanitize(user) });
});

router.post("/demo", (req, res) => {
  const user = oauth.demoUser();
  const session = oauth.startSessionFor(user);
  res.setHeader("Set-Cookie", sessionCookieHeader(session));
  res.json({ user: sanitize(user), note: "demo account — seeded data only" });
});

router.get("/me", (req, res) => {
  if (!req.auth) {
    return res.json({ authenticated: false });
  }
  if (req.auth.kind === "msme") {
    const owned = require("../db").listContractsOwnedBy(req.auth.user.user_id);
    const threads = owned.filter((o) => require("../db").getMessages(o.contract_id).length > 0);
    return res.json({
      authenticated: true,
      kind: "msme",
      user: sanitize(req.auth.user),
      summary: { contracts_count: owned.length, threads_count: threads.length }
    });
  }
  // No longer minted, but harmless to resolve any that predate this change.
  const record = require("../db").getConfirmation(req.auth.session.confirmation_token);
  return res.json({
    authenticated: true,
    kind: "guest",
    guest: {
      contract_id: req.auth.session.contract_id,
      display_name: req.auth.session.display_name || (record ? record.guest_display_name : null)
    }
  });
});

router.post("/logout", (req, res) => {
  const { SESSION_COOKIE, parseCookies } = require("../services/sessionAuth");
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
  if (token) require("../db").deleteSession(token);
  res.setHeader("Set-Cookie", clearCookieHeader());
  res.json({ ok: true });
});

module.exports = router;