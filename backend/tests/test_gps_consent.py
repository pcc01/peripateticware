# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for GPS-consent gating:
  - routes/sessions.py::_check_gps_consent()
  - routes/sessions.py POST /{session_id}/events (location_update consent gate)
  - routes/student_activities.py::_notify_parents_gps_consent()

Strategy
--------
- Mirrors tests/test_parent_portal.py's no-real-DB pattern: minimal FastAPI
  app with just the sessions router, AsyncMock for get_db, MagicMock fake
  user overriding get_current_user.
- _notify_parents_gps_consent() opens its own DB session via
  core.database.async_session_factory rather than a FastAPI dependency, so
  it's tested directly as a plain async function with that module attribute
  monkeypatched to a fake async-context-manager factory.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

pytest.importorskip("fastapi")
pytest.importorskip("httpx")


def _make_app() -> FastAPI:
    from fastapi import FastAPI as _FA
    test_app = _FA()
    from routes.sessions import router as sessions_router
    test_app.include_router(sessions_router, prefix="/api/v1/sessions")
    return test_app


def _fake_student(uid: UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = uid or uuid4()
    user.email = "student@example.com"
    user.full_name = "Test Student"
    user.role = "STUDENT"
    user.is_active = True
    user.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    return user


@pytest_asyncio.fixture
async def ctx():
    from core.database import get_db
    from core.dependencies import get_current_user

    app = _make_app()
    user = _fake_student()
    db = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "db": db, "user": user}


# ===========================================================================
# 1. _check_gps_consent() — direct unit tests
# ===========================================================================

class TestCheckGpsConsent:
    @pytest.mark.asyncio
    async def test_returns_false_when_no_activity_id(self):
        from routes.sessions import _check_gps_consent

        db = AsyncMock()
        result = await _check_gps_consent(db, uuid4(), None)

        assert result is False
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_true_when_active_consent_row_found(self):
        from routes.sessions import _check_gps_consent

        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.fetchone.return_value = (uuid4(),)  # consent_logs row found
        db.execute.return_value = result_mock

        result = await _check_gps_consent(db, uuid4(), uuid4())

        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_when_no_consent_row_found(self):
        from routes.sessions import _check_gps_consent

        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.fetchone.return_value = None
        db.execute.return_value = result_mock

        result = await _check_gps_consent(db, uuid4(), uuid4())

        assert result is False

    @pytest.mark.asyncio
    async def test_fails_closed_returns_false_on_db_error(self):
        """If the consent-check query itself errors, _check_gps_consent must
        return False (fail-closed on consent gating) rather than raising."""
        from routes.sessions import _check_gps_consent

        db = AsyncMock()
        db.execute.side_effect = RuntimeError("db exploded")

        result = await _check_gps_consent(db, uuid4(), uuid4())

        assert result is False


# ===========================================================================
# 2. POST /sessions/{id}/events — location_update consent gate (endpoint)
# ===========================================================================

class TestLocationUpdateConsentGate:
    @pytest.mark.asyncio
    async def test_location_update_blocked_without_consent(self, ctx):
        """A under-13 student's location_update event is rejected with 403
        when GPS capture is enabled on the activity but no active consent
        row exists."""
        client = ctx["client"]
        db = ctx["db"]
        user = ctx["user"]

        session_id = uuid4()
        activity_id = uuid4()

        sess_row = MagicMock()
        sess_row.activity_id = activity_id

        act_row = MagicMock()
        act_row.discovery_location_gps_capture_enabled = True

        user_row = MagicMock()
        user_row.age_group = "under_13"
        user_row.requires_parental_consent = True

        sess_result = MagicMock()
        sess_result.scalar_one_or_none.return_value = sess_row

        act_result = MagicMock()
        act_result.scalar_one_or_none.return_value = act_row

        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = user_row

        consent_result = MagicMock()
        consent_result.fetchone.return_value = None  # no active consent

        db.execute.side_effect = [sess_result, act_result, user_result, consent_result]

        resp = await client.post(
            f"/api/v1/sessions/{session_id}/events",
            json={"event_type": "location_update", "metadata": {"lat": 1.0, "lng": 2.0}},
        )

        assert resp.status_code == 403
        assert resp.json()["detail"] == "gps_consent_required"

    @pytest.mark.asyncio
    async def test_location_update_allowed_with_active_consent(self, ctx):
        """Same setup, but an active consent row exists — the event should
        be logged successfully (201) instead of blocked."""
        client = ctx["client"]
        db = ctx["db"]

        session_id = uuid4()
        activity_id = uuid4()
        event_id = uuid4()
        now = datetime(2026, 1, 15, 10, 0, 0)

        sess_row = MagicMock()
        sess_row.activity_id = activity_id

        act_row = MagicMock()
        act_row.discovery_location_gps_capture_enabled = True

        user_row = MagicMock()
        user_row.age_group = "under_13"
        user_row.requires_parental_consent = True

        sess_result = MagicMock()
        sess_result.scalar_one_or_none.return_value = sess_row

        act_result = MagicMock()
        act_result.scalar_one_or_none.return_value = act_row

        user_result = MagicMock()
        user_result.scalar_one_or_none.return_value = user_row

        consent_result = MagicMock()
        consent_result.fetchone.return_value = (uuid4(),)  # active consent found

        insert_result = MagicMock()
        insert_result.fetchone.return_value = (event_id, now)

        db.execute.side_effect = [sess_result, act_result, user_result, consent_result, insert_result]
        db.commit = AsyncMock()

        resp = await client.post(
            f"/api/v1/sessions/{session_id}/events",
            json={"event_type": "location_update", "metadata": {"lat": 1.0, "lng": 2.0}},
        )

        assert resp.status_code == 201
        body = resp.json()
        assert body["id"] == str(event_id)
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_non_location_event_bypasses_consent_gate(self, ctx):
        """Non-location_update events never call the consent gate at all."""
        client = ctx["client"]
        db = ctx["db"]

        event_id = uuid4()
        now = datetime(2026, 1, 15, 10, 0, 0)

        insert_result = MagicMock()
        insert_result.fetchone.return_value = (event_id, now)
        db.execute.return_value = insert_result
        db.commit = AsyncMock()

        resp = await client.post(
            f"/api/v1/sessions/{uuid4()}/events",
            json={"event_type": "phase_started", "phase": "observe"},
        )

        assert resp.status_code == 201
        # Only the single INSERT call — no session/activity/user/consent lookups.
        assert db.execute.call_count == 1


