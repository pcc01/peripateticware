# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Pydantic schemas for activity and project endpoints"""

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID
from enum import Enum


class DiscoveryModeEnum(str, Enum):
    """Only meaningful when activity_type=DISCOVERY. Mirrors
    schemas/activities_extended.py's DiscoveryModeEnum (kept as a separate
    definition here rather than imported, matching how ActivityTypeEnum
    below is also self-contained rather than shared) — must stay in sync
    if either changes."""
    LOCATION_BASED = "location_based"
    TASK_BASED     = "task_based"


class ActivityTypeEnum(str, Enum):
    """Activity type"""
    INQUIRY = "inquiry"
    DISCUSSION = "discussion"
    HANDS_ON = "hands_on"
    VIRTUAL = "virtual"
    HYBRID = "hybrid"
    DISCOVERY = "discovery"


# Coercion maps so clients sending text labels / legacy values don't 422.
_BLOOM_LABELS = {
    "remember": 1, "understand": 2, "apply": 3,
    "analyze": 4, "evaluate": 5, "create": 6,
}
_ACTIVITY_TYPE_ALIASES = {
    "outdoor": "hands_on",
    "field-observation": "hands_on",
    "field_observation": "hands_on",
    "observation": "hands_on",
    "hands-on": "hands_on",
    "project": "inquiry",
    "experiment": "inquiry",
}


def _coerce_bloom_level(v):
    """Accept ints or text labels ('understand') for bloom_level."""
    if v is None or isinstance(v, int):
        return v
    if isinstance(v, str):
        s = v.strip().lower()
        if s.isdigit():
            return int(s)
        if s in _BLOOM_LABELS:
            return _BLOOM_LABELS[s]
    return v


def _coerce_activity_type(v):
    """Map legacy/invalid activity_type strings to a valid enum value."""
    if isinstance(v, str):
        s = v.strip().lower()
        if s in _ACTIVITY_TYPE_ALIASES:
            return _ACTIVITY_TYPE_ALIASES[s]
    return v


class ActivityStatusEnum(str, Enum):
    """Activity status"""
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ProjectStatusEnum(str, Enum):
    """Project status"""
    PLANNING = "planning"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


# ============================================================================
# ACTIVITY SCHEMAS
# ============================================================================

