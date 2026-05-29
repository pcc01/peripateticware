# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Pydantic schemas for Phase 6 student activity endpoints.

All schemas follow the existing pattern from schemas/activities.py:
- Request bodies use Create/Update suffix
- Response bodies use Response suffix
- Config: from_attributes = True for ORM compatibility
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID


# ============================================================================
# ACTIVITY SCHEMAS  (student-facing, read-only subset of full Activity)
# ============================================================================

class StudentActivitySummary(BaseModel):
    """
    Lightweight activity card shown in the discovery list (screens 02 / 01).
    Omits rubric details, AI suggestions, and teacher-only fields.
    """
    id:                          UUID
    title:                       str
    description:                 str
    subject:                     str
    grade_level:                 int
    estimated_duration_minutes:  int
    difficulty_level:            int
    location_name:               str
    location_latitude:           float
    location_longitude:          float
    location_radius_meters:      int
    bloom_level:                 int
    materials_needed:            List[str]     = []
    learning_objectives:         List[Any]     = []
    assessment_type:             Optional[str] = None
    activity_type:               Optional[str] = None

    class Config:
        from_attributes = True


class StudentActivityDetail(StudentActivitySummary):
    """
    Full activity detail shown on the activity brief / Phase 1 screen (03 / 04).
    Adds location narrative, resources, and taxonomy info.
    """
    location_info:    Optional[str]   = None
    resources:        List[Dict]      = []
    suggested_lessons: Optional[List] = []
    marzano_level:    Optional[int]   = None
    dok_level:        Optional[int]   = None
    solo_level:       Optional[int]   = None
    primary_framework: Optional[str]  = "blooms"
    created_at:       Optional[datetime] = None


class StudentPaginatedActivityResponse(BaseModel):
    """Paginated list of activities for the discovery screen."""
    activities: List[StudentActivitySummary]
    total:      int
    page:       int
    page_size:  int
    has_more:   bool


# ============================================================================
# SESSION SCHEMAS
# ============================================================================

class StartSessionRequest(BaseModel):
    """
    Payload sent when student taps 'Start Activity'.
    GPS fields are optional — indoor / offline use cases must work without them.
    """
    location_latitude:  Optional[float] = Field(None, description="Student GPS lat at session start")
    location_longitude: Optional[float] = Field(None, description="Student GPS lon at session start")
    location_name:      Optional[str]   = Field(None, max_length=255)


class LearningSessionResponse(BaseModel):
    """Returned immediately when a session is created or resumed."""
    session_id:   str
    activity_id:  str
    student_id:   str
    status:       str
    started_at:   str
    location:     Optional[Dict] = None   # {lat, lon, name} if provided

    class Config:
        from_attributes = True


# ============================================================================
# EVIDENCE CAPTURE SCHEMAS
# ============================================================================

class EvidenceCaptureCreate(BaseModel):
    """
    JSON metadata sent alongside a multipart file upload (or standalone for
    text / sketch captures where the payload is inline).
    """
    capture_type:        str   = Field(..., description="photo|video|audio|text|sketch|measurement")
    title:               Optional[str]   = Field(None, max_length=255)
    description:         Optional[str]   = None
    learning_objectives: List[str]       = []
    competencies:        List[str]       = []
    location_latitude:   Optional[float] = None
    location_longitude:  Optional[float] = None
    duration_seconds:    Optional[int]   = Field(None, ge=1, le=3600)
    transcription:       Optional[str]   = None   # pre-populated by on-device ASR
    device_metadata:     Optional[Dict]  = None   # raw device metadata (EXIF etc.)

    @validator("capture_type")
    def validate_capture_type(cls, v: str) -> str:
        allowed = {"photo", "video", "audio", "text", "sketch", "measurement"}
        if v not in allowed:
            raise ValueError(f"capture_type must be one of {allowed}")
        return v


class EvidenceCaptureResponse(BaseModel):
    """Full evidence capture record returned after creation."""
    id:                  str
    session_id:          str
    student_id:          str
    activity_id:         str
    capture_type:        str
    title:               Optional[str] = None
    description:         Optional[str] = None
    file_url:            Optional[str] = None
    duration_seconds:    Optional[int] = None
    transcription:       Optional[str] = None
    learning_objectives: List[str]     = []
    competencies:        List[str]     = []
    created_at:          str

    class Config:
        from_attributes = True


class EvidenceListResponse(BaseModel):
    """List of evidence for a session."""
    captures: List[EvidenceCaptureResponse]
    total:    int


# ============================================================================
# NOTEBOOK / REFLECTION SCHEMAS
# ============================================================================

class NotebookEntryCreate(BaseModel):
    """Payload for creating a reflection entry (Journal screen 10)."""
    reflection_type:     str  = Field(default="freeform",
                                       description="freeform|guided|structured")
    title:               Optional[str] = Field(None, max_length=255)
    content:             str  = Field(..., min_length=1)
    learning_objectives: List[str]     = []
    competencies:        List[str]     = []

    @validator("reflection_type")
    def validate_reflection_type(cls, v: str) -> str:
        allowed = {"freeform", "guided", "structured"}
        if v not in allowed:
            raise ValueError(f"reflection_type must be one of {allowed}")
        return v


class NotebookEntryResponse(BaseModel):
    """Full notebook entry record."""
    id:                  str
    session_id:          str
    student_id:          str
    activity_id:         str
    reflection_type:     str
    title:               Optional[str] = None
    content:             str
    learning_objectives: List[str]     = []
    competencies:        List[str]     = []
    created_at:          str
    updated_at:          str

    class Config:
        from_attributes = True


class NotebookListResponse(BaseModel):
    """List of notebook entries for a session."""
    entries: List[NotebookEntryResponse]
    total:   int


# ============================================================================
# SUBMISSION SCHEMAS
# ============================================================================

class ActivitySubmitRequest(BaseModel):
    """
    Sent when student taps 'Submit' on the Submission screen (screen 06).
    session_id is required to compile evidence snapshot.
    """
    session_id: str = Field(..., description="Active session ID to compile and submit")


class ActivitySubmissionResponse(BaseModel):
    """Response returned after submission."""
    submission_id:     str
    activity_id:       str
    student_id:        str
    submission_status: str
    submitted_at:      Optional[str] = None
    evidence_count:    int = 0
    reflection_count:  int = 0

    class Config:
        from_attributes = True


class SubmissionDetailResponse(ActivitySubmissionResponse):
    """Full submission detail including teacher feedback (post-grading)."""
    teacher_feedback: Optional[str]  = None
    grade:            Optional[float] = None
    rubric_scores:    Optional[Dict]  = None
    graded_at:        Optional[str]   = None
    compiled_evidence: Optional[Dict] = None


# ============================================================================
# PROGRESS SCHEMAS
# ============================================================================

class SessionProgressResponse(BaseModel):
    """
    Real-time progress summary shown on Progress screen (screen 11)
    and as the in-activity progress bar during Phase 2.
    """
    session_id:                    str
    activity_id:                   str
    status:                        str
    evidence_count:                int
    reflection_count:              int
    time_elapsed_minutes:          Optional[int] = None
    learning_objectives_total:     int = 0
    learning_objectives_addressed: List[str] = []
    competencies_demonstrated:     List[str] = []
    started_at:                    str
