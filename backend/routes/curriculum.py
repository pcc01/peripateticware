# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Curriculum management routes - MERGED (Existing + Phase 5)"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy import select
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
import logging

from core.database import get_db
from core.config import settings
from core.dependencies import get_current_user, get_current_teacher
from models.database import User, CurriculumUnit
from services.wikimedia_service import get_location_context_for_activity
from services.activity_generation_service import ActivityGenerationService

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# EXISTING SCHEMAS (Keep as-is)
# ============================================================================

class CreateCurriculumRequest(BaseModel):
    """Create curriculum unit request"""
    title: str
    description: str
    subject: str
    grade_level: int
    bloom_level: Optional[int] = None
    marzano_level: Optional[int] = None
    content: dict


class CurriculumResponse(BaseModel):
    """Curriculum unit response"""
    curriculum_id: str
    title: str
    subject: str
    grade_level: int
    bloom_level: Optional[int] = None
    marzano_level: Optional[int] = None
    
    class Config:
        from_attributes = True


# ============================================================================
# NEW SCHEMAS (Phase 5)
# ============================================================================

class TaxonomyLevel(BaseModel):
    """Taxonomy level representation"""
    level: int
    name: str
    description: str
    color: Optional[str] = None


class StandardsAlignmentResponse(BaseModel):
    """Standards alignment details"""
    curriculum_id: str
    title: str
    subject: str
    grade_level: int
    taxonomies: Dict[str, TaxonomyLevel]


class LocationContextRequest(BaseModel):
    """Request location context from Wikimedia"""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    location_name: str = Field(..., min_length=1, max_length=255)


class LocationContextResponse(BaseModel):
    """Location context response"""
    location_name: str
    latitude: float
    longitude: float
    wikipedia: Dict[str, Any]
    wikidata: Dict[str, Any]
    geographic_features: Dict[str, Any]
    educational_value: Optional[str]
    success: bool


class ActivityGenerationRequest(BaseModel):
    """Request activity suggestions"""
    location_name: str = Field(..., min_length=1, max_length=255)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    subject: str = Field(..., min_length=1, max_length=100)
    grade_level: int = Field(..., ge=3, le=12)
    
    # Optional taxonomy specifications
    bloom_level: Optional[int] = Field(None, ge=1, le=6)
    marzano_level: Optional[int] = Field(None, ge=1, le=4)
    dok_level: Optional[int] = Field(None, ge=1, le=4)
    solo_level: Optional[int] = Field(None, ge=1, le=5)
    
    # Curriculum context
    curriculum_titles: Optional[List[str]] = None
    
    # Generation control
    num_suggestions: int = Field(3, ge=1, le=5)


class ActivitySuggestion(BaseModel):
    """Single activity suggestion"""
    title: str
    description: str
    learning_objectives: List[str]
    bloom_level: int
    marzano_level: int
    dok_level: int
    solo_level: int
    estimated_duration_minutes: int
    materials_needed: List[str]
    activity_type: str
    reasoning: str


class ActivityGenerationResponse(BaseModel):
    """Activity generation response"""
    success: bool
    location: Dict[str, Any]
    curriculum_context: Dict[str, Any]
    suggestions: List[ActivitySuggestion]
    location_context_success: bool
    llm_model: str
    generation_timestamp: str
    error: Optional[str] = None


# ============================================================================
# EXISTING ENDPOINTS (Keep as-is)
# ============================================================================

@router.post("/", response_model=CurriculumResponse)
async def create_curriculum_unit(
    request: CreateCurriculumRequest,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db)
):
    """Create a new curriculum unit"""
    try:
        unit = CurriculumUnit(
            title=request.title,
            description=request.description,
            subject=request.subject,
            grade_level=request.grade_level,
            bloom_level=request.bloom_level,
            marzano_level=request.marzano_level,
            raw_content=request.content,
            content_embedding=[0.0] * 384,  # Placeholder
            created_by=current_user.id
        )
        
        db.add(unit)
        await db.commit()
        await db.refresh(unit)
        
        logger.info(f"Created curriculum unit: {unit.id}")
        
        return CurriculumResponse(
            curriculum_id=str(unit.id),
            title=unit.title,
            subject=unit.subject,
            grade_level=unit.grade_level,
            bloom_level=unit.bloom_level,
            marzano_level=unit.marzano_level
        )
    
    except Exception as e:
        logger.error(f"Error creating curriculum: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create curriculum unit"
        )


