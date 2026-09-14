# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for services/document_parser.py -- the byte-level PDF/CSV/Excel
parsing layer beneath routes/standards.py's upload/refresh endpoints
(which were tested with parse_document mocked -- see
tests/test_standards_upload.py). This is the last untested piece of the
standards-ingestion pipeline (S5 in STANDARDS_RUBRICS_TEST_PLAN.md, and
the plan's own note that this module "needs real fixture files, not
route-level mocking").

Real, exact PDF bytes are generated with reportlab (already a backend
dependency, same one services/export_service.py uses) rather than
committing a binary fixture file, so the "known text in, known text out"
round trip is self-contained and doesn't rot if a fixture file goes stale.
Real .xlsx bytes are likewise generated with openpyxl itself rather than
committing a binary fixture.

Update 2026-09-14: PyMuPDF (`pymupdf`, importable as `fitz`) and openpyxl
are now real requirements.txt dependencies (previously neither was
installed at all -- confirmed via ModuleNotFoundError the first time this
file was written, which is why some of the tests below used to describe a
"not installed" fallback that no longer exists). Consequences now that
both are genuinely present, confirmed by actually running this suite
against the real packages rather than assumed from reading the code:
  - Scanned-PDF OCR (S5) reaches real PyMuPDF page rendering and a real
    vision-LLM dispatch call. Locally that vision call still degrades
    per-page (this deployment's Ollama doesn't have the `llava` model
    pulled -- a 404, not a bug) -- confirmed separately, live, that the
    same pipeline produces correct text end-to-end against Claude's
    vision API instead. The tests below mock only the LLM dispatch call
    itself (agents.provider.dispatch), not PyMuPDF, so real page-to-PNG
    rendering is exercised every run without depending on any specific
    vision model being pulled or an API key being configured in CI.
  - Excel upload (.xlsx/.xlsm/.xls) parses real workbooks via openpyxl.
    A genuinely corrupt/mislabeled file (e.g. a .csv renamed to .xlsx)
    raises inside openpyxl itself (zipfile.BadZipFile, not ImportError --
    there is no "not installed" branch to fall back to anymore), which
    parse_csv() now catches with its own except Exception handler added
    alongside the pre-existing except ImportError, returning a specific,
    actionable warning either way.
"""

from __future__ import annotations

import io

import pytest

pytest.importorskip("reportlab")
pytest.importorskip("pypdf")

from services.document_parser import parse_document, parse_pdf, parse_csv, ParsedDocument


def _make_test_pdf(paragraphs: list[str]) -> bytes:
    """A real, minimal digital PDF with known text content, built the same
    way services/export_service.py builds real exports."""
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.pagesizes import LETTER

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=LETTER)
    styles = getSampleStyleSheet()
    story = []
    for p in paragraphs:
        story.append(Paragraph(p, styles["Normal"]))
        story.append(Spacer(1, 12))
    doc.build(story)
    return buffer.getvalue()


def _make_multi_page_test_pdf(pages: list[str]) -> bytes:
    """Same as _make_test_pdf, but forces one page per string with an
    explicit PageBreak -- needed to exercise _extract_pdf_ocr's per-page
    rendering/dispatch with a real, predictable page_count instead of
    whatever reportlab's own auto-pagination happens to produce."""
    from reportlab.platypus import SimpleDocTemplate, Paragraph, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.pagesizes import LETTER

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=LETTER)
    styles = getSampleStyleSheet()
    story = []
    for i, p in enumerate(pages):
        story.append(Paragraph(p, styles["Normal"]))
        if i < len(pages) - 1:
            story.append(PageBreak())
    doc.build(story)
    return buffer.getvalue()


# ===========================================================================
# parse_pdf / _extract_pdf_text — real PDF bytes, real pypdf extraction
# ===========================================================================

