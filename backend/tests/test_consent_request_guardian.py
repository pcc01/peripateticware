# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for POST /student/consent/request-guardian
(routes/student.py::request_guardian_consent).

Part of the age-scoped-consent plan's "Student-triggered consent request"
work: a student whose capture is blocked with error_code="consent_required"
can trigger a fresh guardian consent email themselves, reusing the same real
send_parent_consent_email()/SignedURL flow accept_invite's initial send
uses. Strategy mirrors test_calendar.py — minimal in-process FastAPI app
with only the student router, get_current_user/get_db overridden, driven via
httpx AsyncClient + ASGITransport.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

pytest.importorskip("fastapi")
pytest.importorskip("httpx")


def _make_app() -> FastAPI:
    from routes.student import router as student_router
    app = FastAPI()
    app.include_router(student_router)
    return app


def _fake_student(parent_email=None, last_request=None) -> MagicMock:
    user = MagicMock()
    user.id = uuid4()
    user.first_name = "Ada"
    user.last_name = "Lovelace"
    user.username = "ada"
    user.parent_email = parent_email
    user.last_consent_request_at = last_request
    return user


async def _client_for(user: MagicMock):
    from core.database import get_db
    from core.dependencies import get_current_user

    app = _make_app()
    db = AsyncMock()
    db.commit = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test"), db


@pytest.mark.asyncio
async def test_no_parent_email_on_file_returns_400():
    user = _fake_student(parent_email=None)
    client, _db = await _client_for(user)
    async with client:
        resp = await client.post("/api/v1/student/consent/request-guardian")
    assert resp.status_code == 400
    assert resp.json()["detail"]["error_code"] == "no_guardian_email_on_file"


@pytest.mark.asyncio
async def test_sends_and_records_timestamp_when_email_on_file():
    user = _fake_student(parent_email="parent@example.com")
    client, db = await _client_for(user)
    send_mock = AsyncMock(return_value=True)
    with patch("services.email_service.send_parent_consent_email", new=send_mock), \
         patch("services.signed_url.SignedURL.generate", return_value="fake-token"):
        async with client:
            resp = await client.post("/api/v1/student/consent/request-guardian")
    assert resp.status_code == 200
    assert resp.json() == {"status": "sent"}
    send_mock.assert_awaited_once()
    assert send_mock.await_args.kwargs["to"] == "parent@example.com"
    db.commit.assert_awaited_once()
    assert isinstance(user.last_consent_request_at, datetime)


@pytest.mark.asyncio
async def test_repeat_request_inside_cooldown_returns_429():
    user = _fake_student(
        parent_email="parent@example.com",
        last_request=datetime.utcnow() - timedelta(hours=1),  # well inside the 72h window
    )
    client, _db = await _client_for(user)
    async with client:
        resp = await client.post("/api/v1/student/consent/request-guardian")
    assert resp.status_code == 429
    assert resp.json()["detail"]["error_code"] == "consent_request_cooldown"


@pytest.mark.asyncio
async def test_request_allowed_once_cooldown_has_elapsed():
    user = _fake_student(
        parent_email="parent@example.com",
        last_request=datetime.utcnow() - timedelta(hours=73),  # just past the 72h window
    )
    client, db = await _client_for(user)
    with patch("services.email_service.send_parent_consent_email", new=AsyncMock(return_value=True)), \
         patch("services.signed_url.SignedURL.generate", return_value="fake-token"):
        async with client:
            resp = await client.post("/api/v1/student/consent/request-guardian")
    assert resp.status_code == 200
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_email_send_failure_returns_502_and_does_not_record_timestamp():
    user = _fake_student(parent_email="parent@example.com")
    client, db = await _client_for(user)
    with patch("services.email_service.send_parent_consent_email", new=AsyncMock(side_effect=RuntimeError("smtp down"))), \
         patch("services.signed_url.SignedURL.generate", return_value="fake-token"):
        async with client:
            resp = await client.post("/api/v1/student/consent/request-guardian")
    assert resp.status_code == 502
    db.commit.assert_not_awaited()
    assert user.last_consent_request_at is None
