# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for GET /activities/teacher/submissions (routes/activities.py::
teacher_submissions) carrying classroom_id/classroom_name per row
(2026-09-15, for the mobile app's class > student grouped/collapsible
submissions list -- see app/teacher-submissions.tsx).

Strategy mirrors test_submission_rubric_scoring.py: an in-process FastAPI
app with only the activities router, get_current_user/get_db overridden,
db.execute() given a mocked .mappings().all() result.
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
    app = FastAPI()
    from routes.activities import router as activities_router
    app.include_router(activities_router)
    return app


def _fake_teacher(uid: UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = uid or uuid4()
    user.email = "teacher@example.com"
    user.role = "TEACHER"
    user.is_active = True
    return user


def _mapping_row(**kwargs):
    m = MagicMock()
    m.__getitem__ = lambda self, k: kwargs[k]
    return m


@pytest_asyncio.fixture
async def teacher_ctx():
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


@pytest.mark.asyncio
async def test_submission_row_carries_classroom_when_student_is_enrolled(teacher_ctx):
    client = teacher_ctx["client"]
    db = teacher_ctx["db"]

    classroom_id = uuid4()
    result = MagicMock()
    result.mappings.return_value.all.return_value = [
        _mapping_row(
            session_id=uuid4(), student_id=uuid4(), status="completed",
            started_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
            activity_id=uuid4(), activity_title="Creek Survey",
            first_name="Grace", last_name="Hopper", student_email="enc:...",
            classroom_id=classroom_id, classroom_name="5th Grade Science",
        ),
    ]
    db.execute.return_value = result

    resp = await client.get("/api/v1/activities/teacher/submissions")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["classroom_id"] == str(classroom_id)
    assert body[0]["classroom_name"] == "5th Grade Science"


@pytest.mark.asyncio
async def test_submission_row_classroom_is_null_when_unenrolled(teacher_ctx):
    """A student with a session but no classroom_students row for this
    teacher at all (activities aren't required to be classroom-scoped) --
    the LEFT JOIN LATERAL must not turn this into a 500 or drop the row,
    and the mobile client groups these under an 'Unassigned' bucket."""
    client = teacher_ctx["client"]
    db = teacher_ctx["db"]

    result = MagicMock()
    result.mappings.return_value.all.return_value = [
        _mapping_row(
            session_id=uuid4(), student_id=uuid4(), status="in_progress",
            started_at=None,
            activity_id=uuid4(), activity_title="Solo Nature Walk",
            first_name="Ada", last_name="Lovelace", student_email="enc:...",
            classroom_id=None, classroom_name=None,
        ),
    ]
    db.execute.return_value = result

    resp = await client.get("/api/v1/activities/teacher/submissions")

    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["classroom_id"] is None
    assert body[0]["classroom_name"] is None