@pytest.mark.asyncio
async def test_parse_pdf_extracts_real_text_from_a_digital_pdf():
    pdf_bytes = _make_test_pdf([
        "Standard WA-4-OAA1: Interpret a multiplication equation as a comparison of two quantities. " * 3,
        "Standard WA-4-OAA2: Solve multistep word problems using the four operations. " * 3,
    ])
    result = await parse_pdf(pdf_bytes)
    assert result.method == "pypdf"
    assert "WA-4-OAA1" in result.text
    assert "WA-4-OAA2" in result.text
    assert result.page_count >= 1


@pytest.mark.asyncio
async def test_parse_pdf_with_enough_text_does_not_trigger_ocr_fallback():
    """The avg-chars-per-page heuristic must not fire on a normal, real
    digital document -- confirm the OCR path is never even attempted."""
    pdf_bytes = _make_test_pdf(["Real, substantial standards document text. " * 20])
    from unittest.mock import AsyncMock, patch
    with patch("services.document_parser._extract_pdf_ocr", new=AsyncMock()) as ocr_mock:
        result = await parse_pdf(pdf_bytes)
    ocr_mock.assert_not_called()
    assert result.method == "pypdf"


@pytest.mark.asyncio
async def test_parse_pdf_sparse_text_triggers_the_ocr_fallback_path():
    """A near-blank PDF (well under 80 chars/page) should trigger the OCR
    branch -- confirmed via the real heuristic, with _extract_pdf_ocr
    itself mocked (its own behavior is covered separately below)."""
    pdf_bytes = _make_test_pdf(["Hi"])  # far under the 80 chars/page threshold
    from unittest.mock import AsyncMock, patch
    from services.document_parser import ParsedDocument as _PD
    with patch("services.document_parser._extract_pdf_ocr",
               new=AsyncMock(return_value=_PD(text="OCR'd text", method="ocr_vision"))) as ocr_mock:
        result = await parse_pdf(pdf_bytes)
    ocr_mock.assert_called_once()
    assert result.method == "ocr_vision"
    assert result.text == "OCR'd text"


@pytest.mark.asyncio
async def test_parse_pdf_ocr_fallback_still_returning_nothing_adds_a_specific_warning():
    pdf_bytes = _make_test_pdf(["Hi"])
    from unittest.mock import AsyncMock, patch
    from services.document_parser import ParsedDocument as _PD
    with patch("services.document_parser._extract_pdf_ocr",
               new=AsyncMock(return_value=_PD(text="", method="ocr_vision"))):
        result = await parse_pdf(pdf_bytes)
    assert result.text == ""
    assert any("OCR produced no text" in w for w in result.warnings)


# ===========================================================================
# _extract_pdf_ocr — real PyMuPDF rendering (installed 2026-09-14), mocked
# vision-LLM dispatch (so the suite doesn't depend on a specific vision
# model being pulled locally or a live API key in CI)
# ===========================================================================

