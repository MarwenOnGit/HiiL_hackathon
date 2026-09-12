// Standalone page for a counterparty with no platform account — no
// dependency on app.js or its state. See
// ../docs/superpowers/specs/2026-09-12-counterparty-confirmation-design.md.

const API = "/api";
const token = new URLSearchParams(window.location.search).get("token");

function el(id) {
  return document.getElementById(id);
}

async function callApi(path, options) {
  let res;
  try {
    res = await fetch(API + path, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
  } catch (err) {
    return { ok: false, networkError: true, body: {} };
  }
  const body = await res.json();
  return { ok: res.ok, networkError: false, body };
}

function renderInvalid(message) {
  el("confirm-title").textContent = "This link isn't valid";
  el("confirm-lede").textContent = message;
  el("confirm-card").hidden = true;
}

function renderExpired() {
  el("confirm-title").textContent = "This link has expired";
  el("confirm-lede").textContent = "Ask the MSME owner to send a new confirmation link.";
  el("confirm-card").hidden = true;
}

function renderAlreadyConfirmed() {
  el("confirm-title").textContent = "Already confirmed";
  el("confirm-lede").textContent = "This agreement was already confirmed. You can close this page.";
  el("confirm-card").hidden = true;
}

function renderSuccess() {
  el("confirm-title").textContent = "Confirmed";
  el("confirm-lede").textContent = "Thanks — this agreement is now anchored and active. You can close this page.";
  el("confirm-card").hidden = true;
}

function renderPending(contractText) {
  el("confirm-title").textContent = "Review and confirm this agreement";
  el("confirm-lede").textContent = "Read the agreement below, then enter the code you were sent to confirm you accept it.";
  const card = el("confirm-card");
  card.hidden = false;
  card.innerHTML = `
    <div class="contract-text">${contractText}</div>
    <div class="field-row" style="margin-top:16px;border-bottom:none">
      <label for="otp-input" class="field-label">Confirmation code</label>
    </div>
    <input id="otp-input" class="otp-input" type="text" inputmode="numeric" maxlength="6" placeholder="6-digit code">
    <button class="primary-btn" id="accept-btn">Accept these terms</button>
    <p class="confirm-error" id="confirm-error"></p>
  `;
  el("accept-btn").addEventListener("click", onAccept);
}

async function onAccept() {
  const code = el("otp-input").value.trim();
  const errorEl = el("confirm-error");
  const button = el("accept-btn");
  errorEl.textContent = "";
  button.disabled = true;

  const { ok, body, networkError } = await callApi(`/confirm/${token}`, {
    method: "POST",
    body: JSON.stringify({ otp_code: code })
  });

  if (ok) {
    renderSuccess();
    return;
  }

  button.disabled = false;
  if (networkError) {
    errorEl.textContent = "Couldn't reach the server — please try again.";
  } else if (body.status === "wrong_code") {
    errorEl.textContent = `That code doesn't match. ${body.attemptsRemaining} attempt(s) left.`;
  } else if (body.status === "expired") {
    renderExpired();
  } else if (body.status === "already_confirmed") {
    renderAlreadyConfirmed();
  } else {
    errorEl.textContent = "Something went wrong confirming this — please try again.";
  }
}

async function init() {
  if (!token) {
    renderInvalid("No confirmation token was provided.");
    return;
  }
  const { ok, body, networkError } = await callApi(`/confirm/${token}`);
  if (!ok) {
    if (networkError) {
      return renderInvalid("Couldn't reach the server — check your connection and reload this page.");
    }
    if (body.status === "expired") return renderExpired();
    if (body.status === "already_confirmed") return renderAlreadyConfirmed();
    return renderInvalid("This link doesn't match a pending confirmation.");
  }
  renderPending(body.contract_text);
}

init();
