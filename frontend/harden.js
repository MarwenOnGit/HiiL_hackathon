// v3 flow: analyse an existing contract, harden it, then resolve a dispute.
// Standalone, no dependency on app.js — same pattern as confirm.js/thread.js.

const API = "/api/agent";
let contractId = null;
let agentReady = false;

const el = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function show(name) {
  for (const panel of document.querySelectorAll("[data-panel3]")) {
    panel.hidden = panel.dataset.panel3 !== name;
  }
  const order = ["ingest", "findings", "accept", "dispute"];
  const index = order.indexOf(name);
  document.querySelectorAll(".v3-step").forEach((step, i) => {
    step.classList.toggle("active", i === index);
    step.classList.toggle("done", i < index);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Raw fetch errors ("fetch failed", "NetworkError") mean nothing to the person
// standing in front of the screen. Every failure that reaches the UI gets a
// sentence that says what broke and what to do about it.
const OFFLINE_MESSAGE =
  "Le service d'analyse ne répond pas. Relancez-le avec ./start.sh mock — " +
  "l'ancrage et la confirmation continuent de fonctionner sans lui.";

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(API + path, options);
  } catch (err) {
    markOffline();
    throw new Error(OFFLINE_MESSAGE);
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 503 || body.agent_available === false) {
    markOffline();
    throw new Error(body.hint || OFFLINE_MESSAGE);
  }
  if (!res.ok) {
    const detail = body.detail;
    if (detail && typeof detail === "object") {
      // The service sends structured detail for a document it could not read.
      throw new Error(
        (detail.error || "document illisible") +
        (detail.needs_ocr ? " — ce PDF n'a pas de couche texte (scan). Un moteur OCR est requis." : "") +
        (detail.warnings && detail.warnings.length ? ` (${detail.warnings[0]})` : "")
      );
    }
    throw new Error(detail || body.error || `Erreur ${res.status}`);
  }
  return body;
}

// ---------- grounding banner ----------
// The single most important piece of honesty in this UI. With no corpus loaded
// every legal finding is ungrounded, and the interface must say so plainly
// rather than let a drafting observation look like a legal conclusion.
function renderGrounding(health) {
  const banner = el("grounding-banner");
  if (!health.agent_available) {
    banner.innerHTML = `<div class="banner banner-warn">
      <strong>Service d'analyse indisponible.</strong>
      L'ancrage et la confirmation restent utilisables sans lui.
      <br>Relancez-le : <code>./start.sh mock</code> — ou, seul :
      <code>cd agent &amp;&amp; python3 -m uvicorn service:app --port 5001</code>
      <br><span class="source-note">Reconnexion automatique dès qu'il répond.</span>
      </div>`;
    return;
  }
  if (!health.grounding_available) {
    banner.innerHTML = `<div class="banner banner-warn">
      <strong>Corpus juridique non chargé.</strong> Les constats ci-dessous sont des constats
      de <em>rédaction</em>, pas des affirmations juridiques : aucun texte de loi n'est cité,
      parce qu'aucun n'a été fourni. Rien n'est inventé pour combler ce vide.</div>`;
  } else {
    banner.innerHTML = `<div class="banner banner-ok"><strong>Corpus chargé :</strong>
      ${esc(health.corpus_size)} extraits indexés. Chaque base légale citée provient d'un
      extrait réellement retrouvé.</div>`;
  }
}

// ---------- 1. ingest ----------
async function analyse(formData) {
  el("ingest-error").textContent = "";
  if (!agentReady && !(await checkHealth())) {
    el("ingest-error").textContent = OFFLINE_MESSAGE;
    return;
  }
  el("btn-analyse").disabled = true;
  el("btn-demo").disabled = true;
  try {
    const report = await api("/harden", { method: "POST", body: formData });
    contractId = report.contract_id;
    renderFindings(report);
    show("findings");
  } catch (err) {
    el("ingest-error").textContent = err.message;
  } finally {
    el("btn-analyse").disabled = false;
    el("btn-demo").disabled = false;
  }
}

el("btn-analyse").addEventListener("click", () => {
  const file = el("file-input").files[0];
  if (!file) { el("ingest-error").textContent = "Choisissez un fichier."; return; }
  const form = new FormData();
  form.append("file", file);
  form.append("contract_id", `contract_${Date.now()}`);
  analyse(form);
});

el("btn-demo").addEventListener("click", async () => {
  const form = new FormData();
  form.append("text", DEMO_CONTRACT);
  form.append("contract_id", `contract_${Date.now()}`);
  analyse(form);
});

// ---------- 2. findings ----------
function renderFindings(report) {
  const g = report.grounding;
  el("findings-lede").textContent =
    `${report.clauses.length} clauses analysées · ${report.gaps.length} clauses manquantes · `
    + `${g.total_redlines} corrections proposées, dont ${g.grounded_redlines} appuyées sur un texte.`;

  el("gaps").innerHTML = report.gaps.length
    ? report.gaps.map((gap) => `
        <div class="finding finding-${esc(gap.severity)}">
          <div class="finding-title">${esc(gap.label)}</div>
          <div class="finding-why">${esc(gap.why)}</div>
        </div>`).join("")
    : `<p class="finding-why">Aucune clause obligatoire manquante.</p>`;

  el("redlines").innerHTML = report.redlines.map((r) => {
    // Deliberately NOT labelled "base légale". Lexical retrieval proves the
    // article shares vocabulary with the clause; it does not prove the article
    // governs it. Showing the matched words lets a reader dismiss a
    // coincidence instead of trusting a confident-looking citation.
    const basis = r.grounded
      ? `<div class="redline-basis basis-cited">
           <strong>${r.verified_pin ? "Article vérifié" : "Extraits retrouvés — à vérifier"}</strong> :
           ${r.legal_basis.map((b) => `<span class="basis-ref">${esc(b.source_doc)} ${esc(b.article_ref)}</span>`).join(", ")}
           <div style="margin-top:5px">${esc(r.legal_basis[0].excerpt.slice(0, 220))}…</div>
           ${r.legal_basis[0].matched_terms && r.legal_basis[0].matched_terms.length
             ? `<div class="source-note">mots correspondants : ${r.legal_basis[0].matched_terms.map(esc).join(", ")}</div>` : ""}
           <div class="source-note">${esc(r.verification_note || "")}</div>
         </div>`
      : `<div class="redline-basis basis-none">${esc(r.no_legal_basis.message)}
           <div class="source-note">${esc(r.no_legal_basis.reason)}</div></div>`;
    return `<div class="redline">
        <div class="finding-title">${esc(r.rationale)}
          <span class="status-pill ${r.risk_kind === "asymmetric" ? "status-pending" : "status-pending"}">${esc(r.risk_kind)}</span></div>
        <div class="redline-before">${esc(r.original.slice(0, 300))}</div>
        <div class="redline-after">${esc(r.proposed)}</div>
        ${basis}
      </div>`;
  }).join("") || `<p class="finding-why">Aucune correction à proposer.</p>`;

  el("obligations").innerHTML = report.obligations.map((o) => `
      <div class="field-row"><span class="field-label">${esc(o.obligor)} — ${esc(o.action)}</span>
      <span class="field-value">${esc(o.trigger)}</span></div>`).join("")
    || `<p class="finding-why">Aucune obligation détectée.</p>`;
}

el("btn-accept").addEventListener("click", async () => {
  try {
    await api(`/contracts/${contractId}/accept`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted_clause_ids: [] })
    });
    await renderVersions();
    show("accept");
  } catch (err) { alert(err.message); }
});

