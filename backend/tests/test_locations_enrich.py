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
- PERI_SPONTANEOUS_DISCOVERY_SPEC_v1.md Design D added an auth gate to both
  endpoints (pre-existing gap -- they took zero auth before), so get_db is
  mocked.
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
    from core.dependencies import get_current_user

    app = _make_app()
    db = AsyncMock()

    execute_result = MagicMock()
    execute_result.scalar_one_or_none.return_value = None
    db.execute.return_value = execute_result
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()

    fake_user = MagicMock()
    fake_user.id = uuid4()
    fake_user.role = "STUDENT"

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: fake_user

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
    enriched_row.language = "en"

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
    assert body["content_language"] == "en"


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
            # No Wikipedia/Wikidata match AND the AI-synopsis fallback also
            # finds nothing (e.g. Ollama unreachable) — description must stay
            # None, not synthesize placeholder content either way.
            with patch(
                "services.activity_generation_service.ActivityGenerationService.generate_location_synopsis",
                new=AsyncMock(return_value=None),
            ):
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


@pytest.mark.asyncio
async def test_enrich_location_ai_synopsis_fallback_when_no_wiki_match(ctx):
    """When Wikipedia/Wikidata have nothing for a place (a small local site
    with no wiki presence — e.g. a watershed restoration project), the AI
    fallback fills in a synopsis and the response is clearly labeled
    source="ai_generated" rather than presented as sourced content."""
    client = ctx["client"]
    db = ctx["db"]

    place_id = "some-local-site"

    cache_lookup_result = MagicMock()
    cache_lookup_result.scalar_one_or_none.return_value = None
    db.execute.return_value = cache_lookup_result

    from services.multi_backend_location_service import LocationData

    empty_enriched = LocationData(
        name="Some Local Site",
        latitude=48.05,
        longitude=-122.51,
        location_type="point_of_interest",
        address="123 County Rd",
        place_id=place_id,
        source="nominatim",
    )

    fake_service = MagicMock()
    fake_service.enrich_location = AsyncMock(return_value=empty_enriched)

    with patch("routes.privacy_locations.get_location_service", return_value=fake_service):
        with patch("routes.privacy_locations.settings.ENABLE_LOCATION_CACHE", False):
            with patch(
                "services.activity_generation_service.ActivityGenerationService.generate_location_synopsis",
                new=AsyncMock(return_value="A small local site useful for observing rural land use."),
            ):
                resp = await client.get(f"/api/v1/locations/{place_id}/enrich")

    assert resp.status_code == 200
    body = resp.json()
    assert body["description"] == "A small local site useful for observing rural land use."
    assert body["source"] == "ai_generated"


# ===========================================================================
# 2b. Locale-aware Wikipedia/Wikidata content (handoff-peripateticware-
#     localized-wikipedia.md): `lang` passthrough, UI-locale normalization,
#     and honest content_language reporting when the fallback engages.
# ===========================================================================

@pytest.mark.asyncio
async def test_enrich_location_normalizes_locale_and_passes_lang_to_service(ctx):
    """A regional i18next locale like "fr-CA" must be normalized to the
    Wikipedia edition code "fr" (there is no fr-ca.wikipedia.org) before
    being passed down to the location service."""
    client = ctx["client"]
    db = ctx["db"]

    place_id = "osm_eiffel"

    cache_lookup_result = MagicMock()
    cache_lookup_result.scalar_one_or_none.return_value = None
    db.execute.return_value = cache_lookup_result

    from services.multi_backend_location_service import LocationData

    enriched = LocationData(
        name="Eiffel Tower",
        latitude=48.8584,
        longitude=2.2945,
        location_type="point_of_interest",
        address="",
        place_id=place_id,
        source="openstreetmap",
        description="La tour Eiffel...",
        content_language="fr",
    )

    fake_service = MagicMock()
    fake_service.enrich_location = AsyncMock(return_value=enriched)

    with patch("routes.privacy_locations.get_location_service", return_value=fake_service):
        with patch("routes.privacy_locations.settings.ENABLE_LOCATION_CACHE", False):
            resp = await client.get(f"/api/v1/locations/{place_id}/enrich?lang=fr-CA")

    assert resp.status_code == 200
    body = resp.json()
    assert body["content_language"] == "fr"

    fake_service.enrich_location.assert_awaited_once()
    _, call_kwargs = fake_service.enrich_location.call_args
    assert call_kwargs["lang"] == "fr"


