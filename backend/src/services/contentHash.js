// The content fingerprint, shared by both halves of the system.
//
// Keccak-256 over a canonical byte form. `agent/core/hashing.py` implements the
// identical rules; the two MUST produce the same digest for the same document,
// and a test vector in docs/cross-team/2026-09-12-chain-interface-v3-request.md
// lets anyone confirm that without coordinating.
//
// Agreeing on the algorithm is only half the problem. Two systems hashing "the
// same document" disagree just as easily over encoding, line endings and
// trailing whitespace. The canonicalisation below pins all of it.

const { ethers } = require("ethers");

/**
 * The exact bytes both sides hash. Rules, in order — keep in lockstep with
 * `canonical_bytes` in agent/core/hashing.py:
 *   1. Unicode NFC
 *   2. CRLF and lone CR become LF
 *   3. trailing whitespace stripped per line
 *   4. leading/trailing blank space of the whole document stripped
 *   5. UTF-8
 */
function canonicalText(text) {
  const normalised = String(text)
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  return normalised
    .split("\n")
    .map((line) => line.replace(/[ \t ]+$/, ""))
    .join("\n")
    .trim();
}

/** 0x-prefixed Keccak-256 of the canonical form. */
function contentHash(text) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalText(text)));
}

module.exports = { canonicalText, contentHash };
