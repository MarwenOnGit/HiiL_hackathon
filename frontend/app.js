// Insaf frontend — plain HTML/CSS/JS on purpose: no build step, no npm
// install required to run it, served directly by the Express backend.
// Talks to the API at the same origin. See ../ARCHITECTURE.md Section 6 for
// the schema every response here follows.

const API = "/api";

const state = {
  relationship: null,
  contract: null,
  onchain: null,
  step: "connect"
};

// ---------- Insaf mascot ----------
// A small rounded character wearing a "scales" badge — states: idle,
// thinking, working, success. Kept as inline SVG, no library.
const MASCOT_FACES = {
  idle: `<circle cx="19" cy="24" r="3.2" style="fill:var(--surface)"/><circle cx="33" cy="24" r="3.2" style="fill:var(--surface)"/><path d="M17 33 Q26 39 35 33" style="stroke:var(--surface);fill:none" stroke-width="3" stroke-linecap="round"/>`,
  thinking: `<circle cx="19" cy="23" r="3" style="fill:var(--surface)"/><circle cx="33" cy="23" r="3" style="fill:var(--surface)"/><path d="M19 34 H33" style="stroke:var(--surface);fill:none" stroke-width="3" stroke-linecap="round"/>`,
  working: `<circle cx="19" cy="24" r="3" style="fill:var(--surface)"/><circle cx="33" cy="24" r="3" style="fill:var(--surface)"/><circle cx="26" cy="34" r="3" style="fill:var(--surface)"/>`,
  success: `<path d="M15 22 Q19 26 23 22" style="stroke:var(--surface);fill:none" stroke-width="3" stroke-linecap="round"/><path d="M29 22 Q33 26 37 22" style="stroke:var(--surface);fill:none" stroke-width="3" stroke-linecap="round"/><path d="M16 31 Q26 41 36 31" style="stroke:var(--surface);fill:none" stroke-width="3.4" stroke-linecap="round"/>`,
  error: `<path d="M15 25 L23 21" style="stroke:var(--surface);fill:none" stroke-width="3" stroke-linecap="round"/><path d="M37 25 L29 21" style="stroke:var(--surface);fill:none" stroke-width="3" stroke-linecap="round"/><path d="M18 36 Q26 30 34 36" style="stroke:var(--surface);fill:none" stroke-width="3" stroke-linecap="round"/>`
};

function mascotSVG(faceState) {
  return `
  <svg viewBox="0 0 52 52" role="img" aria-label="Insaf, the assistant">
    <rect x="2" y="2" width="48" height="48" rx="16" style="fill:var(--accent)"/>
    ${MASCOT_FACES[faceState] || MASCOT_FACES.idle}
    <g transform="translate(19,6)">
      <line x1="7" y1="0" x2="7" y2="8" style="stroke:var(--accent-warm)" stroke-width="1.6"/>
      <line x1="1" y1="2" x2="13" y2="2" style="stroke:var(--accent-warm)" stroke-width="1.6"/>
      <circle cx="1" cy="5" r="2" style="fill:none;stroke:var(--accent-warm)" stroke-width="1.2"/>
      <circle cx="13" cy="5" r="2" style="fill:none;stroke:var(--accent-warm)" stroke-width="1.2"/>
    </g>
  </svg>`;
}

function setInsaf(text, faceState = "idle") {
  const bubble = document.getElementById("insaf-bubble");
  bubble.textContent = text;
  bubble.classList.toggle("error", faceState === "error");
  document.getElementById("insaf-avatar").innerHTML = mascotSVG(faceState);
  document.getElementById("insaf-avatar").className = "insaf-avatar" + (faceState === "thinking" ? " pulse" : "");
}
document.getElementById("brand-mark").innerHTML = mascotSVG("idle");

