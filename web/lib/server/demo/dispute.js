// Agent 2's surface: reconcile the facts, price the alternative, propose ways
// out. Nothing here decides anything — every binding act is a human signature.
//
// The five rules of the Agent 2 liability posture are load-bearing in this file:
//   1. no binding decision — options carry no "recommended" flag
//   2. neutral by design — one ledger, one BATNA, shown identically to both
//   3. every figure traceable to a published source, shown as a range
//   4. settlement drafting carries a lawyer-review flag
//   5. never "force of a final judgment" — "transaction obligatoire entre les parties"

const scenario = require("./scenario");

const { MONTHLY_VALUE, SHORTFALL_VALUE, DELIVERED_VALUE, MARCH_DELIVERED, MONTHLY_QTY } =
  scenario.economics;

const DISPUTE_ID = "dispute_demo_001";

// Published reference — mirrors agent/config/batna.yaml. Quoted with its source
// every time it is shown; never presented as a prediction about this case.
const REFERENCE = {
  source: "World Bank, Doing Business 2020 — Tunisia, « Enforcing Contracts »",
  scope: "Première instance, litige commercial standardisé. Les appels s'ajoutent.",
  duration_days: 565,
  cost_percent_of_claim: 21.8,
  uncertainty_band: 0.25
};

const CLAIM_AMOUNT = MONTHLY_VALUE; // 1800 TND — the withheld March invoice

function band(value) {
  const b = REFERENCE.uncertainty_band;
  return { low: value * (1 - b), high: value * (1 + b) };
}

function batna() {
  const duration = band(REFERENCE.duration_days);
  const pct = band(REFERENCE.cost_percent_of_claim);
  return {
    contested: true,
    path_label: "créance contestée",
    source: REFERENCE.source,
    scope: REFERENCE.scope,
    note:
      "Le défendeur conteste la dette. La procédure ordinaire s'applique ; les durées et coûts de référence ci-dessus sont le point de comparaison.",
    claim_amount: CLAIM_AMOUNT,
    duration_days: { low: Math.round(duration.low), high: Math.round(duration.high), unit: "jours" },
    cost_percent: {
      low: Number(pct.low.toFixed(1)), high: Number(pct.high.toFixed(1)), unit: "% de la créance"
    },
    cost_amount: {
      low: Math.round((CLAIM_AMOUNT * pct.low) / 100),
      high: Math.round((CLAIM_AMOUNT * pct.high) / 100),
      unit: "TND"
    },
    caveats: [
      "Chiffres standardisés de première instance ; un appel s'ajoute.",
      "Estimation indicative, non un pronostic sur cette affaire.",
      "Les deux parties reçoivent exactement la même estimation."
    ]
  };
}

// agreed | disputed | unsupported.
// "Non étayé" means no evidence was produced — not that a party is wrong.
function factLedger() {
  return {
    note:
      "« Non étayé » signifie qu'aucune pièce n'a été produite, pas qu'une partie a tort. Les deux parties voient ce même tableau.",
    facts: [
      {
        fact: `Le contrat de fourniture a été signé et son empreinte ancrée le ${new Date(scenario.shift(scenario.T.signed)).toLocaleDateString("fr-FR", { dateStyle: "long" })}.`,
        status: "agreed",
        clause_ids: ["cl_001"],
        source_evidence: ["ancrage v_001 — doc_001"]
      },
      {
        fact: `La livraison de février (${MONTHLY_QTY} panneaux) a été effectuée et confirmée par les deux parties.`,
        status: "agreed",
        clause_ids: ["cl_004"],
        source_evidence: ["confirmation ob_001 ancrée", "fil : messages des deux parties"]
      },
      {
        fact: "Une livraison a eu lieu en mars, en quantité inférieure à la commande mensuelle.",
        status: "agreed",
        clause_ids: ["cl_002", "cl_004"],
        source_evidence: ["fil : message Bois du Nord", "fil : message Atelier Trabelsi"]
      },
      {
        fact: `La facture de mars (${MONTHLY_VALUE} TND) n'a pas été réglée à son échéance.`,
        status: "agreed",
        clause_ids: ["cl_005"],
        source_evidence: ["aucune confirmation enregistrée pour ob_003", "fil : message Atelier Trabelsi"]
      },
      {
        fact: `Quantité effectivement livrée en mars : Atelier Trabelsi indique ${MARCH_DELIVERED} panneaux ; Bois du Nord ne conteste pas le principe d'un manquant mais n'a produit aucun bon de livraison chiffré.`,
        status: "disputed",
        clause_ids: ["cl_002", "cl_004"],
        source_evidence: ["fil : messages contradictoires", "bon de livraison non produit"]
      },
      {
        fact: "Retard de 11 jours sur la livraison de mars.",
        status: "disputed",
        clause_ids: ["cl_004"],
        source_evidence: [
          "aucun délai chiffré au contrat (lacune signalée à l'analyse) — le retard ne peut être constaté objectivement"
        ]
      },
      {
        fact: "Une livraison partielle suspend-elle l'exigibilité du prix ? Les deux parties soutiennent l'inverse l'une de l'autre.",
        status: "disputed",
        clause_ids: ["cl_005"],
        source_evidence: ["fil : positions opposées des deux parties"]
      },
      {
        fact: "Rupture d'approvisionnement chez la scierie du Fournisseur.",
        status: "unsupported",
        clause_ids: ["cl_007"],
        source_evidence: ["invoqué dans le fil ; aucune pièce produite"]
      },
      {
        fact: "Deux chantiers de l'Acheteur bloqués et préjudice commercial en découlant.",
        status: "unsupported",
        clause_ids: [],
        source_evidence: ["invoqué dans le fil ; aucune pièce produite"]
      }
    ]
  };
}

