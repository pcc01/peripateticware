# ==============================================================================
# backend/routes/student.py
# Student API routes for Phase 6 - Evidence capture, notebook, portfolio
# ==============================================================================

import logging
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session

from core.dependencies import get_db, get_current_user
from models.database import (
    User, StudentCapture, StudentNotebook, StudentAnnotation,
    NotebookCaptureLink, StudentCompetency, CaptureType, NotebookEntryType
)
from services.asr_service import asr_service
from schemas.student import (
    CaptureCreate, CaptureResponse, NotebookCreate, NotebookResponse,
    AnnotationCreate, AnnotationResponse, PortfolioResponse, CompetencyResponse
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/student", tags=["student"])


# ==============================================================================
# CAPTURE ENDPOINTS
# ==============================================================================

@router.post("/captures/upload", response_model=CaptureResponse)
async def upload_capture(
    file: UploadFile = File(...),
    capture_type: CaptureType = Form(...),
    activity_id: Optional[UUID] = Form(None),
    session_id: Optional[UUID] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    location_name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload evidence capture (photo, video, audio, text, sketch)
    
    Returns capture record with ID for polling transcription status
    """
    try:
        # Save file (to local storage or S3)
        import os
        from core.config import settings
        
        # Create captures directory
        captures_dir = Path(settings.UPLOAD_DIR) / "captures" / str(current_user.id)
        captures_dir.mkdir(parents=True, exist_ok=True)
        
        # Save file
        file_path = captures_dir / file.filename
        content = await file.read()
        with open(file_path, 'wb') as f:
            f.write(content)
        
        # Create database record
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
            location_name=location_name,
            description=description
        )
        
        db.add(capture)
        db.commit()
        db.refresh(capture)
        
        # If audio, trigger ASR
        if capture_type == CaptureType.AUDIO:
            asyncio.create_task(
                _transcribe_audio_background(capture.id, str(file_path), db)
            )
        
        logger.info(f"Capture uploaded: {capture.id} by {current_user.id}")
        return CaptureResponse.from_orm(capture)
    
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/captures/{capture_id}", response_model=CaptureResponse)
async def get_capture(
    capture_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get capture details"""
    capture = db.query(StudentCapture).filter(
        StudentCapture.id == capture_id,
        StudentCapture.student_id == current_user.id
    ).first()
    
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    
    return CaptureResponse.from_orm(capture)


@router.get("/captures", response_model=List[CaptureResponse])
async def list_captures(
    activity_id: Optional[UUID] = Query(None),
    capture_type: Optional[CaptureType] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List student's captures with optional filters"""
    query = db.query(StudentCapture).filter(StudentCapture.student_id == current_user.id)
    
    if activity_id:
        query = query.filter(StudentCapture.activity_id == activity_id)
    
    if capture_type:
        query = query.filter(StudentCapture.capture_type == capture_type)
    
    captures = query.order_by(StudentCapture.captured_at.desc()).offset(skip).limit(limit).all()
    
    return [CaptureResponse.from_orm(c) for c in captures]


@router.delete("/captures/{capture_id}")
async def delete_capture(
    capture_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a capture"""
    capture = db.query(StudentCapture).filter(
        StudentCapture.id == capture_id,
        StudentCapture.student_id == current_user.id
    ).first()
    
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    
    # Delete file
    import os
    try:
        os.remove(capture.file_path)
    except:
        pass
    
    db.delete(capture)
    db.commit()
    
    return {"status": "deleted"}


# ==============================================================================
# NOTEBOOK ENDPOINTS
# ==============================================================================

@router.post("/notebook", response_model=NotebookResponse)
async def create_notebook_entry(
    entry: NotebookCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a notebook entry"""
    notebook = StudentNotebook(
        student_id=current_user.id,
        activity_id=entry.activity_id,
        session_id=entry.session_id,
        entry_type=entry.entry_type,
        prompt=entry.prompt,
        content=entry.content,
        learning_objectives_tagged=entry.learning_objectives_tagged or [],
        competencies_addressed=entry.competencies_addressed or [],
        word_count=len(entry.content.split())
    )
    
    db.add(notebook)
    db.commit()
    db.refresh(notebook)
    
    logger.info(f"Notebook entry created: {notebook.id} by {current_user.id}")
    return NotebookResponse.from_orm(notebook)


@router.get("/notebook/{entry_id}", response_model=NotebookResponse)
async def get_notebook_entry(
    entry_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get notebook entry"""
    notebook = db.query(StudentNotebook).filter(
        StudentNotebook.id == entry_id,
        StudentNotebook.student_id == current_user.id
    ).first()
    
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook entry not found")
    
    return NotebookResponse.from_orm(notebook)


@router.get("/notebook", response_model=List[NotebookResponse])
async def list_notebook_entries(
    activity_id: Optional[UUID] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List student's notebook entries"""
    query = db.query(StudentNotebook).filter(StudentNotebook.student_id == current_user.id)
    
    if activity_id:
        query = query.filter(StudentNotebook.activity_id == activity_id)
    
    entries = query.order_by(StudentNotebook.created_at.desc()).offset(skip).limit(limit).all()
    
    return [NotebookResponse.from_orm(e) for e in entries]


@router.put("/notebook/{entry_id}", response_model=NotebookResponse)
async def update_notebook_entry(
    entry_id: UUID,
    entry: NotebookCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update notebook entry"""
    notebook = db.query(StudentNotebook).filter(
        StudentNotebook.id == entry_id,
        StudentNotebook.student_id == current_user.id
    ).first()
    
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook entry not found")
    
    notebook.content = entry.content
    notebook.prompt = entry.prompt
    notebook.learning_objectives_tagged = entry.learning_objectives_tagged or []
    notebook.competencies_addressed = entry.competencies_addressed or []
    notebook.word_count = len(entry.content.split())
    notebook.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(notebook)
    
    return NotebookResponse.from_orm(notebook)


@router.post("/notebook/{entry_id}/link-capture")
async def link_capture_to_notebook(
    entry_id: UUID,
    capture_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Link a capture to notebook entry"""
    # Verify ownership
    notebook = db.query(StudentNotebook).filter(
        StudentNotebook.id == entry_id,
        StudentNotebook.student_id == current_user.id
    ).first()
    
    capture = db.query(StudentCapture).filter(
        StudentCapture.id == capture_id,
        StudentCapture.student_id == current_user.id
    ).first()
    
    if not notebook or not capture:
        raise HTTPException(status_code=404, detail="Notebook or capture not found")
    
    # Check if link already exists
    existing = db.query(NotebookCaptureLink).filter(
        NotebookCaptureLink.notebook_id == entry_id,
        NotebookCaptureLink.capture_id == capture_id
    ).first()
    
    if existing:
        return {"status": "already_linked"}
    
    link = NotebookCaptureLink(
        notebook_id=entry_id,
        capture_id=capture_id
    )
    
    db.add(link)
    db.commit()
    
    return {"status": "linked"}


# ==============================================================================
# ANNOTATION ENDPOINTS
# ==============================================================================

@router.post("/captures/{capture_id}/annotations", response_model=AnnotationResponse)
async def create_annotation(
    capture_id: UUID,
    annotation: AnnotationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create annotation on capture"""
    # Verify capture ownership
    capture = db.query(StudentCapture).filter(
        StudentCapture.id == capture_id,
        StudentCapture.student_id == current_user.id
    ).first()
    
    if not capture:
        raise HTTPException(status_code=404, detail="Capture not found")
    
    annotation_obj = StudentAnnotation(
        capture_id=capture_id,
        student_id=current_user.id,
        annotation_type=annotation.annotation_type,
        content=annotation.content,
        position_x=annotation.position_x,
        position_y=annotation.position_y,
        position_width=annotation.position_width,
        position_height=annotation.position_height,
        linked_objective=annotation.linked_objective,
        linked_concept=annotation.linked_concept,
        explanation=annotation.explanation
    )
    
    db.add(annotation_obj)
    db.commit()
    db.refresh(annotation_obj)
    
    return AnnotationResponse.from_orm(annotation_obj)


@router.get("/captures/{capture_id}/annotations", response_model=List[AnnotationResponse])
async def get_annotations(
    capture_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all annotations for a capture"""
    annotations = db.query(StudentAnnotation).filter(
        StudentAnnotation.capture_id == capture_id,
        StudentAnnotation.student_id == current_user.id
    ).all()
    
    return [AnnotationResponse.from_orm(a) for a in annotations]


# ==============================================================================
# PORTFOLIO ENDPOINTS
# ==============================================================================

@router.get("/portfolio", response_model=PortfolioResponse)
async def get_portfolio(
    activity_id: Optional[UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get student's full portfolio"""
    # Get all captures
    captures_query = db.query(StudentCapture).filter(StudentCapture.student_id == current_user.id)
    if activity_id:
        captures_query = captures_query.filter(StudentCapture.activity_id == activity_id)
    
    captures = captures_query.all()
    
    # Get all notebook entries
    notebook_query = db.query(StudentNotebook).filter(StudentNotebook.student_id == current_user.id)
    if activity_id:
        notebook_query = notebook_query.filter(StudentNotebook.activity_id == activity_id)
    
    notebook_entries = notebook_query.all()
    
    # Get competencies
    competencies = db.query(StudentCompetency).filter(
        StudentCompetency.student_id == current_user.id
    ).all()
    
    return PortfolioResponse(
        captures=[CaptureResponse.from_orm(c) for c in captures],
        notebook_entries=[NotebookResponse.from_orm(e) for e in notebook_entries],
        competencies=[CompetencyResponse.from_orm(c) for c in competencies],
        created_at=datetime.utcnow()
    )


# ==============================================================================
# PROGRESS ENDPOINTS
# ==============================================================================

@router.get("/competencies", response_model=List[CompetencyResponse])
async def get_competencies(
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get student's competency progress"""
    query = db.query(StudentCompetency).filter(StudentCompetency.student_id == current_user.id)
    
    if status:
        query = query.filter(StudentCompetency.status == status)
    
    competencies = query.all()
    
    return [CompetencyResponse.from_orm(c) for c in competencies]


# ==============================================================================
# BACKGROUND TASKS
# ==============================================================================

async def _transcribe_audio_background(capture_id: UUID, file_path: str, db: Session):
    """Background task to transcribe audio"""
    import asyncio
    
    try:
        logger.info(f"Starting ASR for capture {capture_id}")
        
        # Transcribe
        result = await asr_service.transcribe_audio(file_path)
        
        # Update database
        capture = db.query(StudentCapture).filter(StudentCapture.id == capture_id).first()
        if capture:
            if result.get("status") == "completed":
                capture.transcript = result.get("text")
                capture.transcript_confidence = result.get("confidence")
                capture.transcript_language = result.get("language")
                capture.transcript_source = result.get("provider")
                capture.transcript_status = "completed"
            else:
                capture.transcript_status = "failed"
            
            db.commit()
            logger.info(f"ASR completed for capture {capture_id}")
    except Exception as e:
        logger.error(f"Background ASR error: {str(e)}")


# Mount router
def mount_student_routes(app):
    """Mount student routes to app"""
    app.include_router(router)