// ---------- 3. versions ----------
async function renderVersions() {
  const data = await api(`/contracts/${contractId}`);
  el("timeline").innerHTML = data.versions.map((v) => `
      <div class="timeline-row">
        <span class="timeline-id">${esc(v.version_id)}</span>
        <span class="status-pill ${v.status === "in_force" ? "status-executed" : "status-pending"}">${esc(v.status)}</span>
        <span>${esc(v.doc_type)}</span>
        <span class="ledger-clauses">parent ${esc(v.parent_version_id || "—")} ·
          ${v.anchor_tx ? "ancrée" : "non ancrée"} · ${esc(v.clause_count)} clauses</span>
      </div>`).join("");

  const history = await api(`/contracts/${contractId}/history`);
  el("chainlog").innerHTML = history.entries.map((e) => `
      <div class="timeline-row">
        <span class="timeline-id">${esc(e.detail.doc_id || "event")}</span>
        <span>${esc(e.detail.doc_type || e.detail.event_type)}</span>
        <span class="ledger-clauses">${esc(e.tx_hash.slice(0, 18))}… parent ${esc(e.detail.parent_doc_id || "—")}</span>
      </div>`).join("")
    || `<p class="finding-why">Rien d'ancré pour l'instant.</p>`;
}

el("btn-sign").addEventListener("click", async () => {
  try {
    await api(`/contracts/${contractId}/sign`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lawyer_validated: false })
    });
    await renderVersions();
  } catch (err) { alert(err.message); }
});

