# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for teacher-initiated communication (routes/teacher_communication.py)
plus the parent/student-facing announcement read endpoints
(routes/parent.py::get_parent_announcements, routes/student.py::get_student_announcements).

Context
-------
Parents already had a full Messages experience (routes/parent.py) built on
`parent_messages` (1:1, participant-checked) but there was no way for a
*teacher* to originate a conversation, and no broadcast/announcement concept
at all. This adds:
  - Teacher-side reply-within-conversation, reusing the SAME participant-check
    pattern the parent side already uses (routes/teacher_communication.py::
    reply_in_conversation).
  - A brand-new `classroom_announcements` table + teacher create/list
    endpoints, gated by classroom ownership.
  - Parent/student read endpoints for announcements, scoped server-side to
    the caller's own linked children / own enrollment — no client-supplied
    classroom_id, so cross-family/cross-classroom leakage isn't possible by
    construction.

Two tests below are security-critical and must not be skipped:
  - test_reply_forbidden_when_not_participant   (cross-conversation reply denial)
  - test_create_announcement_forbidden_for_non_owning_teacher (cross-classroom
    announcement-creation denial)
Plus a data-isolation pair for the read side:
  - test_parent_announcements_scoped_to_caller
  - test_student_announcements_scoped_to_caller

Strategy mirrors test_parent_portal.py / test_classrooms.py: minimal
in-process FastAPI app(s), get_current_user/get_db overridden, AsyncMock DB,
httpx.AsyncClient + ASGITransport — no real Postgres needed.
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
# Fake users
# ---------------------------------------------------------------------------

def _fake_teacher(uid: UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = uid or uuid4()
    user.email = "teacher@example.com"
    user.full_name = "Ms. Rivera"
    user.role = "TEACHER"
    user.is_active = True
    user.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    return user


def _fake_parent(uid: UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = uid or uuid4()
    user.email = "parent@example.com"
    user.full_name = "Test Parent"
    user.role = "PARENT"
    user.is_active = True
    user.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    return user


def _fake_student(uid: UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = uid or uuid4()
    user.email = "student@example.com"
    user.full_name = "Grace Hopper"
    user.role = "STUDENT"
    user.is_active = True
    user.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    return user


def _row(*values):
    """Positional row mock (behaves like SQLAlchemy Row for tuple access)."""
    m = MagicMock()
    m.__getitem__ = lambda self, i: values[i]
    return m


def _mapping_row(**kwargs):
    m = MagicMock()
    m.__getitem__ = lambda self, k: kwargs[k]
    m.get = lambda k, default=None: kwargs.get(k, default)
    for k, v in kwargs.items():
        setattr(m, k, v)
    return m


# ---------------------------------------------------------------------------
# App builders
# ---------------------------------------------------------------------------

def _make_teacher_app() -> FastAPI:
    app = FastAPI()
    from routes.teacher_communication import router as teacher_router
    app.include_router(teacher_router, prefix="/api/v1")
    return app


def _make_parent_app() -> FastAPI:
    app = FastAPI()
    from routes.parent import router as parent_router
    app.include_router(parent_router, prefix="/api/v1")
    return app


def _make_student_app() -> FastAPI:
    app = FastAPI()
    from routes.student import router as student_router
    app.include_router(student_router)  # router already carries /api/v1/student
    return app


@pytest_asyncio.fixture
async def teacher_ctx():
    from core.database import get_db
    from core.dependencies import get_current_user

    app = _make_teacher_app()
    teacher = _fake_teacher()
    db = AsyncMock()
    db.commit = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: teacher

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "db": db, "teacher": teacher}


@pytest_asyncio.fixture
async def parent_ctx():
    from core.database import get_db
    from core.dependencies import get_current_user

    app = _make_parent_app()
    parent = _fake_parent()
    db = AsyncMock()
    db.commit = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: parent

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "db": db, "parent": parent}


@pytest_asyncio.fixture
async def student_ctx():
    from core.database import get_db
    from core.dependencies import get_current_user

    app = _make_student_app()
    student = _fake_student()
    db = AsyncMock()
    db.commit = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: student

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "db": db, "student": student}


# ===========================================================================
# 1. POST /teacher/messages/{conversation_id}/reply — 200 when teacher IS a
#    participant (i.e. replying within their own classroom's conversation)
# ===========================================================================

