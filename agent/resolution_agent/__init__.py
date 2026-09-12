"""Agent 2 — resolution. Reconciles facts, estimates each side's court
outcome, and proposes settlement options.

Bound by the liability posture in CLAUDE.md:
  1. never decides anything binding — every binding act is a human signature
  2. neutral by design — both parties see the SAME ledger and the SAME figures
  3. every figure traceable to a published source, shown as a range
  4. settlement drafting carries a lawyer-review flag
  5. never describe a settlement as carrying the force of a court ruling —
     that characterisation is unverified for Tunisia. The approved wording
     is "binding settlement enforceable between the parties".

Rule 2 has a consequence this package takes seriously: it never analyses the
contract itself (invariant 5). It reads the object Agent 1 built.
"""

from .orchestrator import DisputeReport, resolve

__all__ = ["DisputeReport", "resolve"]
