# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Activity management endpoints - MERGED (Existing + Phase 5 + ActivityBuilder)"""

from pydantic import BaseModel as _BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, String
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import logging

from core.database import get_db
from core.config import settings
from core.dependencies import get_current_user, get_current_teacher
from core.encryption import decrypt as _decrypt
from models import User, Activity, ActivityStatus, ActivityType, Project
from models.assessment import TAXONOMY_DESCRIPTIONS
from services.polling import poll_interval_seconds
from schemas.activities import (
    ActivityCreate,
    ActivityUpdate,
    ActivityResponse,
    ActivityListResponse,
    PaginatedActivityResponse,
    SharedLibraryActivityResponse,
)
# Phase 5 imports
from schemas.activities_extended import (
    ActivityBaseExtended,
    ActivityGenerationRequest,
    ActivityGenerationResponse,
    ActivitySuggestion,
    TaxonomyFramework,
    TaxonomyInfo,
    LocationContextRequest,
    LocationContextResponse,
)
from services.wikimedia_service import get_location_context_for_activity
from services.activity_generation_service import ActivityGenerationService
from services.privacy_engine import log_access

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/activities",
    tags=["activities"],
    dependencies=[Depends(get_current_user)]
)


# ============================================================================
# HELPERS
# ============================================================================

def _require_teacher(current_user: User, detail: str = "Only teachers can perform this action") -> None:
    """Raise 403 if user is not a teacher.

    User.role is a plain VARCHAR column — compare as a string, never call .value.
    Admins are also permitted since they manage the platform.
    """
    if current_user.role.upper() not in ("TEACHER", "ADMIN", "HOMESCHOOL"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
        )


# ============================================================================
# EXISTING ENDPOINTS
# ============================================================================

