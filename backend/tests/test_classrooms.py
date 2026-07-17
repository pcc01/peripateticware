# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for GET /classrooms/{classroom_id} (routes/classrooms.py :: get_classroom).

Context
-------
The TeacherClassroomPage frontend does capacity arithmetic directly off
`student_count` and `max_students_per_classroom` from this response
(atCapacity, capacityPct, "N spots left"). Those two fields were previously
missing from get_classroom's response entirely — the endpoint returned a
`students` array but never `student_count` or `max_students_per_classroom`,
so the frontend's required TS fields silently evaluated to `undefined`,
producing NaN in the UI. This test locks in the fix: both fields must be
present and numerically correct.

Strategy mirrors test_parent_portal.py:
- Minimal in-process FastAPI app with only the classrooms router mounted.
- get_current_user / get_db overridden; get_db's AsyncMock.execute is driven
  with side_effect since get_classroom issues two queries (classroom+org row,
  then the enrolled-students rows).
- httpx.AsyncClient + ASGITransport, no real Postgres needed.
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


# ---------------------------------------------------------------------------
# Build a minimal test app with only the classrooms router registered.
# ---------------------------------------------------------------------------

def _make_app() -> FastAPI:
    from fastapi import FastAPI as _FA
    test_app = _FA()
    from routes.classrooms import router as classrooms_router
    test_app.include_router(classrooms_router, prefix="/api/v1")
    return test_app


def _fake_teacher(uid: UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = uid or uuid4()
    user.email = "teacher@example.com"
    user.first_name = "Ada"
    user.last_name = "Lovelace"
    user.role = "TEACHER"
    user.is_active = True
    user.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    return user


def _student_mapping(**kwargs) -> dict:
    """classroom_students join row: consumed via dict-style access (s['id'])."""
    base = {
        "id": uuid4(),
        "email": "student@example.com",
        "first_name": "Grace",
        "last_name": "Hopper",
        "full_name": "Grace Hopper",
        "enrolled_at": datetime(2026, 1, 10, tzinfo=timezone.utc),
    }
    base.update(kwargs)
    return base


@pytest_asyncio.fixture
async def ctx():
    """Yields {client, db, teacher} — see module docstring."""
    from core.database import get_db
    from core.dependencies import get_current_user

    app = _make_app()
    teacher = _fake_teacher()
    db = AsyncMock()
    db.commit = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: teacher

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "db": db, "teacher": teacher}


def _mock_classroom_row(
    classroom_id: UUID,
    teacher_id: UUID,
    org_id: UUID,
    max_students_per_classroom: int = 30,
):
    """
    get_classroom accesses the classroom+org row POSITIONALLY (row[0]..row[8]),
    so a plain tuple works — it mirrors the SELECT column order in the route:
    id, name, grade_level, subject, is_active, org_id, teacher_id, created_at,
    max_students_per_classroom.
    """
    return (
        classroom_id,
        "Year 6 Science",
        6,
        "Science",
        True,
        org_id,
        teacher_id,
        datetime(2026, 1, 1, tzinfo=timezone.utc),
        max_students_per_classroom,
    )


# ===========================================================================
# 1. student_count reflects the number of enrolled students, and
#    max_students_per_classroom comes from the org's tier limit — both
#    fields present and numerically correct in the response.
# ===========================================================================

@pytest.mark.asyncio
async def test_get_classroom_includes_student_count_and_capacity(ctx):
    client = ctx["client"]
    db = ctx["db"]
    teacher = ctx["teacher"]

    classroom_id = uuid4()
    org_id = uuid4()

    classroom_result = MagicMock()
    classroom_result.first.return_value = _mock_classroom_row(
        classroom_id, teacher.id, org_id, max_students_per_classroom=25
    )

    students = [_student_mapping(), _student_mapping(email="a@x.com"), _student_mapping(email="b@x.com")]
    students_result = MagicMock()
    students_result.mappings.return_value.all.return_value = students

    db.execute.side_effect = [classroom_result, students_result]

    resp = await client.get(f"/api/v1/classrooms/{classroom_id}")

    assert resp.status_code == 200
    data = resp.json()

    # The core contract bug: these two fields must be present and correct,
    # not missing (which previously produced NaN in the frontend's capacity
    # arithmetic — classroom.students.length / classroom.max_students_per_classroom).
    assert data["student_count"] == 3
    assert data["max_students_per_classroom"] == 25
    assert len(data["students"]) == 3


# ===========================================================================
# 2. Zero enrolled students — student_count is 0, not missing/null, and the
#    frontend's atCapacity/capacityPct math would resolve to a real number.
# ===========================================================================

@pytest.mark.asyncio
async def test_get_classroom_zero_students(ctx):
    client = ctx["client"]
    db = ctx["db"]
    teacher = ctx["teacher"]

    classroom_id = uuid4()
    org_id = uuid4()

    classroom_result = MagicMock()
    classroom_result.first.return_value = _mock_classroom_row(
        classroom_id, teacher.id, org_id, max_students_per_classroom=30
    )

    students_result = MagicMock()
    students_result.mappings.return_value.all.return_value = []

    db.execute.side_effect = [classroom_result, students_result]

    resp = await client.get(f"/api/v1/classrooms/{classroom_id}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["student_count"] == 0
    assert data["max_students_per_classroom"] == 30
    assert data["students"] == []


# ===========================================================================
# 3. Organization has no explicit max_students_per_classroom set (NULL) —
#    the route COALESCEs to the platform default of 30.
# ===========================================================================

@pytest.mark.asyncio
async def test_get_classroom_defaults_max_students_when_org_unset(ctx):
    client = ctx["client"]
    db = ctx["db"]
    teacher = ctx["teacher"]

    classroom_id = uuid4()
    org_id = uuid4()

    classroom_result = MagicMock()
    # COALESCE(o.max_students_per_classroom, 30) happens in SQL — the mock
    # simulates the already-coalesced value the DB would return.
    classroom_result.first.return_value = _mock_classroom_row(
        classroom_id, teacher.id, org_id, max_students_per_classroom=30
    )

    students_result = MagicMock()
    students_result.mappings.return_value.all.return_value = [_student_mapping()]

    db.execute.side_effect = [classroom_result, students_result]

    resp = await client.get(f"/api/v1/classrooms/{classroom_id}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["max_students_per_classroom"] == 30
    assert data["student_count"] == 1


# ===========================================================================
# 4. 404 when the classroom doesn't exist / doesn't belong to this teacher.
# ===========================================================================

@pytest.mark.asyncio
async def test_get_classroom_not_found(ctx):
    client = ctx["client"]
    db = ctx["db"]

    classroom_result = MagicMock()
    classroom_result.first.return_value = None
    db.execute.return_value = classroom_result

    resp = await client.get(f"/api/v1/classrooms/{uuid4()}")

    assert resp.status_code == 404
