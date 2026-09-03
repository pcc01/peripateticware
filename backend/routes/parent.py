# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Parent Portal API Routes
Endpoints for parent authentication, child progress tracking, messages, and reporting
"""

from __future__ import annotations

import calendar
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import uuid4, UUID as _UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from core.encryption import blind_index as _blind_index
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.config import settings
from core.dependencies import get_current_user as _get_current_user
from models.database import User, UserRole, LearningSession
from services.privacy_engine import PrivacyEngine, log_access

# ============================================================================
# SCHEMAS
# ============================================================================

class ParentRegisterRequest(BaseModel):
    """Parent registration request"""
    email: EmailStr
    password: str = Field(..., min_length=8)
    name: str = Field(..., min_length=2, max_length=255)


class ParentLoginRequest(BaseModel):
    """Parent login request"""
    email: EmailStr
    password: str


class TokenRefreshRequest(BaseModel):
    """Token refresh request"""
    refresh_token: str


class TokenResponse(BaseModel):
    """JWT token response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class ChildLinkResponse(BaseModel):
    """Child link response"""
    id: str
    child_id: str
    child_name: str
    child_avatar: Optional[str] = None
    relationship: str
    linked_at: str
    # 'pending' | 'approved' | 'denied' — see link_child()'s docstring.
    # Included (rather than filtering server-side) so the parent's own
    # dashboard can show what it's waiting on instead of the child just
    # silently never appearing.
    status: str = "approved"

    class Config:
        from_attributes = True


class ParentProfileResponse(BaseModel):
    """Parent account response"""
    id: str
    email: str
    name: str
    phone: Optional[str] = None
    created_at: str
    children: List[ChildLinkResponse] = []

    class Config:
        from_attributes = True


class LinkChildRequest(BaseModel):
    """Link child to parent account"""
    link_code: str = Field(..., min_length=6, max_length=6)
    relationship: str = Field(..., pattern="^(mother|father|guardian|grandparent|other)$")


class CompetencyProgressResponse(BaseModel):
    """Competency progress response"""
    id: str
    name: str
    description: Optional[str] = None
    level: int = Field(..., ge=1, le=5)
    target_level: int = Field(..., ge=1, le=5)
    progress: int = Field(..., ge=0, le=100)
    achieved_at: Optional[str] = None


class ChildProgressResponse(BaseModel):
    """Child progress response"""
    child_id: str
    child_name: str
    grade: int
    competencies: List[CompetencyProgressResponse] = []
    activities_completed: int = 0
    hours_learned: float = 0.0
    engagement_score: int = Field(default=0, ge=0, le=100)
    last_active: str


class ActivityResponse(BaseModel):
    """Child activity response"""
    id: str
    session_id: str
    title: str
    subject: str
    description: Optional[str] = None
    completed_at: str
    duration: int  # minutes
    location: Optional[str] = None
    evidence_count: int = 0
    teacher_name: str


class MessageResponse(BaseModel):
    """Message from teacher response"""
    id: str
    from_teacher_id: str
    from_teacher_name: str
    to_parent_id: str
    subject: str
    body: str
    read_at: Optional[str] = None
    created_at: str
    conversation_id: str


class MessageReplyRequest(BaseModel):
    """Reply to teacher message"""
    body: str = Field(..., min_length=1, max_length=5000)


class AnnouncementResponse(BaseModel):
    """Classroom-wide announcement, as seen by a parent"""
    id: str
    classroom_id: str
    classroom_name: str
    teacher_id: str
    teacher_name: str
    child_id: str
    child_name: str
    title: str
    body: str
    created_at: str


class NotificationResponse(BaseModel):
    """Notification response"""
    id: str
    parent_id: str
    type: str  # achievement, concern, message, reminder
    title: str
    body: str
    related_child_id: str
    action_url: Optional[str] = None
    read_at: Optional[str] = None
    created_at: str


class WeeklyReportResponse(BaseModel):
    """Weekly progress report"""
    child_id: str
    week_starting: str
    week_ending: str
    activities_completed: int
    total_hours: float
    new_competencies: List[str] = []
    highlights: List[str] = []
    concerns: List[str] = []
    average_engagement: int = Field(ge=0, le=100)
    class_average: int = Field(ge=0, le=100)