class ActivityBase(BaseModel):
    """Base activity schema"""
    title: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=10, max_length=5000)
    location_latitude: float
    location_longitude: float
    location_radius_meters: int = Field(default=100, ge=10, le=10000)
    location_name: str = Field(..., min_length=1, max_length=255)
    grade_level: int = Field(..., ge=3, le=12)
    subject: str = Field(..., min_length=1, max_length=100)
    difficulty_level: int = Field(default=3, ge=1, le=5)
    estimated_duration_minutes: int = Field(..., ge=5, le=480)
    materials_needed: List[str] = Field(default_factory=list)
    resources: List[dict] = Field(default_factory=list)
    learning_objectives: List[str] = Field(..., min_length=1, max_length=10)
    curriculum_unit_ids: List[UUID] = Field(default_factory=list)
    bloom_level: int = Field(..., ge=1, le=6)
    marzano_level: Optional[int] = Field(None, ge=1, le=4, description="Marzano's taxonomy level (1-4)")
    dok_level: Optional[int] = Field(None, ge=1, le=4, description="Depth of Knowledge level (1-4)")
    solo_level: Optional[int] = Field(None, ge=1, le=5, description="SOLO taxonomy level (1-5)")
    rubric_id: Optional[UUID] = None
    activity_type: ActivityTypeEnum = ActivityTypeEnum.INQUIRY
    is_shareable: bool = False
    share_scope: str = Field(default='org', description="'org' = share with same org only, 'all' = share globally")
    language: Optional[str] = Field(None, max_length=50, description="Content language, e.g. 'English', 'Spanish'")
    state_standard: Optional[str] = Field(None, max_length=100, description="US state curriculum standard, e.g. 'CA', 'TX'")
    discipline: Optional[str] = Field(None, max_length=100, description="Academic discipline, e.g. 'STEM', 'Humanities'")

    # ── Student mobile phase content (teacher-authored) ────────────────────────
    orient_phase: Optional[str] = Field(None, description="Orient phase content shown to students before the activity")
    inquiry_phase: Optional[str] = Field(None, description="Inquiry phase instructions/prompts shown during the activity")
    reflect_phase: Optional[str] = Field(None, description="Reflect phase prompt shown after the activity")

    # ── Wikidata/Wikipedia place enrichment ─────────────────────────────────────
    # Captured by the teacher builder's WikiLocationInfo panel when the location
    # is set, saved with the activity so students can read it offline in the
    # field (no network round-trip at click-time — it ships in the same
    # GET .../activities/{id} payload the app already loaded).
    location_wiki_data: Optional[dict] = Field(None, description="Structured Wikidata/Wikipedia place info (name, description, architect/artist, construction date, historical significance, keywords, learning opportunities, wikidata_id)")

    # ── Discovery / scavenger-hunt mode (Phase 3) ───────────────────────────────
    # Only meaningful when activity_type=DISCOVERY. These columns have existed
    # on the Activity model since Phase 3, but this is the first schema/route
    # wiring that actually lets a client set them at creation time — neither
    # web's activity builder nor this schema (before this change) ever
    # exposed them, so every discovery-typed activity that existed before
    # this was created with all of these left at their column defaults.
    discovery_mode: Optional[DiscoveryModeEnum] = Field(None, description="'location_based' = teacher specifies a location; 'task_based' = student finds it anywhere")
    discovery_task_description: Optional[str] = Field(None, max_length=2000)
    discovery_location_required: bool = False
    discovery_documentation_requirements: Optional[Dict[str, Any]] = Field(None, description='e.g. {"photos": true, "notes": true, "bloom_stage": true}')
    discovery_success_criteria: Optional[str] = Field(None, max_length=2000)
    discovery_difficulty_level: Optional[int] = Field(None, ge=1, le=4)
    discovery_time_limit_minutes: Optional[int] = Field(None, ge=1)
    discovery_location_gps_capture_enabled: bool = True
    discovery_location_sharing_rules: Optional[Dict[str, Any]] = Field(None, description='e.g. {"only_on_submission": true, "require_permission": true}')

    @field_validator('learning_objectives', mode='before')
    @classmethod
    def validate_objectives(cls, v):
        """Validate learning objectives — empty list gets a default instead of hard-failing."""
        if not v:
            return ["Complete the assigned outdoor learning activity."]
        filtered = [obj for obj in v if isinstance(obj, str) and len(obj.strip()) >= 3]
        return filtered or ["Complete the assigned outdoor learning activity."]

    @field_validator('materials_needed', 'resources', 'curriculum_unit_ids', mode='before')
    @classmethod
    def _coerce_none_list(cls, v):
        """These columns default to '[]'/'{}' at the DB level, but only when a
        row's INSERT explicitly touches them — raw-SQL seed inserts (e.g.
        startup.py's demo activity seed) that omit the column leave it NULL
        for pre-existing rows. ActivityResponse serialization (GET/PUT
        /activities/{id}) has no None-handling here, so any such activity
        500s with a bare "Internal Server Error" the moment it's fetched.
        Same failure class as this project's other raw-SQL-bypasses-ORM bugs
        (EncryptedString, AsyncSession.query()) — coerce None to [] rather
        than 500ing on activities nobody explicitly broke."""
        return [] if v is None else v

    @field_validator('bloom_level', mode='before')
    @classmethod
    def _coerce_bloom(cls, v):
        return _coerce_bloom_level(v)

    @field_validator('activity_type', mode='before')
    @classmethod
    def _coerce_type(cls, v):
        return _coerce_activity_type(v)


class ActivityCreate(ActivityBase):
    """Create activity request"""
    pass


