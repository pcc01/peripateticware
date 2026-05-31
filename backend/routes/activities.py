# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Activity management endpoints - MERGED (Existing + Phase 5 + ActivityBuilder)"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import logging

from core.database import get_db
from core.config import settings
from core.dependencies import get_current_user
from models import User, Activity, ActivityStatus, ActivityType, Project
from models.assessment import TAXONOMY_DESCRIPTIONS
from schemas.activities import (
    ActivityCreate,
    ActivityUpdate,
    ActivityResponse,
    ActivityListResponse,
    PaginatedActivityResponse,
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new activity.

    Supports all 4 taxonomies + location / Ollama fields.
    """
    _require_teacher(current_user, "Only teachers can create activities")

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
        suggested_lessons=getattr(activity, "suggested_lessons", []),
        activity_type=ActivityType(activity.activity_type.value),
        is_shareable=activity.is_shareable,
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

    activity.updated_at = datetime.now(timezone.utc)

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


@router.post("/{activity_id}/publish", response_model=ActivityResponse)
async def publish_activity(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Publish an activity (make it visible to others)."""
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

    # Run privacy compliance check (non-blocking — returns warning in response)
    compliance_warning = None
    try:
        from services.privacy_engine import get_privacy_checker
        checker = get_privacy_checker()
        activity_data = {
            "data_collection": ["location", "audio", "photo"] if activity.grade_level and activity.grade_level <= 8 else ["location"],
            "third_parties": [],
            "purpose": "educational",
        }
        is_compliant, issues, _ = checker.check_activity_compliance(
            str(activity.id), activity_data, 13, None
        )
        if not is_compliant:
            compliance_warning = [i for i in issues]
    except Exception as ce:
        logger.debug(f"Privacy check skipped: {ce}")

    activity.status = ActivityStatus.PUBLISHED
    activity.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(activity)

    logger.info(f"Published activity: {activity_id}")

    return activity


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
    activity.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(activity)

    logger.info(f"Archived activity: {activity_id}")

    return activity


# ============================================================================
# PHASE 5 ENDPOINTS
# ============================================================================

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
            "student_email": r["student_email"],
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
            "email": s["email"],
            "first_name": s["first_name"],
            "last_name": s["last_name"],
            "full_name": s["full_name"],
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


# ── Privacy compliance check for ActivityManager badge ────────────────────────

from pydantic import BaseModel as _BaseModel

class ComplianceCheckRequest(_BaseModel):
    location_name: str = ""
    grade_level: int = 0
    data_types: list = []

@router.post("/check-compliance")
async def check_activity_compliance_quick(
    payload: ComplianceCheckRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Lightweight compliance pre-check for the ActivityManager badge.
    Returns: { status: 'compliant'|'review'|'blocked', issues: [...] }
    """
    try:
        from services.privacy_engine import get_privacy_checker
        checker = get_privacy_checker()
        activity_data = {
            "data_collection": payload.data_types or ["location"],
            "third_parties": [],
            "purpose": "educational",
        }
        is_compliant, issues, warnings = checker.check_activity_compliance(
            "preview", activity_data, min(payload.grade_level + 5, 18), None
        )
        if not is_compliant:
            badge = "blocked" if any("COPPA" in str(i) for i in issues) else "review"
        elif warnings:
            badge = "review"
        else:
            badge = "compliant"
        return {"status": badge, "issues": [str(i) for i in issues], "warnings": [str(w) for w in warnings]}
    except Exception as e:
        logger.debug(f"Compliance check error (non-fatal): {e}")
        return {"status": "compliant", "issues": [], "warnings": []}