@pytest.mark.asyncio
async def test_ocr_real_pymupdf_dispatches_through_the_provider_abstraction_and_degrades_a_failed_page():
    """Real, multi-page PDF -> real PyMuPDF page-to-PNG rendering -> real
    dispatch() call per page. Only the LLM call itself is mocked. Verifies:
    (a) _extract_pdf_ocr resolves through agents/provider.py's dispatch()
    (provider-agnostic, per AGENT_DOCUMENT_OCR_PROVIDER) with real rendered
    image bytes, not a hardcoded client or a stand-in for PyMuPDF itself;
    (b) one page's OCR failure degrades only that page to empty text rather
    than raising and losing the whole document -- this is exactly what
    happens live in this deployment today, where Ollama's vision call 404s
    per-page because the `llava` model isn't pulled (confirmed
    2026-09-14: `Ollama API 404: {"error":"model 'llava' not found"}`,
    gracefully degraded, not a crash -- separately confirmed the same
    pipeline works end-to-end against Claude's vision API instead)."""
    from unittest.mock import AsyncMock, patch
    from services.document_parser import _extract_pdf_ocr

    # Real reportlab PDF, forced to 2 pages via PageBreak.
    pdf_bytes = _make_multi_page_test_pdf(["Page one content", "Page two content"])

    async def _dispatch_side_effect(provider, messages, **kwargs):
        # Confirms real PyMuPDF rendering reached dispatch(), not a mock
        # standing in for the whole render step.
        images = kwargs.get("images")
        assert images and isinstance(images[0], str) and len(images[0]) > 100, \
            "expected real base64-encoded PNG page bytes reaching dispatch()"
        if _dispatch_side_effect.calls == 0:
            _dispatch_side_effect.calls += 1
            return "Page one OCR text"
        raise RuntimeError("vision call failed")  # simulates page two's model/provider failure
    _dispatch_side_effect.calls = 0

    with patch("agents.provider.dispatch", new=AsyncMock(side_effect=_dispatch_side_effect)) as mock_dispatch, \
         patch("core.config.settings.AGENT_DOCUMENT_OCR_PROVIDER", "claude"):
        result = await _extract_pdf_ocr(pdf_bytes)

    assert result.method == "ocr_vision"
    assert result.page_count == 2
    assert "Page one OCR text" in result.text
    assert result.pages[1] == ""  # page two degraded to empty, not raised
    # Confirms provider-agnostic routing, not a hardcoded Ollama client --
    # the same class of bug fixed 2026-09-13 in classify_taxonomy/
    # generate_rubric_criteria.
    called_provider = mock_dispatch.call_args_list[0].args[0]
    assert called_provider == "claude"
    assert mock_dispatch.call_count == 2  # both pages attempted


@pytest.mark.asyncio
async def test_ocr_all_pages_failing_still_returns_gracefully_not_a_crash():
    """Every page's OCR call fails (e.g. no vision model reachable at all)
    -- must still return an empty-but-valid ParsedDocument, never raise,
    so parse_pdf()'s "OCR produced no text" warning (tested above via a
    mocked _extract_pdf_ocr) has real content to layer onto."""
    from unittest.mock import AsyncMock, patch
    from services.document_parser import _extract_pdf_ocr

    pdf_bytes = _make_test_pdf(["Hi"])

    with patch("agents.provider.dispatch", new=AsyncMock(side_effect=RuntimeError("no vision model"))):
        result = await _extract_pdf_ocr(pdf_bytes)

    assert result.method == "ocr_vision"
    assert result.text == ""
    assert result.page_count == 1


# ===========================================================================
# parse_csv — real CSV bytes
# ===========================================================================

def test_parse_csv_parses_real_rows_and_headers():
    csv_bytes = b"id,name,category\nwa-1,Multiplicative comparison,Algebra\nwa-2,Word problems,Algebra\n"
    result = parse_csv(csv_bytes, "standards.csv")
    assert result.method == "csv"
    assert len(result.rows) == 2
    assert result.rows[0] == {"id": "wa-1", "name": "Multiplicative comparison", "category": "Algebra"}


def test_parse_csv_strips_utf8_bom():
    csv_bytes = b"\xef\xbb\xbfid,name\nwa-1,Thing\n"
    result = parse_csv(csv_bytes, "standards.csv")
    assert list(result.rows[0].keys()) == ["id", "name"]  # not "﻿id"


def test_parse_csv_skips_fully_blank_rows():
    csv_bytes = b"id,name\nwa-1,Thing\n,\nwa-2,Other Thing\n"
    result = parse_csv(csv_bytes, "standards.csv")
    assert len(result.rows) == 2  # the blank row in the middle is dropped


def test_parse_csv_empty_file_returns_no_rows_not_an_error():
    result = parse_csv(b"", "empty.csv")
    assert result.rows == []


def test_parse_csv_handles_non_utf8_bytes_without_raising():
    """A real-world file with Windows-1252/Latin-1 bytes (a curly quote,
    say) must not crash the upload -- decode with replacement rather than
    raise UnicodeDecodeError."""
    csv_bytes = "id,name\nwa-1,café\n".encode("latin-1")
    result = parse_csv(csv_bytes, "standards.csv")
    assert len(result.rows) == 1  # didn't raise; some mangling of the accented char is acceptable


