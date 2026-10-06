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
  2. If text yield is too low (<80 chars/page average), fall back to OCR:
     render pages as images with PyMuPDF, send to whichever vision-capable
     LLM provider is configured (see agents/provider.py's provider-agnostic
     dispatch() and AGENT_DOCUMENT_OCR_PROVIDER) -- Ollama, Claude, or
     OpenAI, not hardcoded to any one of them.

CSV/Excel strategy:
  - CSV: stdlib csv + chardet for encoding detection.
  - Excel: openpyxl (requirements.txt).

Public API
----------
  parse_pdf(file_bytes)           -> ParsedDocument
  parse_csv(file_bytes, filename) -> ParsedDocument
  parse_document(file_bytes, filename, mime_type) -> ParsedDocument
"""

import asyncio
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

# Table-aware per-page override (moved in from the standards pipeline's
# table_extract.py proof-of-concept -- see HANDOFF.md "table_aware_extract.py",
# 2026-09/10, and the 2026-10-04 Missouri/Ohio grade-band-table fixes).
# pypdf's plain extraction flattens a multi-column table (e.g. a grade-band
# table like "Sixth Grade | Seventh Grade | Eighth Grade") into reading
# order with no column boundary in the text, so a downstream reader has no
# way to tell which column a row came from -- confirmed as the root cause
# of real grade-misattribution bugs on Missouri's and Ohio's standards PDFs.
# PyMuPDF's find_tables() reliably detects the grid, but its own .extract()
# call garbles cell TEXT (confirmed: every character run doubled, e.g.
# "33aa.. K Knnoowwleeledddgggeee" instead of "3a. Knowledge") -- so this
# uses find_tables() only for cell bounding boxes, then re-extracts each
# cell's text with the page's own well-tested get_text(clip=...).
#
# Deliberately scoped to ONLY the pages find_tables() flags as real tables;
# every other page keeps pypdf's plain text unchanged, and any failure in
# this pass (corrupt stream, missing pymupdf) falls back to plain pypdf for
# the whole document rather than failing the parse.
def _dedupe_repeated_block(text: str) -> str:
    """Collapse a "same content twice" artifact seen on some state PDFs
    (looks like an overlapping/duplicated text layer in the source): split
    into non-empty, whitespace-trimmed lines, and if the first half of the
    lines is identical to the second half, keep only one copy."""
    lines = [ln.strip() for ln in text.split("\n")]
    lines = [ln for ln in lines if ln]
    n = len(lines)
    if n >= 2 and n % 2 == 0 and lines[: n // 2] == lines[n // 2 :]:
        lines = lines[: n // 2]
    out = []
    for ln in lines:
        if len(ln) >= 2 and len(ln) % 2 == 0 and ln[: len(ln) // 2] == ln[len(ln) // 2 :]:
            ln = ln[: len(ln) // 2]
        out.append(ln)
    return "\n".join(out)


def _page_has_table(page) -> bool:
    return bool(page.find_tables().tables)


def _extract_page_with_tables(page) -> Optional[str]:
    """Table-aware text for one PyMuPDF page, or None if find_tables()
    detects no table. Each cell comes out as `[column header] cell text`,
    so a row's column (e.g. its grade) is explicit in the text itself
    rather than implied by position."""
    import re as _re
    import pymupdf

    tabs = page.find_tables()
    if not tabs.tables:
        return None

    out_parts: list[str] = []
    covered_rects: list[tuple[float, float, float, float]] = []

    for t_idx, table in enumerate(tabs.tables, 1):
        covered_rects.append(table.bbox)
        # row[0] is sometimes a single full-width merged title bar, not the
        # real header -- use whichever of the first few rows actually has
        # more than one distinct column. A flat ">2" threshold (not a
        # fraction of col_count) correctly separates "1-2 cells, a title"
        # from "several cells, a real header" regardless of how finely the
        # grid is subdivided (found 2026-10-04 on a 15-raw-column grid with
        # only 7 semantically real columns).
        header_row_idx = 0
        for ri, r in enumerate(table.rows[:3]):
            if sum(1 for c in r.cells if c is not None) > 2:
                header_row_idx = ri
                break
        header_row = table.rows[header_row_idx] if table.rows else None
        header_cells = header_row.cells if header_row else []
        header_labels = []
        for bbox in header_cells:
            if bbox is None:
                header_labels.append(None)
                continue
            txt = _dedupe_repeated_block(page.get_text("text", clip=pymupdf.Rect(bbox)).strip())
            header_labels.append(_re.sub(r"\s+", " ", txt) or None)

        out_parts.append(f"--- Table {t_idx} (page {page.number + 1}) ---")
        for row in table.rows[header_row_idx + 1 :]:
            row_had_content = False
            for col_idx, bbox in enumerate(row.cells):
                if bbox is None:
                    continue
                txt = _dedupe_repeated_block(page.get_text("text", clip=pymupdf.Rect(bbox)).strip())
                if not txt:
                    continue
                label = header_labels[col_idx] if col_idx < len(header_labels) and header_labels[col_idx] else f"column {col_idx + 1}"
                out_parts.append(f"[{label}] {txt}")
                row_had_content = True
            if row_had_content:
                out_parts.append("")

    blocks = page.get_text("blocks")
    non_table_text = []
    for b in blocks:
        bx0, by0, bx1, by1, text_ = b[0], b[1], b[2], b[3], b[4]
        inside_a_table = any(
            bx0 >= r[0] - 2 and by0 >= r[1] - 2 and bx1 <= r[2] + 2 and by1 <= r[3] + 2
            for r in covered_rects
        )
        if not inside_a_table and text_.strip():
            non_table_text.append(_dedupe_repeated_block(text_.strip()))

    header_text = "\n".join(non_table_text)
    return (header_text + "\n\n" if header_text else "") + "\n".join(out_parts)


def _extract_pdf_text(file_bytes: bytes) -> ParsedDocument:
    """Extract text from a digital (non-scanned) PDF using pypdf, with a
    table-aware override (see above) on whichever pages PyMuPDF's
    find_tables() flags as a real grid."""
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(file_bytes))
    pages = []
    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append(text.strip())

    try:
        import pymupdf
        fitz_doc = pymupdf.open(stream=file_bytes, filetype="pdf")
        for i, page in enumerate(fitz_doc):
            if i >= len(pages):
                break
            if _page_has_table(page):
                table_text = _extract_page_with_tables(page)
                if table_text:
                    pages[i] = table_text.strip()
        fitz_doc.close()
    except Exception as e:
        logger.warning("table-aware re-extraction skipped: %s", e)

    full_text = "\n\n".join(p for p in pages if p)
    return ParsedDocument(
        text=full_text,
        pages=pages,
        page_count=len(pages),
        method="pypdf",
    )


async def _extract_pdf_ocr(file_bytes: bytes) -> ParsedDocument:
    """
    OCR a scanned PDF using whichever vision-capable LLM provider is
    configured (see agents/provider.py). Renders each page as a PNG with
    Pillow/PyMuPDF then sends it as an image content part.
    Falls back to empty string on any error so the caller can degrade gracefully.
    """
    import base64
    from PIL import Image as PILImage

    try:
        # `import fitz` is PyMuPDF's legacy module name — still works, but
        # emits "The `fitz` API is deprecated... use `import pymupdf`
        # instead" (confirmed 2026-09-14, first time this branch actually
        # ran against a real install). `fitz` itself isn't being removed,
        # just aliased going forward, so `import pymupdf as fitz` keeps
        # every `fitz.*` call below unchanged while resolving the warning.
        import pymupdf as fitz  # PyMuPDF — optional, better page rendering
        has_fitz = True
    except ImportError:
        has_fitz = False

    from core.config import settings
    from agents import provider as _provider

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

    # Resolution order: AGENT_DOCUMENT_OCR_PROVIDER -> LLM_PROVIDER -> "ollama".
    # Ollama's default text model isn't vision-capable, so it gets its
    # dedicated OLLAMA_MODEL_VISION (llava/minicpm-v etc.); Claude and
    # OpenAI's configured default chat models are already vision-capable,
    # so no separate vision-model setting is needed for those two.
    prov = _provider.resolve_provider("AGENT_DOCUMENT_OCR_PROVIDER", "ollama")
    model = (settings.OLLAMA_MODEL_VISION or "llava") if prov == "ollama" else None

    ocr_prompt = "Extract all text from this document page exactly as it appears. Output only the text, no commentary."

    # Bounded concurrency instead of one page at a time, serially — a
    # multi-page scanned PDF previously paid the full round-trip latency of
    # a vision-model call N times in a row before the user saw any result.
    # 3 is a client-side soft cap, not a hard requirement: a local Ollama
    # server queues requests internally rather than running them all in
    # parallel regardless of what we send concurrently, so this mainly
    # helps when the configured provider is Claude/OpenAI (a real remote
    # API that benefits from actual parallelism).
    _MAX_CONCURRENT_OCR_PAGES = 3
    semaphore = asyncio.Semaphore(_MAX_CONCURRENT_OCR_PAGES)

    async def _ocr_one_page(page_num: int, img_bytes: bytes) -> str:
        async with semaphore:
            try:
                b64 = base64.b64encode(img_bytes).decode()
                text = await _provider.dispatch(
                    prov,
                    messages=[{"role": "user", "content": ocr_prompt}],
                    model=model,
                    images=[b64],
                )
                return text.strip()
            except Exception as e:
                logger.warning("OCR failed for page %d: %s", page_num + 1, e)
                return ""

    pages_text = list(await asyncio.gather(*(
        _ocr_one_page(i, img_bytes) for i, img_bytes in enumerate(page_images)
    )))

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
                "unsupported language, or the configured vision model/provider "
                "(see AGENT_DOCUMENT_OCR_PROVIDER) is unavailable."
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
        except Exception as e:
            # A real corrupt/truncated/mislabeled file (a renamed .csv, a
            # legacy .xls binary format saved with an .xlsx extension, a
            # partial download) raises inside openpyxl itself -- e.g.
            # zipfile.BadZipFile, not ImportError. This only had the
            # ImportError branch above until 2026-09-14 (when openpyxl was
            # actually installed for the first time and this path got
            # exercised for real): parse_document()'s outer try/except
            # still caught it, so no caller ever saw a raw exception, but
            # the message it got was the generic "Spreadsheet parse error:
            # {e}" rather than something a teacher can act on. Match the
            # ImportError branch's clarity instead of relying on the
            # outer catch-all.
            logger.warning("Excel parse failed for %r: %s", filename, e)
            return ParsedDocument(text="", rows=[], method="excel",
                                  warnings=[f"Couldn't read this as an Excel file ({type(e).__name__}: {e}). "
                                            f"Confirm it's a valid .xlsx/.xlsm/.xls, or convert to CSV."])

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
# DOCX parsing
# ---------------------------------------------------------------------------

def _iter_docx_blocks(document):
    """python-docx has no public API for walking paragraphs and tables in
    their real document order (only .paragraphs and .tables separately,
    each losing the other's position) -- this is the documented workaround:
    walk the underlying XML body and wrap each child back into the
    matching python-docx object."""
    from docx.oxml.table import CT_Tbl
    from docx.oxml.text.paragraph import CT_P
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    for child in document.element.body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, document)
        elif isinstance(child, CT_Tbl):
            yield Table(child, document)


def parse_docx(file_bytes: bytes) -> ParsedDocument:
    """
    Extract text from a .docx file with python-docx.

    A table's cells are rendered one non-empty cell per line, labeled by
    its column header -- "[column header] cell text" -- the same
    "don't let a standard's grade/position be implied by table formatting
    alone" contract used for table-aware PDF extraction (see
    PPW-Standards_Puller's table_extract.py, built for Missouri's
    grade-comparison tables). A plain per-cell text dump without labels
    would recreate that exact failure mode for any standards document
    published as a Word table instead of a PDF.

    Paragraphs and tables are walked in their real document order (not
    tables-after-all-paragraphs) so a table sitting between two headings
    stays with its actual surrounding context.
    """
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    doc = Document(io.BytesIO(file_bytes))
    parts: list[str] = []

    for block in _iter_docx_blocks(doc):
        if isinstance(block, Paragraph):
            t = block.text.strip()
            if t:
                parts.append(t)
        elif isinstance(block, Table):
            if not block.rows:
                continue
            header = [c.text.strip() for c in block.rows[0].cells]
            for row in block.rows[1:]:
                for col_idx, cell in enumerate(row.cells):
                    txt = cell.text.strip()
                    if not txt:
                        continue
                    label = header[col_idx] if col_idx < len(header) and header[col_idx] else f"column {col_idx + 1}"
                    parts.append(f"[{label}] {txt}")

    full_text = "\n".join(parts)
    # No page concept in a .docx -- one "page" holding everything is correct
    # here: extract.py's chunking is character-count based (CHUNK_CHARS),
    # not page based, so this doesn't lose anything downstream.
    return ParsedDocument(
        text=full_text,
        pages=[full_text] if full_text else [],
        page_count=1,
        method="docx",
    )


# ---------------------------------------------------------------------------
# HTML parsing
# ---------------------------------------------------------------------------

def parse_html(file_bytes: bytes, encoding: str = "utf-8") -> ParsedDocument:
    """
    Extract text from a standards page published as HTML rather than a
    downloadable file (several states' standards only exist this way).

    Strips navigation/script/style noise, then applies the same "label a
    table's cells by column header" treatment used for PDF and DOCX
    tables (table_extract.py, parse_docx() above) before taking the page's
    text -- a <table> is replaced in-place with its own labeled text
    *before* extracting, so document order is preserved (the labeled
    rows end up exactly where the table was) without double-counting the
    table's text once as raw cell content and again as part of a
    surrounding element's .get_text().
    """
    from bs4 import BeautifulSoup, NavigableString

    html = file_bytes.decode(encoding, errors="replace")
    soup = BeautifulSoup(html, "html.parser")

    for tag in soup(["script", "style", "nav", "header", "footer", "noscript", "svg", "form"]):
        tag.decompose()

    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if not rows:
            table.decompose()
            continue
        header = [c.get_text(strip=True) for c in rows[0].find_all(["th", "td"])]
        lines = []
        for row in rows[1:]:
            for col_idx, cell in enumerate(row.find_all(["td", "th"])):
                txt = cell.get_text(strip=True)
                if not txt:
                    continue
                label = header[col_idx] if col_idx < len(header) and header[col_idx] else f"column {col_idx + 1}"
                lines.append(f"[{label}] {txt}")
        table.replace_with(NavigableString("\n" + "\n".join(lines) + "\n"))

    body = soup.body or soup
    full_text = body.get_text(separator="\n", strip=True)
    return ParsedDocument(
        text=full_text,
        pages=[full_text] if full_text else [],
        page_count=1,
        method="html",
    )


# ---------------------------------------------------------------------------
# Unified entry point
# ---------------------------------------------------------------------------

def _strip_nul(doc: ParsedDocument) -> ParsedDocument:
    """Some PDFs' font/encoding tables make pypdf (and, for the same
    underlying reason, other extractors) yield embedded NUL (0x00) bytes in
    otherwise-normal text -- confirmed on Ohio's math standards PDF, page 23.
    Postgres' text type rejects NUL outright (CharacterNotInRepertoireError),
    so any consumer that stores this in the DB needs it gone; stripping here,
    once, covers every caller rather than each one re-discovering the bug."""
    if "\x00" in doc.text:
        doc.text = doc.text.replace("\x00", "")
    doc.pages = [p.replace("\x00", "") if "\x00" in p else p for p in doc.pages]
    return doc


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
            return _strip_nul(await parse_pdf(file_bytes))
        except Exception as e:
            logger.error("PDF parse failed: %s", e)
            return ParsedDocument(text="", warnings=[f"PDF parse error: {e}"])

    if ext in (".csv", ".tsv", ".xlsx", ".xlsm", ".xls") or "csv" in mime or "spreadsheet" in mime:
        try:
            return _strip_nul(parse_csv(file_bytes, filename))
        except Exception as e:
            logger.error("CSV/Excel parse failed: %s", e)
            return ParsedDocument(text="", warnings=[f"Spreadsheet parse error: {e}"])

    if ext == ".docx" or "wordprocessingml" in mime:
        try:
            return _strip_nul(parse_docx(file_bytes))
        except ImportError:
            return ParsedDocument(text="", warnings=["python-docx not installed — cannot parse .docx. Add python-docx to requirements.txt."])
        except Exception as e:
            logger.error("DOCX parse failed: %s", e)
            return ParsedDocument(text="", warnings=[f"DOCX parse error: {e}"])

    if ext in (".html", ".htm") or "html" in mime:
        try:
            return _strip_nul(parse_html(file_bytes))
        except ImportError:
            return ParsedDocument(text="", warnings=["beautifulsoup4 not installed — cannot parse HTML. Add beautifulsoup4 to requirements.txt."])
        except Exception as e:
            logger.error("HTML parse failed: %s", e)
            return ParsedDocument(text="", warnings=[f"HTML parse error: {e}"])

    return ParsedDocument(
        text="",
        warnings=[f"Unsupported file type: {ext or mime or 'unknown'}. Supported: PDF, CSV, XLSX, DOCX, HTML."],
    )
