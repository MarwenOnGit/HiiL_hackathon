// Standalone per-agreement discussion thread, used by BOTH parties. See
// ../docs/superpowers/specs/2026-09-12-per-agreement-chat-design.md.
// The owner arrives from the Dashboard (role=owner, no token); the
// counterparty arrives from their confirmation link (role=counterparty,
// token=<the token that confirmed this agreement>). No dependency on
// app.js — same standalone pattern as confirm.js.

const API = "/api";
const params = new URLSearchParams(window.location.search);
const contractId = params.get("contract_id");
const role = params.get("role") === "counterparty" ? "counterparty" : "owner";
const token = params.get("token");
const POLL_INTERVAL_MS = 4000;

let pollTimer = null;
let lastRenderedCount = -1;

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

// Message bodies are typed by the other party — never interpolate them raw.
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function formatTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

// The owner's badge on the Dashboard is driven entirely from the browser
// (there is no server-side read state), so opening the thread is what
// marks it seen. The stamp must be the server-assigned sent_at of the
// newest message, not the browser's clock — the badge compares this value
// against other messages' server-stamped sent_at, and a browser/server
// clock mismatch would otherwise corrupt the comparison permanently.
function markSeen(messages) {
  if (role !== "owner") return;
  if (!messages.length) return;
  const newest = messages[messages.length - 1].sent_at;
  try {
    localStorage.setItem(`insaf-thread-seen-${contractId}`, newest);
  } catch (err) {
    /* private mode or blocked storage — the badge just stays visible */
  }
}

function renderUnavailable(message) {
  el("thread-title").textContent = "No discussion available";
  el("thread-lede").textContent = message;
  el("thread-card").hidden = true;
  el("compose-card").hidden = true;
}

function renderMessages(messages) {
  if (messages.length === lastRenderedCount) return;
  lastRenderedCount = messages.length;
  const list = el("message-list");
  if (!messages.length) {
    list.innerHTML = `<p class="thread-empty">No messages yet — say something about this agreement.</p>`;
    return;
  }
  list.innerHTML = messages
    .map((m) => {
      const mine = m.sender === role;
      const who = m.sender === "owner" ? "MSME owner" : "Counterparty";
      return `<div class="message ${mine ? "message-mine" : ""}">
        <div class="message-meta">${escapeHtml(who)} · ${escapeHtml(formatTime(m.sent_at))}</div>
        <div class="message-body">${escapeHtml(m.body)}</div>
      </div>`;
    })
    .join("");
  list.scrollTop = list.scrollHeight;
}

async function loadMessages() {
  const { ok, body, networkError } = await callApi(`/threads/${encodeURIComponent(contractId)}/messages`);
  if (!ok) {
    // A transient network blip must not wipe a thread the user is reading.
    if (networkError) return;
    stopPolling();
    return renderUnavailable(body.error || "This agreement doesn't have an active discussion.");
  }
  el("thread-title").textContent = "Agreement discussion";
  el("thread-lede").textContent = `Messages about contract ${contractId}. Both sides see the same thread.`;
  el("thread-card").hidden = false;
  el("compose-card").hidden = false;
  renderMessages(body.messages);
  markSeen(body.messages);
}

async function onSend() {
  const input = el("message-input");
  const errorEl = el("thread-error");
  const button = el("send-btn");
  const text = input.value.trim();
  errorEl.textContent = "";
  if (!text) return;
  button.disabled = true;

  const payload = { sender: role, body: text };
  if (role === "counterparty") payload.token = token;

  const { ok, body, networkError } = await callApi(`/threads/${encodeURIComponent(contractId)}/messages`, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  button.disabled = false;
  if (ok) {
    input.value = "";
    await loadMessages();
    return;
  }
  errorEl.textContent = networkError
    ? "Couldn't reach the server — please try again."
    : body.error || "Couldn't send that message.";
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(loadMessages, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function init() {
  if (!contractId) return renderUnavailable("No agreement was specified.");
  el("send-btn").addEventListener("click", onSend);
  await loadMessages();
  startPolling();
  // Don't keep polling a tab nobody is looking at.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopPolling();
    } else {
      loadMessages();
      startPolling();
    }
  });
}

init();
