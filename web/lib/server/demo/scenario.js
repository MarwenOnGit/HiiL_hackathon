// The staged end-to-end demo: one account, one contract, one conflict, one
// settlement. Everything the product claims to do, already in a state where it
// can be shown rather than performed live.
//
// Dates are computed relative to "now" on every read, so the scenario is always
// current: a milestone that is 12 days overdue today is still 12 days overdue
// next week. Nothing here is persisted — the fixture IS the state, which is
// what makes the demo repeatable. Confirmations made during a demo are held in
// an in-process overlay (see overlay.js) and cleared by /api/demo/reset.

const { CONTRACT_TEXT, CLAUSES, RECOMMENDATIONS, GAPS, grounding, riskCounts } = require("./contract");

const CONTRACT_ID = "contract_demo_trabelsi";

const DEMO_USER = {
  user_id: "user_demo_ines",
  email: "ines@atelier-trabelsi.tn",
  password: "Insaf2026!",
  name: "Ines Trabelsi",
  is_demo: true
};

const PARTIES = [
  {
    party_id: "p_buyer",
    role: "msme_owner",
    display_name: "Ines Trabelsi — Atelier Trabelsi",
    short: "Atelier Trabelsi",
    pseudonym: "pseudo_7f3a91c4e2",
    identity: {
      person_type: "physique",
      given_name: "Ines",
      family_name: "Trabelsi",
      cin: "09 887 431",
      address: "12 rue des Artisans, 1073 Tunis"
    }
  },
  {
    party_id: "p_supplier",
    role: "counterparty",
    display_name: "Karim Fkih — Société Bois du Nord",
    short: "Bois du Nord",
    pseudonym: "pseudo_b18d605af7",
    identity: {
      person_type: "morale",
      given_name: "Société Bois du Nord",
      legal_form: "SARL",
      matricule: "1284637 W/A/M/000",
      address: "Zone industrielle, 8030 Grombalia"
    }
  }
];

const UNIT_PRICE = 45;
const MONTHLY_QTY = 40;
const MONTHLY_VALUE = UNIT_PRICE * MONTHLY_QTY; // 1800 TND
const MARCH_DELIVERED = 28;
const MARCH_SHORTFALL = MONTHLY_QTY - MARCH_DELIVERED; // 12 panels
const SHORTFALL_VALUE = MARCH_SHORTFALL * UNIT_PRICE; // 540 TND
const DELIVERED_VALUE = MARCH_DELIVERED * UNIT_PRICE; // 1260 TND

// ---------- time ----------

const DAY = 24 * 60 * 60 * 1000;

function shift(days) {
  return new Date(Date.now() + days * DAY).toISOString();
}

// The scenario's spine, in days relative to today.
const T = {
  signed: -240,
  analysed: -238,
  febDue: -71,
  febConfirmed: -70,
  marDue: -52,
  marDelivered: -41,
  marDisputed: -40,
  askedInsaf: -39,
  payDue: -12,
  withheld: -10,
  escalated: -8,
  aprDue: 6
};

// ---------- versions ----------
// One contract_id forever, append-only. The hardened proposal is deliberately
// never anchored — "a proposal is not a fact" — so it stays `proposed` and the
// signed version that supersedes it will name it as parent.

function versions() {
  return [
    {
      version_id: "v_001",
      parent_version_id: null,
      doc_type: "original",
      status: "in_force",
      effective_from: shift(T.signed),
      effective_to: null,
      review_status: "party_accepted",
      clause_count: CLAUSES.length,
      text_hash: "0x9c4f2e1a7b83d5061f4e8a2c9b7d013e5a6f8c2d4b9e1a7f3c085d6e2b4a9f71",
      anchor_tx: "0x4a7f2c91e8b3d05f6a1c4e9b2d7f8a03c5e6b1d4f9a2c7e08b3d5f6a1c4e9b2d"
    },
    {
      version_id: "v_002",
      parent_version_id: "v_001",
      doc_type: "hardened",
      status: "proposed",
      effective_from: null,
      effective_to: null,
      review_status: "none",
      clause_count: CLAUSES.length,
      text_hash: "0x2d8b5f1c9a4e7036b2f8d1a5c9e4b7f03a6d2c8b5f1e9a4c7036b2f8d1a5c9e4",
      anchor_tx: null
    }
  ];
}

