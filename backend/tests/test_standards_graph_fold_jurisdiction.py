# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for services/standards_graph_fold.py::_resolve_or_create_jurisdiction --
the explicit country_code parameter (standards_sets.country_code, a real
column) that lets a non-US upload (e.g. a British Columbia standards
document) resolve to its own jurisdiction instead of being silently
mis-tagged as a US state or falling through to "no jurisdiction" (which the
state-filter in routes/inference.py treats as "matches every state").

An earlier version encoded this by sniffing a '-' in state_code itself
(e.g. "CA-BC") -- deprecated now that country_code is a first-class column;
no stored data ever depended on that convention (confirmed before removing
it: zero rows anywhere used it).
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
async def test_bare_code_with_no_country_arg_defaults_to_us():
    db = _db_returning(existing=None)
    j = await _resolve_or_create_jurisdiction(db, "tx")
    assert j.country_code == "US"
    assert j.subdivision_code == "US-TX"
    assert j.level == "state"
    db.add.assert_called_once()


@pytest.mark.asyncio
async def test_explicit_country_code_resolves_its_own_jurisdiction_not_us():
    db = _db_returning(existing=None)
    j = await _resolve_or_create_jurisdiction(db, "BC", "CA")
    assert j.country_code == "CA"
    assert j.subdivision_code == "CA-BC"
    assert j.external_ref == "BC"
    # Confirm a query was actually issued (and, by construction of the WHERE
    # clause in the function, scoped to country_code='CA' -- a wrong clause
    # here would make a second BC upload create a duplicate row instead of
    # reusing this one).
    assert db.execute.call_args.args


@pytest.mark.asyncio
async def test_explicit_country_code_reuses_an_existing_row_instead_of_creating_a_duplicate():
    existing = MagicMock(country_code="CA", subdivision_code="CA-BC")
    db = _db_returning(existing=existing)
    j = await _resolve_or_create_jurisdiction(db, "BC", "CA")
    assert j is existing
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_hyphen_in_state_code_is_no_longer_parsed_specially():
    """The deprecated sniff-a-hyphen convention is gone -- a state_code
    containing '-' is now just treated as a literal (unusual but harmless)
    subdivision code under whatever country_code was passed (default 'US'),
    not silently reinterpreted as a different country."""
    db = _db_returning(existing=None)
    j = await _resolve_or_create_jurisdiction(db, "CA-BC")
    assert j.country_code == "US"
    assert j.subdivision_code == "US-CA-BC"


@pytest.mark.asyncio
async def test_blank_state_code_returns_none():
    db = _db_returning()
    assert await _resolve_or_create_jurisdiction(db, "") is None
    assert await _resolve_or_create_jurisdiction(db, None) is None
    db.execute.assert_not_called()
