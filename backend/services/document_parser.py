# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Document Parser Service
=======================
Extracts clean text from PDF and tabular data from CSV/Excel files.
Used by the standards/rubrics upload pipeline and export service.

PDF strategy:
  1. Try pypdf text extraction (fast, works on digital PDFs).
  2. If text yield is too low (<50 chars/page average), fall back to OCR:
     render pages as images with Pillow, send to Ollama vision model.

CSV/Excel strategy:
  - CSV: stdlib csv + chardet for encoding detection.
  - Excel: openpyxl if available, else inform caller to use CSV.

Public API
----------
  parse_pdf(file_bytes)           -> ParsedDocument
  parse_csv(file_bytes, filename) -> ParsedDocument
  parse_document(file_bytes, filename, mime_type) -> ParsedDocument
"""

import csv
import io
import logging
import os
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Return type
# ---------------------------------------------------------------------------

@dataclass
class ParsedDocument:
    """Result of parsing any supported document format."""
    text: str                        # Full extracted text, newline-separated
    pages: list[str] = field(default_factory=list)   # Per-page text (PDFs)
    rows: list[dict] = field(default_factory=list)   # Parsed rows (CSV/Excel)
    page_count: int = 0
    method: str = ""                 # "pypdf" | "ocr_vision" | "csv" | "excel"
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# PDF parsing
# ---------------------------------------------------------------------------

def _extract_pdf_text(file_bytes: bytes) -> ParsedDocument:
    """Extract text from a digital (non-scanned) PDF using pypdf."""
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(file_bytes))
    pages = []
    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append(text.strip())

    full_text = "\n\n".join(p for p in pages if p)
    return ParsedDocument(
        text=full_text,
        pages=pages,
        page_count=len(pages),
        method="pypdf",
    )


async def _extract_pdf_ocr(file_bytes: bytes) -> ParsedDocument:
    """
    OCR a scanned PDF using Ollama vision model.
    Renders each page as a PNG with Pillow then sends to llava/minicpm-v.
    Falls back to empty string on any error so the caller can degrade gracefully.
    """
    import base64
    from PIL import Image as PILImage

    try:
        import fitz  # PyMuPDF — optional, better page rendering
        has_fitz = True
    except ImportError:
        has_fitz = False

    from core.config import settings
    import ollama as _ollama

    pages_text = []
    warnings = []

    if has_fitz:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        page_images = []
        for page in doc:
            pix = page.get_pixmap(dpi=150)
            page_images.append(pix.tobytes("png"))
    else:
        # Minimal fallback: use pypdf text even if sparse
        warnings.append("PyMuPDF not installed — OCR quality may be limited. pip install pymupdf for better results.")
        result = _extract_pdf_text(file_bytes)
        result.method = "ocr_vision_fallback"
        result.warnings = warnings
        return result

    model = settings.OLLAMA_MODEL_VISION or "llava"
    # Bare ollama.chat() defaults to 127.0.0.1:11434, ignoring
    # settings.OLLAMA_BASE_URL — nothing listens there inside this app's
    # Docker container (Ollama runs on the host, via host.docker.internal).
    ollama_client = _ollama.Client(host=settings.OLLAMA_BASE_URL)
    for i, img_bytes in enumerate(page_images):
        try:
            b64 = base64.b64encode(img_bytes).decode()
            response = ollama_client.chat(
                model=model,
                messages=[{
                    "role": "user",
                    "content": "Extract all text from this document page exactly as it appears. Output only the text, no commentary.",
                    "images": [b64],
                }],
            )
            pages_text.append(response["message"]["content"].strip())
        except Exception as e:
            logger.warning("OCR failed for page %d: %s", i + 1, e)
            pages_text.append("")

    full_text = "\n\n".join(p for p in pages_text if p)
    return ParsedDocument(
        text=full_text,
        pages=pages_text,
        page_count=len(page_images),
        method="ocr_vision",
        warnings=warnings,
    )


async def parse_pdf(file_bytes: bytes) -> ParsedDocument:
    """
    Parse a PDF. Uses pypdf first; if text yield is low, falls back to OCR.
    """
    result = _extract_pdf_text(file_bytes)

    # Heuristic: if average chars per page < 80, it's probably scanned
    avg_chars = len(result.text) / max(result.page_count, 1)
    if avg_chars < 80:
        logger.info(
            "PDF text yield low (%.0f chars/page avg) — attempting OCR", avg_chars
        )
        result = await _extract_pdf_ocr(file_bytes)
        if not result.text.strip():
            result.warnings.append(
                "OCR produced no text. The file may be an image-only PDF with an "
                "unsupported language, or the Ollama vision model is not running."
            )

    return result


# ---------------------------------------------------------------------------
# CSV / Excel parsing
# ---------------------------------------------------------------------------

def _detect_encoding(file_bytes: bytes) -> str:
    """Guess file encoding. Uses chardet if available, else utf-8-sig."""
    try:
        import chardet
        detected = chardet.detect(file_bytes)
        return detected.get("encoding") or "utf-8-sig"
    except ImportError:
        return "utf-8-sig"


def parse_csv(file_bytes: bytes, filename: str = "file.csv") -> ParsedDocument:
    """
    Parse CSV or Excel into a list of row dicts.
    Returns ParsedDocument where .rows is the parsed data and
    .text is a plain-text representation.
    """
    ext = os.path.splitext(filename.lower())[1]
    warnings = []

    # ── Excel ──
    if ext in (".xlsx", ".xlsm", ".xls"):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
            ws = wb.active
            rows_raw = list(ws.iter_rows(values_only=True))
            if not rows_raw:
                return ParsedDocument(text="", rows=[], method="excel",
                                      warnings=["Spreadsheet appears empty."])
            headers = [str(h) if h is not None else f"col_{i}"
                       for i, h in enumerate(rows_raw[0])]
            rows = [dict(zip(headers, (str(v) if v is not None else "" for v in row)))
                    for row in rows_raw[1:] if any(v is not None for v in row)]
            text = "\n".join("\t".join(str(v) for v in r.values()) for r in rows)
            return ParsedDocument(text=text, rows=rows, page_count=1, method="excel")
        except ImportError:
            warnings.append("openpyxl not installed — cannot parse Excel. Convert to CSV or add openpyxl to requirements.txt.")
            return ParsedDocument(text="", rows=[], method="excel", warnings=warnings)

    # ── CSV ──
    encoding = _detect_encoding(file_bytes)
    try:
        text_content = file_bytes.decode(encoding, errors="replace")
    except Exception:
        text_content = file_bytes.decode("utf-8", errors="replace")

    # Strip BOM
    text_content = text_content.lstrip("﻿")

    reader = csv.DictReader(io.StringIO(text_content))
    try:
        rows = [dict(row) for row in reader if any(v.strip() for v in row.values() if v)]
    except Exception as e:
        return ParsedDocument(text="", rows=[], method="csv",
                              warnings=[f"CSV parse error: {e}"])

    text = "\n".join("\t".join(str(v) for v in r.values()) for r in rows)
    return ParsedDocument(text=text, rows=rows, page_count=1, method="csv",
                          warnings=warnings)


# ---------------------------------------------------------------------------
# Unified entry point
# ---------------------------------------------------------------------------

async def parse_document(
    file_bytes: bytes,
    filename: str,
    mime_type: Optional[str] = None,
) -> ParsedDocument:
    """
    Route to the correct parser based on filename extension or MIME type.
    Always returns a ParsedDocument — never raises.
    """
    ext = os.path.splitext(filename.lower())[1]
    mime = (mime_type or "").lower()

    if ext == ".pdf" or "pdf" in mime:
        try:
            return await parse_pdf(file_bytes)
        except Exception as e:
            logger.error("PDF parse failed: %s", e)
            return ParsedDocument(text="", warnings=[f"PDF parse error: {e}"])

    if ext in (".csv", ".tsv", ".xlsx", ".xlsm", ".xls") or "csv" in mime or "spreadsheet" in mime:
        try:
            return parse_csv(file_bytes, filename)
        except Exception as e:
            logger.error("CSV/Excel parse failed: %s", e)
            return ParsedDocument(text="", warnings=[f"Spreadsheet parse error: {e}"])

    return ParsedDocument(
        text="",
        warnings=[f"Unsupported file type: {ext or mime or 'unknown'}. Supported: PDF, CSV, XLSX."],
    )
