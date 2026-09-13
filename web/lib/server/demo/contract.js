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

Article 1 — Parties
Entre les soussignés :
Atelier Trabelsi, entreprise de menuiserie sise à Tunis, ci-après dénommée
« l'Acheteur »,
et
Société Bois du Nord, société à responsabilité limitée sise à Grombalia,
ci-après dénommée « le Fournisseur ».

Article 2 — Objet du contrat
Le Fournisseur s'engage à fournir à l'Acheteur des panneaux de contreplaqué d'une
épaisseur de 18 mm, en quantité approximative de 40 unités par mois.

Article 3 — Prix
Le prix unitaire est fixé à 45 TND par panneau, soit 1 800 TND pour une commande
mensuelle. Le prix pourra être révisé selon le prix du marché.

Article 4 — Livraison
Le Fournisseur livre les marchandises dans un délai raisonnable à compter de la
réception de la commande. En cas d'empêchement susceptible d'affecter le délai de
livraison, le Fournisseur en informe l'Acheteur dans les meilleurs délais.

Article 5 — Paiement
L'Acheteur effectue le paiement dans un délai de trente (30) jours à compter de la
livraison, par virement bancaire.

Article 6 — Qualité
Les marchandises seront conformes à la qualité convenue entre les parties.

Article 7 — Résiliation
Le Fournisseur pourra résilier à tout moment et sans préavis en cas de difficulté
d'approvisionnement. Le Fournisseur ne pourra en aucun cas être tenu responsable des
conséquences d'une rupture de stock.`;

// Verbatim from agent/rag/corpus/fr/normative/cocFR.md. Quoted, not paraphrased:
// the whole point of showing an excerpt is that the reader can check it.
const COC = {
  242: {
    source_doc: "Code des obligations et des contrats",
    article_ref: "art. 242",
    excerpt:
      "Les obligations contractuelles valablement formées tiennent lieu de loi à ceux qui les ont faites, et ne peuvent être révoquées que de leur consentement mutuel ou dans les cas prévus par la loi."
  },
  243: {
    source_doc: "Code des obligations et des contrats",
    article_ref: "art. 243",
    excerpt:
      "Tout engagement doit être exécuté de bonne foi, et oblige, non seulement à ce qui y est exprimé, mais aussi à toutes les suites que la loi, l'usage ou l'équité donnent à l'obligation d'après sa nature."
  },
  244: {
    source_doc: "Code des obligations et des contrats",
    article_ref: "art. 244",
    excerpt:
      "On ne peut stipuler d'avance qu'on ne sera pas tenu de sa faute lourde ou de son dol."
  },
  579: {
    source_doc: "Code des obligations et des contrats",
    article_ref: "art. 579",
    excerpt:
      "Le prix de la vente doit être déterminé. On ne peut en rapporter la détermination à un tiers ni acheter au prix payé par un tiers, à moins que le prix ne soit connu des contractants. On peut, cependant, s'en référer au prix fixé dans une mercuriale, ou tarif déterminé, ou à la moyenne des prix du marché, lorsqu'il s'agit de marchandises dont le prix ne subit pas de variations."
  },
  63: {
    source_doc: "Code des obligations et des contrats",
    article_ref: "art. 63",
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
      "Le Fournisseur ne pourra en aucun cas être tenu responsable des conséquences d'une rupture de stock.",
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
      "La clause permet au Fournisseur de résilier le contrat à tout moment et sans préavis, sans accorder la même faculté à l'Acheteur. Cette clause crée un déséquilibre entre les parties et son application doit être appréciée au regard des règles légales applicables.",
    original:
      "Le Fournisseur pourra résilier à tout moment et sans préavis en cas de difficulté d'approvisionnement.",
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
      "Mécanisme de révision du prix insuffisamment défini : « le prix du marché » ne renvoie ni à une mercuriale, ni à un tarif, ni à une moyenne identifiable, et la révision est laissée à l'appréciation d'une seule partie.",
    original: "Le prix pourra être révisé selon le prix du marché.",
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
      "La quantité est annoncée comme approximative : sans quotité déterminable, une livraison de 28 panneaux et une livraison de 40 panneaux sont également conformes au contrat.",
    original: "en quantité approximative de 40 unités par mois",
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
      "Aucun délai chiffré n'est fixé : un retard ne peut être constaté objectivement, et chaque retard se renégocie au cas par cas.",
    original: "dans un délai raisonnable à compter de la réception de la commande",
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
      "La clause ne définit aucun critère objectif permettant de vérifier la conformité des marchandises. En cas de désaccord sur la qualité livrée, rien ne permet de trancher.",
    original: "Les marchandises seront conformes à la qualité convenue entre les parties.",
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
      "La faculté de résiliation ne joue que dans un sens. Signalé pour information : une clause déséquilibrée n'est pas nécessairement écartée, mais l'Acheteur doit savoir qu'il ne dispose pas de la même sortie.",
    original:
      "Le Fournisseur pourra résilier à tout moment et sans préavis […] (aucune faculté équivalente pour l'Acheteur)",
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
    label: "Sanctions ou conséquences en cas de retard de livraison",
    why: "Si rien n'est prévu, chaque retard se négocie au cas par cas, au moment où les deux parties sont le moins disposées à s'entendre.",
    severity: "high"
  },
  {
    label: "Sanctions ou conséquences en cas de retard de paiement",
    why: "Symétrique du précédent : le Fournisseur a besoin du même point de référence que l'Acheteur.",
    severity: "high"
  },
  {
    label: "Clause de règlement des litiges",
    why: "Le document ne prévoit pas la manière de régler un désaccord. Convenir à froid de cette procédure coûte bien moins cher qu'à chaud.",
    severity: "medium"
  },
  {
    label: "Force majeure",
    why: "Le document ne précise pas les conséquences d'un événement de force majeure susceptible d'empêcher ou de retarder son exécution. L'article 7 tente de combler ce vide par une exonération trop large.",
    severity: "medium"
  },
  {
    label: "Droit applicable et juridiction compétente",
    why: "Le document ne précise ni le droit applicable ni la juridiction compétente en cas de litige. Ces éléments permettent de déterminer le cadre juridique applicable et le tribunal compétent en cas de contentieux.",
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
