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

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import select
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
    return Path(getattr(settings, "UPLOAD_DIR", "/app/uploads"))


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
# BACKGROUND: ASR TRANSCRIPTION
# ==============================================================================

async def _transcribe_audio_background(capture_id: UUID, file_path: str):
    """Transcribe audio via ASR service and write result back to DB."""
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
