# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for POST /student/activities/spontaneous
(PERI_SPONTANEOUS_DISCOVERY_SPEC_v1.md).

Strategy mirrors test_calendar.py: minimal in-process FastAPI app with only
the student_activities router, get_db/get_current_user/ai_rate_limit
overridden, httpx.AsyncClient + ASGITransport. The grade-resolution,
generator and validator calls are patched at their source module (not
mocked via db.execute) since this endpoint imports all three locally at
call time -- patching the source attribute before the request fires is
picked up correctly.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

pytest.importorskip("fastapi")
pytest.importorskip("httpx")


def _make_app() -> FastAPI:
    from routes.student_activities import router as student_router
    app = FastAPI()
    app.include_router(student_router, prefix="/api/v1/student")
    return app


def _fake_student():
    user = MagicMock()
    user.id = uuid4()
    user.role = "STUDENT"
    return user


@pytest_asyncio.fixture
async def ctx():
    from core.database import get_db
    from core.dependencies import get_current_user
    from core.rate_limit import ai_rate_limit

    app = _make_app()
    db = AsyncMock()
    count_result = MagicMock()
    count_result.scalar.return_value = 0  # daily cap: 0 used so far
    db.execute.return_value = count_result
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()

    user = _fake_student()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[ai_rate_limit] = lambda: None

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "db": db, "user": user, "count_result": count_result}


_PAYLOAD = {
    "location_name": "Golden Gate Bridge",
    "subject": "Science",
    "latitude": 37.8199,
    "longitude": -122.4783,
    "location_wiki_data": {"description": "A famous suspension bridge."},
}


@pytest.mark.asyncio
async def test_happy_path_creates_auto_approved_spontaneous_activity(ctx):
    client = ctx["client"]

    with patch("routes.auth._resolve_student_grade_level", new=AsyncMock(return_value=7)), \
         patch("services.peri_script_generator.generate_peri_script", new=AsyncMock(return_value={"v": 1, "stages": {}, "approved": False})), \
         patch("services.peri_script_validator.validate_peri_script", return_value=[]):
        resp = await client.post("/api/v1/student/activities/spontaneous", json=_PAYLOAD)

    assert resp.status_code == 201
    body = resp.json()
    assert "activity_id" in body
    assert body["validation_issue_count"] == 0

    # The Activity instance passed to db.add() carries the right auto-filled
    # fields -- the whole point of this endpoint.
    added = ctx["db"].add.call_args[0][0]
    assert added.origin == "spontaneous"
    assert added.ai_interaction_mode == "curated_only"
    assert added.status == "published"
    assert added.is_shareable is False
    assert added.grade_level == 7
    assert added.originator_student_id == ctx["user"].id
    assert added.peri_script["approved"] is True
    assert added.location_latitude == 37.8199


@pytest.mark.asyncio
async def test_grade_level_falls_back_to_5_when_unresolved(ctx):
    client = ctx["client"]

    with patch("routes.auth._resolve_student_grade_level", new=AsyncMock(return_value=None)), \
         patch("services.peri_script_generator.generate_peri_script", new=AsyncMock(return_value={"v": 1, "stages": {}, "approved": False})), \
         patch("services.peri_script_validator.validate_peri_script", return_value=[]):
        resp = await client.post("/api/v1/student/activities/spontaneous", json=_PAYLOAD)

    assert resp.status_code == 201
    added = ctx["db"].add.call_args[0][0]
    assert added.grade_level == 5


@pytest.mark.asyncio
async def test_no_gps_falls_back_to_zero_coordinates(ctx):
    client = ctx["client"]
    payload = dict(_PAYLOAD)
    del payload["latitude"]
    del payload["longitude"]

    with patch("routes.auth._resolve_student_grade_level", new=AsyncMock(return_value=7)), \
         patch("services.peri_script_generator.generate_peri_script", new=AsyncMock(return_value={"v": 1, "stages": {}, "approved": False})), \
         patch("services.peri_script_validator.validate_peri_script", return_value=[]):
        resp = await client.post("/api/v1/student/activities/spontaneous", json=payload)

    assert resp.status_code == 201
    added = ctx["db"].add.call_args[0][0]
    assert added.location_latitude == 0.0
    assert added.location_longitude == 0.0


@pytest.mark.asyncio
async def test_daily_cap_enforced(ctx):
    client = ctx["client"]
    ctx["count_result"].scalar.return_value = 5  # at the cap already

    resp = await client.post("/api/v1/student/activities/spontaneous", json=_PAYLOAD)

    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_non_student_role_rejected(ctx):
    client = ctx["client"]
    ctx["user"].role = "TEACHER"

    resp = await client.post("/api/v1/student/activities/spontaneous", json=_PAYLOAD)

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_provider_unavailable_returns_503_and_rolls_back(ctx):
    client = ctx["client"]
    from agents.provider import ProviderUnavailableError

    with patch("routes.auth._resolve_student_grade_level", new=AsyncMock(return_value=7)), \
         patch("services.peri_script_generator.generate_peri_script", new=AsyncMock(side_effect=ProviderUnavailableError("down"))):
        resp = await client.post("/api/v1/student/activities/spontaneous", json=_PAYLOAD)

    assert resp.status_code == 503
    ctx["db"].rollback.assert_awaited()
