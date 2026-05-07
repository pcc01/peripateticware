# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""SQLAlchemy models for Peripateticware - COMPLETE MERGED (Original + Phase 6 + Phase 5)"""

from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, ForeignKey, Text, JSON, Index, Enum, Table
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from pgvector.sqlalchemy import Vector
from sqlalchemy.orm import relationship
from core.database import Base
from datetime import datetime
import uuid
import enum


# ============================================================================
# ALL ENUMS (Original + Phase 6 + Phase 5)
# ============================================================================

class UserRole(str, enum.Enum):
    """User role enumeration"""
    STUDENT = "student"
    TEACHER = "teacher"
    PARENT = "parent"
    ADMIN = "admin"


class ActivityType(str, enum.Enum):
    """Activity type enumeration"""
    INQUIRY = "inquiry"
    DISCUSSION = "discussion"
    HANDS_ON = "hands_on"
    VIRTUAL = "virtual"
    HYBRID = "hybrid"


class ActivityStatus(str, enum.Enum):
    """Activity status enumeration"""
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ProjectStatus(str, enum.Enum):
    """Project status enumeration"""
    PLANNING = "planning"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class CaptureType(str, enum.Enum):
    """Type of evidence captured (Phase 6)"""
    PHOTO = "photo"
    VIDEO = "video"
    AUDIO = "audio"
    TEXT = "text"
    SKETCH = "sketch"
    MEASUREMENT = "measurement"


class CompetencyStatus(str, enum.Enum):
    """Student competency progress status (Phase 6)"""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    PROFICIENT = "proficient"
    ADVANCED = "advanced"


class PrivacyFramework(str, enum.Enum):
    """Supported privacy frameworks (Phase 5)"""
    GDPR = "gdpr"
    CCPA = "ccpa"
    COPPA = "coppa"
    PIPEDA = "pipeda"
    LGPD = "lgpd"
    PDPA = "pdpa"
    CUSTOM = "custom"


# ============================================================================
# JUNCTION TABLES
# ============================================================================

activity_locations = Table(
    'activity_locations',
    Base.metadata,
    Column('activity_id', UUID(as_uuid=True), ForeignKey('activities.id'), primary_key=True),
    Column('location_id', UUID(as_uuid=True), ForeignKey('cached_locations.id'), primary_key=True)
)


# ============================================================================
# ORIGINAL USER MODELS (Phase 1-4)
# ============================================================================

class User(Base):
    """User model"""
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, index=True)
    username = Column(String(255), unique=True, index=True)
    hashed_password = Column(String(255))
    role = Column(Enum(UserRole), default=UserRole.STUDENT)
    full_name = Column(String(255))
    avatar_url = Column(String(512), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    learning_sessions = relationship("LearningSession", back_populates="user")
    student_profile = relationship("StudentProfile", uselist=False, back_populates="user")


class StudentProfile(Base):
    """Student profile and persona data"""
    __tablename__ = "student_profiles"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    # Learning Persona (HOW)
    learning_style = Column(String(50))  # visual, auditory, kinesthetic
    bloom_level = Column(Integer, default=1)  # 1-6 (Remember to Create)
    marzano_level = Column(Integer, default=1)  # 1-4
    prior_knowledge = Column(JSONB)
    
    # Hardware Capability Matrix
    device_sensor_precision = Column(Float)
    device_npu_power = Column(Float)
    device_camera_level = Column(Float)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="student_profile")


# ============================================================================
# ORIGINAL CURRICULUM MODELS (Phase 1-4)
# ============================================================================

class CurriculumUnit(Base):
    """Curriculum unit or learning objective"""
    __tablename__ = "curriculum_units"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), index=True)
    description = Column(Text)
    subject = Column(String(255), index=True)
    grade_level = Column(Integer)
    bloom_level = Column(Integer)
    marzano_level = Column(Integer)
    
    # Content
    content_embedding = Column(Vector(384))
    raw_content = Column(JSONB)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    learning_sessions = relationship("LearningSession", back_populates="curriculum")


# ============================================================================
# ORIGINAL SESSION MODELS (Phase 1-4)
# ============================================================================

class LearningSession(Base):
    """Learning session (inquiry path)"""
    __tablename__ = "learning_sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    curriculum_id = Column(UUID(as_uuid=True), ForeignKey("curriculum_units.id"))
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), nullable=True)
    
    # Session data
    title = Column(String(255))
    
    # Location (WHERE)
    latitude = Column(Float)
    longitude = Column(Float)
    location_name = Column(String(255))
    
    # Session state
    is_active = Column(Boolean, default=True)
    status = Column(String(50), default="in_progress")
    
    # Socratic logs
    inquiry_log = Column(JSONB)
    
    # Evidence of Learning
    evidence = Column(JSONB)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="learning_sessions")
    curriculum = relationship("CurriculumUnit", back_populates="learning_sessions")
    activity = relationship("Activity", back_populates="sessions")
    multimodal_inputs = relationship("MultimodalInput", back_populates="session")
    triple_join_records = relationship("TripleJoinRecord", back_populates="session")


