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
from services.multi_backend_location_service import get_location_service
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

@router.post("/locations/search", response_model=List[LocationSearchResponse])
async def search_nearby_locations(
    request: LocationSearchRequest,
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
    db: AsyncSession = Depends(get_db)
):
    """
    Get educational enrichment for a specific location
    
    Returns: learning opportunities, images, historical significance, etc.
    """
    try:
        from sqlalchemy import select as _sel
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

        if enriched:
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
            }

        # 2. Cache miss — try Nominatim + Wikipedia (fire-and-forget, return stub)
        import asyncio, httpx as _httpx
        loc_name = place_id.replace("-", " ").title()
        description = None
        try:
            async with _httpx.AsyncClient(timeout=5, headers={"User-Agent": "Peripateticware/1.0"}) as c:
                wiki = await c.get(
                    f"https://en.wikipedia.org/api/rest_v1/page/summary/{loc_name.replace(' ', '_')}"
                )
                if wiki.status_code == 200:
                    description = wiki.json().get("extract", "")[:500]
        except Exception:
            pass

        return {
            "place_id": place_id,
            "name": loc_name,
            "description": description,
            "subjects": [subject] if subject else [],
            "learning_opportunities": [],
            "image_url": None,
            "enrichment_quality": 0.3 if description else 0.0,
            "source": "wikipedia_live" if description else "none",
        }
    
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


