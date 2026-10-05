# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1

"""Reusable learning-outcome library (teacher-owned) for the guided activity wizard."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_teacher
from models.user import User
from models.assessment import LearningOutcome

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/outcomes", tags=["outcomes"])

MAX_LIBRARY_SIZE = 500


class OutcomeCreate(BaseModel):
    text: str = Field(..., min_length=3, max_length=1000)
    subject: Optional[str] = Field(None, max_length=100)
    grade_min: Optional[int] = Field(None, ge=0, le=12)
    grade_max: Optional[int] = Field(None, ge=0, le=12)
    taxonomy_level: Optional[str] = Field(None, max_length=50)
    evidence_type: Optional[str] = Field(None, max_length=50)


class OutcomeResponse(BaseModel):
    id: UUID
    text: str
    subject: Optional[str]
    grade_min: Optional[int]
    grade_max: Optional[int]
    taxonomy_level: Optional[str]
    evidence_type: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=List[OutcomeResponse])
async def list_outcomes(
    subject: Optional[str] = None,
    grade: Optional[int] = None,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    """The current teacher's saved outcomes, newest first. Optional subject/grade filters."""
    stmt = select(LearningOutcome).where(LearningOutcome.teacher_id == current_user.id)
    if subject:
        stmt = stmt.where(LearningOutcome.subject == subject)
    if grade is not None:
        # Entries with no grade range match every grade.
        stmt = stmt.where(
            (LearningOutcome.grade_min.is_(None)) | (LearningOutcome.grade_min <= grade),
            (LearningOutcome.grade_max.is_(None)) | (LearningOutcome.grade_max >= grade),
        )
    stmt = stmt.order_by(LearningOutcome.created_at.desc()).limit(MAX_LIBRARY_SIZE)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=OutcomeResponse, status_code=201)
async def create_outcome(
    data: OutcomeCreate,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    """Save an outcome to the library. Saving the same text twice returns the existing entry."""
    text = data.text.strip()
    existing = await db.execute(
        select(LearningOutcome).where(
            LearningOutcome.teacher_id == current_user.id,
            LearningOutcome.text == text,
        )
    )
    found = existing.scalars().first()
    if found:
        return found
    if (data.grade_min is not None and data.grade_max is not None
            and data.grade_min > data.grade_max):
        raise HTTPException(status_code=422, detail="grade_min cannot be greater than grade_max")
    outcome = LearningOutcome(
        teacher_id=current_user.id,
        text=text,
        subject=data.subject,
        grade_min=data.grade_min,
        grade_max=data.grade_max,
        taxonomy_level=data.taxonomy_level,
        evidence_type=data.evidence_type,
    )
    db.add(outcome)
    await db.commit()
    await db.refresh(outcome)
    return outcome


@router.delete("/{outcome_id}", status_code=204)
async def delete_outcome(
    outcome_id: UUID,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    """Remove an outcome from the library. Activities that already copied it are unaffected."""
    result = await db.execute(
        select(LearningOutcome).where(
            LearningOutcome.id == outcome_id,
            LearningOutcome.teacher_id == current_user.id,
        )
    )
    outcome = result.scalars().first()
    if not outcome:
        raise HTTPException(status_code=404, detail="Outcome not found")
    await db.delete(outcome)
    await db.commit()