// ---------- theme toggle ----------
// index.html's inline pre-paint script already set documentElement.dataset.theme
// (defaulting to "light"); this just wires up the switch and persists changes.
const themeToggle = document.getElementById("theme-toggle");
function applyThemeToggleLabel() {
  const isDark = document.documentElement.dataset.theme === "dark";
  themeToggle.textContent = isDark ? "☾" : "☀︎";
  themeToggle.setAttribute("aria-pressed", String(isDark));
}
applyThemeToggleLabel();
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("insaf-theme", next);
  applyThemeToggleLabel();
});

// ---------- step navigation ----------
const STEP_ORDER = ["connect", "review", "contract", "anchor", "dashboard"];

function showStep(step) {
  state.step = step;
  for (const s of STEP_ORDER) {
    document.querySelector(`[data-panel="${s}"]`).hidden = s !== step;
    const btn = document.querySelector(`.step[data-step="${s}"]`);
    btn.classList.toggle("active", s === step);
  }
  const pct = (STEP_ORDER.indexOf(step) / (STEP_ORDER.length - 1)) * 100;
  document.getElementById("progress-fill").style.width = `${pct}%`;
  if (step === "dashboard") loadDashboard();
}

document.querySelectorAll(".step").forEach((btn) => {
  btn.addEventListener("click", () => showStep(btn.dataset.step));
});

// ---------- API helpers ----------
async function api(path, options) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "request failed");
  return body;
}

async function loadHealth() {
  try {
    const health = await api("/health");
    document.getElementById("chain-pill").textContent = `chain: ${health.chain_mode}`;
  } catch (e) {
    document.getElementById("chain-pill").textContent = "chain: unreachable";
  }
}
loadHealth();

// ---------- STEP 1: connect ----------
document.getElementById("btn-connect-whatsapp").addEventListener("click", async () => {
  setInsaf("Reading through that export…", "thinking");
  try {
    const { relationship, insaf } = await api("/relationships/demo", { method: "POST" });
    state.relationship = relationship;
    renderRelationship(relationship);
    setInsaf(insaf, "success");
    document.getElementById("btn-to-contract").disabled = false;
    document.querySelector('.step[data-step="connect"]').classList.add("done");
    showStep("review");
  } catch (e) {
    setInsaf("Something went wrong reading that in — try again.", "error");
  }
});

document.getElementById("btn-connect-email").addEventListener("click", () => {
  setInsaf("Email OAuth is wired up in the real build — this prototype demos the WhatsApp path instead.", "idle");
});

// ---------- STEP 2: review ----------
function renderRelationship(rel) {
  const t = rel.financial_terms_detected;
  const evidenceHtml = rel.evidence
    .map((e) => `<div class="evidence-item"><div class="evidence-meta">${new Date(e.timestamp).toLocaleDateString()} · ${e.type}</div><div class="evidence-text">${e.excerpt}</div></div>`)
    .join("");

  document.getElementById("relationship-card").innerHTML = `
    <div class="field-row"><span class="field-label">MSME owner</span><span class="field-value">${rel.parties.msme_owner.name}</span></div>
    <div class="field-row"><span class="field-label">Counterparty</span><span class="field-value">${rel.parties.counterparty.name}</span></div>
    <div class="field-row"><span class="field-label">Goods / services</span><span class="field-value">${t.goods_or_services}</span></div>
    <div class="field-row"><span class="field-label">Amount</span><span class="field-value">${t.amount} ${t.currency}</span></div>
    <div class="field-row"><span class="field-label">Schedule</span><span class="field-value">${t.payment_schedule}</span></div>
    <div class="field-row"><span class="field-label">Confidence</span><span class="field-value">${Math.round(rel.confidence * 100)}%</span></div>
    <h3 style="margin:16px 0 6px;font-size:13px;color:var(--ink-muted)">Evidence (${rel.evidence.length})</h3>
    ${evidenceHtml}
  `;
}