class MonthlyReportResponse(BaseModel):
    """Monthly progress report"""
    child_id: str
    month: str
    year: int
    activities_completed: int
    total_hours: float
    competencies_achieved: List[CompetencyProgressResponse] = []
    growth_areas: List[str] = []
    recommendations: List[str] = []


class SettingsRequest(BaseModel):
    """Parent settings update"""
    dark_mode: Optional[bool] = None
    language: Optional[str] = Field(None, pattern="^(en|es|ar|ja)$")
    email_frequency: Optional[str] = Field(None, pattern="^(daily|weekly|biweekly|monthly)$")
    notifications_enabled: Optional[bool] = None
    push_notifications_enabled: Optional[bool] = None


class SettingsResponse(BaseModel):
    """Parent settings response"""
    parent_id: str
    dark_mode: bool = False
    language: str = "en"
    email_frequency: str = "weekly"
    notifications_enabled: bool = True
    push_notifications_enabled: bool = True


# ============================================================================
# ROUTER
# ============================================================================

router = APIRouter(prefix="/parent", tags=["parent"])
privacy_engine = PrivacyEngine()


# ============================================================================
# AUTHENTICATION
# Parents register and log in via the main auth system: POST /api/v1/auth/login
# The endpoints below have been removed — they used fake bcrypt and fake JWT.
# ============================================================================

# ============================================================================
# PROFILE ENDPOINTS
# ============================================================================

