"""Agent 1 — hardening. Ingests an existing contract and finds what will hurt.

Pipeline: ingest -> segment -> classify -> gap_detect -> risk_score ->
remediate -> extract obligations.

Deterministic throughout. The checklist runs first and the findings are
reproducible across runs, because a demo that answers differently each time is
worthless and a report that cannot be re-derived is not evidence.
"""

from .ingest import IngestEngine, IngestedDocument, PdfIngest, PlainTextIngest, get_engine
from .orchestrator import HardeningReport, harden

__all__ = [
    "IngestEngine", "IngestedDocument", "PdfIngest", "PlainTextIngest",
    "get_engine", "HardeningReport", "harden",
]