@pytest.mark.asyncio
async def test_reply_success_when_participant(teacher_ctx):
    """A teacher who is a participant (from_user_id or to_user_id on the
    latest message in the conversation) can reply — 200."""
    client = teacher_ctx["client"]
    db = teacher_ctx["db"]
    teacher = teacher_ctx["teacher"]

    conv_id = uuid4()
    parent_id = uuid4()

    orig_result = MagicMock()
    # from_user_id = this teacher, to_user_id = the parent, subject
    orig_result.first.return_value = _row(str(teacher.id), str(parent_id), "Field trip")
    insert_result = MagicMock()
    notif_result = MagicMock()
    db.execute.side_effect = [orig_result, insert_result, notif_result]

    resp = await client.post(
        f"/api/v1/teacher/messages/{conv_id}/reply",
        json={"body": "Sounds good, see you then."},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    assert "message_id" in body
    db.commit.assert_called_once()


# ===========================================================================
# 2. POST /teacher/messages/{conversation_id}/reply — 403 when teacher is NOT
#    a participant (SECURITY CRITICAL: cross-classroom / cross-conversation
#    reply denial)
# ===========================================================================

@pytest.mark.asyncio
async def test_reply_forbidden_when_not_participant(teacher_ctx):
    """A teacher who is neither from_user_id nor to_user_id on the
    conversation's latest message must be rejected with 403 — otherwise any
    teacher could inject a message into another teacher's classroom
    conversation just by guessing/enumerating a conversation_id."""
    client = teacher_ctx["client"]
    db = teacher_ctx["db"]

    conv_id = uuid4()
    other_teacher_id = uuid4()
    other_parent_id = uuid4()

    orig_result = MagicMock()
    orig_result.first.return_value = _row(str(other_teacher_id), str(other_parent_id), "Homework")
    db.execute.return_value = orig_result

    resp = await client.post(
        f"/api/v1/teacher/messages/{conv_id}/reply",
        json={"body": "Sneaky reply from an unrelated teacher"},
    )

    assert resp.status_code == 403
    assert "not authorized" in resp.json()["detail"].lower()
    db.commit.assert_not_called()


# ===========================================================================
# 3. POST /teacher/classrooms/{id}/announcements — 200/201 for the owning
#    teacher
# ===========================================================================

@pytest.mark.asyncio
async def test_create_announcement_success_for_owning_teacher(teacher_ctx):
    client = teacher_ctx["client"]
    db = teacher_ctx["db"]
    teacher = teacher_ctx["teacher"]

    classroom_id = uuid4()

    ownership_result = MagicMock()
    ownership_result.first.return_value = _row("Ms. Rivera's Class", str(teacher.id))
    insert_result = MagicMock()
    db.execute.side_effect = [ownership_result, insert_result]

    resp = await client.post(
        f"/api/v1/teacher/classrooms/{classroom_id}/announcements",
        json={"title": "Field trip Friday", "body": "Permission slips due Thursday."},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Field trip Friday"
    assert body["classroom_name"] == "Ms. Rivera's Class"
    assert body["teacher_id"] == str(teacher.id)
    db.commit.assert_called_once()


# ===========================================================================
# 4. POST /teacher/classrooms/{id}/announcements — 403 for a non-owning
#    teacher (SECURITY CRITICAL: cross-classroom announcement-creation denial)
# ===========================================================================

@pytest.mark.asyncio
async def test_create_announcement_forbidden_for_non_owning_teacher(teacher_ctx):
    """A teacher must not be able to post an announcement into a classroom
    owned by a different teacher, even though the classroom_id exists."""
    client = teacher_ctx["client"]
    db = teacher_ctx["db"]

    classroom_id = uuid4()
    other_teacher_id = uuid4()

    ownership_result = MagicMock()
    # Classroom exists, but teacher_id belongs to someone else
    ownership_result.first.return_value = _row("Someone Else's Class", str(other_teacher_id))
    db.execute.return_value = ownership_result

    resp = await client.post(
        f"/api/v1/teacher/classrooms/{classroom_id}/announcements",
        json={"title": "Hijacked announcement", "body": "Should never be created."},
    )

    assert resp.status_code == 403
    db.commit.assert_not_called()


# ===========================================================================
# 5. GET /teacher/classrooms/{id}/announcements — 403 for a non-owning teacher
# ===========================================================================

@pytest.mark.asyncio
async def test_list_announcements_forbidden_for_non_owning_teacher(teacher_ctx):
    client = teacher_ctx["client"]
    db = teacher_ctx["db"]

    classroom_id = uuid4()
    other_teacher_id = uuid4()

    ownership_result = MagicMock()
    ownership_result.first.return_value = _row("Someone Else's Class", str(other_teacher_id))
    db.execute.return_value = ownership_result

    resp = await client.get(f"/api/v1/teacher/classrooms/{classroom_id}/announcements")

    assert resp.status_code == 403


# ===========================================================================
# 6. GET /parent/announcements — scoped to the caller (parent), 200
# ===========================================================================

@pytest.mark.asyncio
async def test_parent_announcements_scoped_to_caller(parent_ctx):
    """GET /parent/announcements returns announcements for the CALLING
    parent's own linked children/classrooms, and the query is bound on
    current_user.id (:pid) — there is no classroom_id/child_id request
    parameter that could be used to pull another family's announcements."""
    client = parent_ctx["client"]
    db = parent_ctx["db"]
    parent = parent_ctx["parent"]

    ann_id = uuid4()
    classroom_id = uuid4()
    teacher_id = uuid4()
    child_id = uuid4()
    now = datetime(2026, 7, 10, 9, 0, 0)

    result_mock = MagicMock()
    result_mock.mappings.return_value.all.return_value = [
        _mapping_row(
            id=ann_id, classroom_id=classroom_id, classroom_name="Room 4",
            teacher_id=teacher_id, teacher_name="Ms. Rivera",
            child_id=child_id, child_name="Grace Hopper",
            title="Field trip Friday", body="Permission slips due Thursday.",
            created_at=now,
        )
    ]
    db.execute.return_value = result_mock

    resp = await client.get("/api/v1/parent/announcements")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Field trip Friday"
    assert data[0]["child_name"] == "Grace Hopper"

    # Verify the bound parameter scoping the query is this parent's own id —
    # not anything client-controlled.
    call_args, call_kwargs = db.execute.call_args
    params = call_args[1]
    assert params["pid"] == str(parent.id)


@pytest.mark.asyncio
async def test_parent_announcements_empty_when_no_linked_classroom(parent_ctx):
    """A parent with no children linked to any classroom that has posted
    announcements gets an empty list — not another family's data."""
    client = parent_ctx["client"]
    db = parent_ctx["db"]

    result_mock = MagicMock()
    result_mock.mappings.return_value.all.return_value = []
    db.execute.return_value = result_mock

    resp = await client.get("/api/v1/parent/announcements")

    assert resp.status_code == 200
    assert resp.json() == []


# ===========================================================================
# 7. GET /student/announcements — scoped to the caller (student), 200
# ===========================================================================

@pytest.mark.asyncio
async def test_student_announcements_scoped_to_caller(student_ctx):
    """GET /student/announcements returns announcements for classrooms the
    CALLING student is enrolled in, bound on current_user.id (:sid) — no
    client-supplied classroom_id, so a student cannot fetch another
    classroom's announcements by guessing an id."""
    client = student_ctx["client"]
    db = student_ctx["db"]
    student = student_ctx["student"]

    ann_id = uuid4()
    classroom_id = uuid4()
    teacher_id = uuid4()
    now = datetime(2026, 7, 10, 9, 0, 0)

    result_mock = MagicMock()
    result_mock.mappings.return_value.all.return_value = [
        _mapping_row(
            id=ann_id, classroom_id=classroom_id, classroom_name="Room 4",
            teacher_id=teacher_id, teacher_name="Ms. Rivera",
            title="Field trip Friday", body="Bring a permission slip.",
            created_at=now,
        )
    ]
    db.execute.return_value = result_mock

    resp = await client.get("/api/v1/student/announcements")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Field trip Friday"

    call_args, call_kwargs = db.execute.call_args
    params = call_args[1]
    assert params["sid"] == str(student.id)


@pytest.mark.asyncio
async def test_student_announcements_empty_when_not_enrolled_anywhere(student_ctx):
    client = student_ctx["client"]
    db = student_ctx["db"]

    result_mock = MagicMock()
    result_mock.mappings.return_value.all.return_value = []
    db.execute.return_value = result_mock

    resp = await client.get("/api/v1/student/announcements")

    assert resp.status_code == 200
    assert resp.json() == []
