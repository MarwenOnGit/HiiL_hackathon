// Seeding and live state for the staged demo.
//
// The fixture is the durable state; anything a visitor does during a demo
// (confirming a milestone, accepting a settlement, posting a message) lands in
// an in-process overlay instead of mutating the fixture. That keeps the demo
// repeatable — restart the server, or POST /api/demo/reset, and the scenario is
// exactly as authored.

const db = require("../db");
const passwords = require("../services/passwords");
const scenario = require("./scenario");
const dispute = require("./dispute");

const { CONTRACT_ID, DEMO_USER } = scenario;

// ---------- overlay ----------

let overlay = emptyOverlay();

function emptyOverlay() {
  return {
    obligations: {},   // obligation_id -> state
    acceptances: {},   // option_id -> { p_buyer, p_supplier }
    messages: [],      // messages posted during the demo
    events: []         // extra chain entries produced during the demo
  };
}

function reset() {
  overlay = emptyOverlay();
}

function getOverlay() {
  return overlay;
}

// ---------- identity ----------

function isDemoContract(contractId) {
  return contractId === CONTRACT_ID;
}

function isDemoUser(userId) {
  return userId === DEMO_USER.user_id;
}

// Idempotent: safe to call on every request that might need the demo account.
function ensureSeeded() {
  const existing = db.getUserByEmail(DEMO_USER.email);
  if (!existing) {
    db.saveUser({
      user_id: DEMO_USER.user_id,
      email: DEMO_USER.email,
      name: DEMO_USER.name,
      avatar: "",
      is_demo: true,
      password_hash: passwords.hash(DEMO_USER.password),
      created_at: scenario.shift(scenario.T.signed)
    });
  }
  if (!db.getContractOwner(CONTRACT_ID)) {
    db.saveContractOwner(CONTRACT_ID, DEMO_USER.user_id, "demo");
  }
  return DEMO_USER;
}

// ---------- read models ----------

function dashboardRow() {
  const msgs = allMessages();
  return {
    contract_id: CONTRACT_ID,
    source: "demo",
    msme_owner: scenario.PARTIES[0].display_name,
    counterparty: scenario.PARTIES[1].display_name,
    generated_at: scenario.shift(scenario.T.signed),
    version_count: scenario.versions().length,
    consent_tier: "REMOTE_OTP_VERIFIED",
    signed: true,
    onchain: { hash: scenario.versions()[0].text_hash },
    thread_message_count: msgs.length,
    thread_last_sent_at: msgs.length ? msgs[msgs.length - 1].sent_at : null,
    invite_active: false,
    invite_expires_at: null,
    // Demo-only extras the dashboard uses to show this row is the live scenario
    demo: true,
    risk_counts: scenario.riskCounts(),
    open_milestones: scenario.monitoring(overlay.obligations).summary.open,
    dispute_status: dispute.report(overlay).status
  };
}

function contractDetail() {
  return {
    contract_id: CONTRACT_ID,
    parties: scenario.PARTIES,
    metadata: { profile: "supply", language: "fr", jurisdiction: "TN" },
    versions: scenario.versions(),
    obligations: scenario.obligations().map((o) => ({
      ...o,
      state: overlay.obligations[o.obligation_id] || o.state
    })),
    contract_text: scenario.CONTRACT_TEXT,
    analysis: analysis()
  };
}

function analysis() {
  return {
    contract_id: CONTRACT_ID,
    clauses: scenario.CLAUSES,
    gaps: scenario.GAPS,
    recommendations: scenario.RECOMMENDATIONS,
    obligations: scenario.obligations(),
    grounding: scenario.grounding(),
    risk_counts: scenario.riskCounts(),
    analysed_at: scenario.shift(scenario.T.analysed),
    anchor: { doc_id: "doc_001", tx_hash: scenario.versions()[0].anchor_tx },
    analysis_anchor: {
      attested: true,
      tx_hash: scenario.history()[1].tx_hash,
      findings_hash: scenario.history()[1].detail.payload_hash,
      total: scenario.RECOMMENDATIONS.length,
      grounded: scenario.grounding().grounded_recommendations,
      gaps: scenario.GAPS.length
    }
  };
}

function allMessages() {
  return [...scenario.messages(), ...overlay.messages].sort(
    (a, b) => new Date(a.sent_at) - new Date(b.sent_at)
  );
}

