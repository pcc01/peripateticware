# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for GET /activities/{id}/fieldwork-locations (routes/activities.py).

Background
----------
This endpoint previously hard-crashed building its query: it joins
StudentFieldNote to LearningSession via StudentFieldNote.session_id, but
that column did not exist on the StudentFieldNote model at the time, so
merely constructing the SQLAlchemy select() raised an AttributeError before
the route's own try/except was even entered. models/database.py::
StudentFieldNote now declares session_id (nullable UUID, no FK — see the
model's inline comment), so building this query should succeed.

Strategy
--------
Mirrors tests/test_parent_portal.py's no-real-DB pattern: minimal FastAPI
app with just the activities router, AsyncMock for get_db, MagicMock fake
user overriding get_current_user. Since the union_all() query is real
SQLAlchemy Core (only db.execute() itself is mocked), this test exercises
the actual query-construction code path — including the
StudentFieldNote.session_id join — and would fail with AttributeError at
collection/call time if that column were removed again.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4, UUID

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

pytest.importorskip("fastapi")
pytest.importorskip("httpx")


def _make_app() -> FastAPI:
    from fastapi import FastAPI as _FA
    test_app = _FA()
    from routes.activities import router as activities_router
    # Router already declares prefix="/api/v1/activities" internally.
    test_app.include_router(activities_router)
    return test_app


def _fake_teacher(uid: UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = uid or uuid4()
    user.email = "teacher@example.com"
    user.full_name = "Test Teacher"
    user.role = "TEACHER"
    user.is_active = True
    user.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    return user


@pytest_asyncio.fixture
async def ctx():
    from core.database import get_db
    from core.dependencies import get_current_user

    app = _make_app()
    teacher = _fake_teacher()
    db = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: teacher

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "db": db, "teacher": teacher}


# ===========================================================================
# 1. GET /activities/{id}/fieldwork-locations — 404 when activity missing
# ===========================================================================

@pytest.mark.asyncio
async def test_fieldwork_locations_404_when_activity_not_found(ctx):
    client = ctx["client"]
    db = ctx["db"]

    activity_result = MagicMock()
    activity_result.scalar_one_or_none.return_value = None
    db.execute.return_value = activity_result

    resp = await client.get(f"/api/v1/activities/{uuid4()}/fieldwork-locations")

    assert resp.status_code == 404


# ===========================================================================
# 2. GET /activities/{id}/fieldwork-locations — 403 when not the owning teacher
# ===========================================================================

@pytest.mark.asyncio
async def test_fieldwork_locations_403_when_not_owner(ctx):
    client = ctx["client"]
    db = ctx["db"]
    teacher = ctx["teacher"]

    activity_id = uuid4()
    activity_row = MagicMock()
    activity_row.teacher_id = uuid4()  # different from ctx teacher.id
    assert activity_row.teacher_id != teacher.id

    activity_result = MagicMock()
    activity_result.scalar_one_or_none.return_value = activity_row
    db.execute.return_value = activity_result

    resp = await client.get(f"/api/v1/activities/{activity_id}/fieldwork-locations")

    assert resp.status_code == 403


# ===========================================================================
# 3. GET /activities/{id}/fieldwork-locations — success path
# ===========================================================================
#
# KNOWN REAL BUG (discovered while writing this test, not a test-authoring
# mistake — see final report): once the StudentFieldNote.session_id column
# exists (it does — see test #4 below) and the route reaches query
# construction, it still crashes with an unhandled NotImplementedError.
# routes/activities.py:1743 builds the EvidenceCapture branch's placeholder
# "location_name" column as `text("NULL").label("location_name")`.
# TextClause.label() is not implemented under SQLAlchemy 2.0.23 (the version
# pinned in requirements.txt) — sqlalchemy/sql/roles.py explicitly raises
# NotImplementedError. This line executes BEFORE the route's own
# try/except, so every authorized call to this endpoint currently 500s.
# The rest of the codebase never uses this text("NULL").label(...) pattern;
# `literal_column("NULL").label(...)` or `literal(None).label(...)` both
# work correctly and would be the fix, but per instructions this test
# documents the current broken behavior rather than silently patching
# around it.

@pytest.mark.asyncio
async def test_fieldwork_locations_success_currently_raises_due_to_text_null_label_bug(ctx):
    """Regression/bug-documentation test: an authorized request that reaches
    query construction currently raises NotImplementedError from
    text("NULL").label("location_name") in the EvidenceCapture branch of the
    union_all() query, rather than returning 200. This test will start
    failing (in a good way) once routes/activities.py:1743 is fixed to use
    literal_column("NULL") or literal(None) instead of text("NULL") — at
    that point this test should be replaced with a real success-path
    assertion (200 + correct location list)."""
    client = ctx["client"]
    db = ctx["db"]
    teacher = ctx["teacher"]

    activity_id = uuid4()
    activity_row = MagicMock()
    activity_row.teacher_id = teacher.id

    activity_result = MagicMock()
    activity_result.scalar_one_or_none.return_value = activity_row

    student_id = uuid4()
    now = datetime(2026, 1, 15, 12, 0, 0)
    field_note_row = {
        "student_id": str(student_id),
        "student_name": "Jamie Rivera",
        "latitude": 37.7749,
        "longitude": -122.4194,
        "location_name": "Golden Gate Park",
        "submitted_at": now,
        "title": "Tree bark texture",
        "type": "field_note",
    }

    rows_result = MagicMock()
    rows_result.mappings.return_value.all.return_value = [field_note_row]

    db.execute.side_effect = [activity_result, rows_result]

    # httpx/ASGITransport propagates unhandled server exceptions as raised
    # exceptions on the client call (there's no exception-handler middleware
    # registered on this minimal test app), which is exactly what surfaces
    # the bug clearly here.
    with pytest.raises(NotImplementedError):
        await client.get(f"/api/v1/activities/{activity_id}/fieldwork-locations")


# ===========================================================================
# 4. StudentFieldNote model regression — session_id column exists
# ===========================================================================

def test_student_field_note_has_session_id_column():
    """Direct regression test for the model itself: StudentFieldNote must
    declare a session_id column (nullable, no FK) so the fieldwork-locations
    join can be built. This previously did not exist and caused an
    AttributeError when routes/activities.py tried to reference
    StudentFieldNote.session_id."""
    from models.database import StudentFieldNote

    assert hasattr(StudentFieldNote, "session_id")
    col = StudentFieldNote.__table__.columns["session_id"]
    assert col.nullable is True


def test_student_field_note_session_join_query_builds_without_error():
    """Isolates just the StudentFieldNote -> LearningSession join (the
    session_id half of the union_all() query) from the unrelated
    text("NULL").label(...) bug in the EvidenceCapture half (see the
    documented-bug test above). Confirms the join itself — the thing this
    test file was specifically commissioned to cover — builds cleanly."""
    from sqlalchemy import select, literal, text as _t
    from models.database import StudentFieldNote, LearningSession as _LS, User as _User

    activity_id = uuid4()

    fn_q = (
        select(
            StudentFieldNote.student_id.cast(_t("TEXT")).label("student_id"),
            _User.full_name.label("student_name"),
            StudentFieldNote.location_latitude.label("latitude"),
            StudentFieldNote.location_longitude.label("longitude"),
            StudentFieldNote.location_name.label("location_name"),
            StudentFieldNote.created_at.label("submitted_at"),
            StudentFieldNote.title.label("title"),
            literal("field_note").label("type"),
        )
        .join(_LS, _LS.id == StudentFieldNote.session_id)
        .join(_User, _User.id == StudentFieldNote.student_id)
        .where(
            _LS.activity_id == activity_id,
            StudentFieldNote.location_latitude.is_not(None),
        )
    )

    from sqlalchemy.sql import Select
    assert isinstance(fn_q, Select)
