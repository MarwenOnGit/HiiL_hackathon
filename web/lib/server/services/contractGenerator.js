// Template-based contract generation — deliberately NOT calling any LLM.
// Input/output are shaped exactly like ARCHITECTURE.md Section 6.1 / 6.2, so
// this function is a drop-in stand-in for the real agent-service's
// contract-generation agent later — same shape in, same shape out.

const { ethers } = require("ethers");
const { randomUUID } = require("crypto");

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
}

function earliestAndLatest(evidence) {
  const timestamps = evidence.map((e) => new Date(e.timestamp).getTime()).sort((a, b) => a - b);
  return {
    earliest: formatDate(new Date(timestamps[0]).toISOString()),
    latest: formatDate(new Date(timestamps[timestamps.length - 1]).toISOString())
  };
}

function recommendConsentTier(relationship) {
  if (relationship.parties.counterparty.on_chain_address) return "FULL_PLATFORM";
  // No verified OTP/witness capture wired up yet in this version — default to
  // the honest baseline tier. The UI lets the MSME owner upgrade this before
  // anchoring if they do capture stronger consent (see ARCHITECTURE.md Section 5/7).
  return "UNILATERAL";
}

function buildClauses(relationship) {
  const { parties, financial_terms_detected: terms, evidence } = relationship;
  const { earliest, latest } = earliestAndLatest(evidence);

  const clauses = [
    {
      title: "Parties",
      body: `This agreement is entered into between ${parties.msme_owner.name} ("the MSME") and ${parties.counterparty.name} ("the Counterparty").`
    },
    {
      title: "Subject of the Agreement",
      body: `The Counterparty agrees to supply ${terms.goods_or_services} to the MSME${terms.recurring ? ", on a recurring monthly basis" : ""}.`
    },
    {
      title: "Payment Terms",
      body: terms.amount
        ? `The MSME agrees to pay ${terms.amount} ${terms.currency} per order${terms.payment_schedule ? `, under the following schedule: ${terms.payment_schedule}` : ""}.`
        : "Payment terms are to be confirmed in writing by both parties before this agreement takes effect."
    },
    {
      title: "Basis of This Agreement",
      body: `This agreement formalizes terms both parties have already been operating under, drawn from ${evidence.length} prior communications between ${earliest} and ${latest}. It does not create new obligations beyond what the parties had already agreed to informally — it makes those terms explicit, fair to both sides, and easy to point back to if a disagreement arises.`
    },
    {
      title: "Fair Dealing",
      body: "Both parties agree to communicate promptly regarding any delay, quality concern, or change in circumstances, and to make a good-faith effort to resolve disagreements directly before escalating."
    },
    {
      title: "Dispute Resolution",
      body: "If a concern is raised in writing and remains unresolved after 14 days, both parties agree to seek mediation before pursuing formal legal proceedings, consistent with amicable commercial practice."
    },
    {
      title: "Record of Consent",
      body: "This agreement's exact text is fingerprinted and time-stamped on a shared, tamper-evident record at the time both parties confirm it, so that neither side can alter the agreed terms afterward without it being detectable."
    }
  ];

  return clauses;
}

function generateContract(relationship) {
  const clauses = buildClauses(relationship);
  const generatedAt = new Date().toISOString();

  const header = `AGREEMENT\nGenerated ${formatDate(generatedAt)}\nRelationship reference: ${relationship.relationship_id}\n`;
  const contractText = header + "\n" + clauses.map((c) => `${c.title}\n${c.body}`).join("\n\n");

  const contractTextHash = ethers.keccak256(ethers.toUtf8Bytes(contractText));

  return {
    contract_id: `contract_${randomUUID().slice(0, 8)}`,
    relationship_id: relationship.relationship_id,
    contract_text: contractText,
    contract_text_hash: contractTextHash,
    clauses,
    consent_tier_recommended: recommendConsentTier(relationship),
    generated_at: generatedAt
  };
}

module.exports = { generateContract };
