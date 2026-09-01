# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for ActivityGenerationService._fetch_location_context()'s cache reuse.

Context: measured directly against prod logs (timestamps between "Fetching
location context" and "Streaming claude for activity generation" across
real requests), this lookup alone cost 1.5-2.5s of the 5-10s total "Suggest
Activities" latency — and the exact same location ("Dave Mackey Park")
looked up twice ~9 minutes apart showed no speedup the second time. The
FIRST fix here added a brand new Redis cache; the CORRECT fix (this one)
is routing through the DB-backed cache that already existed behind
routes/privacy_locations.py::enrich_location() (CachedLocation/
EnrichedLocation, 7-day TTL, access-count tracking, pre-warming) — the
same one the activity form's own "Background & Context" panel already
uses — called directly as a plain function, the same way that file's own
_prewarm_enrichment() already does elsewhere in this codebase.

These tests cover that the delegation actually happens correctly: the
right place_id reaches enrich_location(), its return shape is mapped
correctly, and a lookup failure degrades gracefully rather than blowing up
suggestion generation entirely.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.activity_generation_service import ActivityGenerationService


def _fake_location(place_id="osm_12345", name="Dave Mackey Park"):
    loc = MagicMock()
    loc.place_id = place_id
    loc.name = name
    return loc


@pytest.mark.asyncio
async def test_delegates_to_the_shared_db_backed_cache():
    """The core fix: enrichment must go through routes.privacy_locations.
    enrich_location() (the real cache), not a separate one, and not the
    raw multi_backend_location_service.enrich_location() directly."""
    service = ActivityGenerationService(llm_provider="claude")
    db = AsyncMock()

    mock_location_service = MagicMock()
    mock_location_service.search_nearby = AsyncMock(return_value=[_fake_location()])

    mock_enrich_cached = AsyncMock(return_value={
        "place_id": "osm_12345",
        "name": "Dave Mackey Park",
        "description": "A city park with wetland trails.",
    })

    with patch(
        "services.multi_backend_location_service.get_location_service",
        return_value=mock_location_service,
    ), patch("routes.privacy_locations.enrich_location", new=mock_enrich_cached):
        result = await service._fetch_location_context(47.9393566, -122.4439605, "Dave Mackey Park", db)

    mock_enrich_cached.assert_awaited_once_with(place_id="osm_12345", subject=None, refresh=False, db=db)
    assert result["educational_value"] == "A city park with wetland trails."
    assert result["success"] is True
    assert result["wikipedia"]["title"] == "Dave Mackey Park"
    assert result["wikipedia"]["extract"] == "A city park with wetland trails."


@pytest.mark.asyncio
async def test_matches_location_name_among_multiple_search_results():
    """search_nearby can return several nearby points — the one matching
    the teacher-entered location_name should be the one enriched, not
    just whichever came back first."""
    service = ActivityGenerationService(llm_provider="claude")
    db = AsyncMock()

    other = _fake_location(place_id="osm_1", name="Some Other Spot")
    target = _fake_location(place_id="osm_2", name="Dave Mackey Park")

    mock_location_service = MagicMock()
    mock_location_service.search_nearby = AsyncMock(return_value=[other, target])
    mock_enrich_cached = AsyncMock(return_value={"name": "Dave Mackey Park", "description": "A park."})

    with patch(
        "services.multi_backend_location_service.get_location_service",
        return_value=mock_location_service,
    ), patch("routes.privacy_locations.enrich_location", new=mock_enrich_cached):
        await service._fetch_location_context(47.9393566, -122.4439605, "Dave Mackey Park", db)

    mock_enrich_cached.assert_awaited_once_with(place_id="osm_2", subject=None, refresh=False, db=db)


@pytest.mark.asyncio
async def test_no_search_results_returns_empty_dict_without_calling_enrich():
    service = ActivityGenerationService(llm_provider="claude")
    db = AsyncMock()

    mock_location_service = MagicMock()
    mock_location_service.search_nearby = AsyncMock(return_value=[])
    mock_enrich_cached = AsyncMock()

    with patch(
        "services.multi_backend_location_service.get_location_service",
        return_value=mock_location_service,
    ), patch("routes.privacy_locations.enrich_location", new=mock_enrich_cached):
        result = await service._fetch_location_context(0.0, 0.0, "Nowhere", db)

    assert result == {}
    mock_enrich_cached.assert_not_called()


@pytest.mark.asyncio
async def test_lookup_failure_degrades_gracefully():
    """A broken location lookup must not take down suggestion generation —
    matches the pre-existing try/except contract this method has always had."""
    service = ActivityGenerationService(llm_provider="claude")
    db = AsyncMock()

    mock_location_service = MagicMock()
    mock_location_service.search_nearby = AsyncMock(side_effect=RuntimeError("network error"))

    with patch("services.multi_backend_location_service.get_location_service", return_value=mock_location_service):
        result = await service._fetch_location_context(47.9393566, -122.4439605, "Dave Mackey Park", db)

    assert result == {}


@pytest.mark.asyncio
async def test_no_db_session_falls_back_to_direct_uncached_call():
    """Neither current caller omits db, but a future one might — must
    degrade to the old direct-service-call behavior rather than crash on
    a None db."""
    service = ActivityGenerationService(llm_provider="claude")

    enriched = MagicMock()
    enriched.name = "Dave Mackey Park"
    enriched.description = "A park."
    enriched.wikipedia_url = "https://en.wikipedia.org/wiki/Dave_Mackey_Park"

    mock_location_service = MagicMock()
    mock_location_service.search_nearby = AsyncMock(return_value=[_fake_location()])
    mock_location_service.enrich_location = AsyncMock(return_value=enriched)

    with patch("services.multi_backend_location_service.get_location_service", return_value=mock_location_service):
        result = await service._fetch_location_context(47.9393566, -122.4439605, "Dave Mackey Park", db=None)

    assert result["educational_value"] == "A park."
    assert result["wikipedia"]["url"] == "https://en.wikipedia.org/wiki/Dave_Mackey_Park"