document.getElementById("btn-to-contract").addEventListener("click", async () => {
  setInsaf("Drafting the agreement…", "thinking");
  showStep("contract");
  try {
    const { contract, insaf } = await api("/contracts/generate", {
      method: "POST",
      body: JSON.stringify({ relationship_id: state.relationship.relationship_id })
    });
    state.contract = contract;
    renderContract(contract);
    setInsaf(insaf, "success");
    document.getElementById("btn-to-anchor").disabled = false;
    document.querySelector('.step[data-step="review"]').classList.add("done");
  } catch (e) {
    setInsaf("Couldn't generate a contract from that — " + e.message, "error");
  }
});

// ---------- STEP 3: contract ----------
function renderContract(contract) {
  document.getElementById("contract-card").innerHTML = `
    <div class="field-row"><span class="field-label">Contract ID</span><span class="field-value">${contract.contract_id}</span></div>
    <div class="field-row"><span class="field-label">Recommended consent tier</span><span class="field-value">${contract.consent_tier_recommended}</span></div>
    <div class="field-row"><span class="field-label">Content hash</span><span class="field-value"><span class="hash-tag">${contract.contract_text_hash}</span></span></div>
    <h3 style="margin:16px 0 6px;font-size:13px;color:var(--ink-muted)">Full text</h3>
    <div class="contract-text">${contract.contract_text}</div>
  `;
}

document.getElementById("btn-to-anchor").addEventListener("click", async () => {
  showStep("anchor");
  setInsaf("Generating a confirmation link…", "working");
  try {
    const { confirmation, insaf } = await api(`/contracts/${state.contract.contract_id}/anchor`, { method: "POST" });
    state.confirmation = confirmation;
    renderConfirmation(confirmation);
    setInsaf(insaf, "success");
    document.querySelector('.step[data-step="contract"]').classList.add("done");
  } catch (e) {
    setInsaf("Couldn't generate a confirmation link — " + e.message, "error");
  }
});

// ---------- STEP 4: confirmation link ----------
function renderConfirmation(confirmation) {
  document.getElementById("anchor-card").innerHTML = `
    <div class="field-row"><span class="field-label">Confirmation link</span><span class="field-value"><span class="hash-tag">${confirmation.confirm_url}</span></span></div>
    <div class="field-row"><span class="field-label">Code</span><span class="field-value">${confirmation.otp_code}</span></div>
    <div class="field-row"><span class="field-label">Expires</span><span class="field-value">${new Date(confirmation.expires_at).toLocaleString()}</span></div>
    <h3 style="margin:16px 0 6px;font-size:13px;color:var(--ink-muted)">What happens next</h3>
    <p class="evidence-text">Send this link and code to your counterparty yourself — WhatsApp, email, whatever you already use with them. Once they open the link and accept, this agreement is anchored and signed automatically. Check the Dashboard to see it go live.</p>
  `;
}

// ---------- STEP 5: dashboard ----------
async function loadDashboard() {
  const tbody = document.querySelector("#dash-table tbody");
  tbody.innerHTML = Array.from({ length: 3 })
    .map(() => `<tr><td colspan="5"><div class="skeleton-bar"></div></td></tr>`)
    .join("");
  try {
    const { rows } = await api("/dashboard");
    if (!rows.length) {
      tbody.innerHTML = `<tr class="dash-empty"><td colspan="5">Nothing anchored yet — walk through steps 1-4 first.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows
      .map((r) => {
        const executed = r.onchain && r.onchain.executed;
        const statusClass = executed ? "status-executed" : "status-pending";
        const statusText = r.onchain ? (executed ? "executed" : "pending") : "not anchored";
        return `<tr>
          <td>${r.contract_id}</td>
          <td>${r.msme_owner || "—"}</td>
          <td>${r.counterparty || "—"}</td>
          <td>${r.consent_tier}</td>
          <td><span class="status-pill ${statusClass}">${statusText}</span></td>
        </tr>`;
      })
      .join("");
  } catch (e) {
    tbody.innerHTML = `<tr class="dash-error"><td colspan="5">Couldn't load the dashboard.</td></tr>`;
  }
}

// ---------- init ----------
showStep("connect");
setInsaf("Connect a conversation and I'll take it from there.", "idle");
