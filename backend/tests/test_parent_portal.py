# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for Parent Portal endpoints (routes/parent.py).

Strategy
--------
- The FastAPI app wires the parent router at /api/v1/parent (prefix in main.py).
- We build a minimal in-process app so we never need a real Postgres connection.
- `get_current_user` is overridden to return a fake User object.
- `get_db` is overridden with an AsyncMock whose `.execute()` return value is
  configured per-test via helpers.
- All tests use httpx.AsyncClient with ASGITransport (async-native, no sync
  TestClient workarounds needed).
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
# Build a minimal test app with only the parent router registered.
# ---------------------------------------------------------------------------

def _make_app() -> FastAPI:
    from fastapi import FastAPI as _FA
    test_app = _FA()
    from routes.parent import router as parent_router
    test_app.include_router(parent_router, prefix="/api/v1")
    return test_app


# ---------------------------------------------------------------------------
# Fake User — mimics models.user.User well enough for all parent tests
# ---------------------------------------------------------------------------

def _fake_parent(uid: UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = uid or uuid4()
    user.email = "parent@example.com"
    user.full_name = "Test Parent"
    user.role = "PARENT"
    user.is_active = True
    user.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    return user


# ---------------------------------------------------------------------------
# Helper: mapping-row mock (behaves like an SQLAlchemy Row)
# ---------------------------------------------------------------------------

def _row(**kwargs):
    m = MagicMock()
    m.__getitem__ = lambda self, k: kwargs[k]
    m.get = lambda k, default=None: kwargs.get(k, default)
    for k, v in kwargs.items():
        setattr(m, k, v)
    return m


# ---------------------------------------------------------------------------
# Core async fixture: authenticated AsyncClient with mocked DB
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def ctx():
    """
    Yields a dict with:
      client  – AsyncClient aimed at the test app
      db      – AsyncMock for the DB session
      parent  – the fake parent User object
    """
    from core.database import get_db
    from core.dependencies import get_current_user

    app = _make_app()
    parent = _fake_parent()
    db = AsyncMock()

    # Default execute() chain: empty list / no row
    execute_result = MagicMock()
    execute_result.mappings.return_value.all.return_value = []
    execute_result.mappings.return_value.fetchone.return_value = None
    execute_result.fetchone.return_value = None
    execute_result.scalar.return_value = None
    db.execute.return_value = execute_result
    db.commit = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: parent

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "db": db, "parent": parent}


# ===========================================================================
# 1. GET /parent/messages — empty list
# ===========================================================================

@pytest.mark.asyncio
async def test_get_messages_empty(ctx):
    """GET /parent/messages returns [] when parent_messages has no rows."""
    client = ctx["client"]
    db = ctx["db"]

    result_mock = MagicMock()
    result_mock.mappings.return_value.all.return_value = []
    db.execute.return_value = result_mock

    resp = await client.get("/api/v1/parent/messages")

    assert resp.status_code == 200
    assert resp.json() == []


# ===========================================================================
# 2. GET /parent/messages — returns MessageResponse objects
# ===========================================================================

@pytest.mark.asyncio
async def test_get_messages_returns_list(ctx):
    """GET /parent/messages returns a list of MessageResponse when rows exist."""
    client = ctx["client"]
    db = ctx["db"]
    parent = ctx["parent"]

    teacher_id = uuid4()
    msg_id = uuid4()
    conv_id = uuid4()
    now = datetime(2026, 1, 15, 10, 0, 0)

    fake_row = _row(
        id=msg_id,
        from_user_id=teacher_id,
        to_user_id=parent.id,
        subject="Field trip reminder",
        body="Don't forget the permission slip.",
        conversation_id=conv_id,
        read_at=None,
        created_at=now,
        from_name="Ms. Rivera",
    )

    result_mock = MagicMock()
    result_mock.mappings.return_value.all.return_value = [fake_row]
    db.execute.return_value = result_mock

    resp = await client.get("/api/v1/parent/messages")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    msg = data[0]
    assert msg["id"] == str(msg_id)
    assert msg["from_teacher_name"] == "Ms. Rivera"
    assert msg["subject"] == "Field trip reminder"
    assert msg["read_at"] is None
    assert msg["conversation_id"] == str(conv_id)


