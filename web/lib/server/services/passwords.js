// Password hashing for the email/password MSME sign-in — scrypt from node's
// standard library (no dependency, deliberately: the demo machine has no
// registry-free reason to grow a bcrypt binary). Hash format:
//   "scrypt$N$r$p$salt$derived"   in hex, verified via timingSafeEqual.

const crypto = require("crypto");

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

function hash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(password), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt}$${derived.toString("hex")}`;
}

function verify(password, stored) {
  if (!stored) return false;
  const parts = String(stored).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hex] = parts;
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  if (expected.length === 0) return false;
  const actual = crypto.scryptSync(String(password), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p)
  });
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = { hash, verify };