class ActivityUpdate(BaseModel):
    """Update activity request"""
    title: Optional[str] = Field(None, min_length=3, max_length=255)
    description: Optional[str] = Field(None, min_length=10, max_length=5000)
    location_latitude: Optional[float] = None
    location_longitude: Optional[float] = None
    location_radius_meters: Optional[int] = Field(None, ge=10, le=10000)
    location_name: Optional[str] = Field(None, min_length=1, max_length=255)
    grade_level: Optional[int] = Field(None, ge=3, le=12)
    subject: Optional[str] = Field(None, min_length=1, max_length=100)
    difficulty_level: Optional[int] = Field(None, ge=1, le=5)
    estimated_duration_minutes: Optional[int] = Field(None, ge=5, le=480)
    materials_needed: Optional[List[str]] = None
    resources: Optional[List[dict]] = None
    learning_objectives: Optional[List[str]] = Field(None, min_length=1, max_length=10)
    curriculum_unit_ids: Optional[List[UUID]] = None
    bloom_level: Optional[int] = Field(None, ge=1, le=6)
    marzano_level: Optional[int] = Field(None, ge=1, le=4)
    dok_level: Optional[int] = Field(None, ge=1, le=4)
    solo_level: Optional[int] = Field(None, ge=1, le=5)
    rubric_id: Optional[UUID] = None
    activity_type: Optional[ActivityTypeEnum] = None
    is_shareable: Optional[bool] = None
    share_scope: Optional[str] = None
    language: Optional[str] = Field(None, max_length=50)
    state_standard: Optional[str] = Field(None, max_length=100)
    discipline: Optional[str] = Field(None, max_length=100)
    orient_phase: Optional[str] = None
    inquiry_phase: Optional[str] = None
    reflect_phase: Optional[str] = None
    location_wiki_data: Optional[dict] = None
    # Was settable at creation only (ActivityCreate has it) but silently
    # dropped by this schema on edit -- ActivityManager.tsx's Location tab
    # sends it on every save regardless of create/edit, but FastAPI/Pydantic
    # discards undeclared fields before update_activity() ever sees them, so
    # the edit-form checkbox has never actually worked for existing
    # activities. Needed by the unified tracking-settings surface too (bulk
    # toggle has nothing to toggle without this).
    discovery_location_gps_capture_enabled: Optional[bool] = None

    @field_validator('learning_objectives', mode='before')
    @classmethod
    def validate_objectives(cls, v):
        if v is None:
            return v
        if not v:
            return ["Complete the assigned outdoor learning activity."]
        filtered = [obj for obj in v if isinstance(obj, str) and len(obj.strip()) >= 3]
        return filtered or ["Complete the assigned outdoor learning activity."]

    @field_validator('bloom_level', mode='before')
    @classmethod
    def _coerce_bloom(cls, v):
        return _coerce_bloom_level(v)

    @field_validator('activity_type', mode='before')
    @classmethod
    def _coerce_type(cls, v):
        return _coerce_activity_type(v)


class ActivityResponse(ActivityBase):
    """Activity response"""
    id: UUID
    teacher_id: UUID
    status: ActivityStatusEnum
    is_active: bool
    view_count: int
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime]
    # Media fields (teacher-uploaded)
    hero_image_url: Optional[str] = None
    attachments: List[dict] = []
    # Overrides of ActivityBase's required fields — required is correct for
    # ActivityCreate/ActivityUpdate (a teacher must set a real location to
    # save an activity), but the location_* DB columns are nullable
    # (activities.location_latitude/longitude/name — see startup.py's
    # ALTER ... DROP NOT NULL) and some seeded/legacy rows genuinely have no
    # location (e.g. the "Map Your Neighborhood" demo activity). Without this
    # override, GET/PUT on any such activity 500s with a bare
    # ResponseValidationError ("Input should be a valid number" /
    # "Input should be a valid string") before the client ever sees a detail
    # message — this was the second cause behind "activity not found or
    # access denied" (the first was the None-list fields fixed above).
    location_latitude: Optional[float] = None
    location_longitude: Optional[float] = None
    location_name: Optional[str] = None
    created_locale: Optional[str] = None

    @field_validator('attachments', mode='before')
    @classmethod
    def _coerce_none_attachments(cls, v):
        """Same NULL-vs-[] gap as ActivityBase._coerce_none_list above."""
        return [] if v is None else v

    class Config:
        from_attributes = True


