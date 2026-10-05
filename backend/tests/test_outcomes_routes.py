# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Tests for routes/outcomes.py -- the teacher's reusable outcome library."""

from __future__ import annotations

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

pytest.importorskip("fastapi")
pytest.importorskip("httpx")


def _row(teacher_id, text="Classify three plant species"):
    r = MagicMock()
    r.id = uuid4()
    r.teacher_id = teacher_id
    r.text = text
    r.subject = "Science"
    r.grade_min = 3
    r.grade_max = 5
    r.taxonomy_level = "apply"
    r.evidence_type = "photo"
    r.created_at = datetime(2026, 10, 4)
    return r


def _scalars(rows):
    res = MagicMock()
    res.scalars.return_value.all.return_value = rows
    res.scalars.return_value.first.return_value = rows[0] if rows else None
    return res


async def _client(execute_side_effect):
    from core.database import get_db
    from core.dependencies import get_current_teacher
    from routes.outcomes import router

    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    user = MagicMock()
    user.id = uuid4()
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=execute_side_effect)
    db.add = MagicMock()
    db.commit = AsyncMock()

    async def _refresh(obj):
        obj.id = obj.id or uuid4()
        obj.created_at = obj.created_at or datetime(2026, 10, 4)
    db.refresh = AsyncMock(side_effect=_refresh)

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_teacher] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), db, user


@pytest.mark.asyncio
async def test_list_returns_callers_outcomes():
    client, _db, user = await _client([_scalars([_row(None)])])
    async with client:
        resp = await client.get("/api/v1/outcomes", params={"subject": "Science", "grade": 5})
    assert resp.status_code == 200
    assert resp.json()[0]["text"] == "Classify three plant species"


@pytest.mark.asyncio
async def test_create_saves_new_outcome():
    client, db, _user = await _client([_scalars([])])
    async with client:
        resp = await client.post("/api/v1/outcomes", json={
            "text": "  Use a map to find a landmark  ", "subject": "Social Studies",
            "grade_min": 3, "grade_max": 6, "taxonomy_level": "apply",
        })
    assert resp.status_code == 201
    assert resp.json()["text"] == "Use a map to find a landmark"
    db.add.assert_called_once()
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_create_duplicate_text_returns_existing_without_insert():
    existing = _row(None, text="Same text")
    client, db, _user = await _client([_scalars([existing])])
    async with client:
        resp = await client.post("/api/v1/outcomes", json={"text": "Same text"})
    assert resp.status_code == 201
    assert resp.json()["id"] == str(existing.id)
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_create_rejects_inverted_grade_range():
    client, db, _user = await _client([_scalars([])])
    async with client:
        resp = await client.post("/api/v1/outcomes", json={"text": "Valid text", "grade_min": 8, "grade_max": 3})
    assert resp.status_code == 422
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_delete_missing_outcome_is_404():
    client, _db, _user = await _client([_scalars([])])
    async with client:
        resp = await client.delete(f"/api/v1/outcomes/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_removes_owned_outcome():
    client, db, user = await _client([_scalars([_row(None)])])
    async with client:
        resp = await client.delete(f"/api/v1/outcomes/{uuid4()}")
    assert resp.status_code == 204
    db.delete.assert_awaited_once()