# ===========================================================================
# parse_csv — Excel, real openpyxl (installed 2026-09-14)
# ===========================================================================

def _make_test_xlsx(headers: list[str], rows: list[tuple]) -> bytes:
    """A real, minimal .xlsx workbook with known content, built with
    openpyxl itself -- the same round-trip approach _make_test_pdf takes
    with reportlab, so this doesn't depend on committing a binary
    fixture file."""
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def test_excel_upload_parses_real_workbook_rows_and_skips_blank_rows():
    """Real openpyxl round trip: a genuine .xlsx built by openpyxl, parsed
    back by the same parse_csv() path routes/standards.py's upload
    endpoint calls."""
    xlsx_bytes = _make_test_xlsx(
        ["id", "name"],
        [("wa-1", "Multiplicative comparison"), (None, None)],  # trailing blank row
    )
    result = parse_csv(xlsx_bytes, "standards.xlsx")

    assert result.method == "excel"
    assert result.rows == [{"id": "wa-1", "name": "Multiplicative comparison"}]


def test_excel_upload_of_a_genuinely_corrupt_file_degrades_to_a_clear_warning_not_a_crash():
    """A mislabeled/corrupt file (not a real zip-based .xlsx at all) must
    fail gracefully -- empty rows + a specific, actionable warning --
    rather than propagating openpyxl's raw zipfile.BadZipFile up to the
    caller. This is the real failure mode now that openpyxl is actually
    installed (confirmed 2026-09-14: parse_csv() only caught ImportError
    before, so this exact input used to raise uncaught out of parse_csv()
    itself, though routes/standards.py's own outer try/except still kept
    it from reaching the client as a raw 500)."""
    result = parse_csv(b"not real xlsx bytes", "standards.xlsx")
    assert result.rows == []
    assert result.method == "excel"
    assert any("couldn't read this as an excel file" in w.lower() for w in result.warnings)
    assert any("BadZipFile" in w for w in result.warnings)


# ===========================================================================
# parse_document — routing, never raises
# ===========================================================================

@pytest.mark.asyncio
async def test_parse_document_routes_pdf_extension_to_pdf_parser():
    # Long enough to stay clear of parse_pdf()'s <80-chars/page sparse-text
    # heuristic, which would otherwise route this into the OCR fallback
    # path (see test_parse_pdf_sparse_text_triggers_the_ocr_fallback_path
    # for that behavior tested directly) -- this test is specifically
    # about parse_document()'s extension-based routing, not the sparse-text
    # heuristic, so the fixture needs enough real text to avoid tripping it.
    pdf_bytes = _make_test_pdf(["Real PDF content here, with enough text to clear the sparse-page OCR heuristic. " * 3])
    result = await parse_document(pdf_bytes, "standards.pdf", None)
    assert result.method == "pypdf"
    assert "Real PDF content" in result.text


@pytest.mark.asyncio
async def test_parse_document_routes_by_mime_type_when_filename_has_no_extension():
    csv_bytes = b"id,name\nwa-1,Thing\n"
    result = await parse_document(csv_bytes, "upload", "text/csv")
    assert result.method == "csv"


@pytest.mark.asyncio
async def test_parse_document_unsupported_type_returns_a_clear_warning_not_an_exception():
    result = await parse_document(b"whatever bytes", "notes.docx", "application/msword")
    assert result.text == ""
    assert any("Unsupported file type" in w for w in result.warnings)


@pytest.mark.asyncio
async def test_parse_document_never_raises_on_genuinely_corrupt_pdf_bytes():
    """The upload route (routes/standards.py::upload_and_parse) depends on
    this never raising -- confirm a real corrupt/non-PDF byte string
    routed as a .pdf degrades to a warning instead of propagating an
    exception up to the caller."""
    result = await parse_document(b"this is not a pdf at all, just text", "corrupt.pdf", None)
    assert result.text == ""
    assert len(result.warnings) >= 1