class MultimodalInput(Base):
    """Multimodal sensor inputs from device"""
    __tablename__ = "multimodal_inputs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("learning_sessions.id"))
    
    # Input type
    input_type = Column(String(50))
    
    # Raw data (PII scrubbed)
    raw_data = Column(JSONB)
    
    # Processed embeddings
    embedding = Column(Vector(384))
    
    # Metadata
    timestamp = Column(DateTime, default=datetime.utcnow)
    processing_latency_ms = Column(Integer)
    
    # Relationships
    session = relationship("LearningSession", back_populates="multimodal_inputs")


class TripleJoinRecord(Base):
    """Triple-join reasoning record (SITE + CURRICULUM + PERSONA)"""
    __tablename__ = "triple_join_records"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("learning_sessions.id"))
    
    # Triple join components
    site_context = Column(JSONB)
    curriculum_context = Column(JSONB)
    persona_context = Column(JSONB)
    
    # Reasoning output
    inquiry_path = Column(JSONB)
    recommended_resources = Column(ARRAY(String))
    confidence_score = Column(Float)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    session = relationship("LearningSession", back_populates="triple_join_records")


class ObservabilityLog(Base):
    """Latency and performance metrics"""
    __tablename__ = "observability_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Request tracking
    request_id = Column(String(255), index=True)
    endpoint = Column(String(255))
    
    # Timing
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    total_latency_ms = Column(Integer)
    
    # Component breakdowns
    components = Column(JSONB)
    
    # Status
    status_code = Column(Integer)
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class SyncLog(Base):
    """WAL-based sync log for offline resilience"""
    __tablename__ = "sync_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Device tracking
    device_id = Column(String(255), index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("learning_sessions.id"), nullable=True)
    
    # Operation
    operation = Column(String(50))
    entity_type = Column(String(100))
    entity_id = Column(String(255))
    
    # Payload
    data = Column(JSONB)
    
    # Sync status
    is_synced = Column(Boolean, default=False)
    sync_attempts = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    synced_at = Column(DateTime, nullable=True)


# ============================================================================
# ORIGINAL ACTIVITY MODELS (Phase 1-4)
# ============================================================================

class Activity(Base):
    """Teacher-created learning activity"""
    __tablename__ = "activities"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    
    # Basic Info
    title = Column(String(255), index=True, nullable=False)
    description = Column(Text, nullable=False)
    learning_objectives = Column(JSONB, default=list)
    
    # Location Trigger
    location_latitude = Column(Float, nullable=False)
    location_longitude = Column(Float, nullable=False)
    location_radius_meters = Column(Integer, default=100)
    location_name = Column(String(255), nullable=False)
    
    # Metadata
    grade_level = Column(Integer, nullable=False)
    subject = Column(String(100), index=True, nullable=False)
    difficulty_level = Column(Integer, default=3)
    estimated_duration_minutes = Column(Integer, nullable=False)
    
    # Materials/Resources
    materials_needed = Column(JSONB, default=list)
    resources = Column(JSONB, default=list)
    
    # Curriculum Mapping
    curriculum_unit_ids = Column(ARRAY(UUID(as_uuid=True)), default=list)
    bloom_level = Column(Integer, nullable=False)
    
    # Activity Type
    activity_type = Column(Enum(ActivityType), default=ActivityType.INQUIRY)
    
    # Status & Visibility
    status = Column(Enum(ActivityStatus), default=ActivityStatus.DRAFT, index=True)
    is_active = Column(Boolean, default=True)
    is_shareable = Column(Boolean, default=False)
    
    # Phase 5 Privacy/Location additions
    enriched_location_id = Column(UUID(as_uuid=True), ForeignKey("enriched_locations.id"), nullable=True)
    location_source = Column(String(50), nullable=True)
    privacy_jurisdiction_id = Column(String(100), index=True, nullable=True)
    privacy_compliant = Column(Boolean, default=False)
    last_compliance_check = Column(DateTime, nullable=True)
    
    # Metadata
    view_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)
    
    # Relationships
    teacher = relationship("User")
    projects = relationship("Project", secondary="project_activities", back_populates="activities")
    sessions = relationship("LearningSession", back_populates="activity")
    cached_locations = relationship("CachedLocation", secondary="activity_locations", back_populates="activities_using")
    compliance_checks = relationship("ComplianceCheck", back_populates="activity")
    consent_logs = relationship("ConsentLog", back_populates="activity")
    retention_policies = relationship("DataRetentionPolicy", back_populates="activity")