@router.get("/{curriculum_id}", response_model=CurriculumResponse)
async def get_curriculum_unit(
    curriculum_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get curriculum unit details"""
    try:
        query = select(CurriculumUnit).where(
            CurriculumUnit.id == uuid.UUID(curriculum_id)
        )
        result = await db.execute(query)
        unit = result.scalar()
        
        if not unit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Curriculum unit not found"
            )
        
        return CurriculumResponse(
            curriculum_id=str(unit.id),
            title=unit.title,
            subject=unit.subject,
            grade_level=unit.grade_level,
            bloom_level=unit.bloom_level,
            marzano_level=unit.marzano_level
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching curriculum: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch curriculum unit"
        )


@router.get("/units")
def list_curriculum_units_paginated(
    subject: Optional[str] = None,
    grade_level: Optional[int] = None,
    page: int = 1,
    page_size: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List curriculum units with pagination (for activity mapping)"""
    try:
        query = db.query(CurriculumUnit).filter(CurriculumUnit.is_active == True)
        
        if subject:
            query = query.filter(CurriculumUnit.subject.ilike(f"%{subject}%"))
        if grade_level:
            query = query.filter(CurriculumUnit.grade_level == grade_level)
        
        total = query.count()
        offset = (page - 1) * page_size
        units = query.order_by(CurriculumUnit.title).offset(offset).limit(page_size).all()
        
        total_pages = (total + page_size - 1) // page_size
        
        return {
            "items": [
                CurriculumResponse(
                    curriculum_id=str(unit.id),
                    title=unit.title,
                    subject=unit.subject,
                    grade_level=unit.grade_level,
                    bloom_level=unit.bloom_level,
                    marzano_level=unit.marzano_level
                )
                for unit in units
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        }
    
    except Exception as e:
        logger.error(f"Error listing curriculum: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list curriculum units"
        )


@router.get("/")
async def list_curriculum_units(
    subject: Optional[str] = None,
    grade_level: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List curriculum units with optional filters"""
    try:
        query = select(CurriculumUnit).where(CurriculumUnit.is_active == True)
        
        if subject:
            query = query.where(CurriculumUnit.subject == subject)
        if grade_level:
            query = query.where(CurriculumUnit.grade_level == grade_level)
        
        result = await db.execute(query)
        units = result.scalars().all()
        
        return {
            "total": len(units),
            "units": [
                CurriculumResponse(
                    curriculum_id=str(unit.id),
                    title=unit.title,
                    subject=unit.subject,
                    grade_level=unit.grade_level,
                    bloom_level=unit.bloom_level,
                    marzano_level=unit.marzano_level
                )
                for unit in units
            ]
        }
    
    except Exception as e:
        logger.error(f"Error listing curriculum: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list curriculum units"
        )


@router.get("/{curriculum_id}/standards-alignment")
async def get_standards_alignment(
    curriculum_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get standards alignment matrix (Bloom's & Marzano's)
    
    EXISTING ENDPOINT - Kept for backward compatibility
    """
    try:
        query = select(CurriculumUnit).where(
            CurriculumUnit.id == uuid.UUID(curriculum_id)
        )
        result = await db.execute(query)
        unit = result.scalar()
        
        if not unit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Curriculum unit not found"
            )
        
        # Bloom's taxonomy levels
        blooms_levels = {
            1: "Remember",
            2: "Understand",
            3: "Apply",
            4: "Analyze",
            5: "Evaluate",
            6: "Create"
        }
        
        # Marzano's levels
        marzano_levels = {
            1: "Retrieval",
            2: "Comprehension",
            3: "Analysis",
            4: "Knowledge Utilization"
        }
        
        return {
            "curriculum_id": str(unit.id),
            "title": unit.title,
            "bloom": {
                "level": unit.bloom_level,
                "description": blooms_levels.get(unit.bloom_level, "Unknown")
            },
            "marzano": {
                "level": unit.marzano_level,
                "description": marzano_levels.get(unit.marzano_level, "Unknown")
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching standards: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch standards alignment"
        )


# ============================================================================
# NEW ENDPOINTS (Phase 5)
# ============================================================================

@router.post("/location/context", response_model=LocationContextResponse)
async def get_location_context(
    request: LocationContextRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get location context from Wikimedia (Wikipedia + Wikidata)
    
    NEW ENDPOINT - Phase 5
    
    Returns:
    - Wikipedia article extract
    - Geographic features from Wikidata
    - Educational value summary
    - Cached for 30 days
    """
    try:
        context = await get_location_context_for_activity(
            latitude=request.latitude,
            longitude=request.longitude,
            location_name=request.location_name,
            db=db
        )
        
        return LocationContextResponse(
            location_name=context.get("location_name"),
            latitude=context.get("latitude"),
            longitude=context.get("longitude"),
            wikipedia=context.get("wikipedia", {}),
            wikidata=context.get("wikidata", {}),
            geographic_features=context.get("geographic_features", {}),
            educational_value=context.get("educational_value"),
            success=context.get("success", False)
        )
    
    except Exception as e:
        logger.error(f"Error getting location context: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get location context: {str(e)}"
        )


@router.post("/activities/generate", response_model=ActivityGenerationResponse)
async def generate_activity_suggestions(
    request: ActivityGenerationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate activity suggestions using:
    - WikiLocation context (geographic/historical)
    - Curriculum standards (teacher specified)
    - Assessment frameworks (Bloom's/Marzano/DoK/SOLO)
    - Ollama/Claude for synthesis
    
    NEW ENDPOINT - Phase 5
    
    Only teachers can request activity generation
    """
    
    # Verify teacher role
    if current_user.role.value != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can generate activities"
        )
    
    try:
        logger.info(
            f"Generating activities for {request.location_name} "
            f"({request.latitude}, {request.longitude})"
        )
        
        # Initialize generation service
        service = ActivityGenerationService(llm_provider=settings.LLM_PROVIDER.lower())
        
        # Generate suggestions
        result = await service.generate_activity_suggestions(
            location_name=request.location_name,
            latitude=request.latitude,
            longitude=request.longitude,
            subject=request.subject,
            grade_level=request.grade_level,
            bloom_level=request.bloom_level,
            marzano_level=request.marzano_level,
            dok_level=request.dok_level,
            solo_level=request.solo_level,
            curriculum_titles=request.curriculum_titles,
            db=db,
            num_suggestions=request.num_suggestions
        )
        
        if not result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error", "Generation failed")
            )
        
        # Format response
        suggestions = [
            ActivitySuggestion(**suggestion)
            for suggestion in result.get("suggestions", [])
        ]
        
        return ActivityGenerationResponse(
            success=True,
            location=result.get("location", {}),
            curriculum_context=result.get("curriculum_context", {}),
            suggestions=suggestions,
            location_context_success=result.get("location_context_success", False),
            llm_model=result.get("llm_model", "unknown"),
            generation_timestamp=result.get("generation_timestamp", "")
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating activities: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate activities: {str(e)}"
        )


@router.get("/activities/generate/status")
async def generation_status(
    current_user: User = Depends(get_current_user)
):
    """
    Check availability and status of activity generation service
    
    NEW ENDPOINT - Phase 5
    """
    
    try:
        service = ActivityGenerationService(llm_provider=settings.LLM_PROVIDER.lower())
        
        status_info = {
            "service": "activity_generation",
            "available": True,
            "llm_provider": settings.LLM_PROVIDER.lower(),
            "models": {
                "text": settings.OLLAMA_MODEL_TEXT if settings.LLM_PROVIDER.lower() == "ollama" else settings.CLAUDE_MODEL
            },
            "features": {
                "wikimedia_integration": True,
                "taxonomy_support": ["blooms", "marzano", "dok", "solo"],
                "location_aware": True
            }
        }
        
        return status_info
    
    except Exception as e:
        logger.error(f"Error checking generation status: {e}")
        return {
            "service": "activity_generation",
            "available": False,
            "error": str(e)
        }


