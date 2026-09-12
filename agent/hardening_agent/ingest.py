"""Getting text out of whatever the user uploaded.

OCR is the highest technical risk in this project and the engine is undecided,
so this is an interface with more than one implementation from day one. Nothing
downstream knows which engine ran — swapping after benchmarking is a one-line
registry change, not a refactor.

`PdfIngest` handles a text-layer PDF via pypdf. A scanned PDF has no text layer
and will come back empty; that is reported honestly as `needs_ocr` rather than
returned as an empty contract, because silently analysing zero clauses and
declaring the contract clean is the worst possible failure here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from core.taxonomy import Language


@dataclass
class IngestedDocument:
    text: str
    engine: str
    page_count: int = 1
    needs_ocr: bool = False
    warnings: list[str] = field(default_factory=list)

    @property
    def usable(self) -> bool:
        return bool(self.text.strip()) and not self.needs_ocr


class IngestEngine(Protocol):
    name: str
    def supports(self, path: Path) -> bool: ...
    def extract(self, path: Path) -> IngestedDocument: ...


class PlainTextIngest:
    """.txt / .md — the reliable demo path, and what the seed data uses."""

    name = "plaintext"

    def supports(self, path: Path) -> bool:
        return path.suffix.lower() in {".txt", ".md", ""}

    def extract(self, path: Path) -> IngestedDocument:
        text = path.read_text(encoding="utf-8", errors="replace")
        return IngestedDocument(text=text, engine=self.name, page_count=1)


class PdfIngest:
    """Text-layer PDF via pypdf. No OCR — that is the swappable part."""

    name = "pypdf"

    def supports(self, path: Path) -> bool:
        return path.suffix.lower() == ".pdf"

    def extract(self, path: Path) -> IngestedDocument:
        try:
            from pypdf import PdfReader
        except ImportError:  # pragma: no cover
            return IngestedDocument(
                text="", engine=self.name, needs_ocr=True,
                warnings=["pypdf is not installed; cannot read PDFs"],
            )
        reader = PdfReader(str(path))
        pages = [(page.extract_text() or "") for page in reader.pages]
        text = "\n\n".join(pages).strip()
        if not text:
            return IngestedDocument(
                text="", engine=self.name, page_count=len(pages), needs_ocr=True,
                warnings=[
                    "this PDF has no text layer — it is probably a scan. An OCR "
                    "engine is required; analysing it as an empty contract would "
                    "wrongly report it as having no defects."
                ],
            )
        return IngestedDocument(text=text, engine=self.name, page_count=len(pages))


class OcrIngest:
    """Placeholder for the OCR engine, deliberately not chosen yet.

    Present so the registry has two real shapes and the swap is proven to be a
    registry change. Raises rather than pretending, so nobody demos against a
    stub believing it is real OCR.
    """

    name = "ocr-unconfigured"

    def supports(self, path: Path) -> bool:
        return False

    def extract(self, path: Path) -> IngestedDocument:
        raise NotImplementedError(
            "no OCR engine has been selected yet — benchmark one, then register "
            "it in hardening_agent/ingest.py::ENGINES"
        )


ENGINES: list[IngestEngine] = [PlainTextIngest(), PdfIngest(), OcrIngest()]


def get_engine(path: Path) -> IngestEngine:
    for engine in ENGINES:
        if engine.supports(path):
            return engine
    raise ValueError(f"no ingest engine handles {path.suffix or 'this file'}")


def ingest(path: Path) -> IngestedDocument:
    return get_engine(path).extract(path)


def detect_language(text: str) -> Language:
    """Arabic if the text is meaningfully Arabic-script, else French.

    Called per clause, never per document (invariant 8): a Tunisian commercial
    contract is routinely bilingual, and tagging the whole file French sends an
    Arabic clause into a French drafting prompt.
    """
    arabic = sum(1 for ch in text if "؀" <= ch <= "ۿ")
    letters = sum(1 for ch in text if ch.isalpha())
    if letters and arabic / letters > 0.3:
        return Language.AR
    return Language.FR
