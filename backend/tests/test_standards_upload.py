# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for the HTTP-level upload/refresh endpoints in routes/standards.py --
POST /standards/upload (S1/S2/S5 in STANDARDS_RUBRICS_TEST_PLAN.md) and
POST /standards/{set_id}/refresh (S12). services/standards_parser.py::
extract_criteria itself already has thorough coverage
(tests/test_standards_parser.py); this file is specifically the multipart
upload plumbing and file-size/parse-failure handling wrapped around it,
which the plan flagged as still untested ("extract_criteria itself is
covered, the upload route wrapping it isn't").

document_parser.parse_document and standards_parser.extract_criteria are
both mocked here -- their own correctness is covered elsewhere
(test_standards_parser.py for extraction; document_parser.py has no test
file of its own yet, noted as a remaining gap, not addressed in this pass
since it needs real PDF/CSV byte fixtures rather than route-level mocking).
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

pytest.importorskip("fastapi")
pytest.importorskip("httpx")


def _make_app() -> FastAPI:
    from fastapi import FastAPI as _FA
    test_app = _FA()
    from routes.standards import router as standards_router
    test_app.include_router(standards_router)  # prefix="/api/v1/standards" baked into the router itself
    return test_app


def _fake_user(role: str = "TEACHER") -> MagicMock:
    user = MagicMock()
    user.id = uuid4()
    user.role = role
    return user


async def _client_for(user: MagicMock, execute_side_effect: list | None = None):
    from core.database import get_db
    from core.dependencies import get_current_user

    app = _make_app()
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=execute_side_effect or [])
    db.add = MagicMock()
    db.commit = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test"), db


def _fake_parsed_document(text="Standard WA-1: Do a thing.", method="pypdf", page_count=1, warnings=None):
    from services.document_parser import ParsedDocument
    return ParsedDocument(text=text, page_count=page_count, method=method, warnings=warnings or [])


# ===========================================================================
# S1/S2 — upload succeeds, returns a preview, never persists
# ===========================================================================

@pytest.mark.asyncio
async def test_upload_pdf_returns_preview_criteria_without_persisting():
    teacher = _fake_user("TEACHER")
    client, db = await _client_for(teacher)

    with patch("services.document_parser.parse_document", new=AsyncMock(return_value=_fake_parsed_document())), \
         patch("services.standards_parser.extract_criteria", new=AsyncMock(return_value=(
             [{"id": "wa-1", "name": "Do a thing", "description": "", "category": "General", "required": True, "weight": 1.0}],
             None,
         ))):
        async with client:
            resp = await client.post(
                "/api/v1/standards/upload",
                files={"file": ("standards.pdf", b"%PDF-1.4 fake pdf bytes", "application/pdf")},
                data={"set_type": "state_standards", "name": "WA Math"},
            )

    assert resp.status_code == 200
    body = resp.json()
    assert body["criteria"] == [{"id": "wa-1", "name": "Do a thing", "description": "", "category": "General", "required": True, "weight": 1.0}]
    assert body["method"] == "pypdf"
    assert len(body["checksum"]) == 64  # sha256 hex digest
    # Nothing is persisted by this endpoint -- it doesn't even take a db
    # dependency in the real route signature.
    db.add.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_upload_csv_uses_same_extraction_path():
    teacher = _fake_user("TEACHER")
    client, db = await _client_for(teacher)

    with patch("services.document_parser.parse_document", new=AsyncMock(return_value=_fake_parsed_document(method="csv"))), \
         patch("services.standards_parser.extract_criteria", new=AsyncMock(return_value=([], None))):
        async with client:
            resp = await client.post(
                "/api/v1/standards/upload",
                files={"file": ("standards.csv", b"id,name\nwa-1,Thing", "text/csv")},
                data={"set_type": "state_standards"},
            )

    assert resp.status_code == 200
    assert resp.json()["method"] == "csv"


# ===========================================================================
# File-size guard
# ===========================================================================

@pytest.mark.asyncio
async def test_upload_over_10mb_is_rejected_before_parsing():
    teacher = _fake_user("TEACHER")
    client, db = await _client_for(teacher)

    oversized = b"x" * (10 * 1024 * 1024 + 1)
    with patch("services.document_parser.parse_document", new=AsyncMock()) as parse_mock:
        async with client:
            resp = await client.post(
                "/api/v1/standards/upload",
                files={"file": ("huge.pdf", oversized, "application/pdf")},
                data={"set_type": "rubric"},
            )

    assert resp.status_code == 413
    parse_mock.assert_not_called()  # rejected before ever touching the parser


# ===========================================================================
# S5-adjacent — document parsing itself fails (corrupt file, unsupported
# format, missing optional dependency) -- never a 500, always a usable
# warning the teacher can act on.
# ===========================================================================

@pytest.mark.asyncio
async def test_upload_unparseable_file_returns_warning_not_500():
    teacher = _fake_user("TEACHER")
    client, db = await _client_for(teacher)

    with patch("services.document_parser.parse_document", new=AsyncMock(side_effect=ValueError("not a valid PDF"))):
        async with client:
            resp = await client.post(
                "/api/v1/standards/upload",
                files={"file": ("corrupt.pdf", b"not actually a pdf", "application/pdf")},
                data={"set_type": "rubric"},
            )

    assert resp.status_code == 200  # never 500 -- the failure is surfaced as data, not an exception
    body = resp.json()
    assert body["criteria"] == []
    assert body["method"] == "failed"
    assert any("couldn't read this file" in w.lower() for w in body["warnings"])
    assert len(body["checksum"]) == 64  # still computed even on a parse failure


