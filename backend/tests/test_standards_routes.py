# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for the "applied" half of "a new state standards document gets
parsed and applied correctly": once services/standards_parser.py (see
test_standards_parser.py) has extracted criteria, routes/standards.py is
what saves them and lets a teacher map an activity against one. Zero
automated coverage existed for this module before this file (flagged in
the 2026-09-13 code audit: routes.standards showed 0% coverage from the
whole pre-existing suite).

Covers:
  - _normalize_set_type() / _default_valid_until() -- pure functions,
    including a regression check for REGRESSION_LOG.md's BUG-14 (the
    frontend once sent type='curriculum', not in VALID_TYPES, and got a
    raw enum/DB error -- this is the alias map that fixed it).
  - POST /standards (create_standards_set) -- a parsed set actually
    persists with the right normalized type and expiry.
  - POST /standards/{set_id}/map (map_activity_to_criterion) -- "applied"
    in the literal sense: an activity gets linked to a parsed criterion,
    and the dual-write to content_alignments is best-effort (its failure
    must not take down the primary, authoritative write).
"""

from __future__ import annotations

import pytest
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

pytest.importorskip("fastapi")
pytest.importorskip("httpx")


# ===========================================================================
# _normalize_set_type / _default_valid_until — pure functions
# ===========================================================================

def test_normalize_set_type_passes_through_valid_types():
    from routes.standards import _normalize_set_type
    for t in ("state_standards", "state_reporting", "rubric", "custom"):
        assert _normalize_set_type(t) == t


def test_normalize_set_type_bug14_regression_curriculum_alias():
    """REGRESSION_LOG.md BUG-14: StandardsImportPage.tsx once sent
    type='curriculum', which isn't in VALID_TYPES and previously caused a
    raw DB/enum error on save. Must alias to 'state_standards', not error."""
    from routes.standards import _normalize_set_type
    assert _normalize_set_type("curriculum") == "state_standards"


def test_normalize_set_type_all_known_aliases():
    from routes.standards import _normalize_set_type
    assert _normalize_set_type("standard") == "state_standards"
    assert _normalize_set_type("standards") == "state_standards"
    assert _normalize_set_type("academic") == "state_standards"
    assert _normalize_set_type("reporting") == "state_reporting"
    assert _normalize_set_type("state_requirements") == "state_reporting"
    assert _normalize_set_type("requirements") == "state_reporting"
    assert _normalize_set_type("state_report") == "state_reporting"


def test_normalize_set_type_unknown_falls_back_to_custom_not_an_error():
    from routes.standards import _normalize_set_type
    assert _normalize_set_type("some-typo-the-frontend-sent") == "custom"


def test_normalize_set_type_blank_defaults_to_rubric():
    from routes.standards import _normalize_set_type
    assert _normalize_set_type(None) == "rubric"
    assert _normalize_set_type("") == "rubric"


def test_normalize_set_type_is_case_and_whitespace_insensitive():
    from routes.standards import _normalize_set_type
    assert _normalize_set_type("  State_Standards  ") == "state_standards"
    assert _normalize_set_type("CURRICULUM") == "state_standards"


def test_default_valid_until_state_standards_is_next_july_31():
    from routes.standards import _default_valid_until
    result = _default_valid_until("state_standards")
    assert result.month == 7 and result.day == 31
    assert result >= date.today()


def test_default_valid_until_state_reporting_is_dec_31_this_year():
    from routes.standards import _default_valid_until
    result = _default_valid_until("state_reporting")
    assert result == date(date.today().year, 12, 31)


def test_default_valid_until_rubric_has_no_expiry():
    from routes.standards import _default_valid_until
    assert _default_valid_until("rubric") is None
    assert _default_valid_until("custom") is None


# ===========================================================================
# POST /standards — create_standards_set
# ===========================================================================

def _make_app():
    from fastapi import FastAPI as _FA
    test_app = _FA()
    from routes.standards import router as standards_router
    test_app.include_router(standards_router)
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
    db.refresh = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test"), db


@pytest.mark.asyncio
async def test_create_standards_set_persists_normalized_type_and_criteria():
    teacher = _fake_user("TEACHER")
    client, db = await _client_for(teacher)  # no source_checksum -> no cache-check query

    payload = {
        "name": "Washington K-12 Math Standards",
        "description": "Extracted from an official WA math standards PDF",
        "type": "curriculum",  # the pre-BUG-14 value a client might still send
        "state_code": "WA",
        "is_global": False,
        "criteria": [
            {"id": "wa-4-oaa1", "description": "Interpret multiplicative comparison", "category": "Algebraic Reasoning"},
        ],
    }
    with patch("routes.standards.asyncio.create_task"):  # don't actually spawn the fire-and-forget indexer
        async with client:
            resp = await client.post("/api/v1/standards", json=payload)

    assert resp.status_code == 201
    body = resp.json()
    assert body["type"] == "state_standards"  # normalized from 'curriculum'
    assert body["criteria_count"] == 1
    assert body["state_code"] == "WA"
    assert body["cache_hit"] is False

    db.add.assert_called_once()
    saved = db.add.call_args.args[0]
    assert saved.type == "state_standards"
    assert saved.criteria == [{
        "id": "wa-4-oaa1", "code": "", "subject": "", "category": "Algebraic Reasoning",
        "description": "Interpret multiplicative comparison", "required": True, "weight": 1.0,
    }]
    # state_standards defaults to expiring next July 31 unless the client set one
    assert saved.valid_until.month == 7 and saved.valid_until.day == 31
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_create_global_set_forbidden_for_non_teacher_non_admin():
    student = _fake_user("STUDENT")
    client, db = await _client_for(student)

    payload = {"name": "x", "type": "rubric", "is_global": True, "criteria": []}
    async with client:
        resp = await client.post("/api/v1/standards", json=payload)

    assert resp.status_code == 403
    db.execute.assert_not_called()  # rejected before touching the DB at all


@pytest.mark.asyncio
async def test_create_standards_set_cache_hit_on_matching_checksum():
    """Re-uploading the exact same file (same checksum) should return the
    already-processed set instead of creating a duplicate."""
    teacher = _fake_user("TEACHER")
    existing = MagicMock()
    existing.id = uuid4()
    existing.name = "Already Parsed"
    existing.description = ""
    existing.type = "state_standards"
    existing.state_code = "WA"
    existing.is_global = False
    existing.owner_id = teacher.id
    existing.criteria = [{"id": "c1"}]
    existing.processing_status = "complete"
    existing.last_processed_at = None
    existing.valid_until = None
    existing.created_at = None

    result = MagicMock()
    result.scalar_one_or_none.return_value = existing
    client, db = await _client_for(teacher, execute_side_effect=[result])

    payload = {"name": "Re-upload", "type": "rubric", "criteria": []}
    async with client:
        resp = await client.post("/api/v1/standards", json=payload, params={"source_checksum": "abc123"})

    assert resp.status_code == 201
    body = resp.json()
    assert body["cache_hit"] is True
    assert body["id"] == str(existing.id)
    db.add.assert_not_called()  # nothing new persisted on a cache hit


# ===========================================================================
# POST /standards/{set_id}/map — map_activity_to_criterion
# ===========================================================================

@pytest.mark.asyncio
async def test_map_creates_activity_standards_map_row():
    teacher = _fake_user("TEACHER")
    set_id = uuid4()
    activity_id = uuid4()

    standards_set = MagicMock()
    standards_set.id = set_id
    standards_set.owner_id = teacher.id
    standards_set.is_global = False

    get_set_result = MagicMock()
    get_set_result.scalar_one_or_none.return_value = standards_set  # _get_set()
    existing_map_result = MagicMock()
    existing_map_result.scalar_one_or_none.return_value = None  # no existing mapping

    client, db = await _client_for(teacher, execute_side_effect=[get_set_result, existing_map_result])

    # materialize_standards_set() is the content_alignments dual-write path --
    # make it raise, so this test isolates the primary write's correctness
    # (see test_map_content_alignment_dual_write_failure_does_not_block_primary_write
    # for the "best-effort, non-fatal" contract this depends on).
    with patch("services.standards_graph_fold.materialize_standards_set", new=AsyncMock(side_effect=RuntimeError("boom"))):
        async with client:
            resp = await client.post(
                f"/api/v1/standards/{set_id}/map",
                json={"activity_id": str(activity_id), "criterion_id": "wa-4-oaa1", "coverage_level": "full"},
            )

    assert resp.status_code == 201
    assert resp.json() == {"status": "mapped"}
    db.add.assert_called_once()
    added = db.add.call_args.args[0]
    assert added.activity_id == activity_id
    assert added.criterion_id == "wa-4-oaa1"
    assert added.coverage_level == "full"
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_map_content_alignment_dual_write_failure_does_not_block_primary_write():
    """The content_alignments write is explicitly documented as best-effort
    -- ActivityStandardsMap must still commit even if it fails, and the
    endpoint must still return success (this is the same scenario as the
    test above, asserted from the 'did the request still succeed' angle)."""
    teacher = _fake_user("TEACHER")
    set_id = uuid4()
    activity_id = uuid4()

    standards_set = MagicMock()
    standards_set.id = set_id
    standards_set.owner_id = teacher.id
    standards_set.is_global = False

    get_set_result = MagicMock()
    get_set_result.scalar_one_or_none.return_value = standards_set
    existing_map_result = MagicMock()
    existing_map_result.scalar_one_or_none.return_value = None

    client, db = await _client_for(teacher, execute_side_effect=[get_set_result, existing_map_result])

    with patch("services.standards_graph_fold.materialize_standards_set", new=AsyncMock(side_effect=RuntimeError("graph fold exploded"))):
        async with client:
            resp = await client.post(
                f"/api/v1/standards/{set_id}/map",
                json={"activity_id": str(activity_id), "criterion_id": "wa-4-oaa1"},
            )

    assert resp.status_code == 201  # not 500 -- the primary write's contract is unaffected
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_remap_same_criterion_updates_instead_of_duplicating():
    """Re-mapping the same (activity, set, criterion) with a different
    coverage_level updates the existing row rather than inserting a
    duplicate (ActivityStandardsMap has a unique constraint on exactly
    this triple)."""
    teacher = _fake_user("TEACHER")
    set_id = uuid4()
    activity_id = uuid4()

    standards_set = MagicMock()
    standards_set.id = set_id
    standards_set.owner_id = teacher.id
    standards_set.is_global = False

    existing_map = MagicMock()
    existing_map.coverage_level = "partial"
    existing_map.notes = None

    get_set_result = MagicMock()
    get_set_result.scalar_one_or_none.return_value = standards_set
    existing_map_result = MagicMock()
    existing_map_result.scalar_one_or_none.return_value = existing_map  # already mapped once

    client, db = await _client_for(teacher, execute_side_effect=[get_set_result, existing_map_result])

    with patch("services.standards_graph_fold.materialize_standards_set", new=AsyncMock(side_effect=RuntimeError("n/a"))):
        async with client:
            resp = await client.post(
                f"/api/v1/standards/{set_id}/map",
                json={"activity_id": str(activity_id), "criterion_id": "wa-4-oaa1", "coverage_level": "exceeds", "notes": "revised"},
            )

    assert resp.status_code == 201
    db.add.assert_not_called()  # updates the existing row instead of inserting
    assert existing_map.coverage_level == "exceeds"
    assert existing_map.notes == "revised"
