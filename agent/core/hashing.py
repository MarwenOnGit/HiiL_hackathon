"""Content fingerprints — Keccak-256 over a canonical byte form.

**The algorithm is Keccak-256, matching Solidity and the whole Ethereum
toolchain.** The agent layer previously used sha256, which meant the two halves
of the system produced different fingerprints for identical text. Solidity's
`keccak256` is the cheap builtin and every Node/ethers call already assumes it,
so the Python side conforms rather than the other way round.

Implemented here in pure Python because no keccak library is installed and pip
is externally managed on this machine. It is ~60 lines, it is verified against
the official test vectors in `tests/test_hashing.py`, and it adds no dependency
that has to exist on a demo machine.

**Agreeing on the algorithm is only half of it.** Two systems hashing "the same
document" disagree just as easily over encoding, line endings and trailing
whitespace as over the digest function. `canonical_bytes` pins all of that, and
`backend/src/services/contentHash.js` implements the identical rules on the Node
side. A known test vector lives in the cross-team request document so the chain
owner can confirm agreement without coordinating with anyone.
"""

from __future__ import annotations

import unicodedata

_ROUND_CONSTANTS = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]
_ROTATIONS = [
    [0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56], [27, 20, 39, 8, 14],
]
_MASK = (1 << 64) - 1


def _rotl(value: int, shift: int) -> int:
    return ((value << shift) | (value >> (64 - shift))) & _MASK


def _keccak_f(state: list[list[int]]) -> None:
    for rnd in range(24):
        # theta
        c = [state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rotl(c[(x + 1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                state[x][y] ^= d[x]
        # rho and pi
        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                b[y][(2 * x + 3 * y) % 5] = _rotl(state[x][y], _ROTATIONS[x][y])
        # chi
        for x in range(5):
            for y in range(5):
                state[x][y] = b[x][y] ^ ((~b[(x + 1) % 5][y] & _MASK) & b[(x + 2) % 5][y])
        # iota
        state[0][0] ^= _ROUND_CONSTANTS[rnd]


def keccak256(data: bytes) -> bytes:
    """Keccak-256 (the original padding, as used by Ethereum — not NIST SHA3)."""
    rate = 136  # 1088 bits
    state = [[0] * 5 for _ in range(5)]

    padded = bytearray(data)
    padded.append(0x01)                       # Keccak padding, NOT SHA-3's 0x06
    while len(padded) % rate != 0:
        padded.append(0x00)
    padded[-1] |= 0x80

    for offset in range(0, len(padded), rate):
        block = padded[offset:offset + rate]
        for i in range(rate // 8):
            lane = int.from_bytes(block[i * 8:(i + 1) * 8], "little")
            state[i % 5][i // 5] ^= lane
        _keccak_f(state)

    out = bytearray()
    for i in range(4):                        # 32 bytes
        out += state[i % 5][i // 5].to_bytes(8, "little")
    return bytes(out[:32])


def canonical_bytes(text: str) -> bytes:
    """The exact bytes both sides hash.

    Rules, in order, and they must match `contentHash.js` exactly:

    1. Unicode NFC — "é" typed as one codepoint and as e+combining-accent are
       the same character to a reader and must be the same to the hash.
    2. CRLF and lone CR become LF — the same file edited on Windows and on
       Linux is the same contract.
    3. Trailing whitespace stripped per line — invisible, and editors add it.
    4. Leading/trailing blank space of the whole document stripped.
    5. UTF-8.

    Every one of these is a real way two systems disagree about "the same
    document". Pinning them is not fussiness; without it, hash agreement fails
    for reasons nobody can see by looking at the text.
    """
    normalised = unicodedata.normalize("NFC", text)
    normalised = normalised.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in normalised.split("\n")]
    return "\n".join(lines).strip().encode("utf-8")


def content_hash(text: str) -> str:
    """0x-prefixed Keccak-256 of the canonical form. The only hash callers use."""
    return "0x" + keccak256(canonical_bytes(text)).hex()