class Project(Base):
    """Teacher-managed project (collection of activities)"""
    __tablename__ = "projects"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    
    # Basic Info
    title = Column(String(255), index=True, nullable=False)
    description = Column(Text, nullable=False)
    
    # Scope
    grade_level = Column(Integer, nullable=False)
    subject = Column(String(100), index=True, nullable=False)
    duration_weeks = Column(Integer, nullable=False)
    
    # Timeline
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=True)
    
    # Status
    status = Column(Enum(ProjectStatus), default=ProjectStatus.PLANNING, index=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    teacher = relationship("User")
    activities = relationship("Activity", secondary="project_activities", back_populates="projects")


class ProjectActivity(Base):
    """Association between projects and activities with ordering"""
    __tablename__ = "project_activities"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), index=True)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True)
    
    # Ordering within project
    order = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)


# ============================================================================
# PHASE 6 MODELS - Student Evidence Capture & Portfolio
# ============================================================================

class StudentCapture(Base):
    """Evidence of learning captured by student"""
    __tablename__ = "student_captures"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("learning_sessions.id"))
    
    # Capture metadata
    capture_type = Column(Enum(CaptureType), nullable=False)
    file_path = Column(String(512))
    file_size_bytes = Column(Integer)
    mime_type = Column(String(100))
    
    # Location and time
    captured_at = Column(DateTime, default=datetime.utcnow, index=True)
    location_latitude = Column(Float, nullable=True)
    location_longitude = Column(Float, nullable=True)
    
    # Audio-specific (for ASR)
    transcript = Column(Text, nullable=True)
    transcript_confidence = Column(Float, nullable=True)
    transcript_language = Column(String(10), nullable=True)
    
    # Metadata
    duration_seconds = Column(Integer, nullable=True)
    dimensions = Column(String(20), nullable=True)
    description = Column(Text, nullable=True)
    
    # Relationships
    annotations = relationship("CaptureAnnotation", back_populates="capture")
    notebook_links = relationship("NotebookCaptureLink", back_populates="capture")


class StudentNotebook(Base):
    """Student learning journal/portfolio"""
    __tablename__ = "student_notebooks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True)
    
    # Notebook reflection
    where_notes = Column(Text, nullable=True)
    why_notes = Column(Text, nullable=True)
    how_notes = Column(Text, nullable=True)
    
    # Meta-cognition
    learning_insights = Column(Text, nullable=True)
    next_steps = Column(Text, nullable=True)
    
    # Teacher assessment
    rubric_scores = Column(JSONB, nullable=True)
    
    # Metadata
    is_submitted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    
    # Relationships
    linked_captures = relationship("NotebookCaptureLink", back_populates="notebook")
    teacher_feedback = relationship("NotebookFeedback", back_populates="notebook")


class CaptureAnnotation(Base):
    """Teacher or system annotations on student captures"""
    __tablename__ = "capture_annotations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    capture_id = Column(UUID(as_uuid=True), ForeignKey("student_captures.id"), index=True)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    # Annotation content
    annotation_type = Column(String(50))
    linked_objective = Column(String(255), nullable=True)
    linked_concept = Column(String(255), nullable=True)
    explanation = Column(Text)
    
    # Audit trail
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    capture = relationship("StudentCapture", back_populates="annotations")


