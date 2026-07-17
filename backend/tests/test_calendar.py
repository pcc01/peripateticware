# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for the unified Calendar API (routes/calendar.py).

Context
-------
ParentCalendarPage.tsx used to call GET /parent/children/{id}/activities and
filter client-side on `due_date`/`status` fields the old ActivityResponse
never actually returned, so the calendar grid was always empty. The fix was
GET /api/v1/calendar/events — one real, role-aware endpoint that returns a
`date` (ISO) and `type` ('planned'|'completed'|...) per event, derived from
learning_sessions.status/created_at/completed_at for activities, and from the
classroom_events table for teacher-authored deadlines/events. There is no new
`due_date` column anywhere; "date" is derived (completed_at when
status='completed', else created_at), which is what this test file verifies.

This module also adds the teacher-facing "class roster" calendar: the same
endpoint, scoped by `classroom_id` instead of `child_id`, aggregating every
student in the teacher's classroom (`include_student_name=True`).

Strategy mirrors test_parent_portal.py: build a minimal in-process FastAPI
app with only the calendar router, override get_current_user/get_db, and
drive requests through httpx.AsyncClient + ASGITransport. db.execute() is
given a side_effect list so we can control each successive query's result
in call order.
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
    from routes.calendar import router as calendar_router
    test_app.include_router(calendar_router, prefix="/api/v1")
    return test_app


def _fake_user(role: str, uid: UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = uid or uuid4()
    user.email = f"{role.lower()}@example.com"
    user.full_name = f"Test {role.title()}"
    user.role = role
    user.is_active = True
    user.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    return user


def _row(**kwargs):
    """Mimics a SQLAlchemy mapping Row: supports both r['key'] and r.key."""
    m = MagicMock()
    m.__getitem__ = lambda self, k: kwargs[k]
    m.get = lambda k, default=None: kwargs.get(k, default)
    for k, v in kwargs.items():
        setattr(m, k, v)
    return m


def _plain_row(*values):
    """Mimics a SQLAlchemy positional Row (tuple-like), e.g. `(classroom_id,)`."""
    return tuple(values)


def _mock_result(*, first=None, fetchone=None, all_=None, mappings_all=None):
    """Builds a MagicMock standing in for the object db.execute(...) resolves to.

    NOTE: routes/calendar.py uses `.first()` for its link/ownership existence
    checks (not `.fetchone()`) — pass `first=` for those, not `fetchone=`.
    """
    result = MagicMock()
    result.first.return_value = first
    result.fetchone.return_value = fetchone if fetchone is not None else first
    result.all.return_value = all_ if all_ is not None else []
    result.mappings.return_value.all.return_value = mappings_all if mappings_all is not None else []
    return result


async def _client_for(user: MagicMock, execute_side_effect: list):
    from core.database import get_db
    from core.dependencies import get_current_user

    app = _make_app()
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=execute_side_effect)
    db.commit = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test"), db


# ===========================================================================
# 1. GET /calendar/events (parent) — due_date/status correctly derived
# ===========================================================================

@pytest.mark.asyncio
async def test_parent_events_map_status_and_date_correctly():
    """
    A parent's GET /calendar/events?child_id=... must return one event per
    learning_session with:
      - type='completed', date=completed_at.date() for status='completed'
      - type='planned',   date=created_at.date()   for status in
        ('in_progress', 'paused')
    This is the concrete fix for the "activities always empty" bug: the
    frontend calendar grid filters on `date`/`type`, and both are now real,
    derived values instead of missing fields.
    """
    parent = _fake_user("PARENT")
    child_id = str(uuid4())

    completed_session = uuid4()
    planned_session = uuid4()
    student_uuid = UUID(child_id)
    completed_at = datetime(2026, 7, 10, 9, 0, 0)
    created_at = datetime(2026, 7, 12, 14, 30, 0)

    activity_rows = [
        _row(
            session_id=completed_session, title="River Ecosystem Study", subject="Science",
            status="completed", created_at=datetime(2026, 7, 8, 8, 0, 0), completed_at=completed_at,
            user_id=student_uuid, student_name="Kid One",
        ),
        _row(
            session_id=planned_session, title="Fraction Practice", subject="Math",
            status="in_progress", created_at=created_at, completed_at=None,
            user_id=student_uuid, student_name="Kid One",
        ),
    ]

    execute_side_effect = [
        _mock_result(first=(1,)),                         # 1. parent_child_links / homeschool_children check (.first())
        _mock_result(mappings_all=activity_rows),        # 2. activity events query
        _mock_result(all_=[]),                            # 3. classroom_students lookup -> no classrooms
    ]

    client, db = await _client_for(parent, execute_side_effect)
    async with client:
        resp = await client.get("/api/v1/calendar/events", params={"child_id": child_id})

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2

    by_id = {e["id"]: e for e in data}
    completed_event = by_id[f"activity-{completed_session}"]
    planned_event = by_id[f"activity-{planned_session}"]

    assert completed_event["type"] == "completed"
    assert completed_event["date"] == completed_at.date().isoformat()
    assert completed_event["source"] == "activity"

    assert planned_event["type"] == "planned"
    assert planned_event["date"] == created_at.date().isoformat()

    # Parent-scoped calls don't request student names on the response.
    assert completed_event["student_name"] is None


