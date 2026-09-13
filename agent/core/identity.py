"""Party pseudonyms for the chain.

**This is a stub, and saying so is the point.** It gives every party a stable,
distinct, pseudonymous identifier with no key management — and it gives you no
authentication whatsoever. Nothing here proves the named party consented to
anything.

The two honest paths, and this file takes the first:

**Deferred (what this is).** The relayer keys stay as they are. A party's
on-chain identifier is derived from its internal record — a salted hash of the
party id — and is anchored as *data*, not as a signer. Stable across runs,
distinct per party, zero custody. Does not authenticate.

**Real (not built).** Each party holds its own keypair, signs its own
agreements, and the address *is* the identity. That drags in custody, key
recovery and onboarding: a project, not a task.

Say which one you are on when demonstrating this. A stubbed identity layer
described plainly reads as competence; a vague claim of pseudonymity that
collapses under one question does not.
"""

from __future__ import annotations

import os

from .hashing import keccak256

# A fixed default so seeded demos reproduce byte-for-byte. Override per
# deployment: the salt is what stops a pseudonym from being reversed by anyone
# who can guess the internal id, so a shared default is fine for a demo and
# wrong for anything real.
DEFAULT_SALT = "insaf-demo-salt-v3"
PSEUDONYM_BYTES = 8


def party_salt() -> str:
    return os.environ.get("PARTY_PSEUDONYM_SALT", DEFAULT_SALT)


def derive_pseudonym(party_id: str, *, salt: str | None = None) -> str:
    """Stable pseudonymous id for a party. Not a wallet, not a credential.

    Deterministic, so the same party is recognisable across anchors and a
    seeded demo reproduces exactly.
    """
    if not party_id:
        raise ValueError("party_id is required to derive a pseudonym")
    digest = keccak256(f"{salt or party_salt()}|{party_id}".encode("utf-8"))
    return "pseudo_" + digest[:PSEUDONYM_BYTES].hex()


# What the chain layer should report about itself, so no caller has to guess
# how much this identifier is worth.
IDENTITY_MODEL = {
    "mode": "deferred",
    "authenticates_parties": False,
    "note": (
        "Party identifiers are salted hashes of internal party records, "
        "anchored as data rather than as signers. They are stable and distinct "
        "but prove no consent: every transaction is still submitted by the "
        "platform relayer. Real per-party signing requires key custody and is "
        "not built."
    ),
}