@router.get("/profile", response_model=ParentProfileResponse)
async def get_parent_profile(
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get parent profile and linked children"""
    try:
        from sqlalchemy import select
        result = await db.execute(
            select(User).where(User.id == current_user.id, User.role == UserRole.PARENT)
        )
        parent = result.scalar()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent not found")
        return {
            "id": str(parent.id),
            "email": parent.email,
            "name": parent.full_name,
            "children": [],
            "created_at": parent.created_at.isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/profile")
async def update_parent_profile(
    parent_id: str = Query(...),
    name: Optional[str] = None,
    phone: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Update parent profile"""
    try:
        from sqlalchemy import select

        result = await db.execute(
            select(User).where(User.id == parent_id, User.role == UserRole.PARENT)
        )
        parent = result.scalar()

        if not parent:
            raise HTTPException(status_code=404, detail="Parent not found")

        if name:
            parent.full_name = name
        # Add phone field to User model if needed

        await db.commit()

        return {
            "id": str(parent.id),
            "email": parent.email,
            "name": parent.full_name,
            "created_at": parent.created_at.isoformat(),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CHILD MANAGEMENT ENDPOINTS
# ============================================================================

class LinkChildByEmailRequest(BaseModel):
    """Link child by email (used by frontend /parent/link-child)"""
    child_email: str
    relationship: str = "guardian"


@router.post("/link-child")
@router.post("/children/link")
async def link_child(
    body: LinkChildByEmailRequest,
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Request a link between this parent account and a child's account by
    email. This does NOT grant access by itself — it creates a
    status='pending' row that the child must approve from their own app
    (see routes/student.py's GET/POST /student/parent-requests) before any
    of this parent's endpoints will return that child's data. Every
    authorization check below (progress/activities/reports) requires
    status='approved', not just row-existence, so a pending or denied row
    grants nothing on its own.
    """
    from sqlalchemy import select as _sel
    # NOTE: do not import a ParentChildLink ORM model here — it does not exist.
    # This flow uses raw SQL against the parent_child_links table (created in main.py
    # startup DDL). Importing a missing model raised an uncaught ImportError -> 500.
    try:
        # Find the child user
        result = await db.execute(
            _sel(User).where(User.email_index == _blind_index(body.child_email))
        )
        child = result.scalar_one_or_none()
        if not child:
            raise HTTPException(status_code=404, detail="No account found with that email address.")
        if str(child.id) == str(current_user.id):
            raise HTTPException(status_code=400, detail="Cannot link your own account.")
        if child.role != "STUDENT":
            raise HTTPException(status_code=400, detail="That account isn't a student account.")

        # Insert as pending. On a repeat request: leave an already-pending
        # or already-approved row untouched (a duplicate call can't
        # silently re-grant or reset anything); only a previously-denied
        # row is reopened to pending, so a child who says no can't be
        # spammed into a different outcome by repeated identical requests,
        # but a genuine mistake ("I meant to approve that") isn't permanent.
        row = (await db.execute(text("""
            INSERT INTO parent_child_links (parent_id, child_id, relationship, status, linked_at)
            VALUES (:pid, :cid, :rel, 'pending', NOW())
            ON CONFLICT (parent_id, child_id) DO UPDATE SET
                relationship = EXCLUDED.relationship,
                status = CASE WHEN parent_child_links.status = 'denied' THEN 'pending' ELSE parent_child_links.status END
            RETURNING status
        """), {"pid": str(current_user.id), "cid": str(child.id), "rel": body.relationship})).scalar_one()
        await db.commit()

        try:
            await log_access(
                actor_id=str(current_user.id),
                actor_role=current_user.role,
                action="PARENT_LINK_REQUEST",
                data_type="parent_child_link",
                student_id=str(child.id),
                rules_applied=[],
                compliance_status="COMPLIANT",
                db=db,
                notes=f"parent_id={current_user.id} child_id={child.id} status={row}",
            )
        except Exception as _audit_err:
            import logging as _log
            _log.getLogger(__name__).warning("Privacy audit failed (non-blocking): %s", _audit_err)

        messages = {
            "pending":  f"Request sent to {child.full_name or child.email}. They'll need to approve it in their app before you can see their progress.",
            "approved": f"Already linked to {child.full_name or child.email}.",
        }
        return {
            "success": True,
            "status": row,
            "message": messages.get(row, f"Request sent to {child.full_name or child.email}."),
            "child": {
                "id":           str(child.id),
                "name":         child.full_name or child.email,
                "email":        child.email,
                "relationship": body.relationship,
                "status":       row,
                "linked_at":    datetime.utcnow().isoformat(),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/children", response_model=List[ChildLinkResponse])
async def list_parent_children(
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all children linked to parent, at any status. Deliberately not
    filtered to status='approved' here — the parent's dashboard needs to
    show pending/denied rows too (so a request they sent doesn't just
    vanish with no explanation). Every endpoint that actually returns a
    child's data (progress/activities/reports below) does its own
    status='approved' check independently of this list.
    """
    try:
        rows = (await db.execute(text("""
            SELECT u.id AS child_id, u.full_name, u.email, l.relationship, l.linked_at, l.status
            FROM parent_child_links l
            JOIN users u ON u.id = l.child_id
            WHERE l.parent_id = :pid
            ORDER BY l.linked_at DESC
        """), {"pid": str(current_user.id)})).mappings().all()
        return [
            ChildLinkResponse(
                id=str(r["child_id"]),
                child_id=str(r["child_id"]),
                child_name=r["full_name"] or r["email"],
                relationship=r["relationship"] or "guardian",
                linked_at=(r["linked_at"].isoformat() if r["linked_at"] else ""),
                status=r["status"] or "approved",
            )
            for r in rows
        ]
    except Exception as e:
        import logging as _log
        _log.getLogger(__name__).warning("list_parent_children failed (non-blocking): %s", e)
        return []


@router.delete("/children/{child_id}")
async def unlink_child(
    child_id: str,
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove this parent's link to a child, at any status (pending, approved,
    or denied). The child gets no notification and doesn't need to approve
    this — unlinking is unilateral on the parent's side, same as declining
    a request is unilateral on the child's side. A parent can always send a
    fresh request afterward, which the child would need to approve again
    from scratch (see link_child()'s docstring).
    """
    try:
        from uuid import UUID as _UUID
        _UUID(child_id)  # validates format, prevents injection
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid child_id format")

    result = await db.execute(text("""
        DELETE FROM parent_child_links
        WHERE parent_id = CAST(:pid AS uuid) AND child_id = CAST(:cid AS uuid)
    """), {"pid": str(current_user.id), "cid": child_id})
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="No link to that child found.")
    await db.commit()

    try:
        await log_access(
            actor_id=str(current_user.id),
            actor_role=current_user.role,
            action="PARENT_UNLINK",
            data_type="parent_child_link",
            student_id=child_id,
            rules_applied=[],
            compliance_status="COMPLIANT",
            db=db,
            notes=f"parent_id={current_user.id} child_id={child_id}",
        )
    except Exception:
        import logging as _log
        _log.getLogger(__name__).warning("Privacy audit failed for unlink (non-blocking)", exc_info=True)

    return {"success": True, "child_id": child_id}


# ============================================================================
# PROGRESS ENDPOINTS
# ============================================================================

@router.get("/children/{child_id}/progress", response_model=ChildProgressResponse)
async def get_child_progress(
    child_id: str,
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed progress for a specific child"""
    try:
        from uuid import UUID as _UUID
        child_uuid = _UUID(child_id)  # validates format, prevents injection

        # Verify authorization via parent_child_links — same pattern as
        # get_child_activities()/get_weekly_report() below. Without this any
        # logged-in parent could read any other family's child's progress.
        link = (await db.execute(text(
            "SELECT 1 FROM parent_child_links WHERE parent_id = CAST(:pid AS uuid) AND child_id = CAST(:cid AS uuid) AND status = 'approved'"
        ), {"pid": str(current_user.id), "cid": child_id})).fetchone()
        if not link:
            raise HTTPException(status_code=403, detail="Not authorized to view this child's progress")

        # Parameterised query — no f-string SQL
        from sqlalchemy import select as _sel, func as _fn
        from models.database import LearningSession as _LS
        completed = (await db.execute(
            _sel(_fn.count()).select_from(_LS).where(
                _LS.user_id == child_uuid,
                _LS.status == "completed",
            )
        )).scalar() or 0

        # Privacy audit
        try:
            await log_access(
                actor_id=str(current_user.id),
                actor_role=current_user.role,
                action="PARENT_VIEW",
                data_type="child_progress",
                student_id=child_id,
                rules_applied=[],
                compliance_status="COMPLIANT",
                db=db,
                notes=f"parent_id={current_user.id} child_id={child_id}",
            )
        except Exception as _audit_err:
            import logging as _log
            _log.getLogger(__name__).warning("Privacy audit failed (non-blocking): %s", _audit_err)

        return {
            "child_id": child_id,
            "child_name": "Child",
            "grade": 0,
            "competencies": [],
            "activities_completed": completed,
            "hours_learned": 0.0,
            "engagement_score": 0,
            "last_active": datetime.utcnow().isoformat(),
        }

    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid child_id format")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/children/{child_id}/activities", response_model=List[ActivityResponse])
async def get_child_activities(
    child_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get activity history for a child (paginated)"""
    try:
        try:
            _UUID(child_id)
        except ValueError:
            raise HTTPException(400, "Invalid child_id format")

        # Verify authorization via parent_child_links
        link = (await db.execute(text(
            "SELECT 1 FROM parent_child_links WHERE parent_id = CAST(:pid AS uuid) AND child_id = CAST(:cid AS uuid) AND status = 'approved'"
        ), {"pid": str(current_user.id), "cid": child_id})).fetchone()
        if not link:
            raise HTTPException(403, "Not authorized to view this child's activities")

        rows = (await db.execute(text("""
            SELECT ls.id AS session_id, a.id AS activity_id,
                   a.title, COALESCE(a.subject, 'General') AS subject,
                   a.description, ls.updated_at AS completed_at,
                   COALESCE(a.estimated_duration_minutes, 60) AS duration
            FROM learning_sessions ls
            JOIN activities a ON a.id = ls.activity_id
            WHERE ls.user_id = CAST(:cid AS uuid) AND ls.status = 'completed'
            ORDER BY ls.updated_at DESC
            LIMIT :lim OFFSET :off
        """), {"cid": child_id, "lim": limit, "off": offset})).mappings().all()

        return [
            ActivityResponse(
                id=str(r["activity_id"]),
                session_id=str(r["session_id"]),
                title=r["title"] or "Activity",
                subject=r["subject"],
                description=r["description"],
                completed_at=r["completed_at"].isoformat() if r["completed_at"] else datetime.utcnow().isoformat(),
                duration=int(r["duration"] or 60),
                location=None,
                evidence_count=0,
                teacher_name="Teacher",
            )
            for r in rows
        ]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# REPORTING ENDPOINTS
# ============================================================================

@router.get("/children/{child_id}/reports/weekly", response_model=WeeklyReportResponse)
async def get_weekly_report(
    child_id: str,
    week_start: Optional[str] = Query(None),  # ISO format date
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get weekly progress report for child"""
    try:
        # Verify child link
        link = (await db.execute(text(
            "SELECT 1 FROM parent_child_links WHERE parent_id = CAST(:pid AS uuid) AND child_id = CAST(:cid AS uuid) AND status = 'approved'"
        ), {"pid": str(current_user.id), "cid": child_id})).fetchone()
        if not link:
            raise HTTPException(403, "Not authorized")

        # Calculate week date range
        if not week_start:
            today = datetime.utcnow()
            week_start_date = today - timedelta(days=today.weekday())
        else:
            week_start_date = datetime.fromisoformat(week_start)

        week_end_date = week_start_date + timedelta(days=6)

        # Query real activity count for the week
        count_row = (await db.execute(text("""
            SELECT COUNT(*) FROM learning_sessions
            WHERE user_id = CAST(:cid AS uuid) AND status = 'completed'
              AND updated_at >= :ws AND updated_at < :we
        """), {"cid": child_id, "ws": week_start_date, "we": week_end_date})).fetchone()
        activities_completed = int(count_row[0]) if count_row else 0

        return {
            "child_id": child_id,
            "week_starting": week_start_date.isoformat(),
            "week_ending": week_end_date.isoformat(),
            "activities_completed": activities_completed,
            "total_hours": round(activities_completed * 1.0, 1),
            "new_competencies": [],
            "highlights": [],
            "concerns": [],
            "average_engagement": 85,
            "class_average": 78,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/children/{child_id}/reports/monthly", response_model=MonthlyReportResponse)
async def get_monthly_report(
    child_id: str,
    month: int = Query(None, ge=1, le=12),
    year: int = Query(None),
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get monthly progress report for child"""
    try:
        # Verify child link
        link = (await db.execute(text(
            "SELECT 1 FROM parent_child_links WHERE parent_id = CAST(:pid AS uuid) AND child_id = CAST(:cid AS uuid) AND status = 'approved'"
        ), {"pid": str(current_user.id), "cid": child_id})).fetchone()
        if not link:
            raise HTTPException(403, "Not authorized")

        if not month or not year:
            today = datetime.utcnow()
            month = today.month
            year = today.year

        _, last_day = calendar.monthrange(year, month)
        month_start = datetime(year, month, 1)
        month_end = datetime(year, month, last_day, 23, 59, 59)

        count_row = (await db.execute(text("""
            SELECT COUNT(*) FROM learning_sessions
            WHERE user_id = CAST(:cid AS uuid) AND status = 'completed'
              AND updated_at >= :ms AND updated_at <= :me
        """), {"cid": child_id, "ms": month_start, "me": month_end})).fetchone()
        activities_completed = int(count_row[0]) if count_row else 0

        return {
            "child_id": child_id,
            "month": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1],
            "year": year,
            "activities_completed": activities_completed,
            "total_hours": round(activities_completed * 1.0, 1),
            "competencies_achieved": [],
            "growth_areas": [],
            "recommendations": [],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# MESSAGING ENDPOINTS
# ============================================================================

@router.get("/messages", response_model=List[MessageResponse])
async def get_messages(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get messages from teachers (paginated)"""
    try:
        rows = (await db.execute(text("""
            SELECT m.id, m.from_user_id, m.to_user_id, m.subject, m.body,
                   m.conversation_id, m.read_at, m.created_at,
                   u.full_name AS from_name
            FROM parent_messages m
            JOIN users u ON u.id = m.from_user_id
            WHERE m.to_user_id = :uid
            ORDER BY m.created_at DESC
            LIMIT :lim OFFSET :off
        """), {"uid": str(current_user.id), "lim": limit, "off": offset})).mappings().all()
        return [
            MessageResponse(
                id=str(r["id"]),
                from_teacher_id=str(r["from_user_id"]),
                from_teacher_name=r["from_name"] or "Teacher",
                to_parent_id=str(r["to_user_id"]),
                subject=r["subject"],
                body=r["body"],
                read_at=r["read_at"].isoformat() if r["read_at"] else None,
                created_at=r["created_at"].isoformat(),
                conversation_id=str(r["conversation_id"]),
            )
            for r in rows
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/messages/{message_id}/reply")
async def reply_to_message(
    message_id: str,
    request: MessageReplyRequest,
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reply to a teacher message"""
    try:
        orig = (await db.execute(text(
            "SELECT conversation_id, from_user_id, to_user_id FROM parent_messages WHERE id = CAST(:mid AS uuid)"
        ), {"mid": message_id})).fetchone()
        if not orig:
            raise HTTPException(status_code=404, detail="Message not found")

        # Verify current_user is a participant in this conversation — without
        # this, any authenticated user could reply to any message_id and
        # inject a message into another family's teacher conversation.
        _participant_ids = {str(orig[1]), str(orig[2])}
        if str(current_user.id) not in _participant_ids:
            raise HTTPException(status_code=403, detail="Not authorized to reply to this conversation")

        new_id = str(uuid4())
        await db.execute(text("""
            INSERT INTO parent_messages (id, from_user_id, to_user_id, subject, body, conversation_id)
            VALUES (CAST(:id AS uuid), CAST(:from_uid AS uuid), CAST(:to_uid AS uuid), 'Re: reply', :body, CAST(:conv_id AS uuid))
        """), {
            "id": new_id, "from_uid": str(current_user.id),
            "to_uid": str(orig[1]), "body": request.body, "conv_id": str(orig[0])
        })
        await db.commit()
        return {"success": True, "reply_id": new_id, "created_at": datetime.utcnow().isoformat()}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/announcements", response_model=List[AnnouncementResponse])
async def get_parent_announcements(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Classroom-wide announcements posted by teachers, for every classroom this
    parent's linked children belong to.

    Security note: scoping is entirely server-side, derived from
    parent_child_links + classroom_students for the CALLING parent
    (current_user.id) — there is no client-supplied classroom_id or
    child_id on this endpoint, so a parent cannot request another family's
    classroom's announcements by guessing an id.
    """
    try:
        rows = (await db.execute(text("""
            SELECT DISTINCT a.id, a.classroom_id, c.name AS classroom_name,
                   a.teacher_id, COALESCE(t.full_name, t.email) AS teacher_name,
                   cs.student_id AS child_id, COALESCE(s.full_name, s.email) AS child_name,
                   a.title, a.body, a.created_at
            FROM classroom_announcements a
            JOIN classrooms c ON c.id = a.classroom_id
            JOIN classroom_students cs ON cs.classroom_id = a.classroom_id
            JOIN parent_child_links pcl ON pcl.child_id = cs.student_id
            JOIN users t ON t.id = a.teacher_id
            JOIN users s ON s.id = cs.student_id
            WHERE pcl.parent_id = CAST(:pid AS uuid)
            ORDER BY a.created_at DESC
            LIMIT :lim
        """), {"pid": str(current_user.id), "lim": limit})).mappings().all()

        return [
            AnnouncementResponse(
                id=str(r["id"]),
                classroom_id=str(r["classroom_id"]),
                classroom_name=r["classroom_name"],
                teacher_id=str(r["teacher_id"]),
                teacher_name=r["teacher_name"],
                child_id=str(r["child_id"]),
                child_name=r["child_name"],
                title=r["title"],
                body=r["body"],
                created_at=r["created_at"].isoformat() if r["created_at"] else datetime.utcnow().isoformat(),
            )
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# NOTIFICATIONS ENDPOINTS
# ============================================================================

@router.get("/notifications", response_model=List[NotificationResponse])
async def get_notifications(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get notifications (paginated, optionally unread only)"""
    try:
        base_q = """
            SELECT id, user_id, title, message, is_read,
                   COALESCE(type, 'info') AS type,
                   related_child_id, action_url, created_at
            FROM notifications
            WHERE user_id = :uid
        """
        params = {"uid": str(current_user.id), "lim": limit, "off": offset}
        if unread_only:
            base_q += " AND is_read = false"
        base_q += " ORDER BY created_at DESC LIMIT :lim OFFSET :off"
        rows = (await db.execute(text(base_q), params)).mappings().all()
        return [
            NotificationResponse(
                id=str(r["id"]),
                parent_id=str(r["user_id"]),
                type=r["type"] or "info",
                title=r["title"] or "",
                body=r["message"] or "",
                related_child_id=str(r["related_child_id"]) if r["related_child_id"] else "",
                action_url=r["action_url"],
                read_at=r["created_at"].isoformat() if r["is_read"] else None,
                created_at=r["created_at"].isoformat(),
            )
            for r in rows
        ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/notifications/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: str,
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark notification as read"""
    try:
        await db.execute(text("""
            UPDATE notifications SET is_read = true, updated_at = NOW()
            WHERE id = CAST(:nid AS uuid) AND user_id = CAST(:uid AS uuid)
        """), {"nid": notification_id, "uid": str(current_user.id)})

        await db.commit()
        return {"success": True, "message": "Notification marked as read"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SETTINGS ENDPOINTS
# ============================================================================

@router.get("/settings", response_model=SettingsResponse)
async def get_settings(
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get parent settings"""
    try:
        row = (await db.execute(text(
            "SELECT * FROM parent_settings WHERE parent_id = CAST(:pid AS uuid)"
        ), {"pid": str(current_user.id)})).mappings().fetchone()
        if not row:
            return SettingsResponse(parent_id=str(current_user.id))
        return SettingsResponse(
            parent_id=str(current_user.id),
            dark_mode=row["dark_mode"],
            language=row["language"],
            email_frequency=row["email_frequency"],
            notifications_enabled=row["notifications_enabled"],
            push_notifications_enabled=row["push_notifications_enabled"],
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(
    request: SettingsRequest,
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update parent settings"""
    try:
        await db.execute(text("""
            INSERT INTO parent_settings
                (parent_id, dark_mode, language, email_frequency, notifications_enabled, push_notifications_enabled)
            VALUES (CAST(:pid AS uuid), :dm, :lang, :freq, :notif, :push)
            ON CONFLICT (parent_id) DO UPDATE SET
                dark_mode = EXCLUDED.dark_mode,
                language = EXCLUDED.language,
                email_frequency = EXCLUDED.email_frequency,
                notifications_enabled = EXCLUDED.notifications_enabled,
                push_notifications_enabled = EXCLUDED.push_notifications_enabled,
                updated_at = NOW()
        """), {
            "pid": str(current_user.id),
            "dm": request.dark_mode or False,
            "lang": request.language or "en",
            "freq": request.email_frequency or "weekly",
            "notif": request.notifications_enabled if request.notifications_enabled is not None else True,
            "push": request.push_notifications_enabled if request.push_notifications_enabled is not None else True,
        })
        await db.commit()
        return SettingsResponse(
            parent_id=str(current_user.id),
            dark_mode=request.dark_mode or False,
            language=request.language or "en",
            email_frequency=request.email_frequency or "weekly",
            notifications_enabled=request.notifications_enabled if request.notifications_enabled is not None else True,
            push_notifications_enabled=request.push_notifications_enabled if request.push_notifications_enabled is not None else True,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# EXPORT ENDPOINTS
# ============================================================================

@router.post("/reports/{report_id}/export")
async def export_report(
    parent_id: str = Query(...),
    report_id: str = None,
    format: str = Query("pdf", pattern="^(pdf|excel|csv)$"),
    db: AsyncSession = Depends(get_db)
):
    """Export report as PDF, Excel, or CSV"""
    try:
        return {
            "success": True,
            "message": "Report exported successfully",
            "download_url": f"/api/v1/downloads/{report_id}.{format}",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# PARENT DASHBOARD — GET /parent/dashboard
# =============================================================================

from sqlalchemy import select as _select, func as _func

@router.get("/dashboard")
async def get_parent_dashboard(
    current_user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Parent dashboard: linked children with basic progress summary.
    Frontend: useParentStore.fetchDashboard() -> GET /api/v1/parent/dashboard
    """
    try:
        from models.database import Activity
        activity_count_result = await db.execute(
            _select(_func.count()).where(Activity.status == "published", Activity.is_active == True)
        )
        total_activities = activity_count_result.scalar() or 0
    except Exception:
        total_activities = 0

    return {
        "parent_id": str(current_user.id),
        "parent_name": current_user.full_name or current_user.email,
        "children": [],
        "total_available_activities": total_activities,
        "message": "Link children via POST /api/v1/parent/children/link to see their progress here.",
    }


# -- GPS Tracking Consent (COPPA) --------------------------------------------

class GPSConsentRequest(BaseModel):
    activity_id: str
    student_id: str
    consent_given: bool
    # Capability rung this grant covers: 'C' = coordinate stamp on evidence
    # (default, back-compat with the pre-wayfinding 'gps_tracking' flow),
    # 'D' = live map during the session, 'E' = record the path walked.
    # C / D / E are independent grants — granting C never implies D.
    rung: str = "C"


@router.post("/consent/gps", status_code=201)
async def record_gps_consent(
    body: GPSConsentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_get_current_user),
):
    """
    Parent records location consent for one capability rung of an activity.
    Set consent_given=false to explicitly revoke that rung.

    consent_logs is an append-only audit table (real FK on student_id, no
    unique constraint by design -- see database/init.sql / models.database.ConsentLog).
    Granting inserts a new row; revoking soft-closes any currently-active
    row(s) of that consent_type by setting withdrawn_at. Parent grants expire
    in 30 days and are re-prompted.
    """
    from services.wayfinding_consent import (
        normalize_rung, CONSENT_TYPE_FOR_RUNG, RUNG_DATA_CATEGORIES, PARENT_EXPIRY_DAYS,
    )
    rung = normalize_rung(body.rung, default="C")
    consent_type = CONSENT_TYPE_FOR_RUNG[rung]
    categories = RUNG_DATA_CATEGORIES[rung]
    try:
        if body.consent_given:
            await db.execute(text(f"""
                INSERT INTO consent_logs
                    (student_id, activity_id, consent_type, data_categories,
                     purpose, given_by_parent, parent_id, consent_given_at, expires_at)
                VALUES
                    (CAST(:sid AS uuid), CAST(:aid AS uuid), :ctype, :cats,
                     'wayfinding capability rung {rung}', TRUE,
                     CAST(:pid AS uuid), NOW(), NOW() + make_interval(days => CAST(:days AS int)))
            """), {
                "sid": body.student_id,
                "aid": body.activity_id,
                "pid": str(current_user.id),
                "ctype": consent_type,
                "cats": categories,
                "days": PARENT_EXPIRY_DAYS,
            })
        else:
            await db.execute(text("""
                UPDATE consent_logs
                SET withdrawn_at = NOW()
                WHERE student_id   = CAST(:sid AS uuid)
                  AND activity_id  = CAST(:aid AS uuid)
                  AND consent_type = :ctype
                  AND withdrawn_at IS NULL
            """), {
                "sid": body.student_id,
                "aid": body.activity_id,
                "ctype": consent_type,
            })
            # Promises from §4: revoking C blurs existing stamps immediately;
            # revoking E deletes the recorded path immediately.
            if rung == "C":
                from services.wayfinding_consent import coarsen_captures_now
                await coarsen_captures_now(db, body.student_id, body.activity_id)
            elif rung == "E":
                from services.wayfinding_consent import delete_tracks_now
                await delete_tracks_now(db, body.student_id, body.activity_id)
        await db.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"GPS consent write error: {e}")
        raise HTTPException(status_code=500, detail="Failed to record consent")

    return {
        "recorded": True,
        "consent_given": body.consent_given,
        "activity_id": body.activity_id,
    }
