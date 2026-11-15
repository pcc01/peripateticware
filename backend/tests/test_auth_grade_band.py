# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Unit tests for routes/auth.py's _resolve_student_grade_band() —
PERI_OFFLINE_SPEC_v2.md's grade_band derivation for /auth/me (item 21)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from routes.auth import _resolve_student_grade_band


def _db_returning(*results):
    """AsyncMock db whose .execute() returns a fresh MagicMock with
    .first() yielding each of `results` in turn, one call at a time."""
    db = AsyncMock()
    iterator = iter(results)

    async def _execute(*_a, **_k):
        row = next(iterator, None)
        m = MagicMock()
        m.first.return_value = row
        return m

    db.execute = _execute
    return db


@pytest.mark.asyncio
async def test_prefers_homeschool_child_grade_level():
    db = _db_returning((4,))  # homeschool_children.grade_level = 4
    band = await _resolve_student_grade_band(db, uuid4())
    assert band == "3-5"


@pytest.mark.asyncio
async def test_falls_back_to_classroom_grade_level_when_no_homeschool_row():
    db = _db_returning(None, ("7",))  # no homeschool row, classroom grade_level="7"
    band = await _resolve_student_grade_band(db, uuid4())
    assert band == "6-8"


@pytest.mark.asyncio
async def test_kindergarten_homeschool_child_resolves_to_k2():
    db = _db_returning((0,))
    band = await _resolve_student_grade_band(db, uuid4())
    assert band == "k-2"


@pytest.mark.asyncio
async def test_returns_none_when_neither_source_has_anything():
    db = _db_returning(None, None)
    band = await _resolve_student_grade_band(db, uuid4())
    assert band is None


@pytest.mark.asyncio
async def test_unparseable_classroom_grade_level_returns_none_not_an_error():
    db = _db_returning(None, ("not-a-number",))
    band = await _resolve_student_grade_band(db, uuid4())
    assert band is None
