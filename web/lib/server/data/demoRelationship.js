// Stands in for Agent 1 (RAG extraction) until the real agent-service exists.
// Shaped exactly like the schema in ARCHITECTURE.md Section 6.1, so swapping
// this for a real call later is a drop-in replacement — nothing downstream
// needs to change.
//
// Grounded in a realistic Tunisian MSME scenario: a small carpentry workshop
// in Tunis (the MSME) and its recurring wood-panel supplier (the counterparty).

function demoRelationship() {
  return {
    relationship_id: "rel_demo_001",
    source: "whatsapp_export",
    parties: {
      msme_owner: { user_id: "user_ines", name: "Ines Trabelsi — Atelier Trabelsi (menuiserie)" },
      counterparty: { name: "Karim Fkih — Société Bois du Nord", contact: "+216 98 XXX XXX", on_chain_address: null }
    },
    evidence: [
      {
        type: "message",
        timestamp: "2026-06-03T09:14:00Z",
        excerpt: "Bonjour Karim, il me faut 40 panneaux de contreplaqué 18mm pour la commande de juillet, comme d'habitude.",
        source_ref: "whatsapp_export.txt#L112"
      },
      {
        type: "message",
        timestamp: "2026-06-03T09:41:00Z",
        excerpt: "Ca marche Ines, meme prix que d'habitude, 45 TND le panneau, livraison sous 5 jours, paiement 30 jours apres livraison.",
        source_ref: "whatsapp_export.txt#L118"
      },
      {
        type: "message",
        timestamp: "2026-07-02T08:02:00Z",
        excerpt: "Meme commande que juin, 40 panneaux, tu peux livrer vendredi?",
        source_ref: "whatsapp_export.txt#L204"
      },
      {
        type: "message",
        timestamp: "2026-08-01T10:30:00Z",
        excerpt: "Karim le paiement de juillet a du retard, mon client me paie tard aussi, je regle la semaine prochaine sans faute.",
        source_ref: "whatsapp_export.txt#L268"
      }
    ],
    financial_terms_detected: {
      amount: 1800,
      currency: "TND",
      payment_schedule: "net 30 days after delivery, monthly recurring order",
      goods_or_services: "40 plywood panels (18mm) per month",
      recurring: true
    },
    confidence: 0.82,
    raw_thread_hash: null // filled in by the route handler once the export text is hashed
  };
}

module.exports = { demoRelationship };
