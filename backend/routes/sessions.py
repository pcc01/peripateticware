# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Learning sessions routes"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid
from core.database import get_db
from core.dependencies import get_current_user
from models.database import LearningSession, User, TripleJoinRecord
from services.polling import poll_interval_seconds
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateSessionRequest(BaseModel):
    """Create learning session request"""
    title: str
    curriculum_id: str
    latitude: float
    longitude: float
    location_name: str


class UpdateSessionRequest(BaseModel):
    """Update learning session request"""
    title: Optional[str] = None
    status: Optional[str] = None
    inquiry_log: Optional[dict] = None


class SessionResponse(BaseModel):
    """Learning session response"""
    session_id: str
    title: str
    curriculum_id: str
    activity_id: Optional[str] = None
    status: str
    location: dict
    inquiry_log: list = []
    created_at: str
    updated_at: str
    # Tiered live-tracking hint for useSessionWebSocket's poll cadence — None
    # when the session has no linked activity (nothing to derive a tier from).
    poll_interval_seconds: Optional[int] = None

    class Config:
        from_attributes = True


@router.post("/", response_model=SessionResponse)
async def create_session(
    request: CreateSessionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new learning session"""
    try:
        # SECURITY: previously fetched an arbitrary user via
        # `select(User).limit(1)` instead of requiring auth — any
        # unauthenticated caller could create sessions owned by whatever
        # user happened to be first in the table. Use the authenticated
        # caller instead.
        user = current_user

        # Create session
        session = LearningSession(
            user_id=user.id,
            curriculum_id=uuid.UUID(request.curriculum_id),
            title=request.title,
            latitude=request.latitude,
            longitude=request.longitude,
            location_name=request.location_name,
            status="in_progress",
            inquiry_log=[]
        )
        
        db.add(session)
        await db.commit()
        await db.refresh(session)
        
        logger.info(f"Created session: {session.id}")
        
        return SessionResponse(
            session_id=str(session.id),
            title=session.title,
            curriculum_id=str(session.curriculum_id),
            status=session.status,
            location={
                "latitude": session.latitude,
                "longitude": session.longitude,
                "name": session.location_name
            },
            created_at=session.created_at.isoformat(),
            updated_at=session.updated_at.isoformat()
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create session"
        )


async def _require_session_access(
    session: LearningSession, current_user: User, db: AsyncSession
) -> None:
    """Real ownership check, scoped to the specific student:

    - the student who owns the session
    - an org admin (role=ADMIN) — consistent with require_owns_resource()/
      require_same_org() elsewhere in the codebase
    - a teacher who authored the session's activity, OR who teaches a
      classroom this student is enrolled in (classroom_students join —
      same pattern as routes/activities.py teacher_students())
    - a parent/homeschool guardian linked to this specific student via
      parent_child_links (same pattern as routes/parent.py get_child_activities())

    Anonymous (unauthenticated) access is blocked by the route dependency.
    """
    role = (current_user.role or "").upper()

    if str(session.user_id) == str(current_user.id):
        return
    if role == "ADMIN":
        return

    if role == "TEACHER":
        result = await db.execute(
            text("""
                SELECT 1 WHERE EXISTS (
                    SELECT 1 FROM activities a
                    WHERE a.id = :activity_id AND a.teacher_id = :tid
                ) OR EXISTS (
                    SELECT 1 FROM classroom_students cs
                    JOIN classrooms c ON c.id = cs.classroom_id
                    WHERE cs.student_id = :student_id AND c.teacher_id = :tid
                )
            """),
            {
                "activity_id": session.activity_id,
                "tid": current_user.id,
                "student_id": session.user_id,
            },
        )
        if result.fetchone():
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if role in ("PARENT", "HOMESCHOOL"):
        result = await db.execute(
            text("SELECT 1 FROM parent_child_links WHERE parent_id = :pid AND child_id = :cid"),
            {"pid": current_user.id, "cid": session.user_id},
        )
        if result.fetchone():
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get learning session details"""
    try:
        query = select(LearningSession).where(
            LearningSession.id == uuid.UUID(session_id)
        )
        result = await db.execute(query)
        session = result.scalar()

        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        await _require_session_access(session, current_user, db)

        poll_interval = None
        if session.activity_id:
            act_row = (await db.execute(
                text("""
                    SELECT a.estimated_duration_minutes,
                           EXISTS (SELECT 1 FROM project_activities pa WHERE pa.activity_id = a.id) AS in_project
                    FROM activities a WHERE a.id = :aid
                """),
                {"aid": str(session.activity_id)},
            )).mappings().first()
            if act_row:
                poll_interval = poll_interval_seconds(
                    act_row["estimated_duration_minutes"], act_row["in_project"], detail=True
                )

        return SessionResponse(
            session_id=str(session.id),
            title=session.title,
            curriculum_id=str(session.curriculum_id) if session.curriculum_id else "",
            activity_id=str(session.activity_id) if session.activity_id else None,
            status=session.status,
            location={
                "latitude": session.latitude,
                "longitude": session.longitude,
                "name": session.location_name
            },
            inquiry_log=session.inquiry_log or [],
            created_at=session.created_at.isoformat(),
            updated_at=session.updated_at.isoformat(),
            poll_interval_seconds=poll_interval,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch session"
        )


@router.patch("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: str,
    request: UpdateSessionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update learning session"""
    try:
        query = select(LearningSession).where(
            LearningSession.id == uuid.UUID(session_id)
        )
        result = await db.execute(query)
        session = result.scalar()

        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        await _require_session_access(session, current_user, db)

        # Update fields
        if request.title:
            session.title = request.title
        if request.status:
            session.status = request.status
        if request.inquiry_log:
            session.inquiry_log = request.inquiry_log
        
        session.updated_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(session)
        
        logger.info(f"Updated session: {session.id}")
        
        return SessionResponse(
            session_id=str(session.id),
            title=session.title,
            curriculum_id=str(session.curriculum_id),
            status=session.status,
            location={
                "latitude": session.latitude,
                "longitude": session.longitude,
                "name": session.location_name
            },
            created_at=session.created_at.isoformat(),
            updated_at=session.updated_at.isoformat()
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating session: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update session"
        )


@router.get("/{session_id}/evidence")
async def get_evidence_of_learning(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get Evidence of Learning for a session (for parents/teachers)"""
    try:
        query = select(LearningSession).where(
            LearningSession.id == uuid.UUID(session_id)
        )
        result = await db.execute(query)
        session = result.scalar()

        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        await _require_session_access(session, current_user, db)

        return {
            "session_id": str(session.id),
            "title": session.title,
            "evidence": session.evidence or {},
            "status": session.status,
            "completed_at": session.completed_at.isoformat() if session.completed_at else None
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching evidence: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch evidence"
        )


@router.get("/{session_id}/inquiry-log")
async def get_inquiry_log(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get Aristotelian inquiry log (raw artifacts for teachers)"""
    try:
        query = select(LearningSession).where(
            LearningSession.id == uuid.UUID(session_id)
        )
        result = await db.execute(query)
        session = result.scalar()

        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        await _require_session_access(session, current_user, db)

        return {
            "session_id": str(session.id),
            "title": session.title,
            "inquiry_log": session.inquiry_log or [],
            "teacher_observations": []
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching inquiry log: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch inquiry log"
        )




# ── Session monitoring events (M-14) ──────────────────────────────────────

class SessionEventCreate(BaseModel):
    event_type: str  # phase_started | phase_completed | capture_added | geofence_exit
    phase: Optional[str] = None
    metadata: Optional[dict] = None

class SessionEventResponse(BaseModel):
    id: str
    session_id: str
    event_type: str
    phase: Optional[str]
    metadata: Optional[dict]
    created_at: str

@router.post("/{session_id}/events", status_code=201)
async def log_session_event(
    session_id: str,
    body: SessionEventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Student fires events during a session — teacher dashboard polls these."""
    # GPS consent gate: block location_update for under-13 students without consent
    if body.event_type == "location_update":
        try:
            from models.database import LearningSession as _LS, Activity as _Act
            sess_q = await db.execute(
                select(_LS).where(_LS.id == uuid.UUID(session_id))
            )
            sess = sess_q.scalar_one_or_none()
            if sess and sess.activity_id:
                act_q = await db.execute(
                    select(_Act).where(_Act.id == sess.activity_id)
                )
                act = act_q.scalar_one_or_none()
                if act and getattr(act, "discovery_location_gps_capture_enabled", False):
                    # Determine if consent is required (under-13 or flagged)
                    needs_consent = True
                    try:
                        user_row = await db.execute(
                            select(User).where(User.id == current_user.id)
                        )
                        user = user_row.scalar_one_or_none()
                        if user:
                            age_group = getattr(user, "age_group", None)
                            rpc = getattr(user, "requires_parental_consent", True)
                            if age_group not in ("under_13", None) and not rpc:
                                needs_consent = False  # 13+ self-consents separately
                    except Exception:
                        pass  # conservative: require consent on error
                    if needs_consent:
                        has_consent = await _check_gps_consent(
                            db, current_user.id, sess.activity_id
                        )
                        if not has_consent:
                            raise HTTPException(
                                status_code=403,
                                detail="gps_consent_required",
                            )
        except HTTPException:
            raise
        except Exception as _ge:
            logger.warning(f"GPS consent gate non-fatal: {_ge}")
            # Fail open — don't block the event if the check itself errors

    try:
        result = await db.execute(
            text("""
                INSERT INTO session_events (session_id, student_id, event_type, phase, metadata)
                VALUES (:sid, :uid, :etype, :phase, CAST(:meta AS jsonb))
                RETURNING id, created_at
            """),
            {
                "sid": session_id,
                "uid": str(current_user.id),
                "etype": body.event_type,
                "phase": body.phase,
                "meta": __import__('json').dumps(body.metadata or {}),
            }
        )
        row = result.fetchone()
        await db.commit()
        return {"id": str(row[0]), "created_at": str(row[1])}
    except Exception as e:
        logger.error(f"Event log error: {e}")
        raise HTTPException(status_code=500, detail="Failed to log event")


@router.get("/{session_id}/events")
async def get_session_events(
    session_id: str,
    since: Optional[str] = Query(None, description="ISO timestamp — return events after this time"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Teacher polls this to see live student progress (teacher-scoped)."""
    # Role guard — students must not poll other students' events
    allowed_roles = {"TEACHER", "ADMIN", "HOMESCHOOL", "PROFESSOR"}
    if current_user.role.upper() not in allowed_roles:
        raise HTTPException(status_code=403, detail="Teacher access required")

    # Ownership guard — teacher must own the session's activity
    try:
        sess_result = await db.execute(
            select(LearningSession).where(LearningSession.id == uuid.UUID(session_id))
        )
        session = sess_result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        # Admins bypass ownership check
        if current_user.role.upper() != "ADMIN" and session.user_id != current_user.id:
            # Also allow the teacher who owns the activity
            from models.database import Activity as _Activity
            act_result = await db.execute(
                select(_Activity).where(_Activity.id == session.activity_id)
            )
            act = act_result.scalar_one_or_none()
            if not act or act.teacher_id != current_user.id:
                raise HTTPException(status_code=403, detail="You do not own this session")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Session ownership check error: {e}")

    try:
        where = "WHERE session_id = :sid"
        params: dict = {"sid": session_id}
        if since:
            where += " AND created_at > CAST(:since AS timestamp)"
            params["since"] = since
        result = await db.execute(
            text(f"SELECT * FROM session_events {where} ORDER BY created_at ASC"),
            params
        )
        rows = result.mappings().all()
        return {"events": [dict(r) for r in rows], "count": len(rows)}
    except Exception as e:
        logger.error(f"Events fetch error: {e}")
        return {"events": [], "count": 0}


# ── GPS Location-update helpers (used by student submission routes) ────────
# NOTE: session_events table DDL lives in backend/startup.py (see
# apply_student_phase7_migrations) — do not add inline CREATE TABLE here.

async def _fire_location_event(
    db: AsyncSession,
    session_id,
    student_id,
    latitude: float,
    longitude: float,
) -> None:
    """Best-effort insert of a location_update event.  Never raises."""
    import json
    try:
        await db.execute(
            text("""
                INSERT INTO session_events (session_id, student_id, event_type, metadata)
                VALUES (:sid, :uid, 'location_update', CAST(:meta AS jsonb))
            """),
            {
                "sid": str(session_id),
                "uid": str(student_id),
                "meta": json.dumps({
                    "latitude": latitude,
                    "longitude": longitude,
                    "accuracy": None,
                    "student_id": str(student_id),
                }),
            },
        )
        await db.commit()
    except Exception as exc:
        logger.warning(f"_fire_location_event non-fatal error: {exc}")


async def _check_gps_consent(
    db: AsyncSession,
    student_id,
    activity_id,
) -> bool:
    """Return True if active GPS-tracking consent exists for this student+activity.

    consent_logs is a real, pre-existing append-only audit table (student_id
    is a genuine FK to users.id, not a hash -- see database/init.sql /
    models.database.ConsentLog). "Active consent" = the most recent
    gps_tracking row for this student+activity that hasn't been withdrawn
    or expired and was actually granted (by the student or a parent).
    """
    if not activity_id:
        return False
    try:
        result = await db.execute(
            text("""
                SELECT id FROM consent_logs
                WHERE student_id   = CAST(:sid AS uuid)
                  AND consent_type = 'gps_tracking'
                  AND activity_id  = CAST(:aid AS uuid)
                  AND (given_by_student = TRUE OR given_by_parent = TRUE)
                  AND withdrawn_at IS NULL
                  AND (expires_at IS NULL OR expires_at > NOW())
                ORDER BY consent_given_at DESC
                LIMIT 1
            """),
            {"sid": str(student_id), "aid": str(activity_id)},
        )
        row = result.fetchone()
        return row is not None
    except Exception as exc:
        logger.warning(f"_check_gps_consent non-fatal error: {exc}")
        return False
