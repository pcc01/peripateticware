# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for GET /locations/{place_id}/enrich (routes/privacy_locations.py)
and the _fetch_wikidata_id() gating regression
(services/multi_backend_location_service.py).

Strategy
--------
- Mirrors tests/test_parent_portal.py's no-real-DB pattern: minimal FastAPI
  app with just the privacy_locations router, AsyncMock for get_db.
  This endpoint has no auth dependency, so get_current_user is not overridden.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

pytest.importorskip("fastapi")
pytest.importorskip("httpx")


def _make_app() -> FastAPI:
    from fastapi import FastAPI as _FA
    test_app = _FA()
    from routes.privacy_locations import router as locations_router
    test_app.include_router(locations_router, prefix="/api/v1")
    return test_app


@pytest_asyncio.fixture
async def ctx():
    from core.database import get_db

    app = _make_app()
    db = AsyncMock()

    execute_result = MagicMock()
    execute_result.scalar_one_or_none.return_value = None
    db.execute.return_value = execute_result
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "db": db}


# ===========================================================================
# 1. GET /locations/{place_id}/enrich — happy path (fresh cache hit)
# ===========================================================================

@pytest.mark.asyncio
async def test_enrich_location_cache_hit_happy_path(ctx):
    """When a fresh (non-stale) CachedLocation + EnrichedLocation pair
    exists, the endpoint returns the cached enrichment directly without
    calling out to the location service."""
    client = ctx["client"]
    db = ctx["db"]

    place_id = "osm_12345"

    cached_row = MagicMock()
    cached_row.id = uuid4()
    cached_row.name = "Golden Gate Park"

    enriched_row = MagicMock()
    enriched_row.enriched_at = datetime.utcnow()  # fresh, not stale
    enriched_row.description = "A large urban park."
    enriched_row.subjects = ["Environmental Science"]
    enriched_row.grade_levels = [6, 7]
    enriched_row.learning_opportunities = ["Observe local flora"]
    enriched_row.image_url = "https://example.com/image.jpg"
    enriched_row.enrichment_quality = 0.9
    enriched_row.enrichment_source = "openstreetmap"
    enriched_row.wikidata_id = "Q1234"
    enriched_row.architect_or_artist = None
    enriched_row.construction_date = None
    enriched_row.historical_significance = None
    enriched_row.keywords = ["park", "nature"]

    cache_lookup_result = MagicMock()
    cache_lookup_result.scalar_one_or_none.return_value = cached_row

    enriched_lookup_result = MagicMock()
    enriched_lookup_result.scalar_one_or_none.return_value = enriched_row

    db.execute.side_effect = [cache_lookup_result, enriched_lookup_result]

    resp = await client.get(f"/api/v1/locations/{place_id}/enrich")

    assert resp.status_code == 200
    body = resp.json()
    assert body["place_id"] == place_id
    assert body["name"] == "Golden Gate Park"
    assert body["description"] == "A large urban park."
    assert body["wikidata_id"] == "Q1234"
    assert body["enrichment_quality"] == 0.9


# ===========================================================================
# 2. GET /locations/{place_id}/enrich — cache miss / "not found" path
# ===========================================================================

@pytest.mark.asyncio
async def test_enrich_location_cache_miss_falls_through_to_service(ctx):
    """When there is no CachedLocation row for place_id (i.e. the location
    is not known to us yet — the closest thing to a "not found" case this
    endpoint has, since it always synthesizes a fallback rather than 404ing),
    the endpoint synthesizes a minimal LocationData from the slug and calls
    the location service, still returning 200 with the enrichment result."""
    client = ctx["client"]
    db = ctx["db"]

    place_id = "some-unknown-landmark"

    # No cached row found at all.
    cache_lookup_result = MagicMock()
    cache_lookup_result.scalar_one_or_none.return_value = None
    db.execute.return_value = cache_lookup_result

    from services.multi_backend_location_service import LocationData

    empty_enriched = LocationData(
        name="Some Unknown Landmark",
        latitude=0.0,
        longitude=0.0,
        location_type="point_of_interest",
        address="",
        place_id=place_id,
        source="openstreetmap",
        # description/image_url/wikidata_id all None — nothing was found
    )

    fake_service = MagicMock()
    fake_service.enrich_location = AsyncMock(return_value=empty_enriched)

    with patch("routes.privacy_locations.get_location_service", return_value=fake_service):
        with patch("routes.privacy_locations.settings.ENABLE_LOCATION_CACHE", False):
            resp = await client.get(f"/api/v1/locations/{place_id}/enrich")

    assert resp.status_code == 200
    body = resp.json()
    assert body["place_id"] == place_id
    assert body["name"] == "Some Unknown Landmark"
    assert body["description"] is None
    assert body["wikidata_id"] is None
    # Nothing was found, so the populated-fields heuristic should be 0.
    assert body["enrichment_quality"] == 0.0

    # The synthetic LocationData built from the slug must have been passed
    # through to the location service (title-cased from the hyphenated slug).
    fake_service.enrich_location.assert_awaited_once()
    called_location = fake_service.enrich_location.call_args[0][0]
    assert called_location.name == "Some Unknown Landmark"
    assert called_location.source == "openstreetmap"


# ===========================================================================
# 3. _fetch_wikidata_id() — regression: gates on location.name, not
#    location.wikipedia_url
# ===========================================================================

@pytest.mark.asyncio
async def test_fetch_wikidata_id_calls_out_when_name_present():
    """_fetch_wikidata_id() must attempt the Wikidata search whenever
    location.name is populated, REGARDLESS of whether wikipedia_url is set —
    this was previously (buggily) gated on wikipedia_url, which meant OSM
    nodes without a wikipedia tag never got a Wikidata lookup at all."""
    from services.multi_backend_location_service import LocationData

    location = LocationData(
        name="Golden Gate Bridge",
        latitude=37.8199,
        longitude=-122.4783,
        location_type="landmark",
        address="",
        place_id="osm_999",
        wikipedia_url=None,  # deliberately unset
        wikidata_id=None,
    )

    fake_response = MagicMock()
    fake_response.status_code = 200
    fake_response.json.return_value = {
        "search": [{"id": "Q44440"}]
    }

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=fake_response)
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = False

    # _fetch_wikidata_id is defined on the OSM backend class, not the
    # top-level MultiBackendLocationService facade — resolve it directly.
    from services.multi_backend_location_service import OpenStreetMapBackend
    backend = OpenStreetMapBackend()

    with patch("httpx.AsyncClient", return_value=mock_client):
        result = await backend._fetch_wikidata_id(location)

    assert result.wikidata_id == "Q44440"
    mock_client.get.assert_awaited_once()


@pytest.mark.asyncio
async def test_fetch_wikidata_id_skips_lookup_when_name_missing():
    """When location.name is empty, _fetch_wikidata_id() must not attempt
    any HTTP call at all — it should return the location unchanged."""
    from services.multi_backend_location_service import OpenStreetMapBackend, LocationData

    location = LocationData(
        name="",
        latitude=0.0,
        longitude=0.0,
        location_type="point_of_interest",
        address="",
        place_id="osm_000",
        wikipedia_url="https://en.wikipedia.org/wiki/Something",  # even if set, name gates it
        wikidata_id=None,
    )

    backend = OpenStreetMapBackend()

    mock_client = AsyncMock()
    with patch("httpx.AsyncClient", return_value=mock_client):
        result = await backend._fetch_wikidata_id(location)

    mock_client.get.assert_not_called()
    assert result.wikidata_id is None
