# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Privacy and Location API Routes
Integrated with lesson generation flow
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging

from core.database import get_db
from core.config import settings
from services.privacy_engine import get_privacy_checker
from services.privacy_config_loader import PrivacyConfigurationLoader
from services.multi_backend_location_service import get_location_service, get_http_client, LocationData
from services.iapp_privacy_crawler import run_privacy_crawler, run_jurisdiction_crawl, get_supported_countries

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class LocationSearchRequest(BaseModel):
    """Request to search for nearby locations"""
    latitude: float
    longitude: float
    radius_meters: int = 5000
    location_types: Optional[List[str]] = None
    query: Optional[str] = None
    jurisdiction_id: Optional[str] = None


class LocationSearchResponse(BaseModel):
    """Location search result"""
    name: str
    latitude: float
    longitude: float
    location_type: str
    address: str
    place_id: str
    rating: Optional[float] = None
    user_ratings_total: Optional[int] = None
    is_cached: bool


class GeocodeRequest(BaseModel):
    """Forward-geocode free text — a place name or a full street address."""
    query: str


class GeocodeResponse(BaseModel):
    """Forward-geocode result"""
    latitude: float
    longitude: float
    display_name: str
    place_id: str
    address: str
    is_cached: bool
    # True when the exact typed address had no match and this is a coarser
    # fallback (e.g. just the town) — see geocode_location()'s fallback chain.
    is_approximate: bool = False


def _geocode_cache_key(query: str) -> str:
    """Deterministic place_id for a normalized geocode query string."""
    import hashlib
    normalized = (query or "").strip().lower()
    return "geocode:" + hashlib.sha256(normalized.encode()).hexdigest()[:32]


# ============================================================================
# PRIVACY ENDPOINTS
# ============================================================================

