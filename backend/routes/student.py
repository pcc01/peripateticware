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

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.dependencies import get_current_user
from models.database import (
    CaptureAnnotation,
    CaptureType,
    NotebookCaptureLink,
    StudentCapture,
    StudentCompetency,
    StudentNotebook,
    TranscriptStatus,
    User,
)
from services.privacy_engine import enforce_or_raise

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
    transcript_status: Optional[str] = None
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


def _audio_transcript_fields(
    is_audio: bool, transcript: Optional[str]
) -> tuple[Optional[str], Optional[TranscriptStatus]]:
    """What to store for transcript/transcript_status given a capture's type
    and whatever transcript text (if any) the client submitted alongside the
    upload.

    Non-audio captures never get a transcript at all (None, None). For AUDIO
    captures there is no server-side transcription step to fall back to —
    transcription happens entirely on-device (see upload_capture's
    docstring) — so a missing transcript means UNAVAILABLE, never a pending
    or in-progress state.
    """
    if not is_audio:
        return None, None
    if transcript:
        return transcript, TranscriptStatus.COMPLETED
    return None, TranscriptStatus.UNAVAILABLE


# ==============================================================================
# CAPTURE ENDPOINTS
# ==============================================================================

@router.post("/captures/upload", response_model=CaptureResponse, status_code=201)
async def upload_capture(
    file: UploadFile = File(...),
    capture_type: CaptureType = Form(...),
    activity_id: Optional[UUID] = Form(None),
    session_id: Optional[UUID] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    location_name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    transcript: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload evidence capture.

    For AUDIO captures, `transcript` (optional) is produced entirely
    on-device by the mobile client (expo-speech-recognition with
    requiresOnDeviceRecognition=true — see CaptureSheet.tsx) and trusted
    as-is here; there is no server-side transcription step of any kind
    (removed 2026-09-13 along with services/asr_service.py — the Ollama tier
    could never actually transcribe real audio, and the OpenAI/Claude cloud
    tiers sent student audio to a third party on fallback). A capture
    without a transcript simply has none — never falls back to any
    cloud/self-hosted ASR. See AUDIO_TRANSCRIPTION_ON_DEVICE_HANDOFF.md.
    """
    MAX_BYTES = 50 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit")

    # Privacy enforcement gate — this route (and its /captures/{audio,photo,
    # video} aliases, which delegate here) persists media + optional GPS but
    # never went through enforce_on_submission() at all, unlike the
    # equivalent evidence-capture route in student_activities.py.
    evidence_types = [capture_type.value]
    if latitude is not None and longitude is not None:
        evidence_types.append("gps")
    await enforce_or_raise(
        student_id=str(current_user.id),
        data_type="student_capture",
        db=db,
        evidence_types=evidence_types,
    )

    captures_dir = _upload_dir() / "captures" / str(current_user.id)
    captures_dir.mkdir(parents=True, exist_ok=True)
    safe_name = _unique_filename(file.filename or "upload")
    file_path = captures_dir / safe_name
    file_path.write_bytes(content)

    transcript_value, transcript_status_value = _audio_transcript_fields(
        capture_type == CaptureType.AUDIO, transcript
    )
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
        transcript=transcript_value,
        transcript_status=transcript_status_value,
    )
    db.add(capture)
    await db.commit()
    await db.refresh(capture)

    logger.info(f"Capture uploaded: {capture.id} by {current_user.id}")
    return capture


# Alias routes kept for backwards-compat with older frontend/mobile clients
@router.post("/captures/audio",  response_model=CaptureResponse, status_code=201, include_in_schema=False)
@router.post("/captures/photo",  response_model=CaptureResponse, status_code=201, include_in_schema=False)
@router.post("/captures/video",  response_model=CaptureResponse, status_code=201, include_in_schema=False)
async def upload_capture_alias(
    file: UploadFile = File(...),
    capture_type: CaptureType = Form(...),
    activity_id: Optional[UUID] = Form(None),
    session_id: Optional[UUID] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    location_name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    transcript: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Alias for /captures/upload — same handler."""
    return await upload_capture(
        file=file, capture_type=capture_type,
        activity_id=activity_id, session_id=session_id,
        latitude=latitude, longitude=longitude, location_name=location_name,
        description=description, transcript=transcript,
        current_user=current_user, db=db,
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
    # Free-text student data — never went through enforce_on_submission().
    await enforce_or_raise(
        student_id=str(current_user.id),
        data_type="student_notebook",
        db=db,
    )

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
# STUDENT-TRIGGERED CONSENT REQUEST
# ==============================================================================
# A capture blocked with error_code="consent_required" (privacy_engine.py's
# enforce_or_raise) stays safely on the student's device (nothing gates local
# capture — see the age-scoped-consent plan doc) but can't be uploaded/
# submitted until a guardian grants consent. This lets the student re-trigger
# that request themselves rather than passively waiting on whatever happened
# at signup — reuses the exact same real flow accept_invite's initial send
# uses (SignedURL token + send_parent_consent_email), not a second mechanism.

_CONSENT_REQUEST_COOLDOWN_HOURS = 72  # matches the token's own TTL


@router.post("/consent/request-guardian", status_code=200)
async def request_guardian_consent(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.parent_email:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "no_guardian_email_on_file",
                "message": "No guardian email is on file for this account. Ask a "
                           "teacher to add one before requesting consent.",
            },
        )

    if current_user.last_consent_request_at:
        elapsed = datetime.utcnow() - current_user.last_consent_request_at
        if elapsed.total_seconds() < _CONSENT_REQUEST_COOLDOWN_HOURS * 3600:
            hours_left = _CONSENT_REQUEST_COOLDOWN_HOURS - int(elapsed.total_seconds() // 3600)
            raise HTTPException(
                status_code=429,
                detail={
                    "error_code": "consent_request_cooldown",
                    "message": f"A request was already sent recently. Try again in "
                               f"about {hours_left} hour(s).",
                },
            )

    from services.signed_url import SignedURL
    from services.email_service import send_parent_consent_email

    consent_token = SignedURL.generate(
        purpose="parent_consent",
        payload={"student_id": str(current_user.id)},
    )
    student_name = (
        f"{current_user.first_name} {current_user.last_name}".strip()
        or current_user.username
    )
    try:
        await send_parent_consent_email(
            to=current_user.parent_email,
            token=consent_token,
            student_name=student_name,
        )
    except Exception as exc:
        logger.warning(
            f"Guardian consent re-request email failed for student {current_user.id}: {exc}"
        )
        raise HTTPException(status_code=502, detail="Could not send the request email — try again later.")

    current_user.last_consent_request_at = datetime.utcnow()
    await db.commit()
    logger.info(f"Guardian consent re-requested by student {current_user.id}")
    return {"status": "sent"}


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


# Note: there used to be a "BACKGROUND: ASR TRANSCRIPTION" section here
# (_transcribe_audio_background, _set_transcript_status), calling into
# services/asr_service.py. Removed 2026-09-13 — transcription moved
# on-device (see upload_capture's docstring above and
# AUDIO_TRANSCRIPTION_ON_DEVICE_HANDOFF.md); asr_service.py is deleted.