// ---------- obligations ----------

function obligations() {
  return [
    {
      obligation_id: "ob_001",
      clause_id: "cl_004",
      obligor: "p_supplier",
      obligee: "p_buyer",
      action: `Livrer ${MONTHLY_QTY} panneaux de contreplaqué 18 mm — commande de février`,
      trigger: "commande mensuelle de février",
      due_date: shift(T.febDue),
      evidence_required: "bon de livraison signé",
      state: "performed"
    },
    {
      obligation_id: "ob_002",
      clause_id: "cl_004",
      obligor: "p_supplier",
      obligee: "p_buyer",
      action: `Livrer ${MONTHLY_QTY} panneaux de contreplaqué 18 mm — commande de mars`,
      trigger: "commande mensuelle de mars",
      due_date: shift(T.marDue),
      evidence_required: "bon de livraison signé",
      state: "breached"
    },
    {
      obligation_id: "ob_003",
      clause_id: "cl_005",
      obligor: "p_buyer",
      obligee: "p_supplier",
      action: `Payer ${MONTHLY_VALUE} TND par virement — facture de mars`,
      trigger: "30 jours à compter de la livraison",
      due_date: shift(T.payDue),
      evidence_required: "avis de virement",
      state: "overdue_unconfirmed"
    },
    {
      obligation_id: "ob_004",
      clause_id: "cl_004",
      obligor: "p_supplier",
      obligee: "p_buyer",
      action: `Livrer ${MONTHLY_QTY} panneaux de contreplaqué 18 mm — commande d'avril`,
      trigger: "commande mensuelle d'avril",
      due_date: shift(T.aprDue),
      evidence_required: "bon de livraison signé",
      state: "pending"
    }
  ];
}

// ---------- monitoring ----------
// Silence is a recorded, timestamped fact. An alert is a neutral status, never
// an accusation: "échéance dépassée, aucune confirmation enregistrée".

const LABELS = {
  p_buyer: "Atelier Trabelsi",
  p_supplier: "Bois du Nord"
};

function daysUntil(iso) {
  return Math.round((new Date(iso).getTime() - Date.now()) / DAY);
}

function alertFor(state, due) {
  if (state === "performed" || state === "waived" || state === "cured") return null;
  if (state === "breached") return "breached";
  const d = daysUntil(due);
  if (d < 0) return "overdue_unconfirmed";
  if (d === 0) return "due";
  if (d <= 7) return "due_soon";
  return null;
}

function milestones(overlay = {}) {
  return obligations().map((o) => {
    const state = overlay[o.obligation_id] || o.state;
    const kind = o.clause_id === "cl_005" ? "payment" : "delivery";
    return {
      milestone_id: `ms_${o.obligation_id}`,
      obligation_id: o.obligation_id,
      kind,
      action: o.action,
      obligor_label: LABELS[o.obligor],
      obligee_label: LABELS[o.obligee],
      trigger_text: o.trigger,
      due_date: o.due_date,
      date_reference: "absolute",
      state,
      days_until: daysUntil(o.due_date),
      alert: alertFor(state, o.due_date),
      check_in: kind === "payment" ? "Le paiement a-t-il été effectué ?" : "La livraison a-t-elle eu lieu ?",
      evidence_required: o.evidence_required,
      // Delivery shortfall is the whole conflict; carrying it on the milestone
      // lets the UI show "28 / 40" instead of a bare "breached" chip.
      quantity: o.obligation_id === "ob_002"
        ? { expected: MONTHLY_QTY, actual: MARCH_DELIVERED, unit: "panneaux" }
        : null,
      amount: kind === "payment" ? { value: MONTHLY_VALUE, currency: "TND" } : null,
      anchored: state === "performed" || state === "breached"
    };
  });
}

function monitoring(overlay = {}) {
  const ms = milestones(overlay);
  return {
    active: true,
    as_of: new Date().toISOString(),
    phase: "amicable",
    phase_reference: shift(T.escalated),
    phase_note:
      "Phase amiable ouverte le " +
      new Date(shift(T.escalated)).toLocaleDateString("fr-FR", { dateStyle: "long" }) +
      " — l'ouverture est ancrée, ce qui prouve qu'une résolution a été tentée avant toute action.",
    milestones: ms,
    summary: {
      total: ms.length,
      performed: ms.filter((m) => m.state === "performed").length,
      open: ms.filter((m) => m.alert && m.state !== "performed").length
    }
  };
}

