# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

# ==============================================================================
# backend/routes/student.py
# Student API routes - Evidence capture, notebook, portfolio
# FIXED: async throughout, correct model names, inline schemas, Path import
# ==============================================================================

import asyncio
import logging
import uuid as uuid_lib
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.dependencies import get_current_user, get_current_user_flexible
from models.database import (
    CaptureAnnotation,
    CaptureType,
    NotebookCaptureLink,
    StudentCapture,
    StudentCompetency,
    StudentNotebook,
    User,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/student", tags=["student"])


# ==============================================================================
# INLINE PYDANTIC SCHEMAS
# ==============================================================================

class CaptureResponse(BaseModel):
    id: UUID
    student_id: UUID
    activity_id: Optional[UUID] = None
    session_id: Optional[UUID] = None
    capture_type: str
    file_path: Optional[str] = None
    file_size_bytes: Optional[int] = None
    mime_type: Optional[str] = None
    captured_at: datetime
    location_latitude: Optional[float] = None
    location_longitude: Optional[float] = None
    transcript: Optional[str] = None
    transcript_confidence: Optional[float] = None
    transcript_language: Optional[str] = None
    duration_seconds: Optional[int] = None
    description: Optional[str] = None

    class Config:
        from_attributes = True


class NotebookCreate(BaseModel):
    activity_id: Optional[UUID] = None
    session_id: Optional[UUID] = None
    where_notes: Optional[str] = None
    why_notes: Optional[str] = None
    how_notes: Optional[str] = None
    learning_insights: Optional[str] = None
    next_steps: Optional[str] = None


class NotebookResponse(BaseModel):
    id: UUID
    student_id: UUID
    activity_id: Optional[UUID] = None
    where_notes: Optional[str] = None
    why_notes: Optional[str] = None
    how_notes: Optional[str] = None
    learning_insights: Optional[str] = None
    next_steps: Optional[str] = None
    is_submitted: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AnnotationCreate(BaseModel):
    annotation_type: str
    linked_objective: Optional[str] = None
    linked_concept: Optional[str] = None
    explanation: str


class AnnotationResponse(BaseModel):
    id: UUID
    capture_id: UUID
    teacher_id: UUID
    annotation_type: str
    linked_objective: Optional[str] = None
    linked_concept: Optional[str] = None
    explanation: str
    created_at: datetime

    class Config:
        from_attributes = True


class CompetencyResponse(BaseModel):
    id: UUID
    student_id: UUID
    status: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PortfolioResponse(BaseModel):
    captures: List[CaptureResponse]
    notebook_entries: List[NotebookResponse]
    competencies: List[CompetencyResponse]
    created_at: datetime


# ==============================================================================
# HELPERS
# ==============================================================================

def _upload_dir() -> Path:
    return Path(settings.UPLOAD_DIR)


def _unique_filename(original: str) -> str:
    suffix = Path(original).suffix
    return f"{uuid_lib.uuid4().hex}{suffix}"


# ==============================================================================
# CAPTURE ENDPOINTS
# ==============================================================================

@router.post("/captures/upload", response_model=CaptureResponse, status_code=201)
async def upload_capture(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    capture_type: CaptureType = Form(...),
    activity_id: Optional[UUID] = Form(None),
    session_id: Optional[UUID] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    location_name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload evidence capture. Poll GET /captures/{id} for transcript after audio upload."""
    MAX_BYTES = 50 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit")

    captures_dir = _upload_dir() / "captures" / str(current_user.id)
    captures_dir.mkdir(parents=True, exist_ok=True)
    safe_name = _unique_filename(file.filename or "upload")
    file_path = captures_dir / safe_name
    file_path.write_bytes(content)

    capture = StudentCapture(
        student_id=current_user.id,
        activity_id=activity_id,
        session_id=session_id,
        capture_type=capture_type,
        file_path=str(file_path),
        file_size_bytes=len(content),
        mime_type=file.content_type,
        location_latitude=latitude,
        location_longitude=longitude,
        description=description,
    )
    db.add(capture)
    await db.commit()
    await db.refresh(capture)

    if capture_type == CaptureType.AUDIO:
        background_tasks.add_task(_transcribe_audio_background, capture.id, str(file_path))

    logger.info(f"Capture uploaded: {capture.id} by {current_user.id}")
    return capture


# Alias routes kept for backwards-compat with older frontend/mobile clients
@router.post("/captures/audio",  response_model=CaptureResponse, status_code=201, include_in_schema=False)
@router.post("/captures/photo",  response_model=CaptureResponse, status_code=201, include_in_schema=False)
@router.post("/captures/video",  response_model=CaptureResponse, status_code=201, include_in_schema=False)
async def upload_capture_alias(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    capture_type: CaptureType = Form(...),
    activity_id: Optional[UUID] = Form(None),
    session_id: Optional[UUID] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    location_name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Alias for /captures/upload — same handler."""
    return await upload_capture(
        background_tasks=background_tasks, file=file, capture_type=capture_type,
        activity_id=activity_id, session_id=session_id,
        latitude=latitude, longitude=longitude, location_name=location_name,
        description=description, current_user=current_user, db=db,
    )


@router.get("/captures/{capture_id}", response_model=CaptureResponse)
async def get_capture(
    capture_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentCapture).where(
            StudentCapture.id == capture_id,
            StudentCapture.student_id == current_user.id,
        )
    )
    capture = result.scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    return capture


@router.get("/captures", response_model=List[CaptureResponse])
async def list_captures(
    activity_id: Optional[UUID] = Query(None),
    capture_type: Optional[CaptureType] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(StudentCapture).where(StudentCapture.student_id == current_user.id)
    if activity_id:
        stmt = stmt.where(StudentCapture.activity_id == activity_id)
    if capture_type:
        stmt = stmt.where(StudentCapture.capture_type == capture_type)
    stmt = stmt.order_by(StudentCapture.captured_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/captures/{capture_id}/media-token")
async def mint_capture_media_token(
    capture_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Mint a short-lived (5 min), single-purpose token for streaming ONE capture.

    The frontend calls this with its Authorization header, then puts the
    returned token in the <audio>/<img> src as ?mt=<token>. This replaces
    putting the raw JWT in the query string — a media token can't be replayed
    as a session, expires in minutes, and is scoped to one capture + one user.
    """
    from services.signed_url import SignedURL

    result = await db.execute(
        select(StudentCapture).where(
            StudentCapture.id == capture_id,
            StudentCapture.student_id == current_user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Capture not found")

    token = SignedURL.generate(
        purpose="media_access",
        payload={"capture_id": str(capture_id), "user_id": str(current_user.id)},
    )
    return {"media_token": token, "stream_url": f"/api/v1/student/captures/{capture_id}/stream?mt={token}"}


@router.get("/captures/{capture_id}/stream")
async def stream_capture(
    capture_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    mt: Optional[str] = Query(default=None, description="Short-lived signed media token"),
):
    """
    Stream the raw file for an audio/video capture (e.g. for <audio> src).

    Auth (no raw JWT in the query string):
      1. ?mt=<signed media token> — preferred for browser <audio>/<img> tags
         (mint one via POST /captures/{id}/media-token).
      2. Authorization: Bearer <jwt> — for direct/API access.
    """
    from fastapi.responses import FileResponse
    from services.signed_url import SignedURL, SignedURLError

    user_id = None

    # 1. Signed media token
    if mt:
        try:
            data = await SignedURL.validate(mt, purpose="media_access")
            if data.get("capture_id") != str(capture_id):
                raise HTTPException(status_code=403, detail="Token not valid for this capture")
            user_id = data.get("user_id")
        except SignedURLError:
            raise HTTPException(status_code=401, detail="Invalid or expired media token")
    else:
        # 2. Authorization: Bearer <jwt>
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            from core.dependencies import get_user_from_token_str
            user = await get_user_from_token_str(auth_header.split(" ", 1)[1], db)
            user_id = str(user.id)

    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = await db.execute(
        select(StudentCapture).where(
            StudentCapture.id == capture_id,
            StudentCapture.student_id == user_id,
        )
    )
    capture = result.scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    file_path = Path(capture.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on server")
    media_type = capture.mime_type or "application/octet-stream"
    return FileResponse(str(file_path), media_type=media_type)


@router.delete("/captures/{capture_id}", status_code=204)
async def delete_capture(
    capture_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentCapture).where(
            StudentCapture.id == capture_id,
            StudentCapture.student_id == current_user.id,
        )
    )
    capture = result.scalar_one_or_none()
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    try:
        Path(capture.file_path).unlink(missing_ok=True)
    except Exception:
        pass
    await db.delete(capture)
    await db.commit()


# ==============================================================================
# NOTEBOOK ENDPOINTS
# ==============================================================================

@router.post("/notebook", response_model=NotebookResponse, status_code=201)
async def create_notebook_entry(
    entry: NotebookCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    notebook = StudentNotebook(
        student_id=current_user.id,
        activity_id=entry.activity_id,
        where_notes=entry.where_notes,
        why_notes=entry.why_notes,
        how_notes=entry.how_notes,
        learning_insights=entry.learning_insights,
        next_steps=entry.next_steps,
    )
    db.add(notebook)
    await db.commit()
    await db.refresh(notebook)
    logger.info(f"Notebook entry created: {notebook.id} by {current_user.id}")
    return notebook


@router.get("/notebook/{entry_id}", response_model=NotebookResponse)
async def get_notebook_entry(
    entry_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentNotebook).where(
            StudentNotebook.id == entry_id,
            StudentNotebook.student_id == current_user.id,
        )
    )
    notebook = result.scalar_one_or_none()
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook entry not found")
    return notebook


@router.get("/notebook", response_model=List[NotebookResponse])
async def list_notebook_entries(
    activity_id: Optional[UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(StudentNotebook).where(StudentNotebook.student_id == current_user.id)
    if activity_id:
        stmt = stmt.where(StudentNotebook.activity_id == activity_id)
    stmt = stmt.order_by(StudentNotebook.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.put("/notebook/{entry_id}", response_model=NotebookResponse)
async def update_notebook_entry(
    entry_id: UUID,
    entry: NotebookCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentNotebook).where(
            StudentNotebook.id == entry_id,
            StudentNotebook.student_id == current_user.id,
        )
    )
    notebook = result.scalar_one_or_none()
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook entry not found")

    notebook.where_notes = entry.where_notes
    notebook.why_notes = entry.why_notes
    notebook.how_notes = entry.how_notes
    notebook.learning_insights = entry.learning_insights
    notebook.next_steps = entry.next_steps
    notebook.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(notebook)
    return notebook


@router.post("/notebook/{entry_id}/submit", status_code=200)
async def submit_notebook_entry(
    entry_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark notebook entry as submitted for teacher review."""
    result = await db.execute(
        select(StudentNotebook).where(
            StudentNotebook.id == entry_id,
            StudentNotebook.student_id == current_user.id,
        )
    )
    notebook = result.scalar_one_or_none()
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook entry not found")
    notebook.is_submitted = True
    notebook.submitted_at = datetime.utcnow()
    await db.commit()
    return {"status": "submitted"}


@router.post("/notebook/{entry_id}/link-capture", status_code=200)
async def link_capture_to_notebook(
    entry_id: UUID,
    capture_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    nb_result = await db.execute(
        select(StudentNotebook).where(
            StudentNotebook.id == entry_id,
            StudentNotebook.student_id == current_user.id,
        )
    )
    cap_result = await db.execute(
        select(StudentCapture).where(
            StudentCapture.id == capture_id,
            StudentCapture.student_id == current_user.id,
        )
    )
    if not nb_result.scalar_one_or_none() or not cap_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Notebook or capture not found")

    existing = await db.execute(
        select(NotebookCaptureLink).where(
            NotebookCaptureLink.notebook_id == entry_id,
            NotebookCaptureLink.capture_id == capture_id,
        )
    )
    if existing.scalar_one_or_none():
        return {"status": "already_linked"}

    link = NotebookCaptureLink(notebook_id=entry_id, capture_id=capture_id)
    db.add(link)
    await db.commit()
    return {"status": "linked"}


# ==============================================================================
# PORTFOLIO ENDPOINT
# ==============================================================================

@router.get("/portfolio", response_model=PortfolioResponse)
async def get_portfolio(
    activity_id: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cap_stmt = select(StudentCapture).where(StudentCapture.student_id == current_user.id)
    nb_stmt = select(StudentNotebook).where(StudentNotebook.student_id == current_user.id)
    if activity_id:
        cap_stmt = cap_stmt.where(StudentCapture.activity_id == activity_id)
        nb_stmt = nb_stmt.where(StudentNotebook.activity_id == activity_id)

    caps = (await db.execute(cap_stmt)).scalars().all()
    nbs = (await db.execute(nb_stmt)).scalars().all()
    comps = (
        await db.execute(
            select(StudentCompetency).where(StudentCompetency.student_id == current_user.id)
        )
    ).scalars().all()

    return PortfolioResponse(
        captures=caps,
        notebook_entries=nbs,
        competencies=comps,
        created_at=datetime.utcnow(),
    )


# ==============================================================================
# COMPETENCY ENDPOINT
# ==============================================================================

@router.get("/competencies", response_model=List[CompetencyResponse])
async def get_competencies(
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(StudentCompetency).where(StudentCompetency.student_id == current_user.id)
    if status:
        stmt = stmt.where(StudentCompetency.status == status)
    result = await db.execute(stmt)
    return result.scalars().all()


# ==============================================================================
# ANNOUNCEMENTS (classroom-wide, teacher-initiated broadcasts)
# ==============================================================================

class StudentAnnouncementResponse(BaseModel):
    id: str
    classroom_id: str
    classroom_name: str
    teacher_id: str
    teacher_name: str
    title: str
    body: str
    created_at: str


@router.get("/announcements", response_model=List[StudentAnnouncementResponse])
async def get_student_announcements(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Classroom-wide announcements for every classroom the CALLING student
    (current_user.id) is enrolled in.

    Security note: scoping comes entirely from classroom_students rows for
    current_user.id — there is no client-supplied classroom_id, so a student
    cannot request another classroom's announcements by guessing an id.
    """
    try:
        rows = (await db.execute(text("""
            SELECT a.id, a.classroom_id, c.name AS classroom_name,
                   a.teacher_id, COALESCE(t.full_name, t.email) AS teacher_name,
                   a.title, a.body, a.created_at
            FROM classroom_announcements a
            JOIN classrooms c ON c.id = a.classroom_id
            JOIN classroom_students cs ON cs.classroom_id = a.classroom_id
            JOIN users t ON t.id = a.teacher_id
            WHERE cs.student_id = CAST(:sid AS uuid)
            ORDER BY a.created_at DESC
            LIMIT :lim
        """), {"sid": str(current_user.id), "lim": limit})).mappings().all()

        return [
            StudentAnnouncementResponse(
                id=str(r["id"]),
                classroom_id=str(r["classroom_id"]),
                classroom_name=r["classroom_name"],
                teacher_id=str(r["teacher_id"]),
                teacher_name=r["teacher_name"],
                title=r["title"],
                body=r["body"],
                created_at=r["created_at"].isoformat() if r["created_at"] else datetime.utcnow().isoformat(),
            )
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==============================================================================
# PARENT LINK REQUESTS — child-side consent for routes/parent.py's link_child()
#
# A parent linking by email only creates a status='pending' row in
# parent_child_links — see that endpoint's docstring. Nothing about that
# request grants the parent any access until the child themselves approves
# it here. This is the only place status can move to 'approved' or
# 'denied'; there's no parent-side or admin-side override.
# ==============================================================================

class ParentLinkRequestResponse(BaseModel):
    parent_id: str
    parent_name: str
    parent_email: str
    relationship: str
    requested_at: str


@router.get("/parent-requests", response_model=List[ParentLinkRequestResponse])
async def list_parent_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pending parent-link requests waiting on this student's approval."""
    try:
        rows = (await db.execute(text("""
            SELECT p.id AS parent_id, p.full_name, p.email, l.relationship, l.linked_at
            FROM parent_child_links l
            JOIN users p ON p.id = l.parent_id
            WHERE l.child_id = CAST(:cid AS uuid) AND l.status = 'pending'
            ORDER BY l.linked_at DESC
        """), {"cid": str(current_user.id)})).mappings().all()
        return [
            ParentLinkRequestResponse(
                parent_id=str(r["parent_id"]),
                parent_name=r["full_name"] or r["email"],
                parent_email=r["email"],
                relationship=r["relationship"] or "guardian",
                requested_at=(r["linked_at"].isoformat() if r["linked_at"] else ""),
            )
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def _resolve_parent_request(
    parent_id: str, new_status: str, current_user: User, db: AsyncSession,
) -> dict:
    from uuid import UUID as _UUID
    try:
        _UUID(parent_id)  # validates format, prevents injection
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid parent_id format")

    result = await db.execute(text("""
        UPDATE parent_child_links
        SET status = :status
        WHERE parent_id = CAST(:pid AS uuid) AND child_id = CAST(:cid AS uuid) AND status = 'pending'
    """), {"status": new_status, "pid": parent_id, "cid": str(current_user.id)})
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="No pending request from that account.")
    await db.commit()

    try:
        from services.privacy_engine import log_access
        await log_access(
            actor_id=str(current_user.id),
            actor_role=current_user.role,
            action=f"PARENT_LINK_{new_status.upper()}",
            data_type="parent_child_link",
            student_id=str(current_user.id),
            rules_applied=[],
            compliance_status="COMPLIANT",
            db=db,
            notes=f"parent_id={parent_id} child_id={current_user.id} status={new_status}",
        )
    except Exception:
        logger.warning("Privacy audit failed for parent-link %s (non-blocking)", new_status, exc_info=True)

    return {"success": True, "status": new_status, "parent_id": parent_id}


@router.post("/parent-requests/{parent_id}/approve")
async def approve_parent_request(
    parent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Grant a pending parent an ongoing view of this student's progress."""
    return await _resolve_parent_request(parent_id, "approved", current_user, db)


@router.post("/parent-requests/{parent_id}/deny")
async def deny_parent_request(
    parent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Decline a pending parent-link request."""
    return await _resolve_parent_request(parent_id, "denied", current_user, db)


# ==============================================================================
# BACKGROUND: ASR TRANSCRIPTION
# ==============================================================================

async def _transcribe_audio_background(capture_id: UUID, file_path: str):
    """Transcribe audio via ASR service and write result back to DB."""
    from core.config import settings
    if not settings.ASR_ENABLED:
        logger.debug(f"ASR disabled (ASR_ENABLED=false) — skipping transcription of {capture_id}")
        return
    try:
        from core.database import async_session_factory
        from services.asr_service import asr_service

        result = await asr_service.transcribe_audio(file_path)

        async with async_session_factory() as db:
            res = await db.execute(
                select(StudentCapture).where(StudentCapture.id == capture_id)
            )
            capture = res.scalar_one_or_none()
            if capture:
                if result.get("status") == "completed":
                    capture.transcript = result.get("text")
                    capture.transcript_confidence = result.get("confidence")
                    capture.transcript_language = result.get("language")
                else:
                    capture.transcript = None
                await db.commit()
                logger.info(f"ASR complete for capture {capture_id}")
    except Exception as e:
        logger.error(f"Background ASR error for {capture_id}: {e}")