function ledgerSummary() {
  const facts = factLedger().facts;
  return {
    agreed: facts.filter((f) => f.status === "agreed").length,
    disputed: facts.filter((f) => f.status === "disputed").length,
    unsupported: facts.filter((f) => f.status === "unsupported").length,
    total: facts.length
  };
}

// Options, not recommendations. No option is marked "best" — that is the
// parties' call, and the ordering here is by amount, not by preference.
function options() {
  return [
    {
      option_id: "opt_001",
      label: "Solde et reprise",
      summary: `Atelier Trabelsi règle ${DELIVERED_VALUE} TND, correspondant aux ${MARCH_DELIVERED} panneaux effectivement reçus. Bois du Nord livre les panneaux manquants sous 15 jours. Aucune pénalité de part et d'autre.`,
      terms: [
        `Paiement de ${DELIVERED_VALUE} TND sous 7 jours`,
        `Livraison de ${MONTHLY_QTY - MARCH_DELIVERED} panneaux sous 15 jours`,
        "Renonciation réciproque à toute pénalité au titre de mars"
      ],
      net_position: { p_buyer: -DELIVERED_VALUE, p_supplier: +DELIVERED_VALUE },
      resolves: ["cl_002", "cl_004", "cl_005"],
      addresses_root_cause: false
    },
    {
      option_id: "opt_002",
      label: "Compensation immédiate",
      summary: `Bois du Nord émet un avoir de ${SHORTFALL_VALUE} TND. Atelier Trabelsi règle la facture de mars sous déduction de cet avoir. La commande de mars est close en l'état, sans rattrapage.`,
      terms: [
        `Avoir de ${SHORTFALL_VALUE} TND émis par Bois du Nord`,
        `Paiement de ${MONTHLY_VALUE - SHORTFALL_VALUE} TND sous 7 jours`,
        "La commande de mars est soldée ; aucun rattrapage n'est dû"
      ],
      net_position: { p_buyer: -(MONTHLY_VALUE - SHORTFALL_VALUE), p_supplier: +(MONTHLY_VALUE - SHORTFALL_VALUE) },
      resolves: ["cl_002", "cl_005"],
      addresses_root_cause: false
    },
    {
      option_id: "opt_003",
      label: "Règlement global et correction du contrat",
      summary: `Même règlement financier que « Solde et reprise », assorti d'un avenant corrigeant les trois clauses signalées comme non conformes à l'analyse : prix déterminable (art. 3), délai chiffré et pénalité (art. 4), résiliation avec préavis réciproque et exonération limitée (art. 7).`,
      terms: [
        `Paiement de ${DELIVERED_VALUE} TND sous 7 jours`,
        `Livraison de ${MONTHLY_QTY - MARCH_DELIVERED} panneaux sous 15 jours`,
        "Signature d'un avenant reprenant les rédactions proposées pour les articles 3, 4 et 7",
        "Ajout d'une clause de force majeure et d'une clause de règlement des différends"
      ],
      net_position: { p_buyer: -DELIVERED_VALUE, p_supplier: +DELIVERED_VALUE },
      resolves: ["cl_002", "cl_003", "cl_004", "cl_005", "cl_007"],
      addresses_root_cause: true
    }
  ];
}

