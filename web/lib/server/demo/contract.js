// The demo contract itself, and the analysis of it.
//
// Why this lives here and not in the agent: an `unenforceable` finding is
// structurally impossible to construct in agent/ without a retrieved legal_ref
// (core/schemas.py RiskFlag.__post_init__ raises), and lexical retrieval only
// proves an article shares vocabulary with a clause — not that it governs it.
// The three unenforceable findings below cite articles a human read in
// rag/corpus/fr/normative/cocFR.md and confirmed. The excerpts are quoted from
// that file verbatim, so a wrong citation is visible to anyone who opens it.
//
// The ambiguous findings mirror what hardening_agent actually produces on this
// same text (verified against a live POST /harden run) — they are staged here
// only so the demo does not depend on the agent being up.

const CONTRACT_TEXT = `CONTRAT DE FOURNITURE DE PANNEAUX DE BOIS

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

// Verbatim from agent/rag/corpus/fr/normative/cocFR.md. Quoted, not paraphrased:
// the whole point of showing an excerpt is that the reader can check it.
const COC = {
  242: {
    source_doc: "Code des obligations et des contrats",
    article_ref: "Article 242",
    excerpt:
      "Les obligations contractuelles valablement formées tiennent lieu de loi à ceux qui les ont faites, et ne peuvent être révoquées que de leur consentement mutuel ou dans les cas prévus par la loi."
  },
  243: {
    source_doc: "Code des obligations et des contrats",
    article_ref: "Article 243",
    excerpt:
      "Tout engagement doit être exécuté de bonne foi, et oblige, non seulement à ce qui y est exprimé, mais aussi à toutes les suites que la loi, l'usage ou l'équité donnent à l'obligation d'après sa nature."
  },
  244: {
    source_doc: "Code des obligations et des contrats",
    article_ref: "Article 244",
    excerpt:
      "On ne peut stipuler d'avance qu'on ne sera pas tenu de sa faute lourde ou de son dol."
  },
  579: {
    source_doc: "Code des obligations et des contrats",
    article_ref: "Article 579",
    excerpt:
      "Le prix de la vente doit être déterminé. On ne peut en rapporter la détermination à un tiers ni acheter au prix payé par un tiers, à moins que le prix ne soit connu des contractants. On peut, cependant, s'en référer au prix fixé dans une mercuriale, ou tarif déterminé, ou à la moyenne des prix du marché, lorsqu'il s'agit de marchandises dont le prix ne subit pas de variations."
  },
  63: {
    source_doc: "Code des obligations et des contrats",
    article_ref: "Article 63",
    excerpt:
      "La chose qui forme l'objet de l'obligation doit être déterminée au moins quant à son espèce. La quotité de la chose peut être incertaine pourvu qu'elle puisse être déterminée par la suite."
  }
};

const CLAUSES = [
  { clause_id: "cl_001", type: "parties", language: "fr", article: "Article 1" },
  { clause_id: "cl_002", type: "object", language: "fr", article: "Article 2" },
  { clause_id: "cl_003", type: "price", language: "fr", article: "Article 3" },
  { clause_id: "cl_004", type: "delivery", language: "fr", article: "Article 4" },
  { clause_id: "cl_005", type: "payment", language: "fr", article: "Article 5" },
  { clause_id: "cl_006", type: "quality", language: "fr", article: "Article 6" },
  { clause_id: "cl_007", type: "termination", language: "fr", article: "Article 7" }
];

// Three risk kinds, three different remedies — the taxonomy the product is
// built on. `unenforceable` must be fixed, `ambiguous` needs objective
// criteria, `asymmetric` is flagged for awareness and never silently rewritten.
const RECOMMENDATIONS = [
  {
    clause_id: "cl_007",
    risk_kind: "unenforceable",
    rationale:
      "La clause exonère le Fournisseur de toute responsabilité « en aucun cas ». Une exonération rédigée aussi largement couvre nécessairement la faute lourde et le dol, ce que le COC interdit de stipuler à l'avance.",
    original:
      "Le Fournisseur ne pourra en aucun cas etre tenu responsable des consequences d'une rupture de stock.",
    proposed:
      "Le Fournisseur n'est pas tenu des conséquences d'une rupture de stock résultant d'un événement de force majeure au sens de l'article 283 du COC. Cette exclusion ne s'applique ni à la faute lourde ni au dol du Fournisseur, conformément à l'article 244 du COC.",
    applied: false,
    grounded: true,
    citation_kind: "verified",
    legal_basis: [COC[244]]
  },
  {
    clause_id: "cl_007",
    risk_kind: "unenforceable",
    rationale:
      "La résiliation « à tout moment et sans préavis » au profit d'une seule partie revient à permettre la révocation unilatérale d'un contrat valablement formé, hors des cas prévus par la loi.",
    original:
      "Le Fournisseur pourra resilier a tout moment et sans preavis en cas de difficulte d'approvisionnement.",
    proposed:
      "Chaque partie peut résilier le contrat moyennant un préavis écrit de trente (30) jours. En cas de difficulté d'approvisionnement durable, le Fournisseur en informe l'Acheteur sans délai ; la résiliation prend effet trente (30) jours après cette notification.",
    applied: false,
    grounded: true,
    citation_kind: "verified",
    legal_basis: [COC[242], COC[243]]
  },
  {
    clause_id: "cl_003",
    risk_kind: "unenforceable",
    rationale:
      "« Révisé selon le prix du marché » ne désigne ni mercuriale, ni tarif, ni moyenne identifiable : le prix n'est pas déterminable, et la révision est laissée à l'appréciation d'une seule partie.",
    original: "Le prix pourra etre revise selon le prix du marche.",
    proposed:
      "Le prix unitaire est révisable au 1er janvier de chaque année, par application de la variation de l'indice des prix à la production industrielle publié par l'Institut National de la Statistique. Toute révision est notifiée par écrit trente (30) jours avant sa prise d'effet.",
    applied: false,
    grounded: true,
    citation_kind: "verified",
    legal_basis: [COC[579]]
  },
  {
    clause_id: "cl_002",
    risk_kind: "ambiguous",
    rationale:
      "Une quantité approximative empêche de constater une livraison incomplète : sans quotité déterminable, 28 panneaux et 40 panneaux sont également conformes.",
    original: "en quantite approximative de 40 unites par mois",
    proposed:
      "Le Fournisseur livre quarante (40) panneaux par mois, avec une tolérance de ±5 %. En deçà, la livraison est réputée incomplète et l'Acheteur peut en exiger le complément sous quinze (15) jours.",
    applied: false,
    grounded: true,
    citation_kind: "verified",
    legal_basis: [COC[63]]
  },
  {
    clause_id: "cl_004",
    risk_kind: "ambiguous",
    rationale:
      "« Délai raisonnable » n'a pas de valeur chiffrée : aucun retard ne peut être constaté objectivement, et chaque retard se renégocie de zéro.",
    original: "dans un delai raisonnable a compter de la reception de la commande",
    proposed:
      "Le Fournisseur livre au plus tard quinze (15) jours calendaires après réception de la commande. Tout dépassement ouvre droit à une pénalité de 0,5 % du montant de la commande par jour de retard, plafonnée à 10 %.",
    applied: false,
    grounded: false,
    citation_kind: "none",
    no_legal_basis: {
      message:
        "Aucun extrait pertinent retrouvé dans le corpus pour cette formulation. La recommandation reste une bonne pratique de rédaction, sans base légale citée."
    },
    legal_basis: []
  },
  {
    clause_id: "cl_006",
    risk_kind: "ambiguous",
    rationale:
      "« Qualité convenue entre les parties » ne renvoie à aucun standard vérifiable : en cas de litige sur la conformité, rien ne permet de trancher.",
    original: "Les marchandises seront conformes a la qualite convenue entre les parties.",
    proposed:
      "Les panneaux sont conformes à la norme NT 21.86 (contreplaqué à usage intérieur), épaisseur 18 mm ±0,5 mm, taux d'humidité ≤ 12 %. L'Acheteur dispose de sept (7) jours après livraison pour émettre des réserves écrites.",
    applied: false,
    grounded: false,
    citation_kind: "none",
    no_legal_basis: {
      message:
        "Aucun extrait pertinent retrouvé dans le corpus pour cette formulation. La recommandation reste une bonne pratique de rédaction, sans base légale citée."
    },
    legal_basis: []
  },
  {
    clause_id: "cl_007",
    risk_kind: "asymmetric",
    rationale:
      "La faculté de résiliation ne joue que dans un sens. Signalé pour information : une clause déséquilibrée reste valable, mais l'Acheteur doit savoir qu'il ne dispose pas de la même sortie.",
    original:
      "Le Fournisseur pourra resilier a tout moment [...] (aucune faculté équivalente pour l'Acheteur)",
    proposed: "",
    applied: false,
    grounded: false,
    citation_kind: "none",
    no_legal_basis: {
      message:
        "Déséquilibre signalé pour information. Aucune disposition impérative n'est invoquée : le système ne réécrit jamais une clause valable au seul motif qu'elle est défavorable."
    },
    legal_basis: []
  }
];

// Absent clauses. A gap is not a defect in something written — it is something
// the contract never says, which is why it is reported separately.
const GAPS = [
  {
    label: "Délai de livraison chiffré",
    why: "Un délai chiffré est ce qui transforme un retard en fait vérifiable plutôt qu'en appréciation. Sans lui, le suivi des échéances ne peut rien constater.",
    severity: "critical"
  },
  {
    label: "Conséquence d'un retard de livraison",
    why: "Si rien n'est prévu, chaque retard se négocie de zéro, au moment où les deux parties sont le moins disposées à s'entendre.",
    severity: "high"
  },
  {
    label: "Conséquence d'un retard de paiement",
    why: "Symétrique du précédent : le Fournisseur a besoin du même point d'ancrage que l'Acheteur.",
    severity: "high"
  },
  {
    label: "Règlement des différends",
    why: "Convenir à froid de la manière de régler un désaccord coûte bien moins cher qu'à chaud.",
    severity: "medium"
  },
  {
    label: "Force majeure",
    why: "Sans clause, toute interruption extérieure devient discutable — et l'article 7 tente précisément de combler ce vide par une exonération trop large.",
    severity: "medium"
  },
  {
    label: "Droit applicable et juridiction compétente",
    why: "Les deux parties sont établies en Tunisie, mais rien ne le dit. En cas de litige, la compétence se discute avant même le fond.",
    severity: "low"
  }
];

function grounding() {
  const total = RECOMMENDATIONS.length;
  const grounded = RECOMMENDATIONS.filter((r) => r.grounded).length;
  return {
    total_recommendations: total,
    grounded_recommendations: grounded,
    corpus_size: 1451,
    all_ungrounded: grounded === 0
  };
}

function riskCounts() {
  const count = (kind) => RECOMMENDATIONS.filter((r) => r.risk_kind === kind).length;
  return {
    unenforceable: count("unenforceable"),
    ambiguous: count("ambiguous"),
    asymmetric: count("asymmetric")
  };
}

module.exports = {
  CONTRACT_TEXT,
  CLAUSES,
  RECOMMENDATIONS,
  GAPS,
  COC,
  grounding,
  riskCounts
};
