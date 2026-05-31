# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1

"""Teacher rubric CRUD — Block 13d"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional, Any
from uuid import UUID
from datetime import datetime
import logging

from pydantic import BaseModel

from core.database import get_db
from core.dependencies import get_current_user, get_current_teacher
from models.user import User
from models.assessment import AssessmentRubric
from models.database import Activity

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/rubrics", tags=["rubrics"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class RubricCreate(BaseModel):
    title: str
    description: Optional[str] = None
    criteria: List[Any]           # [{name, description, levels:[{score,label,description}]}]
    total_points: int = 100

class RubricUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    criteria: Optional[List[Any]] = None
    total_points: Optional[int] = None

class RubricResponse(BaseModel):
    id: UUID
    teacher_id: UUID
    title: str
    description: Optional[str]
    criteria: List[Any]
    total_points: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=RubricResponse, status_code=201)
async def create_rubric(
    data: RubricCreate,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    """Create a new rubric (teacher only)."""
    rubric = AssessmentRubric(
        teacher_id=current_user.id,
        title=data.title,
        description=data.description,
        criteria=data.criteria,
        total_points=data.total_points,
    )
    db.add(rubric)
    await db.commit()
    await db.refresh(rubric)
    logger.info(f"Rubric created: {rubric.id} by {current_user.id}")
    return rubric


@router.get("", response_model=List[RubricResponse])
async def list_rubrics(
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    """List all rubrics for the current teacher."""
    result = await db.execute(
        select(AssessmentRubric)
        .where(AssessmentRubric.teacher_id == current_user.id, AssessmentRubric.is_active == True)
        .order_by(AssessmentRubric.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{rubric_id}", response_model=RubricResponse)
async def get_rubric(
    rubric_id: UUID,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AssessmentRubric).where(
            AssessmentRubric.id == rubric_id,
            AssessmentRubric.teacher_id == current_user.id,
        )
    )
    rubric = result.scalar_one_or_none()
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")
    return rubric


@router.put("/{rubric_id}", response_model=RubricResponse)
async def update_rubric(
    rubric_id: UUID,
    data: RubricUpdate,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AssessmentRubric).where(
            AssessmentRubric.id == rubric_id,
            AssessmentRubric.teacher_id == current_user.id,
        )
    )
    rubric = result.scalar_one_or_none()
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")

    if data.title is not None:       rubric.title = data.title
    if data.description is not None: rubric.description = data.description
    if data.criteria is not None:    rubric.criteria = data.criteria
    if data.total_points is not None: rubric.total_points = data.total_points
    rubric.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(rubric)
    return rubric


@router.delete("/{rubric_id}", status_code=204)
async def delete_rubric(
    rubric_id: UUID,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete rubric. Blocked if attached to published activities."""
    result = await db.execute(
        select(AssessmentRubric).where(
            AssessmentRubric.id == rubric_id,
            AssessmentRubric.teacher_id == current_user.id,
        )
    )
    rubric = result.scalar_one_or_none()
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")

    # Block deletion if attached to published activities
    published = await db.execute(
        select(func.count()).where(
            Activity.rubric_id == rubric_id,
            Activity.status == "published",
        )
    )
    if (published.scalar() or 0) > 0:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete a rubric attached to published activities",
        )

    rubric.is_active = False
    await db.commit()


@router.post("/{rubric_id}/attach/{activity_id}", status_code=200)
async def attach_rubric_to_activity(
    rubric_id: UUID,
    activity_id: UUID,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    """Attach a rubric to an activity."""
    rubric_result = await db.execute(
        select(AssessmentRubric).where(
            AssessmentRubric.id == rubric_id,
            AssessmentRubric.teacher_id == current_user.id,
        )
    )
    if not rubric_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Rubric not found")

    activity_result = await db.execute(
        select(Activity).where(
            Activity.id == activity_id,
            Activity.teacher_id == current_user.id,
        )
    )
    activity = activity_result.scalar_one_or_none()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    activity.rubric_id = rubric_id
    await db.commit()
    return {"status": "attached", "rubric_id": str(rubric_id), "activity_id": str(activity_id)}
