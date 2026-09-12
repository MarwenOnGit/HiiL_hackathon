"""Closed vocabularies shared by every agent.

Anything with a fixed set of allowed values lives here, so a string literal
never becomes the de-facto schema. Imported by schemas.py, both agents, and
the prompt config — never the other way round, so this module stays free of
project dependencies.
"""

from enum import Enum


class StrEnum(str, Enum):
    """Serialises as its value, compares equal to that string.

    Keeps JSON round-trips trivial (json.dumps writes the plain string) while
    still failing loudly on a typo at construction time.
    """

    def __str__(self) -> str:
        return self.value


class DocType(StrEnum):
    """What a version *is* in the contract's life."""

    ORIGINAL = "original"    # what the user uploaded, before any analysis
    HARDENED = "hardened"    # our proposed redlines — a proposal, never anchored
    SIGNED = "signed"        # accepted by both parties
    AMENDMENT = "amendment"  # a later change, itself signed


class VersionStatus(StrEnum):
    """Whether a version has force.

    A PROPOSED version never governs anything: it is an offer, not a fact.
    version_manager excludes it from governing-version resolution.
    """

    PROPOSED = "proposed"
    IN_FORCE = "in_force"
    SUPERSEDED = "superseded"


class ReviewStatus(StrEnum):
    """How much human scrutiny a version has had.

    Load-bearing for the human gate (CLAUDE.md invariant 4): nothing binding
    may rest on a version still at NONE.
    """

    NONE = "none"
    PARTY_ACCEPTED = "party_accepted"
    LAWYER_VALIDATED = "lawyer_validated"


class RiskKind(StrEnum):
    """Three failure modes needing three different remedies.

    Kept distinct because collapsing them into a severity score loses the
    remedy: ASYMMETRIC is flagged for awareness and never silently rewritten,
    while UNENFORCEABLE must be fixed.
    """

    UNENFORCEABLE = "unenforceable"  # contradicts a mandatory/public-order provision
    AMBIGUOUS = "ambiguous"          # "reasonable delay", "agreed quality"
    ASYMMETRIC = "asymmetric"        # enforceable but lopsided


class ObligationState(StrEnum):
    """Silence is a recorded fact, not a gap.

    OVERDUE_UNCONFIRMED exists so that "due date passed, nobody said anything"
    is a state we can name and timestamp, rather than an absence.
    """

    PENDING = "pending"
    OVERDUE_UNCONFIRMED = "overdue_unconfirmed"
    PERFORMED = "performed"
    BREACHED = "breached"
    WAIVED = "waived"
    CURED = "cured"


class FactStatus(StrEnum):
    """Where a fact sits once both parties' accounts are reconciled.

    UNSUPPORTED is the honest default, not a failure: a fact nobody evidenced
    lands here rather than being asserted. Thread messages land here too —
    see the chat spec's Known limitations.
    """

    AGREED = "agreed"
    DISPUTED = "disputed"
    UNSUPPORTED = "unsupported"


class Language(StrEnum):
    """Detected at clause granularity, never per document."""

    FR = "fr"
    AR = "ar"


class CorpusType(StrEnum):
    """Which body of text a retrieval hit came from.

    NORMATIVE answers "what must this clause say"; EVALUATIVE answers "what
    happens if we fight". Mixing them produces confidently wrong output, so
    retrieval filters on this, always.
    """

    NORMATIVE = "normative"
    CLAUSE_LIBRARY = "clause_library"
    EVALUATIVE = "evaluative"
