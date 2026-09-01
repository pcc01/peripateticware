# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for services/document_parser.py::_extract_pdf_ocr()'s page-concurrency
change — previously OCR'd every page of a scanned PDF serially (one vision-
model call at a time, in a loop); now runs them concurrently via
asyncio.gather with a bounded semaphore.

The two things a switch from a serial loop to asyncio.gather can silently
break are covered here:
  1. Output order must still match page order — asyncio.gather does
     guarantee this (results ordered by input, not completion time), but it's
     exactly the kind of guarantee worth pinning down with a real assertion
     rather than trusting by inspection.
  2. One page's failure must not affect the others (matching the original
     per-page try/except's behavior: log + empty string for that page only).

fitz (PyMuPDF) isn't a pinned dependency in this environment, so it's faked
via sys.modules rather than skipped — real PDF rendering isn't what's under
test here, the concurrent-dispatch logic downstream of it is.
"""

from __future__ import annotations

import base64
import sys
import types
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _install_fake_fitz(page_pngs: list[bytes]) -> None:
    """Registers a fake `fitz` module in sys.modules that "renders" len(page_pngs)
    pages, each producing the corresponding bytes in page_pngs when
    `page.get_pixmap(dpi=150).tobytes("png")` is called."""
    fake_pages = []
    for png_bytes in page_pngs:
        pix = MagicMock()
        pix.tobytes.return_value = png_bytes
        page = MagicMock()
        page.get_pixmap.return_value = pix
        fake_pages.append(page)

    fake_fitz = types.ModuleType("fitz")
    fake_fitz.open = MagicMock(return_value=fake_pages)
    sys.modules["fitz"] = fake_fitz


@pytest.fixture(autouse=True)
def _cleanup_fake_fitz():
    yield
    sys.modules.pop("fitz", None)


@pytest.mark.asyncio
async def test_pages_processed_concurrently_preserve_order():
    _install_fake_fitz([b"page0-png", b"page1-png", b"page2-png"])

    async def fake_dispatch(prov, messages, model=None, images=None):
        # Identify which page this call is for by its actual image bytes,
        # not call order — proves asyncio.gather's output ordering rather
        # than assuming dispatch calls happen to complete in page order.
        img_bytes = base64.b64decode(images[0])
        return f"text-for-{img_bytes.decode()}"

    with patch("agents.provider.resolve_provider", return_value="ollama"), \
         patch("agents.provider.dispatch", new=AsyncMock(side_effect=fake_dispatch)):
        from services.document_parser import _extract_pdf_ocr
        result = await _extract_pdf_ocr(b"fake-pdf-bytes")

    assert result.page_count == 3
    assert result.pages == [
        "text-for-page0-png",
        "text-for-page1-png",
        "text-for-page2-png",
    ]
    assert result.method == "ocr_vision"


@pytest.mark.asyncio
async def test_one_page_failure_does_not_affect_others():
    _install_fake_fitz([b"page0-png", b"page1-png", b"page2-png"])

    async def fake_dispatch(prov, messages, model=None, images=None):
        img_bytes = base64.b64decode(images[0])
        if img_bytes == b"page1-png":
            raise RuntimeError("simulated vision-model failure on page 2")
        return f"text-for-{img_bytes.decode()}"

    with patch("agents.provider.resolve_provider", return_value="ollama"), \
         patch("agents.provider.dispatch", new=AsyncMock(side_effect=fake_dispatch)):
        from services.document_parser import _extract_pdf_ocr
        result = await _extract_pdf_ocr(b"fake-pdf-bytes")

    assert result.pages == ["text-for-page0-png", "", "text-for-page2-png"]
    # Failed page contributes nothing to full_text but doesn't blank the rest.
    assert "text-for-page0-png" in result.text
    assert "text-for-page2-png" in result.text