# ===========================================================================
# 3. POST /parent/messages/{bad_uuid}/reply — 404 when original not found
# ===========================================================================

@pytest.mark.asyncio
async def test_reply_to_message_not_found(ctx):
    """POST /parent/messages/{id}/reply returns 404 when message doesn't exist."""
    client = ctx["client"]
    db = ctx["db"]

    bad_id = str(uuid4())

    result_mock = MagicMock()
    result_mock.fetchone.return_value = None
    db.execute.return_value = result_mock

    resp = await client.post(
        f"/api/v1/parent/messages/{bad_id}/reply",
        json={"body": "Hello!"},
    )

    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


# ===========================================================================
# 4. GET /parent/notifications?unread_only=true — only returns unread rows
# ===========================================================================

@pytest.mark.asyncio
async def test_get_notifications_unread_filter(ctx):
    """GET /parent/notifications?unread_only=true only returns unread notifications."""
    client = ctx["client"]
    db = ctx["db"]
    parent = ctx["parent"]

    notif_id = uuid4()
    child_id = uuid4()
    now = datetime(2026, 1, 15, 9, 0, 0)

    unread_row = _row(
        id=notif_id,
        user_id=parent.id,
        title="New achievement!",
        message="Your child earned a badge.",
        is_read=False,
        type="achievement",
        related_child_id=child_id,
        action_url=None,
        created_at=now,
    )

    result_mock = MagicMock()
    result_mock.mappings.return_value.all.return_value = [unread_row]
    db.execute.return_value = result_mock

    resp = await client.get("/api/v1/parent/notifications?unread_only=true")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "New achievement!"
    # Unread rows: read_at is None (is_read=False branch in the route)
    assert data[0]["read_at"] is None

    # Confirm the SQL sent to execute() contained the unread filter
    call_args = db.execute.call_args
    executed_sql = str(call_args[0][0])
    assert "is_read" in executed_sql.lower()


# ===========================================================================
# 5. PUT /parent/notifications/{id}/read — marks notification read
# ===========================================================================

@pytest.mark.asyncio
async def test_mark_notification_read(ctx):
    """PUT /parent/notifications/{id}/read returns success and commits."""
    client = ctx["client"]
    db = ctx["db"]

    notif_id = str(uuid4())

    resp = await client.put(f"/api/v1/parent/notifications/{notif_id}/read")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    db.commit.assert_called_once()


# ===========================================================================
# 6. GET /parent/children/{child_id}/activities — 403 when not linked
# ===========================================================================

@pytest.mark.asyncio
async def test_get_child_activities_unauthorized(ctx):
    """GET /parent/children/{child_id}/activities returns 403 when child not linked."""
    client = ctx["client"]
    db = ctx["db"]

    child_id = str(uuid4())

    link_result = MagicMock()
    link_result.fetchone.return_value = None   # no link row
    db.execute.return_value = link_result

    resp = await client.get(f"/api/v1/parent/children/{child_id}/activities")

    assert resp.status_code == 403
    assert "not authorized" in resp.json()["detail"].lower()


# ===========================================================================
# 7. GET /parent/children/{child_id}/activities — success when linked
# ===========================================================================

@pytest.mark.asyncio
async def test_get_child_activities_success(ctx):
    """GET /parent/children/{child_id}/activities returns ActivityResponse list."""
    client = ctx["client"]
    db = ctx["db"]

    child_id = str(uuid4())
    session_id = uuid4()
    activity_id = uuid4()
    now = datetime(2026, 1, 14, 15, 30, 0)

    activity_row = _row(
        session_id=session_id,
        activity_id=activity_id,
        title="Nature Walk",
        subject="Science",
        description="Observe local flora and fauna.",
        completed_at=now,
        duration=45,
    )

    # Call 1: link auth check → row present
    link_result = MagicMock()
    link_result.fetchone.return_value = (1,)

    # Call 2: activities query
    activities_result = MagicMock()
    activities_result.mappings.return_value.all.return_value = [activity_row]

    db.execute.side_effect = [link_result, activities_result]

    resp = await client.get(f"/api/v1/parent/children/{child_id}/activities")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    act = data[0]
    assert act["title"] == "Nature Walk"
    assert act["subject"] == "Science"
    assert act["duration"] == 45
    assert act["session_id"] == str(session_id)