el("btn-to-dispute").addEventListener("click", () => show("dispute"));
el("btn-to-dispute2").addEventListener("click", () => show("dispute"));

// ---------- 4. dispute ----------
el("btn-dispute").addEventListener("click", async () => {
  el("dispute-error").textContent = "";
  const buyer = el("stmt-buyer").value.trim();
  const supplier = el("stmt-supplier").value.trim();
  if (!buyer || !supplier) {
    el("dispute-error").textContent = "Les deux parties doivent donner leur version.";
    return;
  }
  const statements = [];
  buyer.split("\n").filter(Boolean).forEach((t) =>
    statements.push({ party_id: "p_buyer", text: t, evidence_refs: [] }));
  supplier.split("\n").filter(Boolean).forEach((t) =>
    statements.push({ party_id: "p_supplier", text: t, evidence_refs: [] }));

  try {
    const report = await api("/disputes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contract_id: contractId,
        dispute_id: `dispute_${Date.now()}`,
        event_date: new Date().toISOString(),
        claims: [],
        statements,
        contested: el("contested").value === "true",
        claim_amount: parseFloat(el("claim-amount").value) || null
      })
    });
    renderDispute(report);
  } catch (err) { el("dispute-error").textContent = err.message; }
});

function renderDispute(report) {
  const s = report.fact_ledger.summary;
  const b = report.batna;
  const band = (r, unit) => r ? `${r.low} – ${r.high} <span class="batna-unit">${esc(unit)}</span>` : "—";

  el("dispute-result").innerHTML = `
    <div class="card">
      <h3 style="margin-top:0">Version applicable</h3>
      <p class="finding-why">${esc(report.governing_version.explanation)}</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Tableau des faits
        <span class="status-pill pill-agreed">${s.agreed} convenus</span>
        <span class="status-pill pill-disputed">${s.disputed} contestés</span>
        <span class="status-pill pill-unsupported">${s.unsupported} non étayés</span></h3>
      ${report.fact_ledger.facts.map((f) => `
        <div class="ledger-row">
          <span class="status-pill pill-${esc(f.status)}">${esc(f.status)}</span>
          <span class="ledger-fact">${esc(f.fact)}
            <div class="ledger-clauses">${f.clause_ids.length ? "clauses " + f.clause_ids.map(esc).join(", ") : "aucune clause rattachée"}</div>
          </span>
        </div>`).join("")}
      <p class="source-note">${esc(report.fact_ledger.note)}</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Si vous allez au tribunal (${esc(b.path_label)})</h3>
      <div class="batna-band"><span class="batna-value">${band(b.duration_days, "jours")}</span></div>
      <div class="batna-band" style="margin-top:6px"><span class="batna-value">${band(b.cost_amount, "TND de frais")}</span></div>
      <p class="source-note"><strong>Source :</strong> ${esc(b.source)}<br>${esc(b.scope)}</p>
      <p class="source-note">${esc(b.note)}</p>
      <p class="source-note">${b.caveats.map(esc).join("<br>")}</p>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Options de règlement</h3>
      ${report.settlement_options.map((o) => `
        <div class="option-card ${o.monetary ? "monetary" : ""}">
          <div class="option-title">${esc(o.label)} ${o.monetary ? '<span class="status-pill status-pending">monétaire</span>' : ""}</div>
          <div class="option-detail">${esc(o.detail)}</div>
        </div>`).join("")}
      <div class="banner banner-info" style="margin:12px 0 0">
        ${esc(report.negotiation.human_gate_note)}
        ${report.negotiation.lawyer_review_required ? "<br><strong>Revue par un avocat requise avant signature.</strong>" : ""}
      </div>
    </div>`;
}

