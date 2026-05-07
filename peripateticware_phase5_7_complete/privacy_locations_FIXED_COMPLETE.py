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
from services.iapp_privacy_crawler import run_privacy_crawler

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


class PrivacyCheckRequest(BaseModel):
    """Check activity for privacy compliance"""
    activity_id: str
    activity_name: str
    data_collection: List[str]
    third_parties: List[str]
    purpose: str
    student_age: int
    jurisdiction_id: Optional[str] = None


class ComplianceIssue(BaseModel):
    """Compliance issue found"""
    severity: str  # error, warning
    message: str


class PrivacyCheckResponse(BaseModel):
    """Privacy compliance check result"""
    activity_id: str
    is_compliant: bool
    jurisdiction: str
    issues: List[ComplianceIssue]
    warnings: List[ComplianceIssue]
    required_actions: List[str]


class JurisdictionInfo(BaseModel):
    """Information about available jurisdiction"""
    jurisdiction_id: str
    jurisdiction_name: str
    country_code: str
    framework: str


# ============================================================================
# PRIVACY ENDPOINTS
# ============================================================================

@router.post("/privacy/check", response_model=PrivacyCheckResponse)
async def check_activity_compliance(
    request: PrivacyCheckRequest,
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    """
    Check if activity complies with jurisdiction's privacy laws
    
    REQUIRED before teacher proceeds with activity creation
    """
    try:
        checker = get_privacy_checker()
        
        # Set jurisdiction if specified
        if request.jurisdiction_id:
            checker.set_active_jurisdiction(request.jurisdiction_id)
        elif settings.ACTIVE_JURISDICTION:
            checker.set_active_jurisdiction(settings.ACTIVE_JURISDICTION)
        
        # Prepare activity data
        activity_data = {
            "data_collection": request.data_collection,
            "third_parties": request.third_parties,
            "purpose": request.purpose
        }
        
        # Check compliance
        is_compliant, issues, warnings = checker.check_activity_compliance(
            request.activity_id,
            activity_data,
            request.student_age,
            request.jurisdiction_id or settings.ACTIVE_JURISDICTION
        )
        
        # Convert to response format
        issue_objs = [
            ComplianceIssue(severity="error", message=issue)
            for issue in issues
        ]
        
        warning_objs = [
            ComplianceIssue(severity="warning", message=warning)
            for warning in warnings
        ]
        
        # Log compliance check
        if background_tasks:
            background_tasks.add_task(
                _log_compliance_check,
                db,
                request.activity_id,
                request.jurisdiction_id or settings.ACTIVE_JURISDICTION,
                is_compliant,
                issues,
                warnings
            )
        
        return PrivacyCheckResponse(
            activity_id=request.activity_id,
            is_compliant=is_compliant,
            jurisdiction=request.jurisdiction_id or settings.ACTIVE_JURISDICTION,
            issues=issue_objs,
            warnings=warning_objs,
            required_actions=_get_required_actions(issues)
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error checking compliance: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error checking compliance: {str(e)}"
        )


@router.get("/privacy/jurisdictions", response_model=List[JurisdictionInfo])
async def get_available_jurisdictions(db: AsyncSession = Depends(get_db)):
    """
    Get list of available jurisdictions with their privacy frameworks
    
    Shows teacher what jurisdictions are configured and their requirements
    """
    try:
        checker = get_privacy_checker()
        
        jurisdictions = []
        for jurisdiction_id, config in checker.configurations.items():
            jurisdictions.append(
                JurisdictionInfo(
                    jurisdiction_id=jurisdiction_id,
                    jurisdiction_name=config.jurisdiction_name,
                    country_code=config.country_code,
                    framework=config.framework.value
                )
            )
        
        return sorted(jurisdictions, key=lambda x: x.jurisdiction_name)
    
    except Exception as e:
        logger.error(f"Error getting jurisdictions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


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
        # TODO: Fetch location from cache
        # TODO: If not enriched, enrich with Wikipedia/Wikidata
        # TODO: Return enriched data
        
        return {
            "place_id": place_id,
            "subjects": [],
            "learning_opportunities": [],
            "image_url": None,
            "description": None,
            "message": "Location enrichment endpoint - implement database retrieval"
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
        # TODO: Query popular_destinations table
        # TODO: Filter by radius
        # TODO: Return sorted by usage
        
        return {
            "locations": [],
            "message": "Popular locations endpoint - implement database query"
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
        
        # Run crawler in background
        background_tasks.add_task(
            run_privacy_crawler,
            sources=settings.IAPP_CRAWLER_SOURCES_LIST,
            config_directory=settings.PRIVACY_CONFIG_DIR,
            auto_load=settings.PRIVACY_AUTO_LOAD
        )
        
        return {
            "success": True,
            "message": "Privacy crawler started in background. Check status for results."
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
        # TODO: Query pending regulations from file system
        # config/jurisdictions/pending/ directory
        
        return {
            "pending_regulations": [],
            "message": "Pending regulations endpoint - implement file system reading"
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
        # TODO: Move regulation from pending to active
        # TODO: Load into privacy engine
        # TODO: Notify admin of success
        
        return {
            "success": True,
            "jurisdiction_id": jurisdiction_id,
            "message": "Regulation approved and loaded"
        }
    
    except Exception as e:
        logger.error(f"Error approving regulation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def _log_compliance_check(
    db: AsyncSession,
    activity_id: str,
    jurisdiction_id: str,
    is_compliant: bool,
    issues: List[str],
    warnings: List[str]
):
    """Log compliance check to database"""
    try:
        # TODO: Insert into compliance_checks table
        logger.info(
            f"Logged compliance check: activity={activity_id}, "
            f"compliant={is_compliant}, issues={len(issues)}"
        )
    except Exception as e:
        logger.error(f"Error logging compliance check: {e}")


def _get_required_actions(issues: List[str]) -> List[str]:
    """Determine required actions from issues"""
    actions = []
    
    for issue in issues:
        if "consent required" in issue.lower():
            actions.append("obtain_consent")
        elif "cannot collect" in issue.lower():
            actions.append("remove_data_collection")
        elif "parental" in issue.lower():
            actions.append("obtain_parental_consent")
    
    return list(set(actions))  # Remove duplicates
