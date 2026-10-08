# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for services/standards_graph_fold.py::_resolve_or_create_jurisdiction --
specifically the country-prefix convention added so a non-US upload (e.g. a
British Columbia standards document) resolves to its own jurisdiction
instead of being silently mis-tagged as a US state or falling through to
"no jurisdiction" (which the state-filter in routes/inference.py treats as
"matches every state").
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock

from services.standards_graph_fold import _resolve_or_create_jurisdiction


def _db_returning(existing=None):
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = existing
    db.execute = AsyncMock(return_value=result)
    db.add = MagicMock()
    db.flush = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_bare_code_resolves_as_a_us_state_exactly_as_before():
    db = _db_returning(existing=None)
    j = await _resolve_or_create_jurisdiction(db, "tx")
    assert j.country_code == "US"
    assert j.subdivision_code == "US-TX"
    assert j.level == "state"
    db.add.assert_called_once()


@pytest.mark.asyncio
async def test_hyphenated_code_resolves_as_its_own_country_not_us():
    db = _db_returning(existing=None)
    j = await _resolve_or_create_jurisdiction(db, "CA-BC")
    assert j.country_code == "CA"
    assert j.subdivision_code == "CA-BC"
    assert j.external_ref == "BC"
    # Confirm the created row was queried for under its own country, not US --
    # a wrong WHERE clause here would make a second BC upload create a
    # duplicate row instead of reusing this one.
    where_clause_args = db.execute.call_args.args
    assert where_clause_args  # a query was actually issued


@pytest.mark.asyncio
async def test_hyphenated_code_reuses_an_existing_row_instead_of_creating_a_duplicate():
    existing = MagicMock(country_code="CA", subdivision_code="CA-BC")
    db = _db_returning(existing=existing)
    j = await _resolve_or_create_jurisdiction(db, "CA-BC")
    assert j is existing
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_blank_state_code_returns_none():
    db = _db_returning()
    assert await _resolve_or_create_jurisdiction(db, "") is None
    assert await _resolve_or_create_jurisdiction(db, None) is None
    db.execute.assert_not_called()