# ===========================================================================
# 3. _notify_parents_gps_consent() — Notification schema regression
# ===========================================================================

class _FakeAsyncSessionCM:
    """Minimal async-context-manager stand-in for
    core.database.async_session_factory()."""

    def __init__(self, db):
        self._db = db

    async def __aenter__(self):
        return self._db

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.mark.asyncio
async def test_notify_parents_gps_consent_succeeds_without_validation_error():
    """Regression test: constructing the websocket_service.Notification
    object inside _notify_parents_gps_consent() must not raise a pydantic
    ValidationError (a prior field-name mismatch bug silently swallowed
    this — the whole function is wrapped in try/except so a broken
    Notification() call would just log a debug line and never notify
    anyone). Assert send_notification is actually invoked with a valid
    Notification instance for an under-13 student."""
    from routes.student_activities import _notify_parents_gps_consent
    import core.database as db_module

    student_id = uuid4()
    parent_id = uuid4()
    session_id = str(uuid4())
    activity_id = str(uuid4())

    row = {
        "student_id": student_id,
        "age_group": "under_13",
        "requires_parental_consent": True,
        "parent_id": parent_id,
    }

    fake_db = AsyncMock()
    query_result = MagicMock()
    query_result.mappings.return_value.all.return_value = [row]
    fake_db.execute = AsyncMock(return_value=query_result)

    original_factory = db_module.async_session_factory
    db_module.async_session_factory = lambda: _FakeAsyncSessionCM(fake_db)
    try:
        with patch(
            "services.websocket_service.websocket_service.send_notification",
            new=AsyncMock(return_value=True),
        ) as mock_send:
            # Must complete without raising.
            await _notify_parents_gps_consent(session_id, activity_id)
    finally:
        db_module.async_session_factory = original_factory

    mock_send.assert_awaited_once()
    sent_notification = mock_send.call_args[0][0]
    assert sent_notification.parent_id == str(parent_id)
    assert sent_notification.child_id == str(student_id)
    assert sent_notification.title == "GPS Consent Required"
    assert sent_notification.type.value == "reminder"


@pytest.mark.asyncio
async def test_notify_parents_gps_consent_skips_students_not_requiring_consent():
    """Students who are neither under_13 nor flagged requires_parental_consent
    must not trigger a notification at all."""
    from routes.student_activities import _notify_parents_gps_consent
    import core.database as db_module

    row = {
        "student_id": uuid4(),
        "age_group": "13_17",
        "requires_parental_consent": False,
        "parent_id": uuid4(),
    }

    fake_db = AsyncMock()
    query_result = MagicMock()
    query_result.mappings.return_value.all.return_value = [row]
    fake_db.execute = AsyncMock(return_value=query_result)

    original_factory = db_module.async_session_factory
    db_module.async_session_factory = lambda: _FakeAsyncSessionCM(fake_db)
    try:
        with patch(
            "services.websocket_service.websocket_service.send_notification",
            new=AsyncMock(return_value=True),
        ) as mock_send:
            await _notify_parents_gps_consent(str(uuid4()), str(uuid4()))
    finally:
        db_module.async_session_factory = original_factory

    mock_send.assert_not_called()


@pytest.mark.asyncio
async def test_notify_parents_gps_consent_is_non_fatal_on_db_error():
    """If the DB query itself fails (e.g. schema issue), the function must
    swallow the error and return normally rather than propagating — it's a
    fire-and-forget BackgroundTask."""
    from routes.student_activities import _notify_parents_gps_consent
    import core.database as db_module

    original_factory = db_module.async_session_factory

    def _broken_factory():
        raise RuntimeError("connection pool exhausted")

    db_module.async_session_factory = _broken_factory
    try:
        # Should not raise.
        await _notify_parents_gps_consent(str(uuid4()), str(uuid4()))
    finally:
        db_module.async_session_factory = original_factory
