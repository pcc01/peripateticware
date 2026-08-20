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
    APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, File, Form, status,
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
from routes.sessions import _fire_location_event
from schemas.student_activities import (
    StudentActivitySummary,
    StudentActivityDetail,
    ActivityPhaseDetail,
    ActivityPhases,
    ActivityDiscoveryDetail,
    ActivityTeacher,
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
    """Convert ORM Activity to a summary dict matching StudentActivitySummary.
    All nullable fields use safe defaults so NULL DB values don't cause 500s."""
    def _safe_float(v) -> Optional[float]:
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    def _safe_int(v) -> Optional[int]:
        try:
            return int(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    return {
        "id":                         a.id,
        "title":                      a.title or "Untitled",
        "description":                a.description or "",
        "subject":                    a.subject or "",
        "grade_level":                _safe_int(getattr(a, "grade_level", None)),
        "estimated_duration_minutes": _safe_int(getattr(a, "estimated_duration_minutes", None)),
        "difficulty_level":           _safe_int(getattr(a, "difficulty_level", None)),
        "location_name":              getattr(a, "location_name", None) or "",
        "location_latitude":          _safe_float(getattr(a, "location_latitude", None)),
        "location_longitude":         _safe_float(getattr(a, "location_longitude", None)),
        "location_radius_meters":     _safe_int(getattr(a, "location_radius_meters", None)),
        "bloom_level":                _safe_int(getattr(a, "bloom_level", None)),
        "materials_needed":           getattr(a, "materials_needed", None) or [],
        "learning_objectives":        getattr(a, "learning_objectives", None) or [],
        "assessment_type":            getattr(a, "assessment_type", None),
        "activity_type":              getattr(a, "activity_type", None),
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
    # Activities without a fixed location (lat/lon = NULL) are always included.
    if lat is not None and lon is not None:
        MAX_BROWSE_M = 20_000   # 20 km browse radius
        filtered: list[Activity] = []
        for a in rows:
            if a.location_latitude is None or a.location_longitude is None:
                filtered.append(a)   # no fixed location — always show
            elif _haversine_m(lat, lon, a.location_latitude, a.location_longitude) <= MAX_BROWSE_M:
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

    # Fetch teacher name for the detail view
    teacher_name = "Your Teacher"
    try:
        if activity.teacher_id:
            t_result = await db.execute(select(User).where(User.id == activity.teacher_id))
            teacher_obj = t_result.scalar()
            if teacher_obj:
                teacher_name = teacher_obj.full_name or teacher_obj.email
    except Exception:
        pass

    # Build phases from description / learning_objectives
    objs = activity.learning_objectives or []
    orient_instructions = activity.description or "Arrive at the location and orient yourself."
    inquiry_instructions = ("\n".join(str(o) for o in objs)
                            if objs else "Explore, observe, and collect evidence.")
    reflect_instructions = "Review your evidence and reflect on what you learned."
    due_str = activity.created_at.isoformat() if activity.created_at else None

    phases = ActivityPhases(
        orient=ActivityPhaseDetail(
            title="Orient",
            instructions=orient_instructions,
            due_date=due_str or "",
        ),
        inquiry=ActivityPhaseDetail(
            title="Inquiry",
            instructions=inquiry_instructions,
            due_date=due_str or "",
        ),
        reflect=ActivityPhaseDetail(
            title="Reflect",
            instructions=reflect_instructions,
            due_date=due_str or "",
        ),
    )

    # Discovery/scavenger-hunt activities carry their real task in
    # discovery_task_description (e.g. "take photos of 8 native plants in
    # Central Park") rather than the generic description/learning_objectives
    # every activity has -- previously computed nowhere and never sent to
    # the student. task_description is required on the schema (mirrors the
    # DB: discovery activities are never created without it, see
    # discoveryActivities.ts's CreateDiscoveryActivityInput), so this only
    # attaches when there's real content, not just a matching activity_type.
    discovery = None
    if activity.activity_type == "discovery" and activity.discovery_task_description:
        discovery = ActivityDiscoveryDetail(
            task_description=activity.discovery_task_description,
            mode=getattr(activity, "discovery_mode", None),
            documentation_requirements=getattr(activity, "discovery_documentation_requirements", None),
            success_criteria=getattr(activity, "discovery_success_criteria", None),
            difficulty_level=getattr(activity, "discovery_difficulty_level", None),
            time_limit_minutes=getattr(activity, "discovery_time_limit_minutes", None),
            location_required=bool(getattr(activity, "discovery_location_required", False)),
        )

    return StudentActivityDetail(
        **summary,
        location=activity.location_name,
        due_date=due_str,
        teacher=ActivityTeacher(name=teacher_name),
        phases=phases,
        discovery=discovery,
        location_info=activity.location_info,
        location_wiki_data=getattr(activity, "location_wiki_data", None),
        resources=activity.resources or [],
        suggested_lessons=activity.suggested_lessons or [],
        marzano_level=activity.marzano_level,
        dok_level=activity.dok_level,
        solo_level=activity.solo_level,
        primary_framework=activity.primary_framework or "blooms",
        created_at=activity.created_at,
        discovery_location_gps_capture_enabled=bool(
            getattr(activity, "discovery_location_gps_capture_enabled", False)
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# 3.  POST /activities/{activity_id}/start  — start or resume a session
# ─────────────────────────────────────────────────────────────────────────────

async def _notify_parents_gps_consent(session_id: str, activity_id: str) -> None:
    """Background task: notify parents of under-13 students that GPS consent is needed."""
    try:
        import hashlib
        from core.database import async_session_factory
        from sqlalchemy import text as _t

        async with async_session_factory() as db:
            # Find students in the same classroom as this session's activity
            rows = await db.execute(_t("""
                SELECT DISTINCT
                    u.id          AS student_id,
                    u.age_group,
                    u.requires_parental_consent,
                    pcl.parent_id
                FROM learning_sessions ls
                JOIN activities        a   ON a.id  = ls.activity_id
                JOIN classroom_students cs ON cs.student_id = ls.user_id
                JOIN parent_child_links pcl ON pcl.child_id = ls.user_id
                JOIN users              u  ON u.id  = ls.user_id
                WHERE ls.id = CAST(:sid AS uuid)
            """), {"sid": session_id})
            for row in rows.mappings().all():
                # Only notify for under-13 / requires_parental_consent students
                if not (row["age_group"] == "under_13" or row["requires_parental_consent"]):
                    continue
                student_id = str(row["student_id"])
                parent_id  = str(row["parent_id"])
                student_hash = hashlib.sha256(student_id.encode()).hexdigest()
                consent_url = (
                    f"/parent-consent/{student_hash}"
                    f"?consent_type=gps&activity_id={activity_id}&student_id={student_id}"
                )
                try:
                    from services.websocket_service import (
                        websocket_service,
                        Notification,
                        NotificationType,
                    )
                    from datetime import datetime as _dt
                    import uuid as _uuid

                    notif = Notification(
                        id=f"gps_consent_{student_id}_{_uuid.uuid4().hex}",
                        parent_id=parent_id,
                        child_id=student_id,
                        type=NotificationType.REMINDER,
                        title="GPS Consent Required",
                        body=(
                            "Your child's teacher started a GPS-enabled activity. "
                            f"Tap to review and consent: {consent_url}"
                        ),
                        created_at=_dt.utcnow(),
                    )
                    await websocket_service.send_notification(notif)
                except Exception as _ne:
                    logger.debug(f"GPS notify parent {parent_id}: {_ne}")
    except Exception as e:
        logger.warning(f"_notify_parents_gps_consent non-fatal: {e}")


@router.post(
    "/activities/{activity_id}/start",
    response_model=LearningSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_activity_session(
    activity_id:  UUID,
    body:         StartSessionRequest,
    background_tasks: BackgroundTasks,
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

    # GPS: if activity has GPS capture enabled, notify parents of under-13 students
    if getattr(activity, "discovery_location_gps_capture_enabled", False):
        background_tasks.add_task(
            _notify_parents_gps_consent,
            str(session.id),
            str(activity_id),
        )

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

    try:
        q = select(EvidenceCapture).where(
            EvidenceCapture.session_id == session_id
        ).order_by(EvidenceCapture.created_at.asc())
        rows = (await db.execute(q)).scalars().all()
    except Exception:
        await db.rollback()
        rows = []

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

    # ── Privacy enforcement gate (runs BEFORE persisting) ────────────────────
    # In ENFORCEMENT_MODE=block this refuses non-compliant submissions; in
    # "log"/"warn" it never raises. Jurisdiction is derived from the student's
    # org inside enforce_on_submission().
    try:
        pre_enforcement = await enforce_on_submission(
            student_id=str(current_user.id),
            data_type="student_evidence",
            evidence_types=[capture_type],
            db=db,
        )
        if pre_enforcement.status == "BLOCKED":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=pre_enforcement.blocking_reason or "Submission blocked by privacy policy",
            )
    except HTTPException:
        raise
    except Exception as _pre_err:
        logger.warning("Pre-write enforcement check failed (allowing): %s", _pre_err)

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

    # Fire location_update event so teacher map picks up this student's position
    if capture.location_latitude is not None and capture.location_longitude is not None:
        await _fire_location_event(
            db,
            session_id=capture.session_id,
            student_id=capture.student_id,
            latitude=capture.location_latitude,
            longitude=capture.location_longitude,
        )

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
    Persist an uploaded file to Cloudflare R2 (S3-compatible).
    Falls back to local /app/uploads/ if CF_R2_ACCOUNT_ID is not configured (dev mode).
    """
    import core.config as _cfg
    settings = _cfg.settings
    import re
    import asyncio
    import functools

    # Sanitise filename
    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", upload.filename or "file")
    # Strip leading dots to block path-traversal sequences (e.g. "../../etc")
    safe_name = safe_name.lstrip(".")
    safe_name = re.sub(r"\.\.", "_", safe_name)  # collapse any remaining ".." pairs
    safe_name = safe_name or "file"
    safe_name = safe_name[:200]

    file_bytes = await upload.read()
    file_size = len(file_bytes)

    if not settings.CF_R2_ACCOUNT_ID:
        # Dev fallback: write to local volume
        import os
        upload_dir = f"{settings.UPLOAD_DIR}/sessions/{session_id}"
        os.makedirs(upload_dir, exist_ok=True)
        dest = f"{upload_dir}/{safe_name}"
        with open(dest, "wb") as fh:
            fh.write(file_bytes)
        return f"/uploads/sessions/{session_id}/{safe_name}", file_size

    # Production: upload to Cloudflare R2
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError

    endpoint_url = f"https://{settings.CF_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    key = f"sessions/{session_id}/{safe_name}"

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
        await asyncio.to_thread(_upload)
    except (BotoCoreError, ClientError) as exc:
        logger.error(f"R2 upload failed: {exc}")
        raise HTTPException(status_code=500, detail=f"File upload failed: {exc}")

    if settings.CF_R2_PUBLIC_URL:
        public_url = f"{settings.CF_R2_PUBLIC_URL.rstrip('/')}/{key}"
    else:
        public_url = f"r2://{settings.CF_R2_BUCKET_NAME}/{key}"

    return public_url, file_size


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

    try:
        q = select(NotebookEntry).where(
            NotebookEntry.session_id == session_id
        ).order_by(NotebookEntry.created_at.asc())
        rows = (await db.execute(q)).scalars().all()
    except Exception:
        await db.rollback()
        rows = []

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
# 6b. POST /sessions/{session_id}/complete-field  — mark field phase complete
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/sessions/{session_id}/complete-field")
async def complete_field_phase(
    session_id:   UUID,
    current_user: User         = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    """Mark the field / inquiry phase of a session as complete.

    Fail-open: if the session doesn't exist or belongs to another user, returns
    {"status": "ok"} anyway so the student flow is never blocked by this call.
    """
    try:
        session = await db.get(LearningSession, session_id)
        if session and str(session.student_id) == str(current_user.id):
            if session.status not in ("completed", "submitted"):
                session.status = "field_complete"
                db.add(session)
                await db.commit()
    except Exception as _err:
        logger.warning("complete-field non-blocking error: %s", _err)
    return {"status": "ok", "session_id": str(session_id)}


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

    # Count evidence + reflections (guarded — tables may not exist yet)
    evidence_count   = 0
    reflection_count = 0
    all_comps: set[str] = set()
    all_objs:  set[str] = set()
    try:
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

        for row in (await db.execute(cap_comps_q)).scalars().all():
            all_comps.update(row or [])
        for row in (await db.execute(ref_comps_q)).scalars().all():
            all_comps.update(row or [])

        # Unique objectives addressed across captures + reflections
        cap_obj_q = select(EvidenceCapture.learning_objectives).where(
            EvidenceCapture.session_id == session_id)
        ref_obj_q = select(NotebookEntry.learning_objectives).where(
            NotebookEntry.session_id == session_id)

        for row in (await db.execute(cap_obj_q)).scalars().all():
            all_objs.update(row or [])
        for row in (await db.execute(ref_obj_q)).scalars().all():
            all_objs.update(row or [])
    except Exception as _ec_err:
        logger.warning("get_session_progress: evidence/notebook query failed (tables may not exist): %s", _ec_err)
        await db.rollback()

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


# =============================================================================
# STUDENT DASHBOARD — GET /dashboard
# =============================================================================

@router.get("/dashboard")
async def get_student_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Student dashboard summary: recent activities, session counts, progress snapshot.
    Frontend: useStudentStore.fetchDashboard() → GET /api/v1/student/dashboard
    """
    # Recent sessions (last 5)
    sessions_result = await db.execute(
        select(LearningSession)
        .where(LearningSession.user_id == current_user.id)
        .order_by(LearningSession.created_at.desc())
        .limit(5)
    )
    recent_sessions = sessions_result.scalars().all()

    # Total sessions count
    total_result = await db.execute(
        select(func.count()).where(LearningSession.user_id == current_user.id)
    )
    total_sessions = total_result.scalar() or 0

    # Active (in-progress) sessions
    active_result = await db.execute(
        select(func.count()).where(
            and_(
                LearningSession.user_id == current_user.id,
                LearningSession.status == "in_progress",
            )
        )
    )
    active_sessions = active_result.scalar() or 0

    # Published activities available
    activities_result = await db.execute(
        select(Activity)
        .where(and_(Activity.status == "published", Activity.is_active == True))
        .order_by(Activity.created_at.desc())
        .limit(5)
    )
    recent_activities = activities_result.scalars().all()

    return {
        "student_id": str(current_user.id),
        "student_name": current_user.full_name or current_user.email,
        "total_sessions": total_sessions,
        "active_sessions": active_sessions,
        "recent_sessions": [
            {
                "id": str(s.id),
                "title": s.title,
                "status": s.status,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            }
            for s in recent_sessions
        ],
        "recent_activities": [
            {
                "id": str(a.id),
                "title": a.title,
                "subject": a.subject,
                "description": a.description or "",
                "grade_level": a.grade_level,
                "estimated_duration_minutes": a.estimated_duration_minutes,
                "location_name": a.location_name,
                "location": a.location_name,
                "bloom_level": a.bloom_level,
                "status": str(a.status.value) if hasattr(a.status, "value") else str(a.status),
                "due_date": a.created_at.isoformat() if a.created_at else None,
            }
            for a in recent_activities
        ],
    }


# =============================================================================
# STUDENT PROGRESS — GET /progress
# =============================================================================

@router.get("/progress")
async def get_student_progress(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Student competency progress summary.
    Frontend: useStudentStore.fetchProgress() → GET /api/v1/student/progress
    """
    # Count completed sessions by subject as a proxy for progress
    sessions_result = await db.execute(
        select(LearningSession)
        .where(
            and_(
                LearningSession.user_id == current_user.id,
                LearningSession.status == "completed",
            )
        )
    )
    completed_sessions = sessions_result.scalars().all()

    # Try to get competency data from student_competencies table
    try:
        from models.database import StudentCompetency
        comp_result = await db.execute(
            select(StudentCompetency)
            .where(StudentCompetency.student_id == current_user.id)
            .order_by(StudentCompetency.last_achieved_at.desc())
        )
        competencies = comp_result.scalars().all()
        progress_items = [
            {
                "competency_name": c.competency_name,
                "progress_percent": c.progress_percent,
                "evidence_count": c.evidence_count,
                "status": c.status.value if hasattr(c.status, "value") else str(c.status),
                "last_achieved_at": c.last_achieved_at.isoformat() if c.last_achieved_at else None,
            }
            for c in competencies
        ]
    except Exception:
        progress_items = []

    return {
        "student_id": str(current_user.id),
        "completed_sessions": len(completed_sessions),
        "progress": progress_items,
    }


# =============================================================================
# ── Field + Reflection endpoints ──────────────────────────────────────────────

from pydantic import BaseModel as _BaseModel
from sqlalchemy import text as _text
from datetime import timezone as _tz


class ReflectionSaveRequest(_BaseModel):
    reflection_content: dict           # {v:1, sections:[...]} — same shape as ExtendedWritingPanel
    linked_field_note_id: Optional[str] = None
    submit: bool = False               # False = save draft, True = submit for teacher review


@router.get("/pending-reflection")
async def pending_reflection_queue(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns activities where the student has completed field work but hasn't
    yet submitted their reflection. Drives the 'Pending Reflection' queue on
    the student dashboard.
    """
    rows = (await db.execute(
        _text("""
            SELECT
                sub.id                    AS sub_id,
                sub.completion_phase,
                sub.field_phase_status,
                sub.field_phase_feedback,
                sub.reflection_status,
                sub.linked_field_note_id,
                ls.id                     AS session_id,
                ls.created_at             AS started_at,
                a.id                      AS activity_id,
                a.title                   AS activity_title,
                a.subject,
                a.grade_level,
                a.completion_mode,
                a.require_field_approval
            FROM activity_submissions sub
            JOIN learning_sessions ls ON ls.id = sub.session_id
            JOIN activities a         ON a.id  = sub.activity_id
            WHERE sub.student_id = :uid
              AND a.completion_mode = 'field_and_reflection'
              AND sub.reflection_status IN ('not_started', 'in_progress')
              AND sub.completion_phase = 'field_work'
            ORDER BY sub.updated_at DESC
        """),
        {"uid": str(current_user.id)},
    )).mappings().all()

    result = []
    for r in rows:
        # Determine if student can start/continue reflection
        can_reflect = True
        if r["require_field_approval"] and r["field_phase_status"] not in ("approved",):
            can_reflect = False

        result.append({
            "submission_id":          str(r["sub_id"]),
            "session_id":             str(r["session_id"]),
            "activity_id":            str(r["activity_id"]),
            "activity_title":         r["activity_title"],
            "subject":                r["subject"],
            "grade_level":            r["grade_level"],
            "completion_phase":       r["completion_phase"],
            "field_phase_status":     r["field_phase_status"],
            "field_phase_feedback":   r["field_phase_feedback"],
            "reflection_status":      r["reflection_status"],
            "linked_field_note_id":   str(r["linked_field_note_id"]) if r["linked_field_note_id"] else None,
            "started_at":             r["started_at"].isoformat() if r["started_at"] else None,
            "can_reflect":            can_reflect,
            "awaiting_approval":      not can_reflect,
        })
    return result


@router.post("/submissions/{submission_id}/save-reflection")
async def save_reflection(
    submission_id: str,
    body: ReflectionSaveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Save (draft) or submit the reflection for a Field + Reflection activity.
    Linked field note is optional — student can write reflection without one.
    """
    # Verify ownership
    row = (await db.execute(
        _text("""
            SELECT sub.id, sub.completion_phase, sub.reflection_status,
                   a.completion_mode, a.require_field_approval,
                   sub.field_phase_status
            FROM activity_submissions sub
            JOIN activities a ON a.id = sub.activity_id
            WHERE sub.id = :sub_id AND sub.student_id = :uid
        """),
        {"sub_id": submission_id, "uid": str(current_user.id)},
    )).first()

    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    activity_id      = str(row[0])
    completion_mode  = row[1]
    require_approval = row[2]

    try:
        await db.execute(
            _text("""
                INSERT INTO activity_submissions
                    (student_id, session_id, activity_id, field_phase_status)
                VALUES (:uid, CAST(:sid AS uuid), CAST(:aid AS uuid), 'submitted')
                ON CONFLICT (student_id, activity_id) DO UPDATE
                    SET field_phase_status = 'submitted',
                        updated_at = NOW()
            """),
            {"uid": str(current_user.id), "sid": session_id, "aid": activity_id},
        )
        await db.commit()
    except Exception as e:
        logger.error(f"complete_field_phase error: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete field phase")

    return {"status": "submitted", "require_approval": require_approval}


# Student GPS self-consent (ages 13+)

class _StudentGPSConsentRequest(_BaseModel):
    activity_id: str
    consent_given: bool = True


@router.post("/consent/gps", status_code=201)
async def student_record_gps_consent(
    body: _StudentGPSConsentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Student (13+) records their own GPS-tracking consent for an activity.

    consent_logs is an append-only audit table (real FK on student_id, no
    unique constraint by design -- see database/init.sql / models.database.ConsentLog).
    Granting inserts a new row; revoking soft-closes any currently-active
    row(s) by setting withdrawn_at, rather than upserting a single "current
    state" row.
    """
    if current_user.role not in (UserRole.STUDENT, UserRole.HOMESCHOOL):
        raise HTTPException(status_code=403, detail="Student access only")

    try:
        if body.consent_given:
            await db.execute(
                _text("""
                    INSERT INTO consent_logs
                        (student_id, activity_id, consent_type, given_by_student,
                         consent_given_at, expires_at)
                    VALUES
                        (CAST(:sid AS uuid), CAST(:aid AS uuid), 'gps_tracking', TRUE,
                         NOW(), NOW() + INTERVAL '1 year')
                """),
                {"sid": str(current_user.id), "aid": body.activity_id},
            )
        else:
            await db.execute(
                _text("""
                    UPDATE consent_logs
                    SET withdrawn_at = NOW()
                    WHERE student_id   = CAST(:sid AS uuid)
                      AND activity_id  = CAST(:aid AS uuid)
                      AND consent_type = 'gps_tracking'
                      AND withdrawn_at IS NULL
                """),
                {"sid": str(current_user.id), "aid": body.activity_id},
            )
        await db.commit()
    except Exception as e:
        logger.error(f"Student GPS consent error: {e}")
        raise HTTPException(status_code=500, detail="Failed to record consent")

    return {"recorded": True, "consent_given": body.consent_given}


# =============================================================================
# ── Leaderboards for student-created ("reverse scavenger hunt") activities ──
#
# routes/proposals.py's approve_proposal() sets is_student_proposed=TRUE +
# proposed_by_student_id when a teacher approves a student's challenge into a
# real Activity. These two endpoints let any student browse those activities
# and see how their peers are doing on one — completed sessions ranked by
# time taken, in-progress ones by evidence_captures count as a proxy for "how
# far along" on a multi-step challenge (there's no explicit step/checkpoint
# count anywhere in the data model, so captures submitted is the closest
# real signal available without inventing new activity-authoring UI).
# =============================================================================

@router.get("/proposed-activities")
async def list_proposed_activities(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Published, student-proposed activities — the leaderboard picker list."""
    _require_student(current_user)

    result = await db.execute(
        _text("""
            SELECT a.id, a.title, a.subject, a.created_at,
                   u.first_name AS proposer_first_name, u.last_name AS proposer_last_name,
                   (SELECT COUNT(*) FROM learning_sessions ls WHERE ls.activity_id = a.id) AS participant_count
            FROM activities a
            LEFT JOIN users u ON u.id = a.proposed_by_student_id
            WHERE a.is_student_proposed = TRUE AND a.status = 'published' AND a.is_active = TRUE
            ORDER BY a.created_at DESC
        """)
    )
    rows = result.mappings().all()
    return [
        {
            "id": str(r["id"]),
            "title": r["title"],
            "subject": r["subject"],
            "proposed_by": (f"{r['proposer_first_name']} {r['proposer_last_name']}".strip()
                             if r["proposer_first_name"] else None),
            "participant_count": r["participant_count"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


@router.get("/activities/{activity_id}/leaderboard")
async def activity_leaderboard(
    activity_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Per-student standings for one activity. Completed sessions are ranked
    first, fastest completion time first; in-progress sessions follow,
    ranked by evidence captured so far (most first).
    """
    _require_student(current_user)

    result = await db.execute(
        _text("""
            SELECT
                ls.id AS session_id, ls.user_id AS student_id, ls.status,
                ls.created_at AS started_at, ls.completed_at,
                u.first_name, u.last_name,
                (SELECT COUNT(*) FROM evidence_captures ec WHERE ec.session_id = ls.id) AS captures_count
            FROM learning_sessions ls
            JOIN users u ON u.id = ls.user_id
            WHERE ls.activity_id = CAST(:aid AS uuid)
            ORDER BY ls.created_at ASC
        """),
        {"aid": activity_id},
    )
    rows = result.mappings().all()

    entries = []
    for r in rows:
        time_taken_seconds = None
        if r["status"] == "completed" and r["completed_at"] and r["started_at"]:
            time_taken_seconds = round((r["completed_at"] - r["started_at"]).total_seconds())
        entries.append({
            "student_id": str(r["student_id"]),
            "student_name": f"{r['first_name']} {r['last_name']}".strip(),
            "status": r["status"],
            "captures_count": r["captures_count"],
            "time_taken_seconds": time_taken_seconds,
            "started_at": r["started_at"].isoformat() if r["started_at"] else None,
            "is_you": str(r["student_id"]) == str(current_user.id),
        })

    completed = sorted(
        (e for e in entries if e["status"] == "completed"),
        key=lambda e: e["time_taken_seconds"] if e["time_taken_seconds"] is not None else float("inf"),
    )
    in_progress = sorted(
        (e for e in entries if e["status"] != "completed"),
        key=lambda e: e["captures_count"],
        reverse=True,
    )

    ranked = completed + in_progress
    for i, e in enumerate(ranked, start=1):
        e["rank"] = i

    return {"activity_id": activity_id, "entries": ranked}