@pytest.mark.asyncio
async def test_enrich_location_reports_honest_fallback_content_language(ctx):
    """When the requested-language edition has no coverage and the service
    falls back to English, the response must report content_language="en"
    -- never silently relabeled as if it matched the requested language."""
    client = ctx["client"]
    db = ctx["db"]

    place_id = "wikipedia_en_1116801"

    cache_lookup_result = MagicMock()
    cache_lookup_result.scalar_one_or_none.return_value = None
    db.execute.return_value = cache_lookup_result

    from services.multi_backend_location_service import LocationData

    enriched = LocationData(
        name="Maxwelton, Washington",
        latitude=47.93722,
        longitude=-122.44444,
        location_type="point_of_interest",
        address="",
        place_id=place_id,
        source="wikipedia",
        description="Maxwelton is an unincorporated community...",
        content_language="en",  # fallback engaged inside the service
    )

    fake_service = MagicMock()
    fake_service.enrich_location = AsyncMock(return_value=enriched)

    with patch("routes.privacy_locations.get_location_service", return_value=fake_service):
        with patch("routes.privacy_locations.settings.ENABLE_LOCATION_CACHE", False):
            resp = await client.get(f"/api/v1/locations/{place_id}/enrich?lang=fr")

    assert resp.status_code == 200
    body = resp.json()
    assert body["content_language"] == "en"


@pytest.mark.asyncio
async def test_search_nearby_locations_normalizes_and_passes_lang(ctx):
    """POST /locations/search must normalize a regional locale the same
    way and pass the result through to the location service."""
    client = ctx["client"]

    fake_service = MagicMock()
    fake_service.search_nearby = AsyncMock(return_value=[])

    with patch("routes.privacy_locations.get_location_service", return_value=fake_service):
        with patch("routes.privacy_locations.settings.ENABLE_LOCATION_CACHE", False):
            resp = await client.post(
                "/api/v1/locations/search",
                json={"latitude": 48.8584, "longitude": 2.2945, "radius_meters": 500, "lang": "pt-BR"},
            )

    assert resp.status_code == 200
    fake_service.search_nearby.assert_awaited_once()
    _, call_kwargs = fake_service.search_nearby.call_args
    assert call_kwargs["lang"] == "pt"


@pytest.mark.asyncio
async def test_search_and_enrich_reject_unauthenticated_request():
    """Regression test for the Design D auth gate itself -- without the
    get_current_user override, a request with no token must 401, not fall
    through to the handler."""
    from core.database import get_db

    app = _make_app()
    db = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db
    # Deliberately NOT overriding get_current_user here.

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        search_resp = await client.post(
            "/api/v1/locations/search",
            json={"latitude": 48.8584, "longitude": 2.2945, "radius_meters": 500},
        )
        enrich_resp = await client.get("/api/v1/locations/some-place-id/enrich")

    assert search_resp.status_code in (401, 403)
    assert enrich_resp.status_code in (401, 403)


# ===========================================================================
# 3. fetch_wikidata_id_by_name() — regression: gates on location.name, not
#    location.wikipedia_url
# ===========================================================================

@pytest.mark.asyncio
async def test_fetch_wikidata_id_calls_out_when_name_present():
    """fetch_wikidata_id_by_name() must attempt the Wikidata search whenever
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

    # fetch_wikidata_id_by_name is a module-level function shared between
    # OpenStreetMapBackend and WikipediaGeosearchBackend (not a method on
    # either), using the module's shared pooled client — patch that getter
    # rather than httpx.AsyncClient directly.
    from services.multi_backend_location_service import fetch_wikidata_id_by_name

    with patch(
        "services.multi_backend_location_service.get_http_client",
        return_value=mock_client,
    ):
        result = await fetch_wikidata_id_by_name(location)

    assert result.wikidata_id == "Q44440"
    mock_client.get.assert_awaited_once()


@pytest.mark.asyncio
async def test_fetch_wikidata_id_skips_lookup_when_name_missing():
    """When location.name is empty, fetch_wikidata_id_by_name() must not
    attempt any HTTP call at all — it should return the location unchanged."""
    from services.multi_backend_location_service import fetch_wikidata_id_by_name, LocationData

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

    mock_client = AsyncMock()
    with patch(
        "services.multi_backend_location_service.get_http_client",
        return_value=mock_client,
    ):
        result = await fetch_wikidata_id_by_name(location)

    mock_client.get.assert_not_called()
    assert result.wikidata_id is None
