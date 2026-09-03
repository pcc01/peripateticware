# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Endpoint tests for the wayfinding session routes (routes/sessions.py):

  POST /sessions/{id}/waypoints/{wid}/arrive   — rung B, no coordinate
  POST /sessions/{id}/live-position            — rung D gate
  POST /sessions/{id}/track                    — rung E gate + point sanitising

No real DB — AsyncMock get_db, MagicMock user, and the min() gate
(services.wayfinding_consent.effective_capability_rung) patched per-test.
Mirrors tests/test_gps_consent.py's pattern. See WAYFINDING_CONSENT_LADDER.md.
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
    app = FastAPI()
    from routes.sessions import router as sessions_router
    app.include_router(sessions_router, prefix="/api/v1/sessions")
    return app


def _user(uid: UUID) -> MagicMock:
    u = MagicMock()
    u.id = uid
    u.role = "STUDENT"
    u.is_active = True
    return u


@pytest_asyncio.fixture
async def ctx():
    from core.database import get_db
    from core.dependencies import get_current_user

    app = _make_app()
    uid = uuid4()
    user = _user(uid)

    # One session, owned by `user`, tied to an activity.
    sess = MagicMock()
    sess.id = uuid4()
    sess.user_id = uid
    sess.activity_id = uuid4()

    act = MagicMock()
    act.id = sess.activity_id
    act.teacher_id = uuid4()
    act.wayfinding_capability_ceiling = "E"
    act.discovery_location_gps_capture_enabled = True

    # Plain (sync) result object — SQLAlchemy 2.0 async results are consumed
    # synchronously (.scalar_one_or_none(), .fetchone(), .mappings().all()).
    res = MagicMock()
    res.scalar_one_or_none.return_value = sess
    res.scalar.return_value = act
    res.fetchone.return_value = (str(act.id), 0)          # waypoint lookup: (activity_id, seq)
    res.fetchall.return_value = []
    res.mappings.return_value.all.return_value = []
    res.rowcount = 1

    db = AsyncMock()
    db.execute = AsyncMock(return_value=res)
    db.commit = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "db": db, "user": user, "session": sess, "activity": act}


def _gate(rung: str) -> dict:
    return {
        "effective_rung": rung, "activity_ceiling": "E",
        "consent_rung": rung, "age_floor": "E", "consent_needed_for": [],
    }


@pytest.mark.asyncio
async def test_arrive_rejects_other_students_session(ctx):
    ctx["session"].user_id = uuid4()  # not the caller
    r = await ctx["client"].post(
        f"/api/v1/sessions/{ctx['session'].id}/waypoints/{uuid4()}/arrive",
        json={"in_sequence": True},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_arrive_ok_returns_progress_shape(ctx):
    r = await ctx["client"].post(
        f"/api/v1/sessions/{ctx['session'].id}/waypoints/{uuid4()}/arrive",
        json={"in_sequence": True, "captured": False},
    )
    assert r.status_code == 201
    body = r.json()
    assert {"reached", "total", "required_reached", "required_total", "complete"} <= set(body)
    # The request body must never carry a coordinate.
    # (schema only accepts in_sequence/captured/skipped — nothing else.)


@pytest.mark.asyncio
async def test_live_position_blocked_below_rung_d(ctx):
    with patch("services.wayfinding_consent.effective_capability_rung",
               new=AsyncMock(return_value=_gate("C"))):
        r = await ctx["client"].post(
            f"/api/v1/sessions/{ctx['session'].id}/live-position",
            json={"latitude": 1.0, "longitude": 2.0},
        )
    assert r.status_code == 403
    assert r.json()["detail"] == "live_share_consent_required"


@pytest.mark.asyncio
async def test_live_position_ok_at_rung_d(ctx):
    with patch("services.wayfinding_consent.effective_capability_rung",
               new=AsyncMock(return_value=_gate("D"))):
        r = await ctx["client"].post(
            f"/api/v1/sessions/{ctx['session'].id}/live-position",
            json={"latitude": 1.0, "longitude": 2.0, "accuracy": 5},
        )
    assert r.status_code == 201
    assert r.json() == {"ok": True}


@pytest.mark.asyncio
async def test_track_blocked_below_rung_e(ctx):
    with patch("services.wayfinding_consent.effective_capability_rung",
               new=AsyncMock(return_value=_gate("D"))):
        r = await ctx["client"].post(
            f"/api/v1/sessions/{ctx['session'].id}/track",
            json={"points": [[2.0, 1.0, 123]]},
        )
    assert r.status_code == 403
    assert r.json()["detail"] == "track_recording_consent_required"


@pytest.mark.asyncio
async def test_track_sanitises_points_at_rung_e(ctx):
    with patch("services.wayfinding_consent.effective_capability_rung",
               new=AsyncMock(return_value=_gate("E"))):
        r = await ctx["client"].post(
            f"/api/v1/sessions/{ctx['session'].id}/track",
            json={"points": [
                [2.0, 1.0, 100],       # ok
                [999.0, 1.0, 101],     # lng out of range -> dropped by handler
                [0.0, 91.0, 102],      # lat out of range -> dropped by handler
                [3.0, 2.0],            # missing t -> ok, t defaults 0
            ]},
        )
    assert r.status_code == 201
    assert r.json()["appended"] == 2


@pytest.mark.asyncio
async def test_track_empty_batch_is_noop(ctx):
    with patch("services.wayfinding_consent.effective_capability_rung",
               new=AsyncMock(return_value=_gate("E"))):
        r = await ctx["client"].post(
            f"/api/v1/sessions/{ctx['session'].id}/track",
            json={"points": [[999, 999, 1]]},  # all invalid
        )
    assert r.status_code == 201
    assert r.json()["appended"] == 0