function history() {
  return [...scenario.history(), ...overlay.events].sort(
    (a, b) => new Date(a.detail.timestamp) - new Date(b.detail.timestamp)
  );
}

function monitoring() {
  return scenario.monitoring(overlay.obligations);
}

function disputeReport() {
  return dispute.report(overlay);
}

// ---------- writes (overlay only) ----------

function confirmObligation(obligationId, outcome, actorLabel) {
  const map = { performed: "performed", not_yet: "overdue_unconfirmed", breached: "breached" };
  const next = map[outcome];
  if (!next) return { ok: false, error: "unknown outcome" };

  const ob = scenario.obligations().find((o) => o.obligation_id === obligationId);
  if (!ob) return { ok: false, error: "unknown obligation" };

  overlay.obligations[obligationId] = next;

  const line =
    next === "performed"
      ? `« ${ob.action} » confirmée comme exécutée par ${actorLabel}. Confirmation horodatée et ancrée.`
      : next === "breached"
        ? `Manquement signalé par ${actorLabel} sur « ${ob.action} ». Le signalement est horodaté et ancré ; il ne vaut pas mise en demeure.`
        : `${actorLabel} indique que « ${ob.action} » n'est pas encore exécutée. Constat horodaté, sans qualification de faute.`;

  const message = {
    sender: "insaf",
    body: line,
    sent_at: new Date().toISOString(),
    reply_meta: {
      rule_based: true, grounded: false, monitor: true, anchored: true,
      confirmation_for: obligationId, outcome: next, summoned_by: actorLabel
    }
  };
  overlay.messages.push(message);
  overlay.events.push({
    tx_hash: fakeTx(),
    detail: {
      event_type: next === "performed" ? "obligation_performed" : "obligation_attested",
      timestamp: message.sent_at,
      obligation_id: obligationId,
      payload_hash: fakeTx()
    }
  });
  return { ok: true, message, state: next };
}

function respondToOption(optionId, partyId, response, actorLabel) {
  const option = dispute.options().find((o) => o.option_id === optionId);
  if (!option) return { ok: false, error: "unknown option" };

  const current = overlay.acceptances[optionId] || {};
  overlay.acceptances[optionId] = { ...current, [partyId]: response };

  const both =
    overlay.acceptances[optionId].p_buyer === "accepted" &&
    overlay.acceptances[optionId].p_supplier === "accepted";

  const body = both
    ? `Les deux parties ont accepté « ${option.label} ». L'accord est enregistré et son empreinte ancrée. Il vaut transaction obligatoire entre les parties ; une relecture par un avocat est requise avant signature.`
    : response === "accepted"
      ? `${actorLabel} accepte l'option « ${option.label} ». L'accord prendra effet lorsque l'autre partie l'aura également acceptée.`
      : `${actorLabel} écarte l'option « ${option.label} ». Les autres options restent ouvertes.`;

  const message = {
    sender: "insaf",
    body,
    sent_at: new Date().toISOString(),
    reply_meta: {
      rule_based: true, grounded: false, settlement: true,
      anchored: both, option_id: optionId, summoned_by: actorLabel
    }
  };
  overlay.messages.push(message);

  if (both) {
    overlay.events.push({
      tx_hash: fakeTx(),
      detail: {
        event_type: "settlement_signed", timestamp: message.sent_at,
        dispute_id: dispute.DISPUTE_ID, option_id: optionId, payload_hash: fakeTx()
      }
    });
  }
  return { ok: true, message, settled: both };
}

function postMessage(sender, body) {
  const message = { sender, body: String(body), sent_at: new Date().toISOString() };
  overlay.messages.push(message);
  return message;
}

function fakeTx() {
  const hex = "0123456789abcdef";
  let out = "0x";
  for (let i = 0; i < 64; i += 1) out += hex[Math.floor(Math.random() * 16)];
  return out;
}

module.exports = {
  CONTRACT_ID,
  DEMO_USER,
  scenario,
  dispute,
  isDemoContract,
  isDemoUser,
  ensureSeeded,
  reset,
  getOverlay,
  dashboardRow,
  contractDetail,
  analysis,
  allMessages,
  history,
  monitoring,
  disputeReport,
  confirmObligation,
  respondToOption,
  postMessage
};
