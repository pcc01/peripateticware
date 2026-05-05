# ==============================================================================
# backend/schemas/student.py
# Pydantic schemas for Phase 6 student API
# ==============================================================================

from typing import List, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field

from models.database import CaptureType, NotebookEntryType, AnnotationType, CompetencyStatus, TranscriptionStatus


# ==============================================================================
# CAPTURE SCHEMAS
# ==============================================================================

class CaptureCreate(BaseModel):
    """Schema for creating a capture"""
    capture_type: CaptureType
    activity_id: Optional[UUID] = None
    session_id: Optional[UUID] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None
    description: Optional[str] = None
    duration_seconds: Optional[int] = None


class CaptureResponse(BaseModel):
    """Schema for capture response"""
    id: UUID
    student_id: UUID
    activity_id: Optional[UUID]
    session_id: Optional[UUID]
    capture_type: CaptureType
    file_path: str
    file_size_bytes: Optional[int]
    mime_type: Optional[str]
    captured_at: datetime
    location_latitude: Optional[float]
    location_longitude: Optional[float]
    location_name: Optional[str]
    description: Optional[str]
    transcript: Optional[str] = None
    transcript_confidence: Optional[float] = None
    transcript_language: Optional[str] = None
    transcript_status: Optional[TranscriptionStatus] = None
    transcript_source: Optional[str] = None
    duration_seconds: Optional[int]
    dimensions: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CaptureListResponse(BaseModel):
    """Schema for listing captures"""
    total: int
    captures: List[CaptureResponse]


# ==============================================================================
# NOTEBOOK SCHEMAS
# ==============================================================================

class NotebookCreate(BaseModel):
    """Schema for creating notebook entry"""
    entry_type: NotebookEntryType = NotebookEntryType.REFLECTION
    prompt: Optional[str] = None
    content: str = Field(..., min_length=1, max_length=10000)
    activity_id: Optional[UUID] = None
    session_id: Optional[UUID] = None
    learning_objectives_tagged: Optional[List[UUID]] = None
    competencies_addressed: Optional[List[str]] = None


class NotebookResponse(BaseModel):
    """Schema for notebook entry response"""
    id: UUID
    student_id: UUID
    activity_id: Optional[UUID]
    session_id: Optional[UUID]
    entry_type: NotebookEntryType
    prompt: Optional[str]
    content: str
    learning_objectives_tagged: Optional[List[UUID]]
    competencies_addressed: Optional[List[str]]
    reflection_depth: str
    word_count: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class NotebookListResponse(BaseModel):
    """Schema for listing notebook entries"""
    total: int
    entries: List[NotebookResponse]


# ==============================================================================
# ANNOTATION SCHEMAS
# ==============================================================================

class AnnotationCreate(BaseModel):
    """Schema for creating annotation"""
    annotation_type: AnnotationType
    content: str = Field(..., min_length=1)
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    position_width: Optional[float] = None
    position_height: Optional[float] = None
    linked_objective: Optional[str] = None
    linked_concept: Optional[str] = None
    explanation: str = Field(..., min_length=1)


class AnnotationResponse(BaseModel):
    """Schema for annotation response"""
    id: UUID
    capture_id: UUID
    student_id: UUID
    annotation_type: AnnotationType
    content: str
    position_x: Optional[float]
    position_y: Optional[float]
    position_width: Optional[float]
    position_height: Optional[float]
    linked_objective: Optional[str]
    linked_concept: Optional[str]
    explanation: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ==============================================================================
# COMPETENCY SCHEMAS
# ==============================================================================

class CompetencyResponse(BaseModel):
    """Schema for competency response"""
    id: UUID
    student_id: UUID
    competency_name: str
    description: str
    category: str
    status: CompetencyStatus
    progress_percent: int
    evidence_count: int
    first_achieved_at: Optional[datetime]
    last_achieved_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ==============================================================================
# PORTFOLIO SCHEMAS
# ==============================================================================

class PortfolioResponse(BaseModel):
    """Schema for portfolio response"""
    captures: List[CaptureResponse] = []
    notebook_entries: List[NotebookResponse] = []
    competencies: List[CompetencyResponse] = []
    created_at: datetime
    
    class Config:
        from_attributes = True


# ==============================================================================
# TRANSCRIPTION SCHEMAS
# ==============================================================================

class TranscriptionResult(BaseModel):
    """Schema for transcription result"""
    text: str
    confidence: float
    language: str
    provider: str
    duration_seconds: int
    status: str
    words: Optional[List[dict]] = None


# ==============================================================================
# LINK CAPTURE TO NOTEBOOK
# ==============================================================================

class LinkCaptureRequest(BaseModel):
    """Request to link capture to notebook"""
    capture_id: UUID


class LinkCaptureResponse(BaseModel):
    """Response for link capture"""
    status: str
    message: Optional[str] = None
