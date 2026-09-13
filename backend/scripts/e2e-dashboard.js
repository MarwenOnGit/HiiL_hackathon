// End-to-end smoke test for the v3 dashboard path, run against a live stack:
//   ./start.sh           (chain + backend :4000 + dashboard :3000)
//   node scripts/e2e-dashboard.js
// Covers: register + login (email/password) via the Next rewrite -> wizard
// generate -> invite minted (token + OTP) -> guest code-gated accept (chain
// agreement executed) -> both parties post to the shared thread (guest posts
// identified ONLY by the token in the request) -> access control + assistant
// degradation.

const BASE = process.env.DASHBOARD_URL || "http://localhost:3000";

let failures = 0;
function check(name, cond, extra) {
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}

async function api_raw(path, { cookie, method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { cookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual"
  });
  const setCookie = res.headers.get("set-cookie");
  return {
    status: res.status,
    setCookie: setCookie ? setCookie.split(";")[0] : null,
    body: await res.json().catch(() => ({}))
  };
}

async function main() {
  // 1. anonymous /auth/me
  let r = await api_raw("/api/auth/me");
  check("anonymous has no session", r.body.authenticated === false);

  // 2. register an MSME owner by email + password
  const email = `owner${Date.now()}@insaf.local`;
  const password = "correct-horse-42";
  r = await api_raw("/api/auth/register", { method: "POST", body: { email, password, name: "Ines Trabelsi" } });
  const ownerJar = r.setCookie;
  check("register returns a session cookie", Boolean(ownerJar) && r.body.user && r.body.user.email === email);
  check("registered user is an msme", r.body.user.is_demo === false);

  // 3. a second login with the same credentials works
  r = await api_raw("/api/auth/login", { method: "POST", body: { email, password } });
  check("login with password works", r.status === 200 && Boolean(r.setCookie));

  // 4. wrong password rejected
  r = await api_raw("/api/auth/login", { method: "POST", body: { email, password: "wrong-password" } });
  check("wrong password rejected", r.status === 401);

  // 5. duplicate registration rejected
  r = await api_raw("/api/auth/register", { method: "POST", body: { email, password, name: "Cloner" } });
  check("duplicate registration rejected", r.status === 409);

  // 6. me resolves the owner identity
  r = await api_raw("/api/auth/me", { cookie: ownerJar });
  check("me resolves the owner", r.body.authenticated && r.body.kind === "msme");

  // 7. generate a wizard contract as the owner
  await api_raw("/api/relationships/demo", { method: "POST", cookie: ownerJar });
  r = await api_raw("/api/contracts/generate", { cookie: ownerJar, method: "POST", body: { relationship_id: "rel_demo_001" } });
  const contractId = r.body.contract && r.body.contract.contract_id;
  check("contract generated", Boolean(contractId), contractId);

  // 8. owner dashboard shows it
  r = await api_raw("/api/dashboard/mine", { cookie: ownerJar });
  const row = r.body.rows && r.body.rows.find((x) => x.contract_id === contractId);
  check("dashboard lists owned contract", Boolean(row) && row.source === "wizard" && row.signed === false);

  // 9. invite minted — token AND the one-time confirmation code
  r = await api_raw(`/api/invites/${contractId}`, { cookie: ownerJar, method: "POST" });
  const token = r.body.invite && r.body.invite.token;
  const otp = r.body.invite && r.body.invite.otp_code;
  check("invite has a token", Boolean(token));
  check("invite carries an otp_code for the owner to send", typeof otp === "string" && /^\d{6}$/.test(otp), otp);

  // 10. public invite lookup
  r = await api_raw(`/api/invites/${token}`);
  check("invite resolves to pending", r.body.status === "pending" && r.body.contract_id === contractId && r.body.need_accept === true && r.body.otp_required === true);

  // 10b. a wrong code is rejected and the code is not burned
  r = await api_raw(`/api/invites/${token}/accept`, { method: "POST", body: { otp_code: "000000" } });
  check("wrong code rejected", r.status === 400 && r.body.status === "wrong_code");

  // 11. guest accepts WITHOUT a session — the code proves they hold the invite,
  // the token in the URL is their credential from here on
  r = await api_raw(`/api/invites/${token}/accept`, { method: "POST", body: { otp_code: otp } });
  check("guest accept executed agreement", r.body.ok && r.body.executed === true, r.body.redirect);
  check("accept redirect carries the token", r.body.redirect.includes(`token=${token}`));

  // 11b. a returning guest never needs the code again (token alone is identity)
  r = await api_raw(`/api/invites/${token}`);
  check("returning guest is already_confirmed, no code needed", r.body.status === "already_confirmed" && r.body.otp_required === false);

  // 12. thread open — the guest is identified purely by ?token=
  r = await api_raw(`/api/threads/${contractId}/messages?token=${token}`);
  check("guest can read the thread by token", r.status === 200 && r.body.viewer === "counterparty");

  // 13. guest posts with the token in the body (no session)
  r = await api_raw(`/api/threads/${contractId}/messages`, { method: "POST", body: { sender: "counterparty", token, body: "Livraison jeudi, 40 panneaux comme d'habitude." } });
  check("guest posts to the shared thread", r.status === 201, r.body.message && r.body.message.sender);

  // 14. owner posts
  r = await api_raw(`/api/threads/${contractId}/messages`, { cookie: ownerJar, method: "POST", body: { sender: "owner", body: "Merci Karim — paiement à 30 jours comme convenu." } });
  check("owner posts to the shared thread", r.status === 201);

  // 15. both see the same two messages, same thread, same records (non-partisan)
  r = await api_raw(`/api/threads/${contractId}/messages?token=${token}`);
  check("both parties see the same thread", r.body.messages.length === 2 && r.body.viewer === "counterparty");

  // 16. forgery rejected: a plain POST can't impersonate the assistant
  r = await api_raw(`/api/threads/${contractId}/messages`, { cookie: ownerJar, method: "POST", body: { sender: "insaf", body: "fake legal advice" } });
  check("clients cannot post as insaf", r.status === 403);

  // 17. anonymous caller expelled from an owned contract's thread
  r = await api_raw(`/api/threads/${contractId}/messages`, { method: "POST", body: { sender: "owner", body: "intruder" } });
  check("anonymous cannot post to an owned contract", r.status === 403, `status ${r.status}`);

  // 18. a token for the wrong contract is not a key to this thread
  r = await api_raw("/api/auth/demo", { method: "POST" });
  const demoJar = r.setCookie;
  r = await api_raw("/api/contracts/generate", { method: "POST", cookie: demoJar, body: { relationship_id: "rel_demo_001" } });
  const otherId = r.body.contract && r.body.contract.contract_id;
  r = await api_raw(`/api/invites/${otherId}`, { method: "POST", cookie: demoJar });
  const otherToken = r.body.invite && r.body.invite.token;
  const otherOtp = r.body.invite && r.body.invite.otp_code;
  r = await api_raw(`/api/invites/${otherToken}/accept`, { method: "POST", body: { otp_code: otherOtp } });
  if (r.body.ok) {
    r = await api_raw(`/api/threads/${contractId}/messages`, { method: "POST", body: { sender: "counterparty", token: otherToken, body: "wrong contract" } });
    check("another contract's token cannot post here", r.status === 403, `status ${r.status}`);
  } else {
    check("another contract's token cannot post here", r.status === 403, "second contract not accepted");
  }

  // 19. assistant endpoint degrades when the agent service is down (token used)
  r = await api_raw(`/api/threads/${contractId}/assistant`, { cookie: ownerJar, method: "POST", body: { question: "Which obligations are overdue?" } });
  check("assistant degrades gracefully (503 or ok)", r.status === 503 || r.status === 201, `status ${r.status}`);

  console.log(failures === 0 ? "\nALL E2E CHECKS PASSED" : `\n${failures} E2E CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("e2e crashed:", err);
  process.exit(1);
});