// ---------- thread ----------
// Neutral ground: both parties read exactly this, in this order. No string here
// reads differently depending on who is looking at it.

function messages() {
  return [
    {
      sender: "insaf",
      body: `Suivi ouvert pour ce contrat. Deux obligations récurrentes ont été extraites : livraison de ${MONTHLY_QTY} panneaux par mois (Bois du Nord) et paiement de ${MONTHLY_VALUE} TND à 30 jours (Atelier Trabelsi). Les échéances seront rappelées ici, sans qualification de faute.`,
      sent_at: shift(T.analysed),
      reply_meta: { rule_based: true, grounded: false, monitor: true, summoned_by: "système" }
    },
    {
      sender: "counterparty",
      body: "Bonjour Ines, la commande de février est partie hier, 40 panneaux comme convenu. Bon de livraison signé par votre magasinier.",
      sent_at: shift(T.febConfirmed)
    },
    {
      sender: "owner",
      body: "Bien reçue, tout est conforme. Merci Karim.",
      sent_at: shift(T.febConfirmed + 0.1)
    },
    {
      sender: "insaf",
      body: "Livraison de février confirmée par les deux parties. Confirmation horodatée et ancrée.",
      sent_at: shift(T.febConfirmed + 0.2),
      reply_meta: {
        rule_based: true, grounded: false, monitor: true, anchored: true,
        confirmation_for: "ob_001", outcome: "performed", summoned_by: "système"
      }
    },
    {
      sender: "counterparty",
      body: `Ines, pour mars je ne peux livrer que ${MARCH_DELIVERED} panneaux. Notre scierie a eu une rupture sur le 18 mm. Je vous livre ce que j'ai.`,
      sent_at: shift(T.marDelivered)
    },
    {
      sender: "owner",
      body: `${MARCH_DELIVERED} sur ${MONTHLY_QTY}, et avec 11 jours de retard. J'ai deux chantiers bloqués. Il me manque ${MARCH_SHORTFALL} panneaux, soit ${SHORTFALL_VALUE} TND.`,
      sent_at: shift(T.marDisputed)
    },
    {
      sender: "counterparty",
      body: "L'article 7 du contrat me permet de suspendre à tout moment en cas de difficulté d'approvisionnement, et sans engager ma responsabilité.",
      sent_at: shift(T.marDisputed + 0.3)
    },
    {
      sender: "owner",
      body: "@insaf est-ce que l'article 7 lui permet vraiment ça ?",
      sent_at: shift(T.askedInsaf)
    },
    {
      sender: "insaf",
      body:
        "Réponse neutre, adressée aux deux parties.\n\n" +
        "L'article 7 comporte deux stipulations qui ont été signalées comme non conformes lors de l'analyse du contrat :\n\n" +
        "1. L'exonération « en aucun cas » de toute responsabilité. L'article 244 du COC dispose : « On ne peut stipuler d'avance qu'on ne sera pas tenu de sa faute lourde ou de son dol. » Une exonération totale stipulée à l'avance ne peut donc pas produire cet effet dans toute son étendue.\n\n" +
        "2. La résiliation « à tout moment et sans préavis » au profit d'une seule partie. L'article 242 du COC dispose que les obligations contractuelles valablement formées « ne peuvent être révoquées que de leur consentement mutuel ou dans les cas prévus par la loi ».\n\n" +
        "Ceci n'est pas une décision : c'est le texte retrouvé dans le corpus, cité pour que les deux parties lisent la même chose. La qualification d'une rupture d'approvisionnement en force majeure relève de l'appréciation des faits, et le contrat ne contient aucune clause de force majeure.",
      sent_at: shift(T.askedInsaf + 0.05),
      reply_meta: {
        rule_based: false, grounded: true, summoned_by: "Ines Trabelsi",
        legal_refs: ["COC Article 244", "COC Article 242"]
      }
    },
    {
      sender: "insaf",
      body: `Obligation « Payer ${MONTHLY_VALUE} TND — facture de mars » due le ${new Date(shift(T.payDue)).toLocaleDateString("fr-FR", { dateStyle: "long" })}. Aucune confirmation enregistrée à ce jour. Ceci est un constat horodaté, pas une mise en demeure.`,
      sent_at: shift(T.payDue),
      reply_meta: { rule_based: true, grounded: false, monitor: true, checkin_for: "ob_003", summoned_by: "système" }
    },
    {
      sender: "owner",
      body: "Je retiens le paiement jusqu'à ce qu'on règle le solde de mars. Je ne vais pas payer 40 panneaux que je n'ai pas reçus.",
      sent_at: shift(T.withheld)
    },
    {
      sender: "counterparty",
      body: "Le prix est dû à la livraison. Une livraison partielle ne suspend pas le paiement de ce qui a été livré.",
      sent_at: shift(T.withheld + 0.4)
    },
    {
      sender: "insaf",
      body:
        "Phase amiable ouverte à la demande d'Atelier Trabelsi. L'ouverture est ancrée : elle prouve qu'une résolution a été tentée avant toute action contentieuse.\n\n" +
        "Un tableau des faits partagé a été constitué à partir de ce fil. Les deux parties y voient la même chose, y compris ce qui n'est étayé par aucune pièce.",
      sent_at: shift(T.escalated),
      reply_meta: {
        rule_based: true, grounded: false, monitor: true, amicable: true,
        anchored: true, summoned_by: "Ines Trabelsi"
      }
    }
  ];
}

