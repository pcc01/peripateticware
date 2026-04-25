"""Curriculum management routes"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
import uuid
from core.database import get_db
from models.database import CurriculumUnit
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateCurriculumRequest(BaseModel):
    """Create curriculum unit request"""
    title: str
    description: str
    subject: str
    grade_level: int
    bloom_level: int
    marzano_level: int
    content: dict


class CurriculumResponse(BaseModel):
    """Curriculum unit response"""
    curriculum_id: str
    title: str
    subject: str
    grade_level: int
    bloom_level: int
    marzano_level: int
    
    class Config:
        from_attributes = True


@router.post("/", response_model=CurriculumResponse)
async def create_curriculum_unit(
    request: CreateCurriculumRequest,
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
            content_embedding=[0.0] * 384  # Placeholder
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


@router.get("/")
async def list_curriculum_units(
    subject: Optional[str] = None,
    grade_level: Optional[int] = None,
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
    db: AsyncSession = Depends(get_db)
):
    """Get standards alignment matrix (Bloom's & Marzano's)"""
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