@router.post("", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
async def create_activity(
    activity: ActivityCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new activity.

    Supports all 4 taxonomies + location / Ollama fields.
    """
    _require_teacher(current_user, "Only teachers can create activities")

    # Analytics-only tag: the UI locale the teacher was using at creation
    # time (sent as a plain Accept-Language value by the frontend, e.g.
    # 'es', 'fr-CA' — not the full RFC 2616 quality-weighted list format,
    # since we control the only sender). Distinct from `language` below,
    # which is a free-text, teacher-declared content language.
    created_locale = (request.headers.get("Accept-Language") or "").strip()[:10] or None

    db_activity = Activity(
        teacher_id=current_user.id,
        title=activity.title,
        description=activity.description,
        location_latitude=activity.location_latitude,
        location_longitude=activity.location_longitude,
        location_radius_meters=activity.location_radius_meters,
        location_name=activity.location_name,
        grade_level=activity.grade_level,
        subject=activity.subject,
        difficulty_level=activity.difficulty_level,
        estimated_duration_minutes=activity.estimated_duration_minutes,
        materials_needed=activity.materials_needed,
        resources=activity.resources,
        learning_objectives=activity.learning_objectives,
        curriculum_unit_ids=activity.curriculum_unit_ids,
        bloom_level=activity.bloom_level,
        # Phase 5 fields (optional, backward-compatible)
        marzano_level=getattr(activity, "marzano_level", None),
        dok_level=getattr(activity, "dok_level", None),
        solo_level=getattr(activity, "solo_level", None),
        primary_framework=getattr(activity, "primary_framework", "blooms"),
        rubric_id=getattr(activity, "rubric_id", None),
        location_context_id=getattr(activity, "location_context_id", None),
        # ActivityBuilder fields
        assessment_type=getattr(activity, "assessment_type", "formative"),
        location_info=getattr(activity, "location_info", None),
        location_wiki_data=getattr(activity, "location_wiki_data", None),
        suggested_lessons=getattr(activity, "suggested_lessons", []),
        activity_type=ActivityType(activity.activity_type.value),
        is_shareable=activity.is_shareable,
        share_scope=getattr(activity, "share_scope", "org") or "org",
        language=getattr(activity, "language", None),
        created_locale=created_locale,
        state_standard=getattr(activity, "state_standard", None),
        discipline=getattr(activity, "discipline", None),
        # Discovery / scavenger-hunt mode — only meaningful when
        # activity_type=DISCOVERY, but harmless to set regardless (columns
        # default to None/False for every other type). Previously these
        # were accepted by no schema at all and dropped before reaching
        # here even if a client tried to send them.
        discovery_mode=(activity.discovery_mode.value if getattr(activity, "discovery_mode", None) else None),
        discovery_task_description=getattr(activity, "discovery_task_description", None),
        discovery_location_required=getattr(activity, "discovery_location_required", False),
        discovery_documentation_requirements=getattr(activity, "discovery_documentation_requirements", None),
        discovery_success_criteria=getattr(activity, "discovery_success_criteria", None),
        discovery_difficulty_level=getattr(activity, "discovery_difficulty_level", None),
        discovery_time_limit_minutes=getattr(activity, "discovery_time_limit_minutes", None),
        discovery_location_gps_capture_enabled=getattr(activity, "discovery_location_gps_capture_enabled", True),
        discovery_location_sharing_rules=getattr(activity, "discovery_location_sharing_rules", None),
        status=ActivityStatus.DRAFT,
    )

    db.add(db_activity)
    await db.commit()
    await db.refresh(db_activity)

    logger.info(f"Created activity: {db_activity.id} by teacher {current_user.id}")

    return db_activity


@router.get("", response_model=PaginatedActivityResponse)
async def list_activities(
    status_filter: Optional[str] = Query(None, alias="status"),
    subject: Optional[str] = Query(None),
    grade_level: Optional[int] = Query(None),
    difficulty: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List activities for the current teacher."""
    _require_teacher(current_user, "Only teachers can view activities")

    # Build dynamic WHERE conditions
    conditions = [Activity.teacher_id == current_user.id]

    if status_filter:
        try:
            status_enum = ActivityStatus(status_filter)
            conditions.append(Activity.status == status_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {status_filter}",
            )

    if subject:
        conditions.append(Activity.subject.ilike(f"%{subject}%"))

    if grade_level:
        conditions.append(Activity.grade_level == grade_level)

    if difficulty:
        conditions.append(Activity.difficulty_level == difficulty)

    # Count total rows matching filters
    count_result = await db.execute(
        select(func.count()).select_from(Activity).where(*conditions)
    )
    total = count_result.scalar()

    # Fetch paginated rows
    offset = (page - 1) * page_size
    rows_result = await db.execute(
        select(Activity)
        .where(*conditions)
        .order_by(Activity.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    activities = rows_result.scalars().all()

    total_pages = (total + page_size - 1) // page_size

    return PaginatedActivityResponse(
        items=[ActivityListResponse.from_orm(a) for a in activities],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/shared-library", response_model=List[SharedLibraryActivityResponse])
async def get_shared_library_early(
    scope: Optional[str] = Query(None, description="'org' or 'all'; default: show both scopes accessible to user"),
    subject: Optional[str] = Query(None),
    grade_level: Optional[int] = Query(None),
    language: Optional[str] = Query(None),
    state_standard: Optional[str] = Query(None),
    discipline: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return published, shareable activities from all teachers.
    NOTE: This route must appear before /{activity_id} to avoid route shadowing.
    Delegates to the canonical get_shared_library implementation below.
    """
    return await get_shared_library(
        scope=scope, subject=subject, grade_level=grade_level,
        language=language, state_standard=state_standard, discipline=discipline,
        search=search, page=page, page_size=page_size,
        current_user=current_user, db=db,
    )


@router.get("/{activity_id}", response_model=ActivityResponse)
async def get_activity(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get activity details."""
    result = await db.execute(select(Activity).where(Activity.id == activity_id))
    activity = result.scalar_one_or_none()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    # Check ownership or published status
    if activity.teacher_id != current_user.id and activity.status != ActivityStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this activity",
        )

    # Increment view count for non-owners
    if activity.teacher_id != current_user.id:
        activity.view_count += 1
        await db.commit()

    # Privacy audit — teacher viewing activity data
    try:
        await log_access(
            actor_id=str(current_user.id),
            actor_role=current_user.role.lower() if current_user.role else "teacher",
            action="TEACHER_VIEW",
            data_type="activity",
            student_id=None,
            rules_applied=[],
            compliance_status="COMPLIANT",
            db=db,
            notes=f"activity_id={activity_id}",
        )
    except Exception as _audit_err:
        logger.warning("Privacy audit failed (non-blocking): %s", _audit_err)

    return activity


@router.put("/{activity_id}", response_model=ActivityResponse)
async def update_activity(
    activity_id: UUID,
    activity_update: ActivityUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an activity.

    Supports all 4 taxonomy levels, location info, AI lesson suggestions,
    and assessment type.
    """
    result = await db.execute(select(Activity).where(Activity.id == activity_id))
    activity = result.scalar_one_or_none()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    if activity.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own activities",
        )

    update_data = activity_update.dict(exclude_unset=True)

    # Convert enum values
    if "activity_type" in update_data and update_data["activity_type"]:
        update_data["activity_type"] = ActivityType(update_data["activity_type"].value)

    # Handle ActivityBuilder fields explicitly
    for field in ("assessment_type", "location_info", "suggested_lessons"):
        if field in update_data:
            setattr(activity, field, update_data.pop(field))

    for field, value in update_data.items():
        setattr(activity, field, value)

    # DB column is TIMESTAMP WITHOUT TIME ZONE (see database/init.sql and
    # models/database.py's Activity.updated_at = Column(DateTime, ...) with
    # no timezone=True). asyncpg refuses to bind a timezone-AWARE datetime
    # to that column ("can't subtract offset-naive and offset-aware
    # datetimes"), which was silently 500ing every activity update/publish/
    # archive/media-upload call. Use naive UTC (matching the ORM's own
    # default=datetime.utcnow) instead of datetime.now(timezone.utc).
    activity.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(activity)

    logger.info(f"Updated activity: {activity_id}")

    return activity


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an activity."""
    result = await db.execute(select(Activity).where(Activity.id == activity_id))
    activity = result.scalar_one_or_none()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    if activity.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own activities",
        )

    await db.delete(activity)
    await db.commit()

    logger.info(f"Deleted activity: {activity_id}")


@router.post("/{activity_id}/publish")
async def publish_activity(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Publish an activity (make it visible to others).

    Privacy compliance check runs before saving:
    - BLOCK (issues returned): returns HTTP 422 — activity not published.
    - WARNING only: publishes and includes warnings in response body.
    - Check error / unavailable: fails open — publishes without warnings.
    """
    result = await db.execute(select(Activity).where(Activity.id == activity_id))
    activity = result.scalar_one_or_none()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    if activity.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only publish your own activities",
        )

    if not activity.title or not activity.description:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Activity must have a title and description before publishing",
        )

    # ── Privacy compliance check ──────────────────────────────────────────────
    # Determine data categories based on grade level (younger students = more
    # sensitive data collection flags that trigger stricter compliance rules).
    compliance_warnings: list = []
    try:
        from services.privacy_engine import get_privacy_checker
        checker = get_privacy_checker()
        await checker.load_from_db(db)
        grade = activity.grade_level or 9
        activity_data = {
            "data_collection": (
                ["location", "audio", "photo", "behavioral"]
                if grade <= 8
                else ["location"]
            ),
            "third_parties": [],
            "purpose": "educational",
        }
        # student_age proxy: grade + 5 years is a common approximation
        student_age_proxy = min(grade + 5, 18)
        is_compliant, issues, warnings = checker.check_activity_compliance(
            str(activity.id),
            activity_data,
            student_age_proxy,
            settings.ACTIVE_JURISDICTION,
        )
        # Sentinel issues mean the checker could not determine which
        # jurisdiction's rules to apply (no jurisdiction resolved, or the
        # resolved jurisdiction isn't a known/seeded one) — that is not a
        # real compliance violation. Filter them out before deciding whether
        # to block, so an unresolved jurisdiction fails open (per this
        # endpoint's own docstring) instead of hard-blocking every publish.
        genuine_issues = [
            i for i in issues
            if str(i) != "No jurisdiction configured"
            and not str(i).startswith("Unknown jurisdiction:")
        ]
        if genuine_issues:
            # Hard BLOCK — do not publish
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "This activity cannot be published: data collection is "
                    "restricted in the selected jurisdiction. "
                    f"Issues: {'; '.join(str(i) for i in genuine_issues)}"
                ),
            )
        elif issues and not genuine_issues:
            logger.warning(
                f"Privacy compliance check could not resolve a jurisdiction for "
                f"activity {activity.id} — publishing without a compliance verdict"
            )
        if warnings:
            compliance_warnings = [str(w) for w in warnings]
    except HTTPException:
        raise  # re-raise the 422 we just built
    except Exception as ce:
        logger.warning(f"Privacy compliance check failed (fail-open): {ce}")

    # ── Save published status ─────────────────────────────────────────────────
    activity.status = ActivityStatus.PUBLISHED
    # DB column is TIMESTAMP WITHOUT TIME ZONE (see database/init.sql and
    # models/database.py's Activity.updated_at = Column(DateTime, ...) with
    # no timezone=True). asyncpg refuses to bind a timezone-AWARE datetime
    # to that column ("can't subtract offset-naive and offset-aware
    # datetimes"), which was silently 500ing every activity update/publish/
    # archive/media-upload call. Use naive UTC (matching the ORM's own
    # default=datetime.utcnow) instead of datetime.now(timezone.utc).
    activity.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(activity)

    logger.info(f"Published activity: {activity_id}")

    response = ActivityResponse.from_orm(activity)
    response_data = response.dict()
    if compliance_warnings:
        response_data["warnings"] = compliance_warnings
    return response_data


@router.post("/{activity_id}/archive", response_model=ActivityResponse)
async def archive_activity(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Archive an activity (hide from students)."""
    result = await db.execute(select(Activity).where(Activity.id == activity_id))
    activity = result.scalar_one_or_none()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    if activity.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only archive your own activities",
        )

    activity.status = ActivityStatus.ARCHIVED
    # DB column is TIMESTAMP WITHOUT TIME ZONE (see database/init.sql and
    # models/database.py's Activity.updated_at = Column(DateTime, ...) with
    # no timezone=True). asyncpg refuses to bind a timezone-AWARE datetime
    # to that column ("can't subtract offset-naive and offset-aware
    # datetimes"), which was silently 500ing every activity update/publish/
    # archive/media-upload call. Use naive UTC (matching the ORM's own
    # default=datetime.utcnow) instead of datetime.now(timezone.utc).
    activity.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(activity)

    logger.info(f"Archived activity: {activity_id}")

    return activity


# ============================================================================
# PHASE 5 ENDPOINTS
# ============================================================================

@router.post("/generate-suggestions", response_model=ActivityGenerationResponse)
async def generate_draft_activity_suggestions(
    request: ActivityGenerationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate AI activity suggestions while still drafting an activity —
    no saved activity_id required (see /{activity_id}/generate-suggestions
    below for regenerating on an already-saved activity).

    Backs the activity builder's AI sidebar: whatever of subject/objective
    (grade level)/location the teacher has filled in so far is used as-is;
    location is optional (some activities are intentionally place-generic).
    """
    _require_teacher(current_user, "Only teachers can generate activities")

    import time
    started = time.monotonic()

    # generate_activity_suggestions() takes bloom_level (singular — not
    # "blooms_level", unlike TaxonomyFramework.BLOOMS.value) / marzano_level /
    # dok_level / solo_level as separate kwargs; CUSTOM has no matching kwarg.
    _TAXONOMY_LEVEL_KWARG = {
        TaxonomyFramework.BLOOMS: "bloom_level",
        TaxonomyFramework.MARZANO: "marzano_level",
        TaxonomyFramework.DOK: "dok_level",
        TaxonomyFramework.SOLO: "solo_level",
    }
    taxonomy_kwargs: Dict[str, Any] = {}
    if request.desired_taxonomy_level is not None:
        kwarg_name = _TAXONOMY_LEVEL_KWARG.get(request.taxonomy_framework)
        if kwarg_name:
            taxonomy_kwargs[kwarg_name] = request.desired_taxonomy_level

    service = ActivityGenerationService(llm_provider=settings.LLM_PROVIDER.lower())

    generation_result = await service.generate_activity_suggestions(
        subject=request.subject,
        grade_level=request.grade_level,
        location_name=request.location_name,
        latitude=request.location_latitude,
        longitude=request.location_longitude,
        additional_context=request.additional_context,
        db=db,
        num_suggestions=request.activity_count,
        **taxonomy_kwargs,
    )

    if not generation_result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=generation_result.get("error", "Generation failed"),
        )

    suggestions = [
        ActivitySuggestion(
            title=s.get("title", "Activity Suggestion"),
            description=s.get("description", ""),
            learning_objectives=s.get("learning_objectives", []),
            estimated_duration_minutes=s.get("estimated_duration_minutes", 90),
            # Suggestion carries a 1-6 Bloom's level; this schema's
            # difficulty_level is 1-5 — clamp rather than invent a second
            # LLM-derived field for what is, for this UI, the same signal.
            difficulty_level=min(5, max(1, s.get("bloom_level", 3))),
            bloom_level=s.get("bloom_level", 3),
            marzano_level=s.get("marzano_level"),
            dok_level=s.get("dok_level"),
            solo_level=s.get("solo_level"),
            materials_needed=s.get("materials_needed", []),
            location_context_summary=s.get("reasoning"),
        )
        for s in generation_result.get("suggestions", [])
    ]

    return ActivityGenerationResponse(
        suggestions=suggestions,
        location_name=generation_result.get("location", {}).get("name") or "No specific location",
        subject=request.subject,
        grade_level=request.grade_level,
        taxonomy_framework=request.taxonomy_framework,
        provider=generation_result.get("llm_model", service.llm_provider),
        model=settings.CLAUDE_MODEL if service.llm_provider == "claude" else settings.OLLAMA_MODEL_TEXT,
        generation_time_ms=int((time.monotonic() - started) * 1000),
    )


@router.post("/{activity_id}/location-context", response_model=Dict[str, Any])
async def get_location_context(
    activity_id: UUID,
    request: LocationContextRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get WikiLocation context for an activity location (Phase 5).

    Fetches Wikipedia / Wikimedia data about the location.
    Returns a raw dict because the service response shape is finalized
    alongside the wikimedia_service integration.
    """
    _require_teacher(current_user, "Only teachers can access location context")

    try:
        context = await get_location_context_for_activity(
            latitude=request.latitude,
            longitude=request.longitude,
            radius_meters=request.radius_meters,
        )

        logger.info(f"Retrieved location context for activity {activity_id}")

        # Pass the service response through; callers should treat this as
        # an opaque dict until the wikimedia_service API is stabilised.
        return {
            "activity_id": str(activity_id),
            "location_name": request.location_name,
            "latitude": request.latitude,
            "longitude": request.longitude,
            **context,
        }

    except Exception as e:
        logger.error(f"Error getting location context: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get location context: {str(e)}",
        )


@router.post("/{activity_id}/generate-suggestions", response_model=Dict[str, Any])
async def generate_activity_suggestions(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate AI activity suggestions for an existing activity (Phase 5).

    Uses Ollama / Claude to generate location-based lesson suggestions.
    Returns a raw dict because the ActivityGenerationService response shape
    is finalised alongside the service integration.
    """
    _require_teacher(current_user, "Only teachers can generate activities")

    result = await db.execute(select(Activity).where(Activity.id == activity_id))
    activity = result.scalar_one_or_none()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    if activity.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only generate suggestions for your own activities",
        )

    try:
        logger.info(f"Generating suggestions for activity {activity_id}")

        service = ActivityGenerationService(
            llm_provider=settings.LLM_PROVIDER.lower()
        )

        generation_result = await service.generate_activity_suggestions(
            location_name=activity.location_name,
            latitude=activity.location_latitude,
            longitude=activity.location_longitude,
            subject=activity.subject,
            grade_level=activity.grade_level,
            bloom_level=activity.bloom_level,
            marzano_level=getattr(activity, "marzano_level", None),
            dok_level=getattr(activity, "dok_level", None),
            solo_level=getattr(activity, "solo_level", None),
            curriculum_titles=activity.curriculum_unit_ids,
            db=db,
            num_suggestions=3,
        )

        if not generation_result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=generation_result.get("error", "Generation failed"),
            )

        return generation_result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating activity suggestions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate activity suggestions: {str(e)}",
        )


@router.get("/{activity_id}/taxonomy-alignment")
async def get_activity_taxonomy_alignment(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get complete taxonomy alignment for an activity (Phase 5).

    Returns all 4 taxonomy levels with descriptions.
    """
    result = await db.execute(select(Activity).where(Activity.id == activity_id))
    activity = result.scalar_one_or_none()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    if activity.teacher_id != current_user.id and activity.status != ActivityStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this activity",
        )

    try:
        taxonomies: Dict[str, Any] = {}

        if activity.bloom_level:
            bloom_info = TAXONOMY_DESCRIPTIONS.get("blooms", {}).get(activity.bloom_level, {})
            taxonomies["bloom"] = TaxonomyInfo(
                framework=TaxonomyFramework.BLOOMS,
                level=activity.bloom_level,
                label=bloom_info.get("name", "Unknown"),
                description=bloom_info.get("description", ""),
                verbs=bloom_info.get("verbs", []),
            )

        if getattr(activity, "marzano_level", None):
            marzano_info = TAXONOMY_DESCRIPTIONS.get("marzano", {}).get(activity.marzano_level, {})
            taxonomies["marzano"] = TaxonomyInfo(
                framework=TaxonomyFramework.MARZANO,
                level=activity.marzano_level,
                label=marzano_info.get("name", "Unknown"),
                description=marzano_info.get("description", ""),
                verbs=marzano_info.get("verbs", []),
            )

        if getattr(activity, "dok_level", None):
            dok_info = TAXONOMY_DESCRIPTIONS.get("dok", {}).get(activity.dok_level, {})
            taxonomies["dok"] = TaxonomyInfo(
                framework=TaxonomyFramework.DOK,
                level=activity.dok_level,
                label=dok_info.get("name", "Unknown"),
                description=dok_info.get("description", ""),
                verbs=dok_info.get("verbs", []),
            )

        if getattr(activity, "solo_level", None):
            solo_info = TAXONOMY_DESCRIPTIONS.get("solo", {}).get(activity.solo_level, {})
            taxonomies["solo"] = TaxonomyInfo(
                framework=TaxonomyFramework.SOLO,
                level=activity.solo_level,
                label=solo_info.get("name", "Unknown"),
                description=solo_info.get("description", ""),
                verbs=solo_info.get("verbs", []),
            )

        return {
            "activity_id": str(activity.id),
            "title": activity.title,
            "subject": activity.subject,
            "grade_level": activity.grade_level,
            "primary_framework": getattr(activity, "primary_framework", "blooms"),
            "taxonomies": {k: v.dict() for k, v in taxonomies.items()},
        }

    except Exception as e:
        logger.error(f"Error fetching taxonomy alignment: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch taxonomy alignment",
        )


@router.get("/generation/status")
async def generation_service_status(
    current_user: User = Depends(get_current_user),
):
    """Check availability and status of the activity generation service (Phase 5)."""
    try:
        # Instantiating the service validates provider config
        ActivityGenerationService(llm_provider=settings.LLM_PROVIDER.lower())

        return {
            "service": "activity_generation",
            "available": True,
            "llm_provider": settings.LLM_PROVIDER.lower(),
            "models": {
                "text": (
                    settings.OLLAMA_MODEL_TEXT
                    if settings.LLM_PROVIDER.lower() == "ollama"
                    else settings.CLAUDE_MODEL
                )
            },
            "features": {
                "wikimedia_integration": True,
                "taxonomy_support": ["blooms", "marzano", "dok", "solo"],
                "location_aware": True,
                "assessment_types": [
                    "formative",
                    "summative",
                    "diagnostic",
                    "performance-based",
                ],
            },
        }

    except Exception as e:
        logger.error(f"Error checking generation status: {e}")
        return {
            "service": "activity_generation",
            "available": False,
            "error": str(e),
        }


# ============================================================================
# TEACHER DASHBOARD / ADMIN SUMMARY ENDPOINTS
# Added for Block 9 — frontend dashboard pages
# ============================================================================

from models.database import LearningSession, Class, StudentProfile


@router.get("/teacher/dashboard")
async def teacher_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Summary stats for TeacherDashboard page."""
    # Activity counts
    total_act = (await db.execute(
        select(func.count()).where(Activity.teacher_id == current_user.id)
    )).scalar() or 0

    published_act = (await db.execute(
        select(func.count()).where(
            Activity.teacher_id == current_user.id,
            Activity.status == ActivityStatus.PUBLISHED,
        )
    )).scalar() or 0

    # Recent activities (last 5) — raw SQL avoids missing-column errors on old volumes
    recent_result = await db.execute(
        text("SELECT id, title, status, subject, created_at FROM activities "
             "WHERE teacher_id = :tid ORDER BY created_at DESC LIMIT 5"),
        {"tid": current_user.id},
    )
    recent = recent_result.mappings().all()

    # Distinct students who started a session on this teacher's activities
    student_count = (await db.execute(
        text("SELECT COUNT(DISTINCT ls.user_id) FROM learning_sessions ls "
             "JOIN activities a ON ls.activity_id = a.id "
             "WHERE a.teacher_id = :tid"),
        {"tid": current_user.id},
    )).scalar() or 0

    # Class count — raw SQL avoids mapper issues on fresh volumes
    try:
        class_count = (await db.execute(
            text("SELECT COUNT(*) FROM classes WHERE teacher_id = :tid AND is_active = true"),
            {"tid": current_user.id}
        )).scalar() or 0
    except Exception:
        class_count = 0

    # Pending submissions count
    try:
        pending_sub_count = (await db.execute(
            text("SELECT COUNT(*) FROM learning_sessions ls "
                 "JOIN activities a ON ls.activity_id = a.id "
                 "WHERE a.teacher_id = :tid AND ls.status = 'completed'"),
            {"tid": current_user.id},
        )).scalar() or 0
    except Exception:
        pending_sub_count = 0

    return {
        # Field names match TeacherDashboardData frontend type
        "total_students": student_count,
        "total_classes": class_count,
        "active_activities": published_act,
        "pending_submissions": pending_sub_count,
        "activities": [
            {
                "id": str(a["id"]),
                "title": a["title"],
                "status": a["status"],
                "subject": a["subject"],
                "created_at": a["created_at"].isoformat() if a["created_at"] else None,
                "student_count": 0,
                "submissions_count": 0,
            }
            for a in recent
        ],
        "classes": [],
        "recent_submissions": [],
    }


@router.get("/teacher/submissions")
async def teacher_submissions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List completed/in-progress sessions on this teacher's activities."""
    result = await db.execute(
        text("""
            SELECT
                ls.id          AS session_id,
                ls.user_id     AS student_id,
                ls.status,
                ls.created_at  AS started_at,
                a.id           AS activity_id,
                a.title        AS activity_title,
                u.first_name,
                u.last_name,
                u.email        AS student_email
            FROM learning_sessions ls
            JOIN activities a ON ls.activity_id = a.id
            JOIN users u      ON ls.user_id     = u.id
            WHERE a.teacher_id = :teacher_id
            ORDER BY ls.created_at DESC
            OFFSET :skip LIMIT :limit
        """),
        {"teacher_id": current_user.id, "skip": skip, "limit": limit},
    )
    rows = result.mappings().all()

    return [
        {
            "session_id": str(r["session_id"]),
            "student_id": str(r["student_id"]),
            "student_name": f"{r['first_name']} {r['last_name']}",
            # u.email is an EncryptedString column — raw SQL bypasses the ORM
            # TypeDecorator, so it must be decrypted here.
            "student_email": _decrypt(r["student_email"]) if r["student_email"] else r["student_email"],
            "activity_id": str(r["activity_id"]),
            "activity_title": r["activity_title"],
            "status": r["status"],
            "started_at": r["started_at"].isoformat() if r["started_at"] else None,
        }
        for r in rows
    ]


@router.get("/teacher/students")
async def teacher_students(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List distinct students who have sessions on this teacher's activities."""
    result = await db.execute(
        text("""
            SELECT DISTINCT u.id, u.email, u.first_name, u.last_name,
                   u.full_name, u.role, u.is_active
            FROM users u
            JOIN learning_sessions ls ON ls.user_id = u.id
            JOIN activities a         ON ls.activity_id = a.id
            WHERE a.teacher_id = :tid
            ORDER BY u.last_name, u.first_name
        """),
        {"tid": current_user.id},
    )
    students = result.mappings().all()

    return [
        {
            "id": str(s["id"]),
            # u.email / u.full_name are EncryptedString columns — raw SQL
            # bypasses the ORM TypeDecorator, so they must be decrypted here.
            "email": _decrypt(s["email"]) if s["email"] else s["email"],
            "first_name": s["first_name"],
            "last_name": s["last_name"],
            "full_name": _decrypt(s["full_name"]) if s["full_name"] else s["full_name"],
            "role": s["role"],
            "is_active": s["is_active"],
        }
        for s in students
    ]


@router.get("/teacher/classes")
async def teacher_classes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List this teacher's active classes."""
    result = await db.execute(
        select(Class)
        .where(Class.teacher_id == current_user.id, Class.is_active == True)
        .order_by(Class.name)
    )
    classes = result.scalars().all()

    return [
        {
            "id": str(c.id),
            "name": c.name,
            "description": c.description,
            "grade_level": c.grade_level,
            "school_year": c.school_year,
            "is_active": c.is_active,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in classes
    ]


@router.get("/teacher/active-sessions")
async def teacher_active_sessions(
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    Currently in-progress field sessions on this teacher's activities, for
    live tracking (mobile teacher dashboard + web SessionMonitor).

    latitude/longitude reflect the session's start location (set once, at
    session creation) — the actual moving position comes from polling
    GET /api/v1/sessions/{session_id}/events for 'location_update' events,
    same as web's useSessionWebSocket hook. This endpoint is just "who's
    currently in the field, and where did they start" so a teacher can pick
    which session to watch closely.
    """
    result = await db.execute(
        text("""
            SELECT
                ls.id AS session_id, ls.user_id AS student_id, ls.status,
                ls.created_at AS started_at, ls.latitude, ls.longitude, ls.location_name,
                a.id AS activity_id, a.title AS activity_title, a.estimated_duration_minutes,
                u.first_name, u.last_name,
                EXISTS (
                    SELECT 1 FROM project_activities pa WHERE pa.activity_id = a.id
                ) AS in_project
            FROM learning_sessions ls
            JOIN activities a ON ls.activity_id = a.id
            JOIN users u ON ls.user_id = u.id
            WHERE a.teacher_id = :tid AND ls.status = 'in_progress' AND ls.is_active = true
            ORDER BY ls.created_at DESC
        """),
        {"tid": current_user.id},
    )
    rows = result.mappings().all()
    return [
        {
            "session_id": str(r["session_id"]),
            "student_id": str(r["student_id"]),
            "student_name": f"{r['first_name']} {r['last_name']}".strip(),
            "activity_id": str(r["activity_id"]),
            "activity_title": r["activity_title"],
            "status": r["status"],
            "started_at": r["started_at"].isoformat() if r["started_at"] else None,
            "latitude": r["latitude"],
            "longitude": r["longitude"],
            "location_name": r["location_name"],
            # Overview cadence, for this list's own refresh loop.
            "poll_interval_seconds": poll_interval_seconds(
                r["estimated_duration_minutes"], r["in_project"], detail=False
            ),
            # Detail cadence, carried through as a nav param when a row is
            # tapped so session-monitor/[id].tsx doesn't need its own lookup.
            "detail_poll_interval_seconds": poll_interval_seconds(
                r["estimated_duration_minutes"], r["in_project"], detail=True
            ),
        }
        for r in rows
    ]


class BulkTrackingUpdateRequest(_BaseModel):
    activity_ids: List[UUID]
    gps_enabled: bool


@router.get("/teacher/tracking-settings")
async def teacher_tracking_settings(
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    Account-level view of GPS live-tracking across every one of this
    teacher's activities, for the unified tracking-settings page — today
    tracking is otherwise only visible/configurable one activity at a time
    in ActivityManager's Location tab, with no way to see or bulk-change
    what's currently on across a whole account (WORK_TRACKING.md Session 47
    item 4). Each row also carries the same tiered-polling cadence teacher_
    active_sessions computes (services/polling.py), so a teacher can see
    which activities would poll at the fast "trip" cadence vs the slower
    "long-running" one if tracking were active right now.
    """
    result = await db.execute(
        text("""
            SELECT
                a.id AS activity_id, a.title, a.subject, a.grade_level, a.status,
                a.estimated_duration_minutes, a.discovery_location_gps_capture_enabled AS gps_enabled,
                p.id AS project_id, p.title AS project_title
            FROM activities a
            LEFT JOIN project_activities pa ON pa.activity_id = a.id
            LEFT JOIN projects p ON p.id = pa.project_id
            WHERE a.teacher_id = :tid AND a.is_active = true
            ORDER BY a.title
        """),
        {"tid": current_user.id},
    )
    rows = result.mappings().all()
    return [
        {
            "activity_id": str(r["activity_id"]),
            "title": r["title"],
            "subject": r["subject"],
            "grade_level": r["grade_level"],
            "status": r["status"],
            "gps_enabled": bool(r["gps_enabled"]),
            "project_id": str(r["project_id"]) if r["project_id"] else None,
            "project_title": r["project_title"],
            "poll_interval_seconds": poll_interval_seconds(
                r["estimated_duration_minutes"], r["project_id"] is not None, detail=False
            ),
        }
        for r in rows
    ]


@router.patch("/teacher/tracking-settings/bulk")
async def bulk_update_tracking_settings(
    request: BulkTrackingUpdateRequest,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    Turn GPS live-tracking on/off for several activities at once — the
    "bulk control" half of the gap above. Per-activity toggling already
    works through the ordinary PATCH /activities/{id} (ActivityUpdate now
    declares discovery_location_gps_capture_enabled -- see schemas/
    activities.py); this is only for the multi-select bulk action.
    """
    if not request.activity_ids:
        return {"updated": 0}

    result = await db.execute(
        text("""
            UPDATE activities
            SET discovery_location_gps_capture_enabled = :enabled, updated_at = NOW()
            WHERE teacher_id = :tid AND id = ANY(CAST(:ids AS uuid[]))
        """),
        {
            "enabled": request.gps_enabled,
            "tid": current_user.id,
            "ids": [str(i) for i in request.activity_ids],
        },
    )
    await db.commit()
    return {"updated": result.rowcount}


# ── Submission review endpoints (called by TeacherSubmissionsPage) ────────────
#
# These operate on learning_sessions (which the teacher submissions list returns)
# and upsert into activity_submissions for phase tracking.

class FieldReviewRequest(_BaseModel):
    feedback:       str  = ""
    approve:        bool = False  # True = explicitly unlock reflection (gated mode)
    reject:         bool = False  # True = send back for more field work


class FinalReviewRequest(_BaseModel):
    feedback: str  = ""
    score:    int  = 4


def _now():
    return datetime.now(timezone.utc)


async def _upsert_submission(db: AsyncSession, session_id: str, student_id: str,
                             activity_id: str) -> dict:
    """Return existing activity_submission row or create one, as a dict."""
    row = (await db.execute(
        text("SELECT id FROM activity_submissions WHERE session_id = :sid"),
        {"sid": session_id},
    )).first()
    if row:
        return {"id": str(row[0])}
    await db.execute(
        text("""
            INSERT INTO activity_submissions
                (id, student_id, activity_id, session_id,
                 submission_status, completion_phase,
                 field_phase_status, reflection_status,
                 created_at, updated_at)
            SELECT
                uuid_generate_v4(), :student_id, :activity_id, :session_id,
                'submitted',
                CASE WHEN a.completion_mode = 'field_and_reflection'
                     THEN 'field_work' ELSE 'complete' END,
                CASE WHEN a.completion_mode = 'field_and_reflection'
                     THEN 'submitted' ELSE 'not_applicable' END,
                CASE WHEN a.completion_mode = 'field_and_reflection'
                     THEN 'not_started' ELSE 'not_applicable' END,
                NOW(), NOW()
            FROM activities a WHERE a.id = :activity_id
        """),
        {"student_id": student_id, "activity_id": activity_id, "session_id": session_id},
    )
    await db.commit()
    row = (await db.execute(
        text("SELECT id FROM activity_submissions WHERE session_id = :sid"),
        {"sid": session_id},
    )).first()
    return {"id": str(row[0])}


@router.post("/teacher/submissions/{session_id}/approve")
async def approve_submission(
    session_id: str,
    body: FinalReviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve final submission — mark session graded, write teacher feedback."""
    # Verify session belongs to this teacher's activity
    row = (await db.execute(
        text("""
            SELECT ls.user_id, ls.activity_id
            FROM   learning_sessions ls
            JOIN   activities a ON a.id = ls.activity_id
            WHERE  ls.id = :sid AND a.teacher_id = :tid
        """),
        {"sid": session_id, "tid": str(current_user.id)},
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    sub = await _upsert_submission(db, session_id, str(row[0]), str(row[1]))

    await db.execute(
        text("""
            UPDATE activity_submissions
            SET    submission_status = 'graded',
                   completion_phase  = 'complete',
                   teacher_feedback  = :feedback,
                   grade             = :score,
                   graded_at         = NOW(),
                   updated_at        = NOW()
            WHERE  id = :sub_id
        """),
        {"feedback": body.feedback, "score": body.score, "sub_id": sub["id"]},
    )
    await db.execute(
        text("UPDATE learning_sessions SET status = 'completed' WHERE id = :sid"),
        {"sid": session_id},
    )
    await db.commit()
    return {"status": "approved", "submission_id": sub["id"]}


@router.post("/teacher/submissions/{session_id}/reject")
async def reject_submission(
    session_id: str,
    body: FinalReviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject final submission with feedback."""
    row = (await db.execute(
        text("""
            SELECT ls.user_id, ls.activity_id
            FROM   learning_sessions ls
            JOIN   activities a ON a.id = ls.activity_id
            WHERE  ls.id = :sid AND a.teacher_id = :tid
        """),
        {"sid": session_id, "tid": str(current_user.id)},
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    sub = await _upsert_submission(db, session_id, str(row[0]), str(row[1]))

    await db.execute(
        text("""
            UPDATE activity_submissions
            SET    submission_status = 'draft',
                   teacher_feedback  = :feedback,
                   updated_at        = NOW()
            WHERE  id = :sub_id
        """),
        {"feedback": body.feedback, "sub_id": sub["id"]},
    )
    await db.commit()
    return {"status": "rejected", "submission_id": sub["id"]}


@router.post("/teacher/submissions/{session_id}/review-field")
async def review_field_phase(
    session_id: str,
    body: FieldReviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Teacher reviews the field work phase of a Field + Reflection activity.

    - Always saves field_phase_feedback.
    - If body.approve = True  → sets field_phase_status='approved', unlocks reflection.
    - If body.reject = True   → sets field_phase_status='rejected', sends back to student.
    - Otherwise               → sets field_phase_status='reviewed' (student can still proceed
                                 if require_field_approval=FALSE on the activity).
    """
    row = (await db.execute(
        text("""
            SELECT ls.user_id, ls.activity_id, a.completion_mode, a.require_field_approval
            FROM   learning_sessions ls
            JOIN   activities a ON a.id = ls.activity_id
            WHERE  ls.id = :sid AND a.teacher_id = :tid
        """),
        {"sid": session_id, "tid": str(current_user.id)},
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    if row[2] != "field_and_reflection":
        raise HTTPException(status_code=400, detail="Activity is not Field + Reflection type")

    sub = await _upsert_submission(db, session_id, str(row[0]), str(row[1]))

    if body.reject:
        new_field_status = "rejected"
    elif body.approve:
        new_field_status = "approved"
    else:
        new_field_status = "reviewed"

    await db.execute(
        text("""
            UPDATE activity_submissions
            SET    field_phase_status      = :field_status,
                   field_phase_feedback    = :feedback,
                   field_phase_reviewed_at = NOW(),
                   updated_at              = NOW()
            WHERE  id = :sub_id
        """),
        {"field_status": new_field_status, "feedback": body.feedback, "sub_id": sub["id"]},
    )
    await db.commit()
    return {"status": new_field_status, "submission_id": sub["id"]}


@router.get("/teacher/submissions/{session_id}/detail")
async def submission_detail(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full submission detail including field phase and reflection status."""
    row = (await db.execute(
        text("""
            SELECT
                ls.id             AS session_id,
                ls.user_id        AS student_id,
                ls.status         AS session_status,
                ls.created_at     AS started_at,
                ls.completed_at,
                ls.evidence,
                a.id              AS activity_id,
                a.title           AS activity_title,
                a.completion_mode,
                a.require_field_approval,
                u.first_name, u.last_name,
                sub.id                    AS sub_id,
                sub.submission_status,
                sub.completion_phase,
                sub.field_phase_status,
                sub.field_phase_feedback,
                sub.field_phase_reviewed_at,
                sub.reflection_status,
                sub.reflection_content,
                sub.linked_field_note_id,
                sub.teacher_feedback,
                sub.grade
            FROM learning_sessions ls
            JOIN activities a  ON a.id  = ls.activity_id
            JOIN users u       ON u.id  = ls.user_id
            LEFT JOIN activity_submissions sub ON sub.session_id = ls.id
            WHERE ls.id = :sid AND a.teacher_id = :tid
        """),
        {"sid": session_id, "tid": str(current_user.id)},
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id":             str(row[0]),
        "student_id":             str(row[1]),
        "student_name":           f"{row[10]} {row[11]}",
        "session_status":         row[2],
        "started_at":             row[3].isoformat() if row[3] else None,
        "completed_at":           row[4].isoformat() if row[4] else None,
        "evidence":               row[5] or [],
        "activity_id":            str(row[6]),
        "activity_title":         row[7],
        "completion_mode":        row[8],
        "require_field_approval": row[9],
        "submission_id":          str(row[12]) if row[12] else None,
        "submission_status":      row[13],
        "completion_phase":       row[14],
        "field_phase_status":     row[15],
        "field_phase_feedback":   row[16],
        "field_phase_reviewed_at":row[17].isoformat() if row[17] else None,
        "reflection_status":      row[18],
        "reflection_content":     row[19],
        "linked_field_note_id":   str(row[20]) if row[20] else None,
        "teacher_feedback":       row[21],
        "grade":                  row[22],
    }


# ── Privacy compliance check for ActivityManager badge ────────────────────────


class ComplianceCheckRequest(_BaseModel):
    location_name: str = ""
    grade_level: int = 0
    data_types: list = []

@router.post("/check-compliance")
async def check_activity_compliance_quick(
    payload: ComplianceCheckRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lightweight compliance pre-check for the ActivityManager badge.
    Returns: { status: 'compliant'|'review'|'blocked', issues: [...] }
    """
    try:
        from services.privacy_engine import get_privacy_checker
        checker = get_privacy_checker()
        await checker.load_from_db(db)
        activity_data = {
            "data_collection": payload.data_types or ["location"],
            "third_parties": [],
            "purpose": "educational",
        }
        is_compliant, issues, warnings = checker.check_activity_compliance(
            "preview", activity_data, min(payload.grade_level + 5, 18), settings.ACTIVE_JURISDICTION
        )
        # Sentinel issues ("No jurisdiction configured" / "Unknown jurisdiction: ...")
        # mean the checker couldn't resolve which rules apply — not a real
        # compliance violation. Filter them out before badging so an
        # unresolved jurisdiction doesn't surface a misleading "review" badge.
        genuine_issues = [
            i for i in issues
            if str(i) != "No jurisdiction configured"
            and not str(i).startswith("Unknown jurisdiction:")
        ]
        if genuine_issues:
            badge = "blocked" if any("COPPA" in str(i) for i in genuine_issues) else "review"
        elif warnings:
            badge = "review"
        else:
            badge = "compliant"
        return {"status": badge, "issues": [str(i) for i in genuine_issues], "warnings": [str(w) for w in warnings]}
    except Exception as e:
        logger.debug(f"Compliance check error (non-fatal): {e}")
        return {"status": "unknown", "issues": [], "warnings": []}


# ============================================================================
# TAXONOMY CLASSIFICATION (Priority 1 — build_taxonomy_classification_prompt())
# ============================================================================
# Suggest-then-confirm only: this endpoint returns a SUGGESTED taxonomy level.
# It never writes to the DB or mutates any activity. The teacher must
# explicitly accept the suggestion in ActivityManager.tsx before it updates
# the taxonomy dropdown.


class TaxonomyClassifyRequest(_BaseModel):
    text: str
    classify_for: Optional[List[str]] = None


class TaxonomyClassifyResponse(_BaseModel):
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


@router.post("/classify-taxonomy", response_model=TaxonomyClassifyResponse)
async def classify_taxonomy(
    payload: TaxonomyClassifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Suggest Bloom's / DOK / SOLO / Marzano taxonomy levels for a learning
    objective or activity text.

    Preview/suggest only — never writes to the DB. Never raises: on any
    AI/parsing failure this returns {result: None, error: "..."} so the
    teacher's existing taxonomy selection and text are never lost.

    AI-call mechanism note: AIRouter.complete() (services/ai_router.py) only
    accepts (task_type, prompt, db, entity_id, entity_type, system, org_id) —
    it has no per-call temperature/max_tokens knob, and its own internal
    Ollama call (_call_ollama) doesn't pass an `options` dict at all.
    build_taxonomy_classification_prompt()'s docstring calls for a fixed,
    low temperature (0.10) for deterministic structured output, so this
    endpoint uses the standards_parser.py::extract_criteria() fallback
    pattern instead: a direct ollama.chat() call with
    options={"temperature": 0.10}. See CHANGE_SUMMARY_20260718_
    PROMPT_LIBRARY_REMAINING.md for the full deviation note.
    """
    _require_teacher(current_user, "Only teachers can use AI taxonomy classification")

    # NOTE: intentionally not named `text` — this module imports sqlalchemy's
    # `text()` at module scope (`from sqlalchemy import select, func, text`),
    # and shadowing it with a local variable of the same name in this
    # function would be confusing/risky for future edits even though this
    # function itself never calls the SQL text() helper.
    input_text = (payload.text or "").strip()
    if not input_text:
        return TaxonomyClassifyResponse(result=None, error="No text provided to classify.")

    from services.prompt_library import build_taxonomy_classification_prompt
    prompt = build_taxonomy_classification_prompt(text=input_text, classify_for=payload.classify_for)

    import json
    import re

    try:
        from core.config import settings
        import ollama as _ollama

        model = settings.OLLAMA_MODEL_TEXT or "mistral"
        try:
            # Bare ollama.chat() defaults to 127.0.0.1:11434, ignoring
            # settings.OLLAMA_BASE_URL — nothing listens there inside this
            # app's Docker container (Ollama runs on the host, reached via
            # host.docker.internal).
            client = _ollama.Client(host=settings.OLLAMA_BASE_URL)
            response = client.chat(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                options={"temperature": 0.10},  # Low temp for structured output
            )
        except Exception as e:
            logger.error(
                "Ollama call failed during taxonomy classification (model=%s): %s",
                model, e, exc_info=True,
            )
            return TaxonomyClassifyResponse(
                result=None,
                error=f"AI classification service unavailable ({type(e).__name__}: {e}). Set the taxonomy manually.",
            )

        raw = response["message"]["content"].strip()

        # Strip markdown code fences if present
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE)

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error("Taxonomy classification: LLM returned invalid JSON: %s | raw: %s", e, raw[:200])
            return TaxonomyClassifyResponse(
                result=None,
                error="The AI's response wasn't valid structured data — try again, or set the taxonomy manually.",
            )

        if not isinstance(parsed, dict):
            logger.error(
                "Taxonomy classification: LLM did not return a JSON object (got %s) | raw: %s",
                type(parsed).__name__, raw[:200],
            )
            return TaxonomyClassifyResponse(
                result=None,
                error="The AI didn't return the expected classification format. Set the taxonomy manually.",
            )

        logger.info("Taxonomy classification succeeded for user %s", current_user.id)
        return TaxonomyClassifyResponse(result=parsed, error=None)

    except Exception as e:
        logger.error("Taxonomy classification failed unexpectedly: %s", e, exc_info=True)
        return TaxonomyClassifyResponse(
            result=None,
            error=f"Classification failed unexpectedly ({type(e).__name__}: {e}). Set the taxonomy manually.",
        )


# ============================================================================
# ACTIVITY MEDIA UPLOAD
# ============================================================================

async def _save_activity_file(upload: UploadFile, activity_id: UUID) -> tuple[str, int]:
    """
    Upload an activity media file to Cloudflare R2 (or local fallback in dev).
    Returns (public_url, file_size_bytes).
    """
    import re, asyncio, os
    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", upload.filename or "file")[:200]
    file_bytes = await upload.read()
    file_size = len(file_bytes)

    if not settings.CF_R2_ACCOUNT_ID:
        upload_dir = f"{settings.UPLOAD_DIR}/activities/{activity_id}"
        os.makedirs(upload_dir, exist_ok=True)
        dest = f"{upload_dir}/{safe_name}"
        with open(dest, "wb") as fh:
            fh.write(file_bytes)
        return f"/uploads/activities/{activity_id}/{safe_name}", file_size

    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
    endpoint_url = f"https://{settings.CF_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    key = f"activities/{activity_id}/{safe_name}"

    def _upload():
        client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=settings.CF_R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.CF_R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
        client.put_object(
            Bucket=settings.CF_R2_BUCKET_NAME,
            Key=key,
            Body=file_bytes,
            ContentType=upload.content_type or "application/octet-stream",
        )

    try:
        import asyncio as _asyncio
        await _asyncio.to_thread(_upload)
    except (BotoCoreError, ClientError) as exc:
        logger.error(f"R2 activity upload failed: {exc}")
        raise HTTPException(status_code=500, detail=f"File upload failed: {exc}")

    if settings.CF_R2_PUBLIC_URL:
        public_url = f"{settings.CF_R2_PUBLIC_URL.rstrip('/')}/{key}"
    else:
        public_url = f"r2://{settings.CF_R2_BUCKET_NAME}/{key}"

    return public_url, file_size


@router.post("/{activity_id}/media", status_code=201)
async def upload_activity_media(
    activity_id: UUID,
    media_type: str = Form("attachment"),  # "hero" | "attachment"
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a hero image or file attachment to an activity.
    media_type=hero       → sets activity.hero_image_url (replaces any existing)
    media_type=attachment → appends to activity.attachments list (max 10)

    Only the owning teacher can upload. Uses Cloudflare R2 in production,
    local /app/uploads/ fallback in development.
    """
    # 1. Verify activity ownership
    result = await db.execute(select(Activity).where(Activity.id == activity_id))
    activity = result.scalar_one_or_none()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied: you don't own this activity")

    # 2. Validate file
    MAX_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
    ALLOWED_TYPES = {
        "image/jpeg", "image/png", "image/webp", "image/gif",
        "application/pdf", "video/mp4", "video/webm",
        "audio/mpeg", "audio/ogg", "audio/webm",
    }
    if file.content_type and file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type: {file.content_type}. Allowed: images, PDF, video, audio."
        )
    if media_type not in ("hero", "attachment"):
        raise HTTPException(status_code=400, detail="media_type must be 'hero' or 'attachment'")

    # 3. Check attachment cap
    existing_attachments = activity.attachments or []
    if media_type == "attachment" and len(existing_attachments) >= 10:
        raise HTTPException(status_code=400, detail="Maximum 10 attachments per activity")

    # 4. Upload to R2 (or local fallback)
    file_url, file_size = await _save_activity_file(file, activity_id)

    if file_size > MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    # 5. Persist URL on activity
    if media_type == "hero":
        activity.hero_image_url = file_url
    else:
        new_attachment = {
            "url": file_url,
            "filename": file.filename or "file",
            "size_bytes": file_size,
            "content_type": file.content_type or "application/octet-stream",
        }
        # SQLAlchemy JSONB mutation tracking requires reassignment
        activity.attachments = existing_attachments + [new_attachment]

    # DB column is TIMESTAMP WITHOUT TIME ZONE (see database/init.sql and
    # models/database.py's Activity.updated_at = Column(DateTime, ...) with
    # no timezone=True). asyncpg refuses to bind a timezone-AWARE datetime
    # to that column ("can't subtract offset-naive and offset-aware
    # datetimes"), which was silently 500ing every activity update/publish/
    # archive/media-upload call. Use naive UTC (matching the ORM's own
    # default=datetime.utcnow) instead of datetime.now(timezone.utc).
    activity.updated_at = datetime.utcnow()
    await db.commit()

    return {
        "success": True,
        "media_type": media_type,
        "url": file_url,
        "filename": file.filename,
        "size_bytes": file_size,
        "activity_id": str(activity_id),
    }


@router.delete("/{activity_id}/media/hero", status_code=204)
async def delete_activity_hero_image(
    activity_id: UUID,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
):
    """Clear the hero image from an activity."""
    result = await db.execute(select(Activity).where(Activity.id == activity_id))
    activity = result.scalar_one_or_none()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    activity.hero_image_url = None
    # DB column is TIMESTAMP WITHOUT TIME ZONE (see database/init.sql and
    # models/database.py's Activity.updated_at = Column(DateTime, ...) with
    # no timezone=True). asyncpg refuses to bind a timezone-AWARE datetime
    # to that column ("can't subtract offset-naive and offset-aware
    # datetimes"), which was silently 500ing every activity update/publish/
    # archive/media-upload call. Use naive UTC (matching the ORM's own
    # default=datetime.utcnow) instead of datetime.now(timezone.utc).
    activity.updated_at = datetime.utcnow()
    await db.commit()


# ============================================================================
# SHARED LIBRARY ENDPOINTS
# ============================================================================

@router.get("/shared-library", response_model=List[SharedLibraryActivityResponse])
async def get_shared_library(
    scope: Optional[str] = Query(None, description="'org' or 'all'; default: show both scopes accessible to user"),
    subject: Optional[str] = Query(None),
    grade_level: Optional[int] = Query(None),
    language: Optional[str] = Query(None),
    state_standard: Optional[str] = Query(None),
    discipline: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return published, shareable activities from all teachers.
    - scope='org': only activities shared within the user's org
    - scope='all': all globally shared activities
    - scope=None: org activities from user's org + all globally shared ones
    Excludes the current user's own activities (use the regular list endpoint for those).
    """
    user_org_id = str(current_user.org_id) if current_user.org_id else None

    # Build the query using raw SQL for flexibility
    where_clauses = [
        "a.is_shareable = TRUE",
        "a.status = 'published'",
        "a.teacher_id != :uid",
    ]
    params: dict = {"uid": str(current_user.id), "offset": (page - 1) * page_size, "limit": page_size}

    # Scope filtering
    if scope == "org":
        if user_org_id:
            where_clauses.append("a.share_scope = 'org' AND u.org_id = :org_id")
            params["org_id"] = user_org_id
        else:
            # User has no org — can't see org-scoped content
            where_clauses.append("FALSE")
    elif scope == "all":
        where_clauses.append("a.share_scope = 'all'")
    else:
        # Default: show globally shared + org-scoped from same org
        if user_org_id:
            where_clauses.append(
                "(a.share_scope = 'all' OR (a.share_scope = 'org' AND u.org_id = :org_id))"
            )
            params["org_id"] = user_org_id
        else:
            where_clauses.append("a.share_scope = 'all'")

    if subject:
        where_clauses.append("LOWER(a.subject) LIKE :subject")
        params["subject"] = f"%{subject.lower()}%"
    if grade_level:
        where_clauses.append("a.grade_level = :grade_level")
        params["grade_level"] = grade_level
    if language:
        where_clauses.append("LOWER(a.language) = :language")
        params["language"] = language.lower()
    if state_standard:
        where_clauses.append("LOWER(a.state_standard) = :state_standard")
        params["state_standard"] = state_standard.lower()
    if discipline:
        where_clauses.append("LOWER(a.discipline) LIKE :discipline")
        params["discipline"] = f"%{discipline.lower()}%"
    if search:
        where_clauses.append(
            "(LOWER(a.title) LIKE :search OR LOWER(a.description) LIKE :search OR LOWER(a.location_name) LIKE :search)"
        )
        params["search"] = f"%{search.lower()}%"

    where_sql = " AND ".join(where_clauses)

    rows = (await db.execute(text(f"""
        SELECT
            a.id, a.title, a.description, a.subject, a.grade_level,
            a.difficulty_level, a.estimated_duration_minutes, a.activity_type,
            a.bloom_level, a.location_name, a.share_scope,
            a.language, a.state_standard, a.discipline, a.created_at,
            COALESCE(u.full_name, u.email) AS author_name,
            o.name AS author_org
        FROM activities a
        JOIN users u ON u.id = a.teacher_id
        LEFT JOIN organizations o ON o.id = u.org_id
        WHERE {where_sql}
        ORDER BY a.created_at DESC
        OFFSET :offset LIMIT :limit
    """), params)).fetchall()

    return [
        SharedLibraryActivityResponse(
            id=r[0], title=r[1], description=r[2], subject=r[3],
            grade_level=r[4], difficulty_level=r[5],
            estimated_duration_minutes=r[6],
            activity_type=r[7] or "inquiry",
            bloom_level=r[8] or 1,
            location_name=r[9] or "",
            share_scope=r[10] or "org",
            language=r[11], state_standard=r[12], discipline=r[13],
            created_at=r[14],
            # author_name is COALESCE(u.full_name, u.email) — both are
            # EncryptedString columns read via raw SQL, so whichever one
            # COALESCE picked still needs decrypting.
            author_name=(_decrypt(r[15]) if r[15] else r[15]), author_org=r[16],
        )
        for r in rows
    ]


@router.post("/{activity_id}/copy", status_code=status.HTTP_201_CREATED)
async def copy_shared_activity(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Copy a shared library activity into the current teacher's own library as a draft."""
    _require_teacher(current_user, "Only teachers can copy activities")

    result = await db.execute(select(Activity).where(Activity.id == activity_id))
    src = result.scalar_one_or_none()
    if not src:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not src.is_shareable or src.status != ActivityStatus.PUBLISHED:
        raise HTTPException(status_code=403, detail="This activity is not available for copying")

    copy = Activity(
        teacher_id=current_user.id,
        title=f"[Copy] {src.title}",
        description=src.description,
        location_latitude=src.location_latitude,
        location_longitude=src.location_longitude,
        location_radius_meters=src.location_radius_meters,
        location_name=src.location_name,
        grade_level=src.grade_level,
        subject=src.subject,
        difficulty_level=src.difficulty_level,
        estimated_duration_minutes=src.estimated_duration_minutes,
        materials_needed=src.materials_needed or [],
        resources=src.resources or [],
        learning_objectives=src.learning_objectives or [],
        curriculum_unit_ids=src.curriculum_unit_ids or [],
        bloom_level=src.bloom_level,
        marzano_level=src.marzano_level,
        dok_level=src.dok_level,
        solo_level=src.solo_level,
        primary_framework=src.primary_framework or "blooms",
        activity_type=src.activity_type,
        assessment_type=src.assessment_type or "formative",
        language=src.language,
        state_standard=src.state_standard,
        discipline=src.discipline,
        # Copy is private draft by default
        is_shareable=False,
        share_scope="org",
        status=ActivityStatus.DRAFT,
    )
    db.add(copy)
    await db.commit()
    await db.refresh(copy)
    return {"id": str(copy.id), "title": copy.title, "status": "draft"}


# ── Professor / Teacher: Fieldwork Location Map ─────────────────────────────

@router.get("/{activity_id}/fieldwork-locations")
async def get_fieldwork_locations(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns GPS snapshots for every field-note and evidence-capture submitted
    against this activity that has lat/lng stored.

    College professors use this for the CourseFieldworkTracker map.
    K-12 teachers can also use it for post-session review.
    No live streaming — purely historical.
    """
    from models.student_models import EvidenceCapture
    from models.database import StudentFieldNote, LearningSession as _LS, User as _User
    from sqlalchemy import literal, union_all

    allowed_roles = {"TEACHER", "PROFESSOR", "ADMIN", "HOMESCHOOL"}
    if current_user.role.upper() not in allowed_roles:
        raise HTTPException(status_code=403, detail="Teacher or professor access required")

    result = await db.execute(select(Activity).where(Activity.id == activity_id))
    activity = result.scalar_one_or_none()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if current_user.role.upper() != "ADMIN" and activity.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not own this activity")

    # ── Query 1: EvidenceCapture (direct activity_id FK) ──────────────────
    ec_q = (
        select(
            EvidenceCapture.student_id.cast(String).label("student_id"),
            _User.full_name.label("student_name"),
            EvidenceCapture.location_latitude.label("latitude"),
            EvidenceCapture.location_longitude.label("longitude"),
            literal(None, type_=String).label("location_name"),
            EvidenceCapture.created_at.label("submitted_at"),
            EvidenceCapture.title.label("title"),
            literal("capture").label("type"),
        )
        .join(_User, _User.id == EvidenceCapture.student_id)
        .where(
            EvidenceCapture.activity_id == activity_id,
            EvidenceCapture.location_latitude.is_not(None),
        )
    )

    # ── Query 2: StudentFieldNote via session join ─────────────────────────
    fn_q = (
        select(
            StudentFieldNote.student_id.cast(String).label("student_id"),
          
            _User.full_name.label("student_name"),
            StudentFieldNote.location_latitude.label("latitude"),
            StudentFieldNote.location_longitude.label("longitude"),
            StudentFieldNote.location_name.label("location_name"),
            StudentFieldNote.created_at.label("submitted_at"),
            StudentFieldNote.title.label("title"),
            literal("field_note").label("type"),
        )
        .join(_LS, _LS.id == StudentFieldNote.session_id)
        .join(_User, _User.id == StudentFieldNote.student_id)
        .where(
            _LS.activity_id == activity_id,
            StudentFieldNote.location_latitude.is_not(None),
        )
    )

    try:
        combined = union_all(ec_q, fn_q)
        rows = (await db.execute(combined)).mappings().all()
        return {
            "activity_id": str(activity_id),
            "locations": [
                {
                    "student_id":   r["student_id"],
                    "student_name": r["student_name"] or "Student",
                    "latitude":     float(r["latitude"]),
                    "longitude":    float(r["longitude"]),
                    "location_name": r["location_name"],
                    "submitted_at": r["submitted_at"].isoformat() if r["submitted_at"] else None,
                    "title":        r["title"],
                    "type":         r["type"],
                }
                for r in rows
            ],
            "count": len(rows),
        }
    except Exception as e:
        logger.error(f"Fieldwork locations query error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch fieldwork locations")