// ---------- chain ----------

function history() {
  return [
    {
      tx_hash: "0x4a7f2c91e8b3d05f6a1c4e9b2d7f8a03c5e6b1d4f9a2c7e08b3d5f6a1c4e9b2d",
      detail: {
        doc_id: "doc_001", doc_type: "original", parent_doc_id: null,
        timestamp: shift(T.signed),
        parties: PARTIES.map((p) => p.pseudonym)
      }
    },
    {
      tx_hash: "0x7e2b9d4f1a6c8305e7b2d9f4a1c6e830b5d2f9a4c1e6b83d05f7a2c9e4b1d6f83",
      detail: {
        event_type: "analysis_completed", timestamp: shift(T.analysed),
        payload_hash: "0x1f8c5a2e9b4d7036f1c8a5e2b9d4706c3f1a8e5b2d9c4706f3a1c8e5b2d94706"
      }
    },
    {
      tx_hash: "0x3c9e5a1f7b2d840635c9e1a7f3b2d8406c95e1a3f7b2d84065c9e1a7f3b2d8406",
      detail: {
        event_type: "obligation_performed", timestamp: shift(T.febConfirmed + 0.2),
        obligation_id: "ob_001",
        payload_hash: "0x8b3f1d6a9c25e70418b3f1d6a9c25e704b81f3d6a9c25e7041b83fd16a9c25e70"
      }
    },
    {
      tx_hash: "0x6d1a8f3c5e9b2740d61a8f3c5e9b27406d1a8f3c5e9b27406d1a8f3c5e9b27406",
      detail: {
        event_type: "obligation_breached", timestamp: shift(T.marDisputed),
        obligation_id: "ob_002",
        payload_hash: "0x5e2c9a6f1b8d3407e52c9a6f1b8d34075e2c9a6f1b8d34075e2c9a6f1b8d34075"
      }
    },
    {
      tx_hash: "0x9f4d2b7e1a6c58039f4d2b7e1a6c58039f4d2b7e1a6c58039f4d2b7e1a6c5803",
      detail: {
        event_type: "dispute_opened", timestamp: shift(T.escalated),
        dispute_id: "dispute_demo_001",
        payload_hash: "0x2a7e4c1b9f6d3805a27e4c1b9f6d38052a7e4c1b9f6d38052a7e4c1b9f6d3805"
      }
    }
  ];
}

module.exports = {
  CONTRACT_ID,
  DEMO_USER,
  PARTIES,
  LABELS,
  CONTRACT_TEXT,
  CLAUSES,
  RECOMMENDATIONS,
  GAPS,
  grounding,
  riskCounts,
  versions,
  obligations,
  milestones,
  monitoring,
  messages,
  history,
  shift,
  T,
  economics: {
    UNIT_PRICE, MONTHLY_QTY, MONTHLY_VALUE,
    MARCH_DELIVERED, MARCH_SHORTFALL, SHORTFALL_VALUE, DELIVERED_VALUE
  }
};