# ===========================================================================
# 2. GET /calendar/events (parent) — 403 when child isn't linked
# ===========================================================================

@pytest.mark.asyncio
async def test_parent_events_forbidden_for_unlinked_child():
    parent = _fake_user("PARENT")
    child_id = str(uuid4())

    execute_side_effect = [
        _mock_result(fetchone=None),  # link check fails
    ]

    client, db = await _client_for(parent, execute_side_effect)
    async with client:
        resp = await client.get("/api/v1/calendar/events", params={"child_id": child_id})

    assert resp.status_code == 403
    assert "not authorized" in resp.json()["detail"].lower()


# ===========================================================================
# 3. GET /calendar/events (teacher roster) — happy path, aggregated across
#    the whole classroom, student names included
# ===========================================================================

@pytest.mark.asyncio
async def test_teacher_roster_events_happy_path():
    teacher = _fake_user("TEACHER")
    classroom_id = str(uuid4())
    student_a = uuid4()
    student_b = uuid4()
    session_id = uuid4()
    completed_at = datetime(2026, 7, 14, 11, 0, 0)

    activity_rows = [
        _row(
            session_id=session_id, title="Volcano Diorama", subject="Science",
            status="completed", created_at=datetime(2026, 7, 12, 8, 0, 0), completed_at=completed_at,
            user_id=student_a, student_name="Alice",
        ),
    ]
    event_row = _row(
        id=uuid4(), classroom_id=UUID(classroom_id), title="Field trip permission due",
        description="Bring signed slip", event_date=__import__("datetime").date(2026, 7, 20),
        event_type="deadline",
    )

    execute_side_effect = [
        _mock_result(first=(1,)),                                     # 1. classroom ownership check (.first())
        _mock_result(all_=[_plain_row(student_a), _plain_row(student_b)]),  # 2. classroom_students roster
        _mock_result(mappings_all=activity_rows),                      # 3. activity events for roster
        _mock_result(mappings_all=[event_row]),                        # 4. classroom_events for classroom
    ]

    client, db = await _client_for(teacher, execute_side_effect)
    async with client:
        resp = await client.get("/api/v1/calendar/events", params={"classroom_id": classroom_id})

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2

    activity_event = next(e for e in data if e["source"] == "activity")
    assert activity_event["type"] == "completed"
    assert activity_event["date"] == completed_at.date().isoformat()
    # Teacher/roster view includes which student the activity belongs to.
    assert activity_event["student_name"] == "Alice"

    deadline_event = next(e for e in data if e["source"] == "classroom_event")
    assert deadline_event["type"] == "deadline"
    assert deadline_event["date"] == "2026-07-20"
    assert deadline_event["classroom_id"] == classroom_id


# ===========================================================================
# 4. GET /calendar/events (teacher) — 404 when classroom isn't theirs
# ===========================================================================

@pytest.mark.asyncio
async def test_teacher_roster_events_forbidden_when_not_owner():
    teacher = _fake_user("TEACHER")
    classroom_id = str(uuid4())

    execute_side_effect = [
        _mock_result(fetchone=None),  # ownership check fails
    ]

    client, db = await _client_for(teacher, execute_side_effect)
    async with client:
        resp = await client.get("/api/v1/calendar/events", params={"classroom_id": classroom_id})

    assert resp.status_code == 404


# ===========================================================================
# 5. POST /calendar/events — 403 for a non-teacher role (student)
# ===========================================================================

@pytest.mark.asyncio
async def test_create_classroom_event_forbidden_for_non_teacher():
    student = _fake_user("STUDENT")

    client, db = await _client_for(student, execute_side_effect=[])
    async with client:
        resp = await client.post(
            "/api/v1/calendar/events",
            json={
                "classroom_id": str(uuid4()),
                "title": "Sneaky event",
                "event_date": "2026-08-01",
                "event_type": "event",
            },
        )

    assert resp.status_code == 403
    assert "only teachers" in resp.json()["detail"].lower()


# ===========================================================================
# 6. POST /calendar/events — happy path for the owning teacher
# ===========================================================================

@pytest.mark.asyncio
async def test_create_classroom_event_happy_path():
    teacher = _fake_user("TEACHER")
    classroom_id = str(uuid4())

    execute_side_effect = [
        _mock_result(first=(1,)),  # ownership check passes (.first())
        _mock_result(),            # INSERT
    ]

    client, db = await _client_for(teacher, execute_side_effect)
    async with client:
        resp = await client.post(
            "/api/v1/calendar/events",
            json={
                "classroom_id": classroom_id,
                "title": "Museum field trip",
                "description": "Bring a permission slip",
                "event_date": "2026-08-01",
                "event_type": "field_trip",
            },
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Museum field trip"
    assert body["date"] == "2026-08-01"
    assert body["type"] == "field_trip"
    assert body["source"] == "classroom_event"
    db.commit.assert_awaited()
