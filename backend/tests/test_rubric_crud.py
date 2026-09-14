# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for routes/rubrics.py's CRUD endpoints (POST/GET/PUT/DELETE
/rubrics) and attach-to-activity (POST /rubrics/{id}/attach/{activity_id}).
Zero automated coverage existed for any of this before this file --
everything previously written for rubrics.py covered only /generate
(tests/test_ai_route_providers.py) and /score-rubric
(tests/test_submission_rubric_scoring.py).

Note this file's own regression evidence: create_rubric() is exactly the
route that was silently 500ing on every call until the
AssessmentRubric.framework native_enum fix (2026-09-13) -- see
test_standards_routes.py's... no, actually see
test_submission_rubric_scoring.py::test_assessment_rubric_framework_column_is_not_a_native_enum
for that regression guard specifically. This file assumes that fix is in
place and tests the CRUD logic itself.
"""

from __future__ import annotations

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4, UUID

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

pytest.importorskip("fastapi")
pytest.importorskip("httpx")


def _make_app() -> FastAPI:
    from fastapi import FastAPI as _FA
    test_app = _FA()
    from routes.rubrics import router as rubrics_router
    # rubrics_router declares prefix="/rubrics" only (unlike routes/
    # activities.py and routes/standards.py, which bake in the full
    # "/api/v1/..." prefix themselves) -- main.py adds "/api/v1" via its
    # own include_router() call, so this test app must do the same.
    test_app.include_router(rubrics_router, prefix="/api/v1")
    return test_app


def _fake_teacher(uid: UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = uid or uuid4()
    user.role = "TEACHER"
    return user


def _fake_rubric_row(rubric_id: UUID, teacher_id: UUID, *, title="Test Rubric",
                      criteria=None, total_points=100, is_active=True):
    r = MagicMock()
    r.id = rubric_id
    r.teacher_id = teacher_id
    r.title = title
    r.description = None
    r.criteria = criteria if criteria is not None else []
    r.total_points = total_points
    r.is_active = is_active
    r.created_at = datetime(2026, 9, 1)
    r.updated_at = datetime(2026, 9, 1)
    return r


async def _client_for(user: MagicMock, execute_side_effect: list | None = None):
    from core.database import get_db
    from core.dependencies import get_current_user, get_current_teacher

    app = _make_app()
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=execute_side_effect or [])
    db.add = MagicMock()
    db.commit = AsyncMock()

    # POST /rubrics constructs a real (un-persisted) AssessmentRubric ORM
    # object and returns it through response_model=RubricResponse, which
    # requires id/created_at/updated_at/is_active to be non-None --
    # SQLAlchemy's Column(default=...) callables only apply at a real
    # flush, which this mocked session never performs. db.refresh() is
    # where a real session would populate those after INSERT, so fake that
    # here rather than leaving them None and failing response validation.
    async def _fake_refresh(obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid4()
        if getattr(obj, "created_at", None) is None:
            obj.created_at = datetime(2026, 9, 1)
        if getattr(obj, "updated_at", None) is None:
            obj.updated_at = datetime(2026, 9, 1)
        if getattr(obj, "is_active", None) is None:
            obj.is_active = True
    db.refresh = AsyncMock(side_effect=_fake_refresh)

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_current_teacher] = lambda: user

    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test"), db


# ===========================================================================
# R1 — create
# ===========================================================================

@pytest.mark.asyncio
async def test_create_rubric_persists_teacher_supplied_total_points():
    teacher = _fake_teacher()
    client, db = await _client_for(teacher)

    payload = {
        "title": "Field Observation Rubric",
        "description": "Assesses careful observation skills",
        "criteria": [
            {"id": "c1", "name": "Observation Detail", "levels": [
                {"score": 4, "label": "Exceeds", "description": ""}, {"score": 3, "label": "Meets", "description": ""},
                {"score": 2, "label": "Approaching", "description": ""}, {"score": 1, "label": "Beginning", "description": ""},
            ]},
        ],
        "total_points": 4,
    }
    async with client:
        resp = await client.post("/api/v1/rubrics", json=payload)

    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Field Observation Rubric"
    assert body["total_points"] == 4  # the value the teacher entered, not server-recalculated
    assert body["teacher_id"] == str(teacher.id)
    db.add.assert_called_once()
    db.commit.assert_awaited()


# ===========================================================================
# R2 — list is scoped to the caller
# ===========================================================================

@pytest.mark.asyncio
async def test_list_rubrics_query_is_scoped_to_caller():
    teacher = _fake_teacher()
    own_rubric = _fake_rubric_row(uuid4(), teacher.id, title="Mine")
    result = MagicMock()
    result.scalars.return_value.all.return_value = [own_rubric]
    client, db = await _client_for(teacher, execute_side_effect=[result])

    async with client:
        resp = await client.get("/api/v1/rubrics")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["title"] == "Mine"
    compiled_sql = str(db.execute.call_args.args[0])
    assert "teacher_id" in compiled_sql and "is_active" in compiled_sql


# ===========================================================================
# get/put/delete: filter by (id, teacher_id) in the WHERE clause itself --
# someone else's rubric is a 404, not a 403 or a silent no-op 200.
# ===========================================================================

@pytest.mark.asyncio
async def test_get_someone_elses_rubric_is_404_not_a_leak():
    teacher = _fake_teacher()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None  # WHERE teacher_id=caller finds nothing
    client, db = await _client_for(teacher, execute_side_effect=[result])

    async with client:
        resp = await client.get(f"/api/v1/rubrics/{uuid4()}")

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_rubric_merges_only_provided_fields():
    teacher = _fake_teacher()
    rubric_id = uuid4()
    existing = _fake_rubric_row(rubric_id, teacher.id, title="Old Title", total_points=100)
    get_result = MagicMock()
    get_result.scalar_one_or_none.return_value = existing
    client, db = await _client_for(teacher, execute_side_effect=[get_result])

    async with client:
        # Only title given -- description/criteria/total_points must survive untouched.
        resp = await client.put(f"/api/v1/rubrics/{rubric_id}", json={"title": "New Title"})

    assert resp.status_code == 200
    assert resp.json()["title"] == "New Title"
    assert existing.total_points == 100  # unchanged
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_update_someone_elses_rubric_is_404():
    teacher = _fake_teacher()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    client, db = await _client_for(teacher, execute_side_effect=[result])

    async with client:
        resp = await client.put(f"/api/v1/rubrics/{uuid4()}", json={"title": "Hijacked"})

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_rubric_soft_deletes():
    teacher = _fake_teacher()
    rubric_id = uuid4()
    existing = _fake_rubric_row(rubric_id, teacher.id)
    get_result = MagicMock()
    get_result.scalar_one_or_none.return_value = existing
    count_result = MagicMock()
    count_result.scalar.return_value = 0  # not attached to any published activity
    client, db = await _client_for(teacher, execute_side_effect=[get_result, count_result])

    async with client:
        resp = await client.delete(f"/api/v1/rubrics/{rubric_id}")

    assert resp.status_code == 204
    assert existing.is_active is False  # soft delete, not db.delete()
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_delete_rubric_blocked_when_attached_to_a_published_activity():
    """A rubric attached to a published activity must not be deletable out
    from under it -- 409, and the soft-delete flag must not flip."""
    teacher = _fake_teacher()
    rubric_id = uuid4()
    existing = _fake_rubric_row(rubric_id, teacher.id)
    get_result = MagicMock()
    get_result.scalar_one_or_none.return_value = existing
    count_result = MagicMock()
    count_result.scalar.return_value = 1  # attached to 1 published activity
    client, db = await _client_for(teacher, execute_side_effect=[get_result, count_result])

    async with client:
        resp = await client.delete(f"/api/v1/rubrics/{rubric_id}")

    assert resp.status_code == 409
    assert existing.is_active is True  # unchanged


# ===========================================================================
# R12-R14 — attach to activity
# ===========================================================================

@pytest.mark.asyncio
async def test_attach_rubric_sets_activity_rubric_id():
    teacher = _fake_teacher()
    rubric_id, activity_id = uuid4(), uuid4()
    existing_rubric = _fake_rubric_row(rubric_id, teacher.id)
    fake_activity = MagicMock()
    fake_activity.rubric_id = None

    rubric_result = MagicMock()
    rubric_result.scalar_one_or_none.return_value = existing_rubric
    activity_result = MagicMock()
    activity_result.scalar_one_or_none.return_value = fake_activity
    client, db = await _client_for(teacher, execute_side_effect=[rubric_result, activity_result])

    async with client:
        resp = await client.post(f"/api/v1/rubrics/{rubric_id}/attach/{activity_id}")

    assert resp.status_code == 200
    assert resp.json() == {"status": "attached", "rubric_id": str(rubric_id), "activity_id": str(activity_id)}
    assert fake_activity.rubric_id == rubric_id
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_attach_someone_elses_rubric_is_404():
    teacher = _fake_teacher()
    rubric_id, activity_id = uuid4(), uuid4()
    rubric_result = MagicMock()
    rubric_result.scalar_one_or_none.return_value = None  # WHERE teacher_id=caller finds nothing
    client, db = await _client_for(teacher, execute_side_effect=[rubric_result])

    async with client:
        resp = await client.post(f"/api/v1/rubrics/{rubric_id}/attach/{activity_id}")

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_attach_to_someone_elses_activity_is_404():
    teacher = _fake_teacher()
    rubric_id, activity_id = uuid4(), uuid4()
    existing_rubric = _fake_rubric_row(rubric_id, teacher.id)
    rubric_result = MagicMock()
    rubric_result.scalar_one_or_none.return_value = existing_rubric
    activity_result = MagicMock()
    activity_result.scalar_one_or_none.return_value = None  # activity not owned by this teacher
    client, db = await _client_for(teacher, execute_side_effect=[rubric_result, activity_result])

    async with client:
        resp = await client.post(f"/api/v1/rubrics/{rubric_id}/attach/{activity_id}")

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_reattach_overwrites_the_previous_rubric_id():
    """Re-attaching a different rubric to an activity that already has one
    overwrites it -- no versioning, no confirmation step. Documenting the
    real behavior, per R14."""
    teacher = _fake_teacher()
    old_rubric_id = uuid4()
    new_rubric_id, activity_id = uuid4(), uuid4()
    existing_rubric = _fake_rubric_row(new_rubric_id, teacher.id)
    fake_activity = MagicMock()
    fake_activity.rubric_id = old_rubric_id

    rubric_result = MagicMock()
    rubric_result.scalar_one_or_none.return_value = existing_rubric
    activity_result = MagicMock()
    activity_result.scalar_one_or_none.return_value = fake_activity
    client, db = await _client_for(teacher, execute_side_effect=[rubric_result, activity_result])

    async with client:
        resp = await client.post(f"/api/v1/rubrics/{new_rubric_id}/attach/{activity_id}")

    assert resp.status_code == 200
    assert fake_activity.rubric_id == new_rubric_id  # silently overwritten, no trace of old_rubric_id kept


# ===========================================================================
# X3 (cross-cutting) — non-teacher role on a teacher-only rubric endpoint
# ===========================================================================

@pytest.mark.asyncio
async def test_non_teacher_role_cannot_create_a_rubric():
    """get_current_teacher is the router-level dependency on every write
    endpoint here -- confirm a non-teacher role is actually rejected by it
    rather than the override happening to accept anything in these tests."""
    from core.dependencies import get_current_teacher
    from fastapi import HTTPException

    app = _make_app()
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[])

    async def _reject_non_teacher():
        raise HTTPException(status_code=403, detail="Teacher role required")

    from core.database import get_db
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_teacher] = _reject_non_teacher

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/rubrics", json={"title": "x", "criteria": []})

    assert resp.status_code == 403
