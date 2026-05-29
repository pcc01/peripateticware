# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Phase 6 — Student Activity Endpoints
=====================================
All routes a student mobile app needs to discover, engage with,
and submit learning activities.

Prefix: /api/v1/student  (registered in main.py)
Auth:   Bearer JWT required on all endpoints

Endpoints
---------
  GET  /activities                          List published activities (discovery)
  GET  /activities/{activity_id}            Activity detail (brief + phase spec)
  POST /activities/{activity_id}/start      Start / resume a session
  GET  /sessions/{session_id}/evidence      List evidence for a session
  POST /sessions/{session_id}/evidence      Add an evidence capture
  GET  /sessions/{session_id}/reflections   List notebook entries for a session
  POST /sessions/{session_id}/reflection    Add a notebook / reflection entry
  POST /activities/{activity_id}/submit     Submit completed activity
  GET  /sessions/{session_id}/progress      Session progress summary
  GET  /submissions/{activity_id}           Get student's submission for an activity
"""

from fastapi import (
    APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status,
)
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from uuid import UUID
from datetime import datetime
from typing import Optional, List
import uuid
import logging
import math

from core.database import get_db
from core.dependencies import get_current_user
from models.database import (
    User, UserRole, Activity, LearningSession,
)
from models.student_models import EvidenceCapture, NotebookEntry, ActivitySubmission
from services.privacy_engine import log_access, enforce_on_submission
from schemas.student_activities import (
    StudentActivitySummary,
    StudentActivityDetail,
    StudentPaginatedActivityResponse,
    StartSessionRequest,
    LearningSessionResponse,
    EvidenceCaptureCreate,
    EvidenceCaptureResponse,
    EvidenceListResponse,
    NotebookEntryCreate,
    NotebookEntryResponse,
    NotebookListResponse,
    ActivitySubmitRequest,
    ActivitySubmissionResponse,
    SubmissionDetailResponse,
    SessionProgressResponse,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Router — prefix added by main.py as /api/v1/student
# ─────────────────────────────────────────────────────────────────────────────
router = APIRouter(tags=["student"])


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _require_student(user: User) -> None:
    """Raise 403 if the caller is not a student or admin."""
    if user.role not in (UserRole.STUDENT, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student access required",
        )


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in metres between two GPS coordinates."""
    R = 6_371_000
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lon2 - lon1)
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _activity_to_summary(a: Activity) -> dict:
    """Convert ORM Activity to a summary dict matching StudentActivitySummary."""
    return {
        "id":                         a.id,
        "title":                      a.title,
        "description":                a.description,
        "subject":                    a.subject,
        "grade_level":                a.grade_level,
        "estimated_duration_minutes": a.estimated_duration_minutes,
        "difficulty_level":           a.difficulty_level,
        "location_name":              a.location_name,
        "location_latitude":          a.location_latitude,
        "location_longitude":         a.location_longitude,
        "location_radius_meters":     a.location_radius_meters,
        "bloom_level":                a.bloom_level,
        "materials_needed":           a.materials_needed or [],
        "learning_objectives":        a.learning_objectives or [],
        "assessment_type":            a.assessment_type,
        "activity_type":              a.activity_type,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 1.  GET /activities  — discovery list
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/activities", response_model=StudentPaginatedActivityResponse)
async def list_student_activities(
    subject:      Optional[str] = Query(None, description="Filter by subject"),
    grade_level:  Optional[int] = Query(None, ge=3, le=12),
    # Geofence filter — return only activities near this point
    lat:          Optional[float] = Query(None, description="Student latitude for proximity filter"),
    lon:          Optional[float] = Query(None, description="Student longitude for proximity filter"),
    skip:         int = Query(0,  ge=0),
    limit:        int = Query(20, ge=1, le=100),
    current_user: User          = Depends(get_current_user),
    db:           AsyncSession  = Depends(get_db),
) -> StudentPaginatedActivityResponse:
    """
    Return published activities available to the authenticated student.

    When lat / lon are provided, activities whose geofence (location_radius_meters)
    includes the student's position are ranked first and activities outside a
    20 km corridor are excluded.  Without GPS the full published list is returned.
    """
    _require_student(current_user)

    # Base query: only published, active activities
    q = select(Activity).where(
        and_(Activity.status == "published", Activity.is_active == True)
    )

    if subject:
        q = q.where(Activity.subject.ilike(f"%{subject}%"))

    if grade_level:
        q = q.where(Activity.grade_level == grade_level)

    # Total count (before pagination)
    count_q = select(func.count()).select_from(q.subquery())
    total   = (await db.execute(count_q)).scalar() or 0

    # Pagination
    q = q.order_by(Activity.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(q)).scalars().all()

    # Optional geofence proximity filter / sort
    if lat is not None and lon is not None:
        MAX_BROWSE_M = 20_000   # 20 km browse radius
        filtered: list[Activity] = []
        for a in rows:
            dist = _haversine_m(lat, lon, a.location_latitude, a.location_longitude)
            if dist <= MAX_BROWSE_M:
                filtered.append(a)
        rows = filtered

    activities = [StudentActivitySummary(**_activity_to_summary(a)) for a in rows]

    return StudentPaginatedActivityResponse(
        activities=activities,
        total=total,
        page=(skip // limit) + 1,
        page_size=limit,
        has_more=(skip + limit) < total,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 2.  GET /activities/{activity_id}  — activity detail (brief + phases)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/activities/{activity_id}", response_model=StudentActivityDetail)
async def get_student_activity(
    activity_id:  UUID,
    current_user: User         = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
) -> StudentActivityDetail:
    """
    Return full activity detail for the brief / Phase 1 screen.
    Only published activities are accessible to students.
    """
    _require_student(current_user)

    result   = await db.execute(select(Activity).where(Activity.id == activity_id))
    activity = result.scalar()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    if activity.status != "published" and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Activity is not published")

    summary = _activity_to_summary(activity)
    return StudentActivityDetail(
        **summary,
        location_info=activity.location_info,
        resources=activity.resources or [],
        suggested_lessons=activity.suggested_lessons or [],
        marzano_level=activity.marzano_level,
        dok_level=activity.dok_level,
        solo_level=activity.solo_level,
        primary_framework=activity.primary_framework or "blooms",
        created_at=activity.created_at,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 3.  POST /activities/{activity_id}/start  — start or resume a session
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/activities/{activity_id}/start",
    response_model=LearningSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_activity_session(
    activity_id:  UUID,
    body:         StartSessionRequest,
    current_user: User          = Depends(get_current_user),
    db:           AsyncSession  = Depends(get_db),
) -> LearningSessionResponse:
    """
    Create a new LearningSession for the student + activity pair.

    If the student already has an active (in_progress) session for this
    activity, the existing session is returned instead of creating a duplicate.
    This makes the mobile 'Start' button idempotent — safe to retry offline.
    """
    _require_student(current_user)

    # Check activity exists and is published
    act_result = await db.execute(select(Activity).where(Activity.id == activity_id))
    activity   = act_result.scalar()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity.status != "published" and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Activity is not published")

    # Resume if already in progress
    existing_q = select(LearningSession).where(
        and_(
            LearningSession.user_id     == current_user.id,
            LearningSession.activity_id == activity_id,
            LearningSession.status      == "in_progress",
        )
    )
    existing = (await db.execute(existing_q)).scalar()
    if existing:
        logger.info("Resuming existing session %s for user %s", existing.id, current_user.id)
        return _session_response(existing, current_user)

    # Create new session
    # curriculum_id is nullable in some builds; use None if not required
    session = LearningSession(
        user_id     = current_user.id,
        activity_id = activity_id,
        # curriculum_id left NULL — activity-centric sessions don't require it
        curriculum_id = None,
        title       = f"{activity.title} – {current_user.full_name or current_user.username}",
        latitude    = body.location_latitude,
        longitude   = body.location_longitude,
        location_name = body.location_name or activity.location_name,
        status      = "in_progress",
        is_active   = True,
        inquiry_log = [],
        evidence    = {},
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    logger.info("Created session %s for user %s / activity %s",
                session.id, current_user.id, activity_id)
    return _session_response(session, current_user)


def _session_response(session: LearningSession, user: User) -> LearningSessionResponse:
    location = None
    if session.latitude is not None:
        location = {
            "latitude":  session.latitude,
            "longitude": session.longitude,
            "name":      session.location_name,
        }
    return LearningSessionResponse(
        session_id  = str(session.id),
        activity_id = str(session.activity_id),
        student_id  = str(user.id),
        status      = session.status,
        started_at  = session.created_at.isoformat(),
        location    = location,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 4a.  GET /sessions/{session_id}/evidence  — list evidence
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sessions/{session_id}/evidence", response_model=EvidenceListResponse)
async def list_session_evidence(
    session_id:   UUID,
    current_user: User         = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
) -> EvidenceListResponse:
    """Return all evidence captures for a session owned by the current student."""
    session = await _get_owned_session(session_id, current_user, db)

    q = select(EvidenceCapture).where(
        EvidenceCapture.session_id == session_id
    ).order_by(EvidenceCapture.created_at.asc())
    rows = (await db.execute(q)).scalars().all()

    return EvidenceListResponse(
        captures=[EvidenceCaptureResponse(**r.to_dict()) for r in rows],
        total=len(rows),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 4b.  POST /sessions/{session_id}/evidence  — add evidence capture
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/sessions/{session_id}/evidence",
    response_model=EvidenceCaptureResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_evidence_capture(
    session_id:   UUID,
    # Metadata can arrive as JSON body OR as multipart form fields
    capture_type:        str            = Form(...),
    title:               Optional[str]  = Form(None),
    description:         Optional[str]  = Form(None),
    learning_objectives: Optional[str]  = Form("[]"),  # JSON-encoded list
    competencies:        Optional[str]  = Form("[]"),  # JSON-encoded list
    location_latitude:   Optional[float] = Form(None),
    location_longitude:  Optional[float] = Form(None),
    duration_seconds:    Optional[int]  = Form(None),
    transcription:       Optional[str]  = Form(None),
    file:                Optional[UploadFile] = File(None),
    current_user: User         = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
) -> EvidenceCaptureResponse:
    """
    Add a single evidence capture to an active session.

    Accepts multipart/form-data so the mobile app can stream a file (photo,
    audio, video, sketch) alongside metadata in one request.
    Text captures omit the file field — all data is in the form fields.

    File storage: in development, files are written to a local volume mount
    (/app/uploads).  In production, swap _save_file() for an S3 presigned
    PUT and store the resulting URL.
    """
    import json

    session = await _get_owned_session(session_id, current_user, db)

    # Parse JSON-encoded list fields
    try:
        objectives  = json.loads(learning_objectives or "[]")
        comps       = json.loads(competencies or "[]")
    except json.JSONDecodeError:
        objectives, comps = [], []

    # Handle file upload
    file_url        = None
    file_size_bytes = None
    if file and file.filename:
        file_url, file_size_bytes = await _save_file(file, session_id)

    capture = EvidenceCapture(
        session_id         = session.id,
        student_id         = current_user.id,
        activity_id        = session.activity_id,
        capture_type       = capture_type,
        title              = title,
        description        = description,
        file_url           = file_url,
        file_size_bytes    = file_size_bytes,
        duration_seconds   = duration_seconds,
        transcription      = transcription,
        learning_objectives = objectives,
        competencies       = comps,
        location_latitude  = location_latitude,
        location_longitude = location_longitude,
    )
    db.add(capture)
    await db.commit()
    await db.refresh(capture)

    # Privacy audit — log-only, non-blocking
    try:
        enforcement = await enforce_on_submission(
            student_id=str(current_user.id),
            data_type="student_evidence",
            evidence_types=[capture_type],
            db=db,
        )
        await log_access(
            actor_id=str(current_user.id),
            actor_role="student",
            action="EVIDENCE_SUBMIT",
            data_type="student_evidence",
            student_id=str(current_user.id),
            rules_applied=enforcement.rules_applied,
            compliance_status=enforcement.status,
            db=db,
            notes=f"capture_type={capture_type} session={session_id}",
        )
    except Exception as _audit_err:
        logger.warning("Privacy audit failed (non-blocking): %s", _audit_err)

    logger.info("Evidence capture %s added to session %s", capture.id, session_id)
    return EvidenceCaptureResponse(**capture.to_dict())


async def _save_file(upload: UploadFile, session_id: UUID) -> tuple[str, int]:
    """
    Persist an uploaded file to the local uploads volume.
    Returns (relative_url, size_bytes).

    Replace this function body with S3 logic for production.
    """
    import os, aiofiles

    upload_dir = f"/app/uploads/sessions/{session_id}"
    os.makedirs(upload_dir, exist_ok=True)

    safe_name = f"{uuid.uuid4()}_{upload.filename}"
    dest      = os.path.join(upload_dir, safe_name)

    contents = await upload.read()
    async with aiofiles.open(dest, "wb") as f:
        await f.write(contents)

    relative_url = f"/uploads/sessions/{session_id}/{safe_name}"
    return relative_url, len(contents)


# ─────────────────────────────────────────────────────────────────────────────
# 5a.  GET /sessions/{session_id}/reflections  — list notebook entries
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sessions/{session_id}/reflections", response_model=NotebookListResponse)
async def list_session_reflections(
    session_id:   UUID,
    current_user: User         = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
) -> NotebookListResponse:
    """Return all notebook entries for a session owned by the current student."""
    await _get_owned_session(session_id, current_user, db)

    q = select(NotebookEntry).where(
        NotebookEntry.session_id == session_id
    ).order_by(NotebookEntry.created_at.asc())
    rows = (await db.execute(q)).scalars().all()

    return NotebookListResponse(
        entries=[NotebookEntryResponse(**r.to_dict()) for r in rows],
        total=len(rows),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 5b.  POST /sessions/{session_id}/reflection  — add notebook entry
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/sessions/{session_id}/reflection",
    response_model=NotebookEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_reflection(
    session_id:   UUID,
    body:         NotebookEntryCreate,
    current_user: User         = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
) -> NotebookEntryResponse:
    """
    Save a student reflection / notebook entry to an active session.
    Works offline — the mobile app queues these and POSTs on reconnect.
    """
    session = await _get_owned_session(session_id, current_user, db)

    entry = NotebookEntry(
        session_id          = session.id,
        student_id          = current_user.id,
        activity_id         = session.activity_id,
        reflection_type     = body.reflection_type,
        title               = body.title,
        content             = body.content,
        learning_objectives = body.learning_objectives,
        competencies        = body.competencies,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    logger.info("Reflection %s added to session %s", entry.id, session_id)
    return NotebookEntryResponse(**entry.to_dict())


# ─────────────────────────────────────────────────────────────────────────────
# 6.  POST /activities/{activity_id}/submit  — submit completed activity
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/activities/{activity_id}/submit",
    response_model=ActivitySubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_activity(
    activity_id:  UUID,
    body:         ActivitySubmitRequest,
    current_user: User         = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
) -> ActivitySubmissionResponse:
    """
    Compile all evidence + reflections for a session and create a submission
    record.  The session status is set to 'completed'.

    Idempotent: if a submitted submission already exists for this student +
    activity pair it is returned without creating a duplicate.
    """
    _require_student(current_user)

    session_id = UUID(body.session_id)
    session    = await _get_owned_session(session_id, current_user, db)

    # Idempotency guard
    existing_sub_q = select(ActivitySubmission).where(
        and_(
            ActivitySubmission.student_id        == current_user.id,
            ActivitySubmission.activity_id       == activity_id,
            ActivitySubmission.submission_status == "submitted",
        )
    )
    existing_sub = (await db.execute(existing_sub_q)).scalar()
    if existing_sub:
        captures_q   = select(func.count(EvidenceCapture.id)).where(
            EvidenceCapture.session_id == session_id)
        reflections_q = select(func.count(NotebookEntry.id)).where(
            NotebookEntry.session_id == session_id)
        evidence_count   = (await db.execute(captures_q)).scalar() or 0
        reflection_count = (await db.execute(reflections_q)).scalar() or 0

        return ActivitySubmissionResponse(
            submission_id=str(existing_sub.id),
            activity_id=str(activity_id),
            student_id=str(current_user.id),
            submission_status="submitted",
            submitted_at=existing_sub.submitted_at.isoformat() if existing_sub.submitted_at else None,
            evidence_count=evidence_count,
            reflection_count=reflection_count,
        )

    # Collect all evidence + reflections
    captures_q   = select(EvidenceCapture).where(EvidenceCapture.session_id == session_id)
    reflections_q = select(NotebookEntry).where(NotebookEntry.session_id == session_id)

    captures    = (await db.execute(captures_q)).scalars().all()
    reflections = (await db.execute(reflections_q)).scalars().all()

    compiled = {
        "captures":    [c.to_dict() for c in captures],
        "reflections": [r.to_dict() for r in reflections],
        "submitted_at": datetime.utcnow().isoformat(),
    }

    now = datetime.utcnow()

    # Create submission
    submission = ActivitySubmission(
        student_id        = current_user.id,
        activity_id       = activity_id,
        session_id        = session_id,
        submission_status = "submitted",
        compiled_evidence = compiled,
        submitted_at      = now,
    )
    db.add(submission)

    # Close session
    session.status      = "completed"
    session.is_active   = False
    session.completed_at = now
    db.add(session)

    await db.commit()
    await db.refresh(submission)

    # Privacy audit for activity submission — log-only
    try:
        await log_access(
            actor_id=str(current_user.id),
            actor_role="student",
            action="ACTIVITY_SUBMIT",
            data_type="activity_submission",
            student_id=str(current_user.id),
            rules_applied=[],
            compliance_status="COMPLIANT",
            db=db,
            notes=f"activity_id={activity_id} session_id={session_id} evidence={len(captures)} reflections={len(reflections)}",
        )
    except Exception as _audit_err:
        logger.warning("Privacy audit failed (non-blocking): %s", _audit_err)

    logger.info("Submission %s created for user %s / activity %s",
                submission.id, current_user.id, activity_id)

    return ActivitySubmissionResponse(
        submission_id    = str(submission.id),
        activity_id      = str(activity_id),
        student_id       = str(current_user.id),
        submission_status = "submitted",
        submitted_at     = now.isoformat(),
        evidence_count   = len(captures),
        reflection_count = len(reflections),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 7.  GET /sessions/{session_id}/progress  — real-time progress summary
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sessions/{session_id}/progress", response_model=SessionProgressResponse)
async def get_session_progress(
    session_id:   UUID,
    current_user: User         = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
) -> SessionProgressResponse:
    """
    Return a real-time progress snapshot for the in-progress session.
    Used by the StepRail and ProgressDashboard components (screens 05 / 11).
    """
    session = await _get_owned_session(session_id, current_user, db)

    # Count evidence + reflections
    ec_q = select(func.count(EvidenceCapture.id)).where(
        EvidenceCapture.session_id == session_id)
    nb_q = select(func.count(NotebookEntry.id)).where(
        NotebookEntry.session_id == session_id)

    evidence_count   = (await db.execute(ec_q)).scalar() or 0
    reflection_count = (await db.execute(nb_q)).scalar() or 0

    # Unique competencies demonstrated across all captures + reflections
    cap_comps_q = select(EvidenceCapture.competencies).where(
        EvidenceCapture.session_id == session_id)
    ref_comps_q = select(NotebookEntry.competencies).where(
        NotebookEntry.session_id == session_id)

    all_comps: set[str] = set()
    for row in (await db.execute(cap_comps_q)).scalars().all():
        all_comps.update(row or [])
    for row in (await db.execute(ref_comps_q)).scalars().all():
        all_comps.update(row or [])

    # Unique objectives addressed across captures + reflections
    cap_obj_q = select(EvidenceCapture.learning_objectives).where(
        EvidenceCapture.session_id == session_id)
    ref_obj_q = select(NotebookEntry.learning_objectives).where(
        NotebookEntry.session_id == session_id)

    all_objs: set[str] = set()
    for row in (await db.execute(cap_obj_q)).scalars().all():
        all_objs.update(row or [])
    for row in (await db.execute(ref_obj_q)).scalars().all():
        all_objs.update(row or [])

    # Activity total objectives for percentage
    act_q    = select(Activity).where(Activity.id == session.activity_id)
    activity = (await db.execute(act_q)).scalar()
    total_obj = len(activity.learning_objectives) if activity and activity.learning_objectives else 0

    # Time elapsed
    elapsed_min: Optional[int] = None
    if session.created_at:
        delta       = datetime.utcnow() - session.created_at
        elapsed_min = int(delta.total_seconds() // 60)

    return SessionProgressResponse(
        session_id                    = str(session_id),
        activity_id                   = str(session.activity_id),
        status                        = session.status,
        evidence_count                = evidence_count,
        reflection_count              = reflection_count,
        time_elapsed_minutes          = elapsed_min,
        learning_objectives_total     = total_obj,
        learning_objectives_addressed = list(all_objs),
        competencies_demonstrated     = list(all_comps),
        started_at                    = session.created_at.isoformat(),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 8.  GET /submissions/{activity_id}  — student's submission for an activity
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/submissions/{activity_id}",
    response_model=SubmissionDetailResponse,
)
async def get_submission(
    activity_id:  UUID,
    current_user: User         = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
) -> SubmissionDetailResponse:
    """
    Return the student's most recent submission for an activity.
    Includes teacher feedback and grade once graded.
    Used by the CompletedActivity screen and portfolio.
    """
    _require_student(current_user)

    q = select(ActivitySubmission).where(
        and_(
            ActivitySubmission.student_id  == current_user.id,
            ActivitySubmission.activity_id == activity_id,
        )
    ).order_by(ActivitySubmission.created_at.desc()).limit(1)

    sub = (await db.execute(q)).scalar()
    if not sub:
        raise HTTPException(status_code=404, detail="No submission found for this activity")

    # Count evidence + reflections from compiled snapshot
    compiled        = sub.compiled_evidence or {}
    evidence_count  = len(compiled.get("captures", []))
    reflection_count = len(compiled.get("reflections", []))

    return SubmissionDetailResponse(
        submission_id     = str(sub.id),
        activity_id       = str(sub.activity_id),
        student_id        = str(sub.student_id),
        submission_status = sub.submission_status,
        submitted_at      = sub.submitted_at.isoformat()  if sub.submitted_at else None,
        evidence_count    = evidence_count,
        reflection_count  = reflection_count,
        teacher_feedback  = sub.teacher_feedback,
        grade             = sub.grade,
        rubric_scores     = sub.rubric_scores,
        graded_at         = sub.graded_at.isoformat()     if sub.graded_at    else None,
        compiled_evidence = sub.compiled_evidence,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Shared helper — fetch session and verify ownership
# ─────────────────────────────────────────────────────────────────────────────

async def _get_owned_session(
    session_id:   UUID,
    current_user: User,
    db:           AsyncSession,
) -> LearningSession:
    """
    Load a LearningSession and verify it belongs to current_user.
    Raises 404 or 403 as appropriate.
    """
    q = select(LearningSession).where(LearningSession.id == session_id)
    session = (await db.execute(q)).scalar()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Admins can view any session; students only their own
    if current_user.role != UserRole.ADMIN and session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this session",
        )

    return session