@router.post("/privacy/reload-config")
async def reload_privacy_config(db: AsyncSession = Depends(get_db)):
    """
    Hot-reload privacy configurations from JSON files
    
    Allows updates to privacy rules without restarting
    """
    try:
        loader = PrivacyConfigurationLoader(settings.PRIVACY_CONFIG_DIR)
        configs = loader.load_all_jurisdictions()
        
        checker = get_privacy_checker()
        for jurisdiction_id, config in configs.items():
            checker.register_jurisdiction(config)
        
        logger.info(f"Reloaded {len(configs)} jurisdiction configurations")
        
        return {
            "success": True,
            "jurisdictions_loaded": len(configs),
            "message": f"Successfully reloaded {len(configs)} privacy configurations"
        }
    
    except Exception as e:
        logger.error(f"Error reloading config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ============================================================================
# LOCATION ENDPOINTS
# ============================================================================

@router.post("/locations/geocode", response_model=GeocodeResponse)
async def geocode_location(
    request: GeocodeRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Forward-geocode free text — a landmark name ("Eiffel Tower") or a full
    street address ("7015 Maxwelton Rd, Clinton, WA 98236") — to
    latitude/longitude. Backs the activity builder's single "Location Name"
    field so a teacher-typed address resolves the same way a landmark name
    does, with no separate "Address" field needed.

    Moved server-side (this previously happened client-side, straight from
    the browser to Nominatim — see ActivityManager.tsx's old forwardGeocode)
    so it shares the pooled client (get_http_client) and the same
    CachedLocation table as /locations/search, instead of an uncached,
    unauthenticated call repeated on every keystroke pause.
    """
    query = (request.query or "").strip()
    if not query:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="query is required")

    from models.database import CachedLocation as _CL
    from sqlalchemy import select as _sel3
    from datetime import datetime as _dt

    place_id = _geocode_cache_key(query)

    if settings.ENABLE_LOCATION_CACHE:
        existing = (await db.execute(
            _sel3(_CL).where(_CL.place_id == place_id)
        )).scalar_one_or_none()
        if existing:
            try:
                existing.access_count = (existing.access_count or 0) + 1
                existing.last_accessed = _dt.utcnow()
                await db.commit()
            except Exception as usage_err:
                logger.warning(f"Geocode usage tracking update failed (non-fatal): {usage_err}")
                await db.rollback()
            return GeocodeResponse(
                latitude=existing.latitude,
                longitude=existing.longitude,
                display_name=existing.name,
                place_id=place_id,
                address=existing.address or "",
                is_cached=True,
            )

    # Fallback chain: rural/small-town roads (e.g. an outdoor-classroom site
    # down a county road) are frequently missing house-number-level detail
    # in OSM/Nominatim entirely — confirmed directly against Nominatim, not
    # a bug in this endpoint: the exact street address returns [], but
    # progressively dropping the leading (most specific) comma-separated
    # segment finds the town/village. A coarse pin the teacher can drag to
    # the right spot beats a hard 404 with no starting point at all.
    segments = [s.strip() for s in query.split(",") if s.strip()]
    candidates = [query] + [", ".join(segments[i:]) for i in range(1, len(segments))]

    client = get_http_client()
    results = None
    matched_query = query
    for attempt, candidate in enumerate(candidates):
        try:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": candidate, "format": "json", "limit": 1, "addressdetails": 1},
                timeout=10,
            )
            response.raise_for_status()
            candidate_results = response.json()
        except Exception as e:
            logger.error(f"Geocode request failed for '{candidate}': {e}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Geocoding service unavailable"
            )
        if candidate_results:
            results = candidate_results
            matched_query = candidate
            break

    if not results:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No location found for '{query}'"
        )
    is_approximate = matched_query != query

    top = results[0]
    latitude = float(top["lat"])
    longitude = float(top["lon"])
    display_name = top.get("display_name", matched_query)
    address_obj = top.get("address") if isinstance(top.get("address"), dict) else {}
    address_str = ", ".join(p for p in [
        address_obj.get("road"),
        address_obj.get("house_number"),
        address_obj.get("city") or address_obj.get("town") or address_obj.get("village"),
        address_obj.get("state"),
        address_obj.get("postcode"),
    ] if p)

    # Only cache exact (first-attempt) matches. Caching a fallback match
    # under the *original* address's cache key would silently keep serving
    # a coarse approximation on every future lookup of that exact address —
    # the is_approximate flag on this response wouldn't survive into the
    # cache-hit branch above without a schema change, so the honest choice
    # is to just recompute the (cheap) fallback chain each time instead.
    if settings.ENABLE_LOCATION_CACHE and not is_approximate:
        try:
            db.add(_CL(
                name=display_name,
                latitude=latitude,
                longitude=longitude,
                location_type="geocode",
                address=address_str,
                place_id=place_id,
                source="nominatim",
            ))
            await db.commit()
        except Exception as cache_err:
            logger.warning(f"Geocode cache write skipped for '{query}': {cache_err}")
            await db.rollback()

    return GeocodeResponse(
        latitude=latitude,
        longitude=longitude,
        display_name=display_name,
        place_id=place_id,
        address=address_str,
        is_cached=False,
        is_approximate=is_approximate,
    )


async def _prewarm_enrichment(place_ids: List[str]) -> None:
    """
    Pre-fetch and cache enrichment for the top few /locations/search results
    so picking a different nearby place still feels instant. Runs after the
    response is sent, so it opens its own DB session rather than reusing the
    request-scoped one (which may already be torn down by then) — same
    session-factory pattern get_db() itself uses.
    """
    from core.database import get_session_factory

    session_factory = get_session_factory()
    for place_id in place_ids:
        try:
            async with session_factory() as session:
                await enrich_location(place_id=place_id, subject=None, refresh=False, db=session)
        except Exception as prewarm_err:
            logger.warning(f"Pre-warm enrichment skipped for {place_id}: {prewarm_err}")


@router.post("/locations/search", response_model=List[LocationSearchResponse])
async def search_nearby_locations(
    request: LocationSearchRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Search for educational locations near coordinates
    
    Uses cached results when available for speed
    Falls back to free open-source backends (OSM, Wikidata, Wikipedia)
    """
    try:
        service = get_location_service()

        # Search for locations
        locations = await service.search_nearby(
            latitude=request.latitude,
            longitude=request.longitude,
            radius_meters=request.radius_meters,
            location_types=request.location_types,
            query=request.query
        )

        # Cache write-back — WITHOUT this, the real name/lat/lng/address a
        # backend (e.g. Nominatim) just found here is thrown away: the
        # follow-up GET /locations/{place_id}/enrich call (routes below)
        # looks this place_id up in CachedLocation, finds nothing, and
        # synthesizes a placeholder from the place_id slug itself (e.g.
        # "nominatim_432316288" -> name "Nominatim 432316288", lat/lng 0,0),
        # which is the garbage the WikiLocationInfo panel was showing. Write
        # each result here so /enrich has real data to enrich against.
        if settings.ENABLE_LOCATION_CACHE and locations:
            from models.database import CachedLocation as _CL
            from sqlalchemy import select as _sel2
            for loc in locations:
                try:
                    existing = (await db.execute(
                        _sel2(_CL).where(_CL.place_id == loc.place_id)
                    )).scalar_one_or_none()
                    if existing:
                        existing.name = loc.name
                        existing.latitude = loc.latitude
                        existing.longitude = loc.longitude
                        existing.location_type = loc.location_type
                        existing.address = loc.address
                        existing.source = loc.source
                    else:
                        db.add(_CL(
                            name=loc.name,
                            latitude=loc.latitude,
                            longitude=loc.longitude,
                            location_type=loc.location_type,
                            address=loc.address,
                            place_id=loc.place_id,
                            source=loc.source,
                            search_latitude=request.latitude,
                            search_longitude=request.longitude,
                            search_radius_meters=request.radius_meters,
                        ))
                except Exception as cache_err:
                    logger.warning(f"Location cache write skipped for {loc.place_id}: {cache_err}")
            try:
                await db.commit()
            except Exception as commit_err:
                logger.warning(f"Location cache commit failed (non-fatal): {commit_err}")
                await db.rollback()

        # Convert to response format
        responses = [
            LocationSearchResponse(
                name=loc.name,
                latitude=loc.latitude,
                longitude=loc.longitude,
                location_type=loc.location_type,
                address=loc.address,
                place_id=loc.place_id,
                rating=loc.rating,
                user_ratings_total=loc.user_ratings_total,
                is_cached=loc.source != "google"  # Assume non-Google is from cache
            )
            for loc in locations
        ]

        # Pre-warm enrichment for the top few results in the background, so
        # picking a nearby place other than the auto-matched one is already
        # cached by the time the teacher clicks it.
        if settings.ENABLE_LOCATION_CACHE and responses:
            background_tasks.add_task(
                _prewarm_enrichment, [r.place_id for r in responses[:3]]
            )

        logger.info(f"Found {len(responses)} locations")
        return responses

    except Exception as e:
        logger.error(f"Error searching locations: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/locations/{place_id}/enrich")
async def enrich_location(
    place_id: str,
    subject: Optional[str] = None,
    refresh: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """
    Get educational enrichment for a specific location

    Returns: learning opportunities, images, historical significance, etc.

    `refresh=true` forces a live re-fetch, bypassing the (up to 7-day TTL)
    cache. Without this, there was no way to get a fresh result for a
    place that had already been enriched once — every enrichment-quality
    fix made to the underlying pipeline stayed invisible for any
    already-cached place_id until the TTL happened to expire, which is
    exactly what made earlier fixes this session look like they "weren't
    working" (the cached pre-fix row was still being served).
    """
    try:
        from sqlalchemy import select as _sel
        from datetime import datetime, timedelta
        from models.database import CachedLocation, EnrichedLocation as _EL

        # 1. Check cache
        result = await db.execute(
            _sel(CachedLocation).where(CachedLocation.place_id == place_id)
        )
        cached = result.scalar_one_or_none()
        enriched = None
        if cached:
            er = await db.execute(
                _sel(_EL).where(_EL.cached_location_id == cached.id)
            )
            enriched = er.scalar_one_or_none()

        # TTL staleness check — an over-age row is treated as a cache miss so
        # it gets re-fetched and refreshed below rather than served forever.
        # `refresh=true` forces the same treatment regardless of age.
        is_stale = refresh
        if enriched and enriched.enriched_at and not is_stale:
            age = datetime.utcnow() - enriched.enriched_at
            if age > timedelta(hours=settings.LOCATION_CACHE_TTL_HOURS):
                is_stale = True

        if enriched and not is_stale:
            # Usage tracking — mirrors the increment-and-commit idiom already
            # used for the (unrelated) inference cache in routes/inference.py
            # (_get_cached_inference). Without this, access_count/usage_count
            # sit at their insert-time defaults forever, so the "which places
            # do teachers actually use" signal these columns exist for never
            # accumulates on a real cache hit.
            try:
                from datetime import datetime as _dt
                if cached:
                    cached.access_count = (cached.access_count or 0) + 1
                    cached.last_accessed = _dt.utcnow()
                enriched.usage_count = (enriched.usage_count or 0) + 1
                enriched.last_used = _dt.utcnow()
                await db.commit()
            except Exception as usage_err:
                logger.warning(f"Location usage tracking update failed (non-fatal): {usage_err}")
                await db.rollback()

            return {
                "place_id": place_id,
                "name": cached.name if cached else place_id,
                "description": enriched.description,
                "subjects": enriched.subjects or [],
                "grade_levels": enriched.grade_levels or [],
                "learning_opportunities": enriched.learning_opportunities or [],
                "image_url": enriched.image_url,
                "enrichment_quality": enriched.enrichment_quality,
                "source": enriched.enrichment_source,
                "wikidata_id": enriched.wikidata_id,
                "architect_or_artist": enriched.architect_or_artist,
                "construction_date": enriched.construction_date,
                "historical_significance": enriched.historical_significance,
                "keywords": enriched.keywords or [],
            }

        # 2. Cache miss (or stale) — reconstruct a LocationData and run the
        # real MultiBackendLocationService enrichment pipeline (OSM tags ->
        # Wikidata entity -> Wikipedia extract -> educational metadata).
        service = get_location_service()

        if cached:
            location = LocationData(
                name=cached.name,
                latitude=cached.latitude,
                longitude=cached.longitude,
                location_type=cached.location_type or "point_of_interest",
                address=cached.address or "",
                place_id=cached.place_id,
                source=cached.source or "openstreetmap",
            )
        else:
            # No CachedLocation row yet — synthesize a minimal LocationData
            # from the slug. Must use source="openstreetmap": that's the only
            # backend whose enrich_location() actually does the
            # Wikidata/Wikipedia chain — "nominatim" is a no-op passthrough.
            loc_name = place_id.replace("-", " ").title()
            location = LocationData(
                name=loc_name,
                latitude=0.0,
                longitude=0.0,
                location_type="point_of_interest",
                address="",
                place_id=place_id,
                source="openstreetmap",
            )

        enriched_location = await service.enrich_location(location, subject=subject)

        # AI-synopsis fallback: small local sites (a watershed restoration
        # project, a school's own outdoor classroom) often have no Wikipedia
        # or Wikidata entry at all — enrich_location() above then returns no
        # description. Rather than leaving the panel blank, ask the LLM for
        # a short overview from its general knowledge. Clearly distinguished
        # from sourced content via source="ai_generated" (checked by
        # WikiLocationInfo.tsx to render a distinct label) — an LLM's
        # knowledge of a small, obscure place can be thin or wrong on
        # specifics, so it must never be presented as if it were Wikipedia.
        if not enriched_location.description:
            from services.activity_generation_service import ActivityGenerationService

            synopsis = await ActivityGenerationService(
                llm_provider=settings.LLM_PROVIDER.lower()
            ).generate_location_synopsis(
                location_name=enriched_location.name,
                address=enriched_location.address,
                latitude=enriched_location.latitude,
                longitude=enriched_location.longitude,
            )
            if synopsis:
                enriched_location.description = synopsis
                enriched_location.source = "ai_generated"

        # Simple populated-fields heuristic for enrichment_quality — not a
        # hardcoded constant. LocationData has no enrichment_quality field.
        quality_fields = [
            enriched_location.description,
            enriched_location.image_url,
            enriched_location.wikidata_id,
        ]
        enrichment_quality = min(
            sum(1 for f in quality_fields if f) / len(quality_fields), 1.0
        )

        response = {
            "place_id": place_id,
            "name": enriched_location.name,
            "description": enriched_location.description,
            "subjects": enriched_location.subjects or [],
            "grade_levels": [],  # LocationData has no grade_levels source data
            "learning_opportunities": enriched_location.learning_opportunities or [],
            "image_url": enriched_location.image_url,
            "enrichment_quality": enrichment_quality,
            "source": enriched_location.source,
            "wikidata_id": enriched_location.wikidata_id,
            "architect_or_artist": enriched_location.architect_or_artist,
            "construction_date": enriched_location.construction_date,
            "historical_significance": enriched_location.historical_significance,
            "keywords": enriched_location.keywords or [],
        }

        # 3. Cache write-back — mirrors inference.py::_write_inference_cache().
        if settings.ENABLE_LOCATION_CACHE:
            try:
                if not cached:
                    cached = CachedLocation(
                        name=enriched_location.name,
                        latitude=enriched_location.latitude,
                        longitude=enriched_location.longitude,
                        location_type=enriched_location.location_type,
                        address=enriched_location.address,
                        place_id=place_id,
                        source=enriched_location.source,
                    )
                    db.add(cached)
                    await db.flush()  # get cached.id before creating EnrichedLocation
                else:
                    cached.name = enriched_location.name
                    cached.location_type = enriched_location.location_type
                    cached.address = enriched_location.address
                    cached.source = enriched_location.source

                if enriched:
                    # Stale row found earlier — refresh it in place rather
                    # than inserting a second row (cached_location_id is
                    # unique on EnrichedLocation).
                    enriched.subjects = enriched_location.subjects or []
                    enriched.keywords = enriched_location.keywords or []
                    enriched.learning_opportunities = enriched_location.learning_opportunities or []
                    enriched.description = enriched_location.description
                    enriched.image_url = enriched_location.image_url
                    enriched.wikipedia_url = enriched_location.wikipedia_url
                    enriched.wikidata_id = enriched_location.wikidata_id
                    enriched.architect_or_artist = enriched_location.architect_or_artist
                    enriched.construction_date = enriched_location.construction_date
                    enriched.historical_significance = enriched_location.historical_significance
                    enriched.enrichment_source = enriched_location.source
                    enriched.enrichment_quality = enrichment_quality
                    enriched.enriched_at = datetime.utcnow()
                else:
                    new_enriched = _EL(
                        cached_location_id=cached.id,
                        subjects=enriched_location.subjects or [],
                        keywords=enriched_location.keywords or [],
                        learning_opportunities=enriched_location.learning_opportunities or [],
                        description=enriched_location.description,
                        image_url=enriched_location.image_url,
                        wikipedia_url=enriched_location.wikipedia_url,
                        wikidata_id=enriched_location.wikidata_id,
                        architect_or_artist=enriched_location.architect_or_artist,
                        construction_date=enriched_location.construction_date,
                        historical_significance=enriched_location.historical_significance,
                        enrichment_source=enriched_location.source,
                        enrichment_quality=enrichment_quality,
                    )
                    db.add(new_enriched)

                await db.commit()
            except Exception as cache_err:
                logger.warning(f"Location cache write failed (non-fatal): {cache_err}")
                await db.rollback()

        return response

    except Exception as e:
        logger.error(f"Error enriching location: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/locations/popular")
async def get_popular_locations(
    latitude: float,
    longitude: float,
    radius_meters: int = 10000,
    db: AsyncSession = Depends(get_db)
):
    """
    Get most popular educational locations in an area
    
    Helps teachers discover what works well in their region
    """
    try:
        from sqlalchemy import select as _sel, desc as _desc, func as _func
        from models.database import CachedLocation as _CL

        # Haversine filter approximation using bounding box, then sort by access_count
        # 1 degree lat ≈ 111 km
        lat_delta = radius_meters / 111_000
        lon_delta = radius_meters / (111_000 * abs(import_cos(latitude)) if (import_cos := __import__("math").cos) else 1)

        result = await db.execute(
            _sel(_CL)
            .where(
                _CL.latitude.between(latitude - lat_delta, latitude + lat_delta),
                _CL.longitude.between(longitude - lon_delta, longitude + lon_delta),
            )
            .order_by(_desc(_CL.access_count))
            .limit(20)
        )
        locs = result.scalars().all()

        return {
            "locations": [
                {
                    "place_id": loc.place_id,
                    "name": loc.name,
                    "latitude": loc.latitude,
                    "longitude": loc.longitude,
                    "usage_count": loc.access_count or 0,
                }
                for loc in locs
            ],
            "total": len(locs),
        }
    
    except Exception as e:
        logger.error(f"Error getting popular locations: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ============================================================================
# PRIVACY CRAWLER ENDPOINTS
# ============================================================================

@router.post("/privacy/crawl-regulations")
async def crawl_privacy_regulations(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Manually trigger privacy crawler to check for new regulations
    
    Normally runs on schedule defined in .env
    """
    try:
        if not settings.IAPP_CRAWLER_ENABLED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="IAPP crawler is disabled"
            )
        
        # Run crawler in a background task with its own DB session
        async def _run_crawler():
            from core.database import get_session_factory
            async with get_session_factory()() as db_session:
                await run_privacy_crawler(
                    db=db_session,
                    auto_load=getattr(settings, "PRIVACY_AUTO_LOAD", False),
                )

        background_tasks.add_task(_run_crawler)

        return {
            "success": True,
            "message": "Privacy crawler started in background. Regulations will be checked against public sources.",
            "supported_countries": get_supported_countries(),
        }
    
    except Exception as e:
        logger.error(f"Error starting crawler: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/privacy/pending-regulations")
async def get_pending_regulations(db: AsyncSession = Depends(get_db)):
    """
    Get pending regulations awaiting admin review
    
    Shows regulations discovered by crawler
    """
    try:
        import json as _json
        from pathlib import Path
        pending_dir = Path(__file__).parent.parent / "config" / "jurisdictions" / "pending"
        pending_dir.mkdir(parents=True, exist_ok=True)

        regulations = []
        for json_file in sorted(pending_dir.glob("*.json")):
            try:
                data = _json.loads(json_file.read_text())
                regulations.append({
                    "filename": json_file.name,
                    "jurisdiction_code": data.get("jurisdiction_code", json_file.stem),
                    "name": data.get("name", json_file.stem),
                    "full_name": data.get("full_name", ""),
                    "regulator": data.get("regulator", ""),
                    "framework": data.get("framework", ""),
                    "effective_date": data.get("effective_date", ""),
                    "added_at": json_file.stat().st_mtime,
                })
            except Exception as e:
                logger.warning(f"Could not read pending regulation {json_file.name}: {e}")

        return {
            "pending_regulations": regulations,
            "count": len(regulations),
            "pending_dir": str(pending_dir),
        }

    except Exception as e:
        logger.error(f"Error getting pending regulations: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/privacy/approve-regulation/{jurisdiction_id}")
async def approve_regulation(
    jurisdiction_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Admin approves a pending regulation for loading
    """
    try:
        import json as _json
        import shutil
        from pathlib import Path

        pending_dir = Path(__file__).parent.parent / "config" / "jurisdictions" / "pending"
        active_dir  = Path(__file__).parent.parent / "config" / "jurisdictions"

        # Find the pending file — try exact name or jurisdiction_code match
        pending_file = pending_dir / f"{jurisdiction_id}.json"
        if not pending_file.exists():
            # Try scanning all pending files for a matching jurisdiction_code
            for f in pending_dir.glob("*.json"):
                try:
                    data = _json.loads(f.read_text())
                    if data.get("jurisdiction_code") == jurisdiction_id:
                        pending_file = f
                        break
                except Exception:
                    continue

        if not pending_file.exists():
            raise HTTPException(
                status_code=404,
                detail=f"No pending regulation found for jurisdiction_id '{jurisdiction_id}'"
            )

        # Load and validate the JSON
        try:
            reg_data = _json.loads(pending_file.read_text())
        except _json.JSONDecodeError as e:
            raise HTTPException(status_code=422, detail=f"Invalid JSON in pending regulation: {e}")

        jurisdiction_code = reg_data.get("jurisdiction_code", pending_file.stem)
        target_file = active_dir / f"{jurisdiction_code}.json"

        # Move to active directory
        shutil.move(str(pending_file), str(target_file))
        logger.info(f"Moved {pending_file.name} → {target_file}")

        # Attempt to reload via privacy config loader
        try:
            loader = PrivacyConfigurationLoader(str(active_dir))
            configs = loader.load_all_jurisdictions()
            checker = get_privacy_checker()
            for jid, config in configs.items():
                checker.register_jurisdiction(config)
            logger.info(f"Reloaded jurisdiction {jurisdiction_code} into privacy engine")
        except Exception as e:
            logger.warning(f"Privacy engine reload skipped (non-fatal): {e}")

        # Log to audit trail
        try:
            from sqlalchemy import text as _text
            await db.execute(_text("""
                INSERT INTO rule_audit_log
                    (id, action, data_type, compliance_status, jurisdiction_ids, notes)
                VALUES
                    (gen_random_uuid(),
                     'REGULATION_APPROVED',
                     'jurisdiction',
                     'COMPLIANT',
                     CAST(:jurisdictions AS jsonb),
                     :notes)
            """), {
                "jurisdictions": f'["{jurisdiction_code}"]',
                "notes": f"Approved {jurisdiction_code} from pending; moved to active config",
            })
            await db.commit()
        except Exception as e:
            logger.warning(f"Audit log for regulation approval failed (non-fatal): {e}")

        return {
            "success": True,
            "jurisdiction_id": jurisdiction_code,
            "filename": target_file.name,
            "message": f"Regulation '{jurisdiction_code}' approved and loaded into active config.",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving regulation {jurisdiction_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