class NotebookCaptureLink(Base):
    """Links notebook entries to captured evidence"""
    __tablename__ = "notebook_capture_links"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    notebook_id = Column(UUID(as_uuid=True), ForeignKey("student_notebooks.id"), index=True)
    capture_id = Column(UUID(as_uuid=True), ForeignKey("student_captures.id"), index=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    notebook = relationship("StudentNotebook", back_populates="linked_captures")
    capture = relationship("StudentCapture", back_populates="notebook_links")


class NotebookFeedback(Base):
    """Teacher feedback on student reflections"""
    __tablename__ = "notebook_feedback"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    notebook_id = Column(UUID(as_uuid=True), ForeignKey("student_notebooks.id"), index=True)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    # Feedback
    feedback_text = Column(Text)
    rating = Column(Integer)  # 1-5
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    notebook = relationship("StudentNotebook", back_populates="teacher_feedback")


class StudentCompetency(Base):
    """Track student progress on competencies"""
    __tablename__ = "student_competencies"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    competency_name = Column(String(255), index=True)
    
    # Progress tracking
    status = Column(Enum(CompetencyStatus), default=CompetencyStatus.NOT_STARTED)
    progress_percentage = Column(Integer, default=0)
    
    # Evidence
    supporting_evidence = Column(JSONB)  # Links to captures/notebooks
    
    # Metadata
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


# ============================================================================
# PHASE 5 MODELS - Privacy & Location
# ============================================================================

class CachedLocation(Base):
    """Cached location data for fast retrieval"""
    __tablename__ = "cached_locations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    place_id = Column(String(255), unique=True, index=True)
    name = Column(String(255), index=True)
    latitude = Column(Float)
    longitude = Column(Float)
    location_type = Column(String(100))
    address = Column(String(512))
    
    # Educational metadata
    subjects = Column(ARRAY(String))
    keywords = Column(ARRAY(String))
    learning_opportunities = Column(ARRAY(String))
    
    # Enrichment data
    description = Column(Text)
    image_url = Column(String(512))
    wikipedia_url = Column(String(512))
    wikidata_id = Column(String(100))
    
    # Source tracking
    source = Column(String(50))  # osm, nominatim, wikidata, google
    rating = Column(Float)
    user_ratings_total = Column(Integer)
    
    # Timestamps
    cached_at = Column(DateTime, default=datetime.utcnow, index=True)
    last_accessed = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    activities_using = relationship("Activity", secondary="activity_locations", back_populates="cached_locations")
    enriched = relationship("EnrichedLocation", uselist=False, back_populates="cached")


class EnrichedLocation(Base):
    """Enriched location data with educational context"""
    __tablename__ = "enriched_locations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cached_location_id = Column(UUID(as_uuid=True), ForeignKey("cached_locations.id"), unique=True)
    
    # Enhanced content
    detailed_description = Column(Text)
    historical_significance = Column(Text)
    architect_or_artist = Column(String(255))
    construction_date = Column(String(50))
    
    # Educational enrichment
    grade_levels = Column(ARRAY(Integer))
    related_concepts = Column(ARRAY(String))
    suggested_activities = Column(ARRAY(String))
    
    # Metadata
    enriched_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    cached = relationship("CachedLocation", back_populates="enriched")


class LocationSearchHistory(Base):
    """Track location searches for analytics"""
    __tablename__ = "location_search_history"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    
    # Search parameters
    search_latitude = Column(Float)
    search_longitude = Column(Float)
    search_radius = Column(Integer)
    search_query = Column(String(255))
    
    # Results
    results_count = Column(Integer)
    
    # Metadata
    searched_at = Column(DateTime, default=datetime.utcnow, index=True)


class PopularDestinations(Base):
    """Track popular educational locations in regions"""
    __tablename__ = "popular_destinations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("cached_locations.id"))
    
    # Usage stats
    usage_count = Column(Integer, default=1)
    unique_teachers = Column(Integer, default=0)
    unique_students = Column(Integer, default=0)
    
    # Geographic region (for clustering)
    region_latitude = Column(Float)
    region_longitude = Column(Float)
    region_radius_km = Column(Integer)
    
    # Metadata
    last_used = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


class LocationEnrichmentQueue(Base):
    """Queue for background enrichment jobs"""
    __tablename__ = "location_enrichment_queue"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id = Column(UUID(as_uuid=True), ForeignKey("cached_locations.id"))
    
    # Job status
    status = Column(String(50), default="pending")  # pending, processing, completed, failed
    priority = Column(Integer, default=0)
    
    # Subject context
    subject_context = Column(String(255))
    
    # Retry tracking
    attempt_count = Column(Integer, default=0)
    last_error = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)


class ComplianceCheck(Base):
    """Activity compliance check record"""
    __tablename__ = "compliance_checks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True)
    
    # Check details
    jurisdiction = Column(String(100), index=True)
    is_compliant = Column(Boolean)
    issues = Column(ARRAY(String))
    warnings = Column(ARRAY(String))
    
    # Metadata
    checked_at = Column(DateTime, default=datetime.utcnow, index=True)
    checked_by = Column(String(100))
    
    # Relationships
    activity = relationship("Activity", back_populates="compliance_checks")


class ConsentLog(Base):
    """Consent and privacy audit log"""
    __tablename__ = "consent_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    # Consent details
    consent_type = Column(String(100))
    granted = Column(Boolean)
    jurisdiction = Column(String(100))
    
    # Audit trail
    logged_at = Column(DateTime, default=datetime.utcnow, index=True)
    expires_at = Column(DateTime, nullable=True)
    
    # Relationships
    activity = relationship("Activity", back_populates="consent_logs")


class DataRetentionPolicy(Base):
    """Data retention configuration for activities"""
    __tablename__ = "data_retention_policies"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True)
    
    # Retention rules
    retention_days = Column(Integer)
    retention_reason = Column(String(255))
    jurisdiction = Column(String(100))
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    activity = relationship("Activity", back_populates="retention_policies")


class PrivacyConfiguration(Base):
    """Privacy configuration for jurisdiction compliance"""
    __tablename__ = "privacy_configurations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jurisdiction = Column(String(100), unique=True, index=True)
    framework = Column(Enum(PrivacyFramework))
    
    # Configuration
    config_data = Column(JSONB)
    student_age_limits = Column(JSONB)
    consent_requirements = Column(JSONB)
    prohibited_data = Column(ARRAY(String))
    
    # Metadata
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)