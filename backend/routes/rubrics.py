# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1

"""Teacher rubric CRUD — Block 13d"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional, Any, Dict
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
router = APIRouter(prefix="/rubrics", tags=["rubrics"])


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


# ── AI-generated rubric criteria (Priority 2 — build_rubric_alignment_prompt()) ──
# Preview/suggest endpoint only — never saves to the DB. Registered before the
# "/{rubric_id}" parameterised routes per this repo's route-order convention
# (see PROJECT_PROFILE.md "Routing quirks").

_LEVEL_LABELS: Dict[int, str] = {4: "Exceeds", 3: "Meets", 2: "Approaching", 1: "Beginning"}


class RubricGenerateRequest(BaseModel):
    activity_title: str
    activity_description: str
    learning_objectives: List[str] = []
    subject: str
    grade_level: int
    taxonomy_type: str = "blooms"
    taxonomy_level: str = "analyze"
    existing_rubric_criteria: Optional[List[Dict[str, Any]]] = None


class GeneratedLevel(BaseModel):
    score: int
    label: str
    description: str


class GeneratedCriterion(BaseModel):
    id: str
    name: str
    description: str
    levels: List[GeneratedLevel]


class RubricGenerateResponse(BaseModel):
    criteria: List[GeneratedCriterion] = []
    error: Optional[str] = None


@router.post("/generate", response_model=RubricGenerateResponse)
async def generate_rubric_criteria(
    payload: RubricGenerateRequest,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    AI-generate draft rubric criteria (4-level descriptors) from an activity's
    title/description/objectives and taxonomy level.

    Preview/suggest only — never writes to the DB. The teacher reviews the
    returned criteria and, if satisfied, they are appended to the criteria
    already in RubricBuilder.tsx's form (never replacing what's there), then
    saved via the existing POST /rubrics create endpoint. Never raises: on
    any AI/parsing failure this returns {criteria: [], error: "..."} so the
    teacher can fall back to manual entry.

    AI-call mechanism note: same as classify_taxonomy() in routes/activities.py
    — AIRouter.complete() has no per-call temperature knob, and
    build_rubric_alignment_prompt()'s docstring calls for temperature 0.30 /
    max_tokens 1500. This endpoint uses a direct ollama.chat() call (the
    standards_parser.py fallback pattern) instead of AIRouter, matching the
    work plan's explicit fallback instruction. See
    CHANGE_SUMMARY_20260718_PROMPT_LIBRARY_REMAINING.md for the deviation
    note.
    """
    if not payload.activity_title.strip() and not payload.activity_description.strip():
        return RubricGenerateResponse(
            criteria=[],
            error="Provide at least an activity title or description to generate a rubric.",
        )

    from services.prompt_library import build_rubric_alignment_prompt, SYSTEM_STANDARDS_ANALYST
    prompt = build_rubric_alignment_prompt(
        activity_title=payload.activity_title,
        activity_description=payload.activity_description,
        learning_objectives=payload.learning_objectives or [],
        subject=payload.subject,
        grade_level=payload.grade_level,
        taxonomy_type=payload.taxonomy_type,
        taxonomy_level=payload.taxonomy_level,
        existing_rubric_criteria=payload.existing_rubric_criteria,
    )

    import json
    import re
    import uuid as _uuid

    try:
        from core.config import settings
        import ollama as _ollama

        model = settings.OLLAMA_MODEL_TEXT or "mistral"
        try:
            response = _ollama.chat(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_STANDARDS_ANALYST},
                    {"role": "user", "content": prompt},
                ],
                options={"temperature": 0.30},
            )
        except Exception as e:
            logger.error(
                "Ollama call failed during rubric generation (model=%s): %s",
                model, e, exc_info=True,
            )
            return RubricGenerateResponse(
                criteria=[],
                error=f"AI rubric generation service unavailable ({type(e).__name__}: {e}). Add criteria manually.",
            )

        raw = response["message"]["content"].strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE)

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error("Rubric generation: LLM returned invalid JSON: %s | raw: %s", e, raw[:200])
            return RubricGenerateResponse(
                criteria=[],
                error="The AI's response wasn't valid structured data. Add criteria manually.",
            )

        if not isinstance(parsed, list):
            logger.error(
                "Rubric generation: LLM did not return a JSON array (got %s) | raw: %s",
                type(parsed).__name__, raw[:200],
            )
            return RubricGenerateResponse(
                criteria=[],
                error="The AI didn't return a list of criteria as expected. Add criteria manually.",
            )

        cleaned: List[GeneratedCriterion] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            levels_raw = item.get("levels") or {}
            if not isinstance(levels_raw, dict):
                levels_raw = {}
            levels = [
                GeneratedLevel(
                    score=score,
                    label=_LEVEL_LABELS[score],
                    description=str(levels_raw.get(str(score), "")),
                )
                for score in (4, 3, 2, 1)
            ]
            cleaned.append(GeneratedCriterion(
                id=str(_uuid.uuid4()),
                name=str(item.get("name") or "Untitled Criterion")[:100],
                description=str(item.get("description") or ""),
                levels=levels,
            ))

        if not cleaned:
            logger.info("Rubric generation: LLM returned zero usable criteria")
            return RubricGenerateResponse(
                criteria=[],
                error="The AI processed the activity but didn't generate any criteria. Add criteria manually.",
            )

        logger.info("Rubric generation succeeded for user %s: %d criteria", current_user.id, len(cleaned))
        return RubricGenerateResponse(criteria=cleaned, error=None)

    except Exception as e:
        logger.error("Rubric generation failed unexpectedly: %s", e, exc_info=True)
        return RubricGenerateResponse(
            criteria=[],
            error=f"Rubric generation failed unexpectedly ({type(e).__name__}: {e}). Add criteria manually.",
        )


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