const DEMO_CONTRACT = `CONTRAT DE FOURNITURE DE PANNEAUX DE BOIS

Article 1 - Parties
Entre les soussignes: Atelier Trabelsi, menuiserie sise a Tunis, designe ci-apres
"l'Acheteur", et Societe Bois du Nord, designe ci-apres "le Fournisseur".

Article 2 - Objet du contrat
Le Fournisseur s'engage a fournir a l'Acheteur des panneaux de contreplaque de
18mm, en quantite approximative de 40 unites par mois.

Article 3 - Prix
Le prix est fixe a 45 TND par panneau, soit un montant de 1800 TND par commande
mensuelle. Le prix pourra etre revise selon le prix du marche.

Article 4 - Livraison
Le Fournisseur livre les marchandises dans un delai raisonnable a compter de la
reception de la commande. En cas d'empechement, il previendra l'Acheteur dans
les meilleurs delais.

Article 5 - Paiement
L'Acheteur procede au paiement a 30 jours a compter de la livraison, par
virement bancaire.

Article 6 - Qualite
Les marchandises seront conformes a la qualite convenue entre les parties.

Article 7 - Resiliation
Le Fournisseur pourra resilier a tout moment et sans preavis en cas de
difficulte d'approvisionnement. Le Fournisseur ne pourra en aucun cas etre tenu
responsable des consequences d'une rupture de stock.`;

el("stmt-buyer").value = "La livraison de juin contenait 12 panneaux fissures\nLe paiement de juin n a pas ete effectue";
el("stmt-supplier").value = "La livraison de juin ne contenait pas de panneaux fissures\nLe paiement de juin n a pas ete effectue";

let healthTimer = null;

function markOffline() {
  agentReady = false;
  el("agent-pill").textContent = "agent: hors ligne";
  setActionsEnabled(false);
  startHealthPolling();
}

function setActionsEnabled(enabled) {
  for (const id of ["btn-analyse", "btn-demo", "btn-accept", "btn-sign", "btn-dispute"]) {
    const node = el(id);
    if (node) node.disabled = !enabled;
  }
}

// The health check used to run once at load, so a service that came back after
// the page opened stayed "offline" until someone thought to reload. Poll while
// down and recover on our own.
function startHealthPolling() {
  if (healthTimer) return;
  healthTimer = setInterval(checkHealth, 3000);
}

function stopHealthPolling() {
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
}

async function checkHealth() {
  let health;
  try {
    const res = await fetch(API + "/health");
    health = await res.json();
  } catch (err) {
    health = { agent_available: false, detail: "le backend lui-même ne répond pas" };
  }
  const wasReady = agentReady;
  agentReady = Boolean(health.agent_available);

  el("agent-pill").textContent = agentReady
    ? `agent: ok · corpus ${health.corpus_size}` : "agent: hors ligne";
  setActionsEnabled(agentReady);
  renderGrounding(health);

  if (agentReady) {
    stopHealthPolling();
    if (!wasReady) el("ingest-error").textContent = "";
  } else {
    startHealthPolling();
  }
  return agentReady;
}

(async function init() {
  await checkHealth();
})();