class ActivityListResponse(BaseModel):
    """Activity list response (simplified)"""
    id: UUID
    teacher_id: UUID
    title: str
    description: str
    subject: str
    grade_level: int
    difficulty_level: int
    estimated_duration_minutes: int
    status: ActivityStatusEnum
    activity_type: ActivityTypeEnum
    is_shareable: bool = False
    share_scope: str = 'org'
    language: Optional[str] = None
    state_standard: Optional[str] = None
    discipline: Optional[str] = None
    view_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SharedLibraryActivityResponse(BaseModel):
    """Activity response for the shared library (includes author info)"""
    id: UUID
    title: str
    description: str
    subject: str
    grade_level: int
    difficulty_level: int
    estimated_duration_minutes: int
    activity_type: str
    bloom_level: int
    location_name: str
    share_scope: str
    language: Optional[str] = None
    state_standard: Optional[str] = None
    discipline: Optional[str] = None
    author_name: Optional[str] = None
    author_org: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PaginatedActivityResponse(BaseModel):
    """Paginated activity response"""
    items: List[ActivityListResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ============================================================================
# PROJECT SCHEMAS
# ============================================================================

class ProjectBase(BaseModel):
    """Base project schema"""
    title: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=10, max_length=5000)
    grade_level: int = Field(..., ge=3, le=12)
    subject: str = Field(..., min_length=1, max_length=100)
    duration_weeks: int = Field(..., ge=1, le=52)
    start_date: datetime
    end_date: Optional[datetime] = None
    
    @model_validator(mode='after')
    def validate_end_date(self):
        if self.end_date and self.start_date:
            if self.end_date <= self.start_date:
                raise ValueError('End date must be after start date')
        return self


class ProjectCreate(ProjectBase):
    """Create project request"""
    pass


class ProjectUpdate(BaseModel):
    """Update project request"""
    title: Optional[str] = Field(None, min_length=3, max_length=255)
    description: Optional[str] = Field(None, min_length=10, max_length=5000)
    grade_level: Optional[int] = Field(None, ge=3, le=12)
    subject: Optional[str] = Field(None, min_length=1, max_length=100)
    duration_weeks: Optional[int] = Field(None, ge=1, le=52)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class ProjectActivityOrder(BaseModel):
    """Reorder activity request"""
    activity_id: UUID
    order: int


class ProjectActivityLink(BaseModel):
    """Link activity to project request"""
    activity_id: UUID
    order: Optional[int] = None


class ProjectResponse(ProjectBase):
    """Project response"""
    id: UUID
    teacher_id: UUID
    status: ProjectStatusEnum
    activities: List[ActivityListResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    """Project list response (simplified)"""
    id: UUID
    teacher_id: UUID
    title: str
    description: str
    subject: str
    grade_level: int
    duration_weeks: int
    start_date: datetime
    end_date: Optional[datetime]
    status: ProjectStatusEnum
    activity_count: int = 0
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class PaginatedProjectResponse(BaseModel):
    """Paginated project response"""
    items: List[ProjectListResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ============================================================================
# CURRICULUM SCHEMAS (for mapping)
# ============================================================================

class CurriculumUnitResponse(BaseModel):
    """Curriculum unit response"""
    id: UUID
    title: str
    description: str
    subject: str
    grade_level: int
    bloom_level: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class PaginatedCurriculumResponse(BaseModel):
    """Paginated curriculum response"""
    items: List[CurriculumUnitResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ============================================================================
# ERROR RESPONSES
# ============================================================================

class ErrorResponse(BaseModel):
    """Error response"""
    detail: str
    status_code: int


class ValidationErrorResponse(BaseModel):
    """Validation error response"""
    detail: List[dict]
    status_code: int = 422
