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
    Fields are Optional with safe defaults so NULL DB values don't 500.
    """
    id:                          UUID
    title:                       str
    description:                 Optional[str] = ""
    subject:                     Optional[str] = ""
    grade_level:                 Optional[int] = None
    estimated_duration_minutes:  Optional[int] = None
    difficulty_level:            Optional[int] = None
    location_name:               Optional[str] = ""
    location_latitude:           Optional[float] = None
    location_longitude:          Optional[float] = None
    location_radius_meters:      Optional[int] = None
    bloom_level:                 Optional[int] = None
    materials_needed:            List[str]     = []
    learning_objectives:         List[Any]     = []
    assessment_type:             Optional[str] = None
    activity_type:               Optional[str] = None
    # Author's choice (schemas/activities.py's AIInteractionModeEnum):
    # 'ai_chat' = "Ask Peri" AI conversation available; 'curated_only' =
    # curated question bank only, no live AI call. Client uses this to
    # decide whether to show the Ask Peri entry point at all.
    ai_interaction_mode:         str           = "ai_chat"

    class Config:
        from_attributes = True


class ActivityPhaseDetail(BaseModel):
    title: str
    instructions: str
    due_date: str  # ISO string


class ActivityPhases(BaseModel):
    orient:  ActivityPhaseDetail
    inquiry: ActivityPhaseDetail
    reflect: ActivityPhaseDetail


class ActivityDiscoveryDetail(BaseModel):
    """
    Discovery / scavenger-hunt specific content (Activity.discovery_* columns
    -- see models/database.py). Only present when activity_type='discovery';
    None for every other activity type. This is the actual "take photos of 8
    native plants in Central Park" task the teacher or AI wrote -- distinct
    from the generic description/learning_objectives every activity has, and
    previously dropped entirely by this endpoint (see get_student_activity's
    comment). Frontend contract: when rendering or reading this aloud,
    task_description (the objective) always comes first.
    """
    task_description:           str
    mode:                        Optional[str]           = None  # 'location_based' | 'task_based'
    documentation_requirements:  Optional[Dict[str, Any]] = None  # e.g. {"photos": true, "notes": true}
    success_criteria:            Optional[str]            = None
    difficulty_level:            Optional[int]            = None
    time_limit_minutes:          Optional[int]            = None
    location_required:           bool                     = False


class WaypointDetail(BaseModel):
    """One scavenger-hunt stop, sent to the student app so it can navigate
    ON DEVICE (rung B — no coordinate leaves the phone). See
    WAYFINDING_CONSENT_LADDER.md."""
    id:                    str
    sequence_index:        int
    name:                  str
    clue_text:             Optional[str]            = None
    latitude:              float
    longitude:             float
    arrival_radius_meters: int                      = 25
    symbol:                Optional[str]            = None
    required:              bool                     = True
    capture_requirements:  Optional[Dict[str, Any]] = None
    hint_unlock_rule:      Optional[str]            = None
    hint_unlock_minutes:   Optional[int]            = None


class WayfindingDetail(BaseModel):
    """Multi-step hunt navigation payload — ships in the activity detail so the
    map + route render offline (same rationale as location_wiki_data)."""
    enabled:            bool
    mode:               Optional[str]            = None   # ordered | free_choice | guided_path
    capability_ceiling: Optional[str]            = None   # 'A'..'E'
    route_geometry:     Optional[Dict[str, Any]] = None   # GeoJSON LineString
    waypoints:          List[WaypointDetail]     = []


class ActivityTeacher(BaseModel):
    name: str


class StudentActivityMySession(BaseModel):
    """The caller's current/most-recent attempt at an activity (for resume)."""
    session_id:     str
    status:         str            # in_progress | completed | submitted
    has_reflection: bool = False
    evidence_count: int  = 0


class StudentActivityDetail(StudentActivitySummary):
    """
    Full activity detail shown on the activity brief / Phase 1 screen (03 / 04).
    Adds location narrative, resources, taxonomy info, and frontend-expected
    phase/teacher/location shape.
    """
    location_info:     Optional[str]           = None
    location:          Optional[str]           = None   # alias of location_name for frontend
    # Structured Wikidata/Wikipedia place enrichment the teacher captured while
    # building this activity — shipped in this same payload so the student's
    # "Background Info" link works with no network call, even with no signal
    # at the field location. See models/database.py Activity.location_wiki_data.
    location_wiki_data: Optional[dict]          = None
    due_date:          Optional[str]           = None   # ISO string
    teacher:           Optional[ActivityTeacher] = None
    phases:            Optional[ActivityPhases]  = None
    discovery:         Optional[ActivityDiscoveryDetail] = None
    wayfinding:        Optional[WayfindingDetail] = None
    resources:         List[Dict]              = []
    suggested_lessons: Optional[List]          = []
    marzano_level:     Optional[int]           = None
    dok_level:         Optional[int]           = None
    solo_level:        Optional[int]           = None
    primary_framework: Optional[str]           = "blooms"
    created_at:        Optional[datetime]      = None
    # GPS live-map feature: tells the client whether to prompt the student
    # for location-sharing self-consent (13+) before/at session start.
    discovery_location_gps_capture_enabled: Optional[bool] = False
    # The caller's most recent session for this activity, if any — lets the
    # detail page resume an in-progress attempt on reload instead of showing
    # the "Before you begin" screen from scratch. None = never started.
    my_session: Optional[StudentActivityMySession] = None


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