// What the system offers when the parties are stuck. Framed as observations
// about the file, addressed to both parties at once — never advice to one side.
function suggestions() {
  return [
    {
      suggestion_id: "sg_001",
      trigger: "disputed_fact",
      title: "Le désaccord sur la quantité se règle par une pièce, pas par un arbitrage",
      body: `La quantité livrée en mars est le seul fait chiffré en litige, et il est vérifiable : le bon de livraison signé au dépôt le tranche immédiatement. Tant qu'il n'est pas produit, ce fait restera « contesté » dans le tableau et aucune option chiffrée ne repose sur une base solide.`,
      action: "Produire le bon de livraison de mars",
      addressed_to: "both"
    },
    {
      suggestion_id: "sg_002",
      trigger: "gap_blocks_claim",
      title: "Le retard de 11 jours n'est pas opposable en l'état",
      body: `Le contrat ne fixe aucun délai chiffré — c'est la lacune « critique » relevée à l'analyse. Un retard ne peut donc pas être constaté objectivement, quelle que soit sa durée réelle. Cela vaut dans les deux sens : l'Acheteur ne peut pas en tirer de pénalité, et le Fournisseur ne peut pas s'en prévaloir comme d'une exécution conforme.`,
      action: "Chiffrer le délai dans l'avenant",
      addressed_to: "both"
    },
    {
      suggestion_id: "sg_003",
      trigger: "unenforceable_relied_upon",
      title: "L'article 7 est invoqué alors qu'il a été signalé comme non conforme",
      body: `Bois du Nord fonde sa position sur l'article 7. L'analyse du contrat a signalé deux stipulations de cet article comme contraires à des dispositions du COC (art. 244 sur l'exonération, art. 242 sur la révocation unilatérale). Une position construite sur cette clause est fragile pour les deux parties : elle ne protège pas le Fournisseur autant qu'il le pense, et elle n'ouvre pas à l'Acheteur un droit automatique.`,
      action: "Voir les articles cités dans l'analyse",
      addressed_to: "both"
    },
    {
      suggestion_id: "sg_004",
      trigger: "batna_disproportionate",
      title: "Le coût du contentieux dépasse l'écart qui sépare les parties",
      body: `L'écart entre les positions est de ${SHORTFALL_VALUE} TND. Le coût standardisé d'un contentieux sur une créance de ${CLAIM_AMOUNT} TND est estimé entre ${Math.round((CLAIM_AMOUNT * band(REFERENCE.cost_percent_of_claim).low) / 100)} et ${Math.round((CLAIM_AMOUNT * band(REFERENCE.cost_percent_of_claim).high) / 100)} TND, pour une durée de ${Math.round(band(REFERENCE.duration_days).low)} à ${Math.round(band(REFERENCE.duration_days).high)} jours. Ce constat vaut pour les deux parties de la même manière.`,
      action: "Voir le détail et la source",
      addressed_to: "both"
    }
  ];
}

function rounds() {
  return [
    {
      round: 1,
      proposer: "system",
      at: scenario.shift(scenario.T.escalated),
      note: "Trois options générées à partir du tableau des faits. Aucune n'est recommandée : le choix appartient aux parties.",
      option_ids: ["opt_001", "opt_002", "opt_003"],
      responses: {}
    }
  ];
}

function report(overlay = {}) {
  const acceptances = overlay.acceptances || {};
  const r = rounds();
  r[0].responses = acceptances;

  const accepted = Object.keys(acceptances).filter(
    (id) => acceptances[id] && acceptances[id].p_buyer === "accepted" && acceptances[id].p_supplier === "accepted"
  );

  return {
    dispute_id: DISPUTE_ID,
    contract_id: scenario.CONTRACT_ID,
    status: accepted.length ? "settled" : "open",
    opened_at: scenario.shift(scenario.T.escalated),
    governing_version: {
      version_id: "v_001",
      doc_type: "original",
      explanation:
        "La version en vigueur à la date des faits (livraison de mars) est la version originale v_001. La proposition renforcée v_002 n'a jamais été signée : elle ne régit donc aucun des événements en litige.",
      effective_from: scenario.shift(scenario.T.signed)
    },
    claims: [
      `Bois du Nord réclame le paiement de la facture de mars, soit ${MONTHLY_VALUE} TND.`,
      `Atelier Trabelsi réclame la livraison des ${MONTHLY_QTY - MARCH_DELIVERED} panneaux manquants, soit ${SHORTFALL_VALUE} TND, et conteste devoir le prix d'une marchandise non reçue.`
    ],
    fact_ledger: { ...factLedger(), summary: ledgerSummary() },
    batna: batna(),
    settlement_options: options(),
    suggestions: suggestions(),
    negotiation: { rounds: r, current_round: 1 },
    settled_option_id: accepted[0] || null,
    anchor: {
      attest_tx: "0x9f4d2b7e1a6c58039f4d2b7e1a6c58039f4d2b7e1a6c58039f4d2b7e1a6c5803",
      event_type: "dispute_opened"
    },
    neutrality: {
      shared_ledger: true,
      shared_batna: true,
      note: "Analyse neutre : aucun conseil n'est donné à l'une des parties contre l'autre."
    },
    liability: {
      lawyer_review_required: true,
      note:
        "Un accord signé ici vaut transaction obligatoire entre les parties au sens du Titre XI du COC (art. 1458 et suivants). La signature doit être précédée d'une relecture par un avocat."
    }
  };
}

module.exports = { DISPUTE_ID, report, options, factLedger, batna, suggestions, CLAIM_AMOUNT };
