# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Test for ActivityGenerationService._fetch_location_context()'s caching.

Added after measuring real prod logs: this lookup alone cost 1.5-2.5s of
the 5-10s total "Suggest Activities" latency, and the same location
looked up twice ~9 minutes apart showed no speedup the second time —
confirming it was uncached despite living in a module described as "fast,
pooled." Locks in the one guarantee that matters: a cache hit must skip
the network lookup entirely, not just return faster.
"""

from unittest.mock import AsyncMock, patch

import pytest

from services.activity_generation_service import ActivityGenerationService


@pytest.mark.asyncio
async def test_location_context_cache_hit_skips_network_lookup():
    service = ActivityGenerationService(llm_provider="claude")
    cached_result = {
        "wikipedia": {"title": "Dave Mackey Park", "extract": "A park.", "url": "https://en.wikipedia.org/wiki/Dave_Mackey_Park"},
        "geographic_features": {},
        "educational_value": "A park.",
        "success": True,
    }

    mock_get_location_service = AsyncMock()  # should never be called on a hit

    with patch("services.activity_generation_service.get_cache", new=AsyncMock(return_value=cached_result)), \
         patch("services.activity_generation_service.set_cache", new=AsyncMock()) as mock_set, \
         patch("services.multi_backend_location_service.get_location_service", new=mock_get_location_service):
        result = await service._fetch_location_context(47.9393566, -122.4439605, "Dave Mackey Park")

    assert result == cached_result
    mock_get_location_service.assert_not_called()
    mock_set.assert_not_called()  # already cached — no reason to re-store it


@pytest.mark.asyncio
async def test_location_context_cache_key_rounds_coordinates():
    """4 decimal places (~11m), matching the frontend's own lat/lng input
    step — two near-identical coordinates a teacher could plausibly enter
    for "the same place" should hit the same cache entry."""
    service = ActivityGenerationService(llm_provider="claude")
    seen_keys = []

    async def fake_get_cache(key):
        seen_keys.append(key)
        return {"success": True}  # short-circuit before any real network call

    with patch("services.activity_generation_service.get_cache", new=fake_get_cache), \
         patch("services.activity_generation_service.set_cache", new=AsyncMock()):
        await service._fetch_location_context(47.93935661, -122.44396051, "Dave Mackey Park")
        await service._fetch_location_context(47.9393566, -122.4439605, "Dave Mackey Park")

    assert len(seen_keys) == 2
    assert seen_keys[0] == seen_keys[1]
