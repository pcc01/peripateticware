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

Two real findings from actually running this module in this environment,
not assumed from reading the code: neither PyMuPDF (`fitz`) nor
`openpyxl` is installed here (confirmed: ModuleNotFoundError for both;
neither appears in requirements.txt at all -- not a stale-container
issue, they were never added). That means:
  - Scanned-PDF OCR (S5) never actually reaches a vision LLM in this
    deployment -- has_fitz is always False, so _extract_pdf_ocr always
    takes its "PyMuPDF not installed" fallback branch, which just re-runs
    the same sparse pypdf extraction under a different label. The
    provider-agnostic OCR routing code (AGENT_DOCUMENT_OCR_PROVIDER) is
    real and correctly written but currently unreachable dead code here.
  - Excel upload (.xlsx/.xlsm/.xls) always hits the ImportError branch and
    returns an empty document telling the user to convert to CSV --
    "Excel support" is advertised in this module's own docstring but not
    functional in this environment.
Not fixed here (adding pymupdf/openpyxl to requirements.txt changes the
production container image -- a real infra decision, not a test-writing
one) -- documented so it's a decision made on purpose, not by omission.
Both the real degraded-mode behavior AND the code path that would run if
these were installed are tested below (the latter via mocking), so the
code is verified correct in either state.
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
# _extract_pdf_ocr — real environment state (no PyMuPDF installed here)
# ===========================================================================

@pytest.mark.asyncio
async def test_ocr_without_pymupdf_degrades_to_sparse_pypdf_text_with_a_warning():
    """The real, current state of this deployment: fitz isn't installed,
    so OCR silently degrades to re-running the same (sparse) pypdf
    extraction under a different label, rather than reaching a vision
    LLM at all. This must never raise -- a teacher uploading a scanned
    PDF still gets *something* back, with a warning explaining why it's
    thin, not a 500."""
    from services.document_parser import _extract_pdf_ocr
    pdf_bytes = _make_test_pdf(["Hi"])

    result = await _extract_pdf_ocr(pdf_bytes)

    assert result.method == "ocr_vision_fallback"
    assert any("PyMuPDF not installed" in w for w in result.warnings)
    # It's still pypdf's real (sparse) extraction, not empty/garbage.
    assert "Hi" in result.text


@pytest.mark.asyncio
async def test_ocr_with_pymupdf_present_dispatches_through_the_provider_abstraction():
    """The code path that WOULD run if PyMuPDF were installed -- verifies
    it resolves through agents/provider.py's dispatch() (provider-agnostic,
    per AGENT_DOCUMENT_OCR_PROVIDER), not a hardcoded client, and that a
    per-page OCR failure degrades that one page to empty text rather than
    failing the whole document."""
    from unittest.mock import AsyncMock, MagicMock, patch

    fake_fitz_module = MagicMock()
    fake_page = MagicMock()
    fake_pixmap = MagicMock()
    fake_pixmap.tobytes.return_value = b"fake-png-bytes"
    fake_page.get_pixmap.return_value = fake_pixmap
    fake_doc = [fake_page, fake_page]  # 2-page document, iterable
    fake_fitz_module.open.return_value = fake_doc

    async def _dispatch_side_effect(provider, messages, **kwargs):
        # Second page's OCR call fails -- must degrade that page to "",
        # not raise and lose the whole document.
        if _dispatch_side_effect.calls == 0:
            _dispatch_side_effect.calls += 1
            return "Page one OCR text"
        raise RuntimeError("vision call failed")
    _dispatch_side_effect.calls = 0

    with patch.dict("sys.modules", {"fitz": fake_fitz_module}), \
         patch("agents.provider.dispatch", new=AsyncMock(side_effect=_dispatch_side_effect)) as mock_dispatch, \
         patch("core.config.settings.AGENT_DOCUMENT_OCR_PROVIDER", "claude"):
        from services.document_parser import _extract_pdf_ocr
        result = await _extract_pdf_ocr(b"irrelevant-with-fitz-mocked")

    assert result.method == "ocr_vision"
    assert "Page one OCR text" in result.text
    assert result.page_count == 2
    # Confirms provider-agnostic routing, not a hardcoded Ollama client --
    # the same class of bug fixed 2026-09-13 in classify_taxonomy/
    # generate_rubric_criteria.
    called_provider = mock_dispatch.call_args_list[0].args[0]
    assert called_provider == "claude"


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
# parse_csv — Excel, current real environment state (no openpyxl installed)
# ===========================================================================

def test_excel_upload_without_openpyxl_degrades_to_a_clear_warning_not_a_crash():
    """The real, current state of this deployment: .xlsx uploads can't
    actually be parsed. Confirm that fails gracefully (empty rows + a
    specific, actionable warning) rather than a 500."""
    result = parse_csv(b"not real xlsx bytes", "standards.xlsx")
    assert result.rows == []
    assert result.method == "excel"
    assert any("openpyxl not installed" in w.lower() for w in result.warnings)


def test_excel_upload_with_openpyxl_present_parses_real_rows():
    """The code path that WOULD run if openpyxl were installed."""
    from unittest.mock import MagicMock, patch

    fake_ws = MagicMock()
    fake_ws.iter_rows.return_value = [
        ("id", "name"),
        ("wa-1", "Multiplicative comparison"),
        (None, None),  # a fully-blank row must be skipped
    ]
    fake_wb = MagicMock()
    fake_wb.active = fake_ws
    fake_openpyxl_module = MagicMock()
    fake_openpyxl_module.load_workbook.return_value = fake_wb

    with patch.dict("sys.modules", {"openpyxl": fake_openpyxl_module}):
        result = parse_csv(b"irrelevant-with-openpyxl-mocked", "standards.xlsx")

    assert result.method == "excel"
    assert result.rows == [{"id": "wa-1", "name": "Multiplicative comparison"}]


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