@pytest.mark.asyncio
async def test_upload_extraction_failure_surfaces_as_a_warning_alongside_parser_warnings():
    """parse_document succeeds (real text extracted) but extract_criteria
    fails (e.g. dead LLM provider) -- the parser's own warnings (S5's
    scanned-PDF-OCR path can add these) and the extraction error must both
    reach the caller."""
    teacher = _fake_user("TEACHER")
    client, db = await _client_for(teacher)

    parsed = _fake_parsed_document(warnings=["Some pages required OCR"])
    with patch("services.document_parser.parse_document", new=AsyncMock(return_value=parsed)), \
         patch("services.standards_parser.extract_criteria", new=AsyncMock(return_value=([], "AI classification service unavailable"))):
        async with client:
            resp = await client.post(
                "/api/v1/standards/upload",
                files={"file": ("scanned.pdf", b"%PDF-1.4", "application/pdf")},
                data={"set_type": "rubric"},
            )

    assert resp.status_code == 200
    body = resp.json()
    assert body["criteria"] == []
    assert "Some pages required OCR" in body["warnings"]
    assert "AI classification service unavailable" in body["warnings"]


# ===========================================================================
# S12 — POST /{set_id}/refresh
# ===========================================================================

def _fake_set(set_id: UUID, owner_id: UUID, *, checksum=None, set_type="state_standards") -> MagicMock:
    s = MagicMock()
    s.id = set_id
    s.owner_id = owner_id
    s.is_global = False
    s.name = "WA Math Standards"
    s.type = set_type
    s.source_checksum = checksum
    s.processing_status = "complete"
    s.criteria = [{"id": "old-1"}]
    s.valid_until = None
    return s


@pytest.mark.asyncio
async def test_refresh_with_identical_file_is_a_cache_hit_and_skips_reextraction():
    teacher = _fake_user("TEACHER")
    set_id = uuid4()
    file_bytes = b"%PDF-1.4 same file every time"
    import hashlib
    checksum = hashlib.sha256(file_bytes).hexdigest()
    existing = _fake_set(set_id, teacher.id, checksum=checksum)

    get_set_result = MagicMock()
    get_set_result.scalar_one_or_none.return_value = existing
    client, db = await _client_for(teacher, execute_side_effect=[get_set_result])

    with patch("services.standards_parser.extract_criteria", new=AsyncMock()) as extract_mock:
        async with client:
            resp = await client.post(
                f"/api/v1/standards/{set_id}/refresh",
                files={"file": ("standards.pdf", file_bytes, "application/pdf")},
            )

    assert resp.status_code == 200
    body = resp.json()
    assert body["cache_hit"] is True
    assert existing.criteria == [{"id": "old-1"}]  # unchanged -- cache hit means no re-extraction
    extract_mock.assert_not_called()
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_refresh_with_a_new_file_re_extracts_and_replaces_criteria():
    teacher = _fake_user("TEACHER")
    set_id = uuid4()
    existing = _fake_set(set_id, teacher.id, checksum="old-checksum-does-not-match")

    get_set_result = MagicMock()
    get_set_result.scalar_one_or_none.return_value = existing
    client, db = await _client_for(teacher, execute_side_effect=[get_set_result])

    new_criteria = [{"id": "new-1", "name": "Updated criterion"}]
    with patch("services.document_parser.parse_document", new=AsyncMock(return_value=_fake_parsed_document())), \
         patch("services.standards_parser.extract_criteria", new=AsyncMock(return_value=(new_criteria, None))), \
         patch("routes.standards._index_standards_set_criteria", new=MagicMock(return_value=None)), \
         patch("routes.standards.asyncio.create_task"):
        async with client:
            resp = await client.post(
                f"/api/v1/standards/{set_id}/refresh",
                files={"file": ("standards_v2.pdf", b"%PDF-1.4 a genuinely different file", "application/pdf")},
            )

    assert resp.status_code == 200
    body = resp.json()
    assert body["cache_hit"] is False
    assert existing.criteria == new_criteria  # replaced, not merged/appended
    assert existing.processing_status == "complete"


@pytest.mark.asyncio
async def test_refresh_forbidden_for_non_owner():
    teacher = _fake_user("TEACHER")
    set_id = uuid4()
    other_owner_id = uuid4()
    existing = _fake_set(set_id, other_owner_id)
    existing.is_global = True  # readable via _get_set()'s OR clause...

    get_set_result = MagicMock()
    get_set_result.scalar_one_or_none.return_value = existing
    client, db = await _client_for(teacher, execute_side_effect=[get_set_result])

    async with client:
        resp = await client.post(
            f"/api/v1/standards/{set_id}/refresh",
            files={"file": ("standards.pdf", b"%PDF-1.4", "application/pdf")},
        )

    assert resp.status_code == 403  # ...but not writable


@pytest.mark.asyncio
async def test_refresh_reextraction_failure_marks_set_failed_not_silently_stale():
    teacher = _fake_user("TEACHER")
    set_id = uuid4()
    existing = _fake_set(set_id, teacher.id, checksum="old-checksum")

    get_set_result = MagicMock()
    get_set_result.scalar_one_or_none.return_value = existing
    client, db = await _client_for(teacher, execute_side_effect=[get_set_result])

    with patch("services.document_parser.parse_document", new=AsyncMock(side_effect=RuntimeError("corrupt file"))):
        async with client:
            resp = await client.post(
                f"/api/v1/standards/{set_id}/refresh",
                files={"file": ("bad.pdf", b"not a real pdf", "application/pdf")},
            )

    assert resp.status_code == 500
    assert existing.processing_status == "failed"
