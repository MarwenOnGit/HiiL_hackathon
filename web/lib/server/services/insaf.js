// Centralizes what "Insaf" (إنصاف — Arabic for fairness/impartiality) says at
// each step. Keeping the persona's voice in one place means the frontend just
// renders whatever `insaf` string comes back from the API, instead of
// duplicating copy in two places.

function firstName(fullName) {
  return fullName.split(" — ")[0];
}

function onExtraction(relationship) {
  const owner = firstName(relationship.parties.msme_owner.name);
  const counterparty = firstName(relationship.parties.counterparty.name);
  const terms = relationship.financial_terms_detected;
  return `I went through ${relationship.evidence.length} messages between ${owner} and ${counterparty}. Looks like a recurring order worth ${terms.amount} ${terms.currency}, roughly monthly. Want me to draft a contract from this?`;
}

function onGenerated() {
  return "Drafted. Nothing in here should surprise either side — it's what you were already doing, written down clearly and fairly to both of you.";
}

function onAnchoring() {
  return "Fingerprinting this contract and anchoring it now, so the wording can't be quietly changed later.";
}

function onAnchored(record) {
  return `Anchored as agreement #${record.agreementId}. Anyone can now verify this exact text was what both sides agreed to.`;
}

function onConfirmationCreated() {
  return "Link's ready. Send it — and the code — to your counterparty yourself. The moment they accept, this gets anchored and signed in one step, no extra confirmation needed from you.";
}

function onSigned(role, executed) {
  if (executed) return "Fully confirmed on both sides. This agreement is active.";
  const who = role === "partyA" ? "the MSME owner's" : "the counterparty's";
  return `Got ${who} confirmation. Waiting on the other side before this is fully active.`;
}

function idle() {
  return "Connect a conversation with a business contact and I'll take it from there.";
}

module.exports = { onExtraction, onGenerated, onAnchoring, onAnchored, onConfirmationCreated, onSigned, idle };
