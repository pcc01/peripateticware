"""Pydantic schemas for activity and project endpoints"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from enum import Enum


class ActivityTypeEnum(str, Enum):
    """Activity type"""
    INQUIRY = "inquiry"
    DISCUSSION = "discussion"
    HANDS_ON = "hands_on"
    VIRTUAL = "virtual"
    HYBRID = "hybrid"


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
    learning_objectives: List[str] = Field(..., min_items=1, max_items=10)
    curriculum_unit_ids: List[UUID] = Field(default_factory=list)
    bloom_level: int = Field(..., ge=1, le=6)
    activity_type: ActivityTypeEnum = ActivityTypeEnum.INQUIRY
    is_shareable: bool = False
    
    @validator('learning_objectives')
    def validate_objectives(cls, v):
        """Validate learning objectives"""
        if not v:
            raise ValueError('At least one learning objective is required')
        for obj in v:
            if not isinstance(obj, str) or len(obj) < 3:
                raise ValueError('Each objective must be at least 3 characters')
        return v


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
    learning_objectives: Optional[List[str]] = Field(None, min_items=1, max_items=10)
    curriculum_unit_ids: Optional[List[UUID]] = None
    bloom_level: Optional[int] = Field(None, ge=1, le=6)
    activity_type: Optional[ActivityTypeEnum] = None
    is_shareable: Optional[bool] = None


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
    view_count: int
    created_at: datetime
    updated_at: datetime
    
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
    
    @validator('end_date')
    def validate_end_date(cls, v, values):
        """Validate end_date is after start_date"""
        if v and 'start_date' in values:
            if v <= values['start_date']:
                raise ValueError('End date must be after start date')
        return v


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