# ===========================================================================
# 8. GET /parent/children/{child_id}/reports/weekly — real count from sessions
# ===========================================================================

@pytest.mark.asyncio
async def test_weekly_report_real_count(ctx):
    """Weekly report returns real activity count (not 0) when sessions exist."""
    client = ctx["client"]
    db = ctx["db"]

    child_id = str(uuid4())

    link_result = MagicMock()
    link_result.fetchone.return_value = (1,)

    count_result = MagicMock()
    count_result.fetchone.return_value = (7,)

    db.execute.side_effect = [link_result, count_result]

    resp = await client.get(
        f"/api/v1/parent/children/{child_id}/reports/weekly",
        params={"week_start": "2026-01-12"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["child_id"] == child_id
    assert body["activities_completed"] == 7
    assert body["total_hours"] == pytest.approx(7.0, abs=0.1)
    assert "week_starting" in body
    assert "week_ending" in body


# ===========================================================================
# 9. GET /parent/children/{child_id}/reports/monthly — real count
# ===========================================================================

@pytest.mark.asyncio
async def test_monthly_report_real_count(ctx):
    """Monthly report returns real activity count (not 0) when sessions exist."""
    client = ctx["client"]
    db = ctx["db"]

    child_id = str(uuid4())

    link_result = MagicMock()
    link_result.fetchone.return_value = (1,)

    count_result = MagicMock()
    count_result.fetchone.return_value = (23,)

    db.execute.side_effect = [link_result, count_result]

    resp = await client.get(
        f"/api/v1/parent/children/{child_id}/reports/monthly",
        params={"month": 1, "year": 2026},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["child_id"] == child_id
    assert body["activities_completed"] == 23
    assert body["total_hours"] == pytest.approx(23.0, abs=0.1)
    assert body["month"] == "Jan"
    assert body["year"] == 2026


# ===========================================================================
# 10. PUT then GET /parent/settings — upsert / retrieval round-trip
# ===========================================================================

@pytest.mark.asyncio
async def test_settings_upsert(ctx):
    """PUT /parent/settings upserts; subsequent GET returns saved values."""
    client = ctx["client"]
    db = ctx["db"]
    parent = ctx["parent"]

    # --- PUT ---
    put_resp = await client.put(
        "/api/v1/parent/settings",
        json={
            "dark_mode": True,
            "language": "es",
            "email_frequency": "daily",
            "notifications_enabled": False,
            "push_notifications_enabled": True,
        },
    )

    assert put_resp.status_code == 200
    put_body = put_resp.json()
    assert put_body["dark_mode"] is True
    assert put_body["language"] == "es"
    assert put_body["email_frequency"] == "daily"
    assert put_body["notifications_enabled"] is False
    assert put_body["push_notifications_enabled"] is True
    db.commit.assert_called_once()

    # --- GET (simulate DB returning the upserted row) ---
    db.commit.reset_mock()

    saved_row = _row(
        parent_id=parent.id,
        dark_mode=True,
        language="es",
        email_frequency="daily",
        notifications_enabled=False,
        push_notifications_enabled=True,
    )
    get_result = MagicMock()
    get_result.mappings.return_value.fetchone.return_value = saved_row
    db.execute.return_value = get_result

    get_resp = await client.get("/api/v1/parent/settings")

    assert get_resp.status_code == 200
    get_body = get_resp.json()
    assert get_body["dark_mode"] is True
    assert get_body["language"] == "es"
    assert get_body["email_frequency"] == "daily"
    assert get_body["notifications_enabled"] is False
