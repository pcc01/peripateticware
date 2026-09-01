# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for the short-TTL dashboard caching added to
routes/activities.py::teacher_dashboard and
routes/homeschool.py::homeschool_dashboard (each ran 4-5 queries on every
single dashboard load — a cache hit should skip all of them).

Focuses on the one behavioral guarantee that actually matters here: a cache
hit must short-circuit before touching the database at all. The cache-miss
path (compute + store) is exercised implicitly by every other test that
hits these endpoints without pre-populating the cache — Redis fails open
(core/cache.py) so get_cache() returning None there is indistinguishable
from a genuine miss.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_homeschool_dashboard_cache_hit_skips_db_entirely():
    from routes.homeschool import homeschool_dashboard

    user = MagicMock()
    user.id = "11111111-1111-1111-1111-111111111111"
    user.role = "HOMESCHOOL"

    db = AsyncMock()
    cached_result = {"child_count": 2, "activity_count": 5, "session_count": 10, "standards_count": 1}

    with patch("routes.homeschool.get_cache", new=AsyncMock(return_value=cached_result)), \
         patch("routes.homeschool.set_cache", new=AsyncMock()) as mock_set:
        result = await homeschool_dashboard(current_user=user, db=db)

    assert result == cached_result
    db.execute.assert_not_called()
    mock_set.assert_not_called()  # already cached — no reason to re-store it


@pytest.mark.asyncio
async def test_teacher_dashboard_cache_hit_skips_db_entirely():
    from routes.activities import teacher_dashboard

    user = MagicMock()
    user.id = "22222222-2222-2222-2222-222222222222"

    db = AsyncMock()
    cached_result = {
        "total_students": 3, "total_classes": 1, "active_activities": 4,
        "pending_submissions": 2, "activities": [], "classes": [], "recent_submissions": [],
    }

    with patch("routes.activities.get_cache", new=AsyncMock(return_value=cached_result)), \
         patch("routes.activities.set_cache", new=AsyncMock()) as mock_set:
        result = await teacher_dashboard(current_user=user, db=db)

    assert result == cached_result
    db.execute.assert_not_called()
    mock_set.assert_not_called()


@pytest.mark.asyncio
async def test_homeschool_dashboard_cache_key_is_per_user():
    """Two different users must not share a cache entry — confirms the key
    actually includes current_user.id, not a fixed string."""
    from routes.homeschool import homeschool_dashboard

    seen_keys = []

    async def fake_get_cache(key):
        seen_keys.append(key)
        return None  # force the miss path so we can inspect the key used

    user = MagicMock()
    user.id = "33333333-3333-3333-3333-333333333333"
    user.role = "HOMESCHOOL"

    # Cache-miss path still needs the 4 db.execute calls to return something
    # scalar()-able — a single AsyncMock reused for all of them is enough
    # since this test only cares about the cache KEY, not the query results.
    db = AsyncMock()
    db.execute.return_value.scalar.return_value = 0

    with patch("routes.homeschool.get_cache", new=fake_get_cache), \
         patch("routes.homeschool.set_cache", new=AsyncMock()):
        await homeschool_dashboard(current_user=user, db=db)

    assert seen_keys == [f"homeschool_dashboard:{user.id}"]
