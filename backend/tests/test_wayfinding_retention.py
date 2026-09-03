# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Tests for the wayfinding retention tasks in tasks/retention_cleanup.py.

No real DB — a fake async session whose execute() returns a canned result.
Verifies the tasks honour the row count, resolve the window from
data_retention_policies when present, and never raise. See
WAYFINDING_CONSENT_LADDER.md §3.
"""

from __future__ import annotations

import pytest

pytest.importorskip("sqlalchemy")

from unittest.mock import AsyncMock, MagicMock, patch

from tasks.retention_cleanup import (
    _retention_days,
    coarsen_expired_capture_coordinates,
    purge_expired_session_positions,
    purge_expired_breadcrumb_tracks,
    _WAYFINDING_DEFAULT_DAYS,
)


def _db(*, scalar=None, rowcount=0):
    res = MagicMock()
    res.scalar.return_value = scalar
    res.rowcount = rowcount
    res.fetchall.return_value = []
    db = AsyncMock()
    db.execute = AsyncMock(return_value=res)
    db.commit = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_retention_days_falls_back_to_constant():
    db = _db(scalar=None)
    assert await _retention_days(db, "breadcrumb_track") == _WAYFINDING_DEFAULT_DAYS["breadcrumb_track"]
    assert await _retention_days(db, "evidence_coordinates") == 30


@pytest.mark.asyncio
async def test_retention_days_uses_policy_row_when_present():
    db = _db(scalar=14)
    assert await _retention_days(db, "breadcrumb_track") == 14


@pytest.mark.asyncio
async def test_retention_days_survives_db_error():
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=RuntimeError("no such table"))
    assert await _retention_days(db, "live_session_positions") == 7


@pytest.mark.asyncio
async def test_coarsen_returns_rowcount_and_audits():
    db = _db(scalar=None, rowcount=5)
    with patch("tasks.retention_cleanup._audit", new=AsyncMock()) as audit:
        n = await coarsen_expired_capture_coordinates(db)
    assert n == 5
    audit.assert_awaited_once()
    assert audit.await_args.args[1] == "COARSEN_CAPTURE_COORDS"


@pytest.mark.asyncio
async def test_purge_session_positions_targets_location_update():
    db = _db(rowcount=3)
    with patch("tasks.retention_cleanup._audit", new=AsyncMock()):
        n = await purge_expired_session_positions(db)
    assert n == 3
    sql = db.execute.await_args.args[0].text
    assert "location_update" in sql and "DELETE FROM session_events" in sql


@pytest.mark.asyncio
async def test_purge_breadcrumb_tracks_hard_deletes():
    db = _db(rowcount=2)
    with patch("tasks.retention_cleanup._audit", new=AsyncMock()) as audit:
        n = await purge_expired_breadcrumb_tracks(db)
    assert n == 2
    sql = db.execute.await_args.args[0].text
    assert "DELETE FROM session_tracks" in sql
    assert audit.await_args.args[1] == "DELETE_BREADCRUMB_TRACKS"


@pytest.mark.asyncio
async def test_tasks_noop_cleanly_on_zero_rows():
    db = _db(rowcount=0)
    with patch("tasks.retention_cleanup._audit", new=AsyncMock()) as audit:
        assert await coarsen_expired_capture_coordinates(db) == 0
        assert await purge_expired_session_positions(db) == 0
        assert await purge_expired_breadcrumb_tracks(db) == 0
    audit.assert_not_awaited()
