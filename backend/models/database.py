# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""SQLAlchemy models for Peripateticware"""

from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, ForeignKey, Text, JSON, Enum
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from pgvector.sqlalchemy import Vector
from sqlalchemy.orm import relationship
from core.database import Base
from datetime import datetime
import uuid
import enum


class UserRole(str, enum.Enum):
    """User role enumeration"""
    STUDENT = "student"
    TEACHER = "teacher"
    PARENT = "parent"
    ADMIN = "admin"


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


class CurriculumUnit(Base):
    """Curriculum unit or learning objective"""
    __tablename__ = "curriculum_units"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), index=True)
    description = Column(Text)
    subject = Column(String(255), index=True)
    grade_level = Column(Integer)
    bloom_level = Column(Integer)  # Target Bloom level
    marzano_level = Column(Integer)  # Target Marzano level
    
    # Content
    content_embedding = Column(Vector(384))  # For RAG
    raw_content = Column(JSONB)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    learning_sessions = relationship("LearningSession", back_populates="curriculum")


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
    status = Column(String(50), default="in_progress")  # in_progress, completed, paused
    
    # Socratic logs (raw artifacts for teachers)
    inquiry_log = Column(JSONB)  # Array of inquiry objects
    
    # Evidence of Learning
    evidence = Column(JSONB)  # Structured learning outcomes
    
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
    input_type = Column(String(50))  # image, audio, text, location, sensor
    
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
    site_context = Column(JSONB)  # WHERE: location-based
    curriculum_context = Column(JSONB)  # WHY: learning objectives
    persona_context = Column(JSONB)  # HOW: student learning style
    
    # Reasoning output
    inquiry_path = Column(JSONB)  # Generated inquiry pathway
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
    components = Column(JSONB)  # {"rag_pipeline": 120, "inference": 450, ...}
    
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
    operation = Column(String(50))  # create, update, delete
    entity_type = Column(String(100))
    entity_id = Column(String(255))
    
    # Payload
    data = Column(JSONB)
    
    # Sync status
    is_synced = Column(Boolean, default=False)
    sync_attempts = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    synced_at = Column(DateTime, nullable=True)


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


class Activity(Base):
    """Teacher-created learning activity"""
    __tablename__ = "activities"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    
    # Basic Info
    title = Column(String(255), index=True, nullable=False)
    description = Column(Text, nullable=False)
    learning_objectives = Column(JSONB, default=list)  # List of objectives
    
    # Location Trigger
    location_latitude = Column(Float, nullable=False)
    location_longitude = Column(Float, nullable=False)
    location_radius_meters = Column(Integer, default=100)
    location_name = Column(String(255), nullable=False)
    
    # Metadata
    grade_level = Column(Integer, nullable=False)  # 3-12
    subject = Column(String(100), index=True, nullable=False)
    difficulty_level = Column(Integer, default=3)  # 1-5
    estimated_duration_minutes = Column(Integer, nullable=False)
    
    # Materials/Resources
    materials_needed = Column(JSONB, default=list)
    resources = Column(JSONB, default=list)  # URLs, references
    
    # Curriculum Mapping
    curriculum_unit_ids = Column(ARRAY(UUID(as_uuid=True)), default=list)
    bloom_level = Column(Integer, nullable=False)  # 1-6
    
    # Activity Type
    activity_type = Column(Enum(ActivityType), default=ActivityType.INQUIRY)
    
    # Status & Visibility
    status = Column(Enum(ActivityStatus), default=ActivityStatus.DRAFT, index=True)
    is_active = Column(Boolean, default=True)
    is_shareable = Column(Boolean, default=False)
    
    # Metadata
    view_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)
    
    # Relationships
    teacher = relationship("User")
    projects = relationship("Project", secondary="project_activities", back_populates="activities")
    sessions = relationship("LearningSession", back_populates="activity")


class ProjectStatus(str, enum.Enum):
    """Project status enumeration"""
    PLANNING = "planning"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


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

# ==============================================================================
# PHASE 6: Student Evidence & Learning Models
# Add these classes to backend/models/database.py
# ==============================================================================

import enum
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey, Boolean, Enum, ARRAY, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

# ==============================================================================
# ENUMERATIONS FOR PHASE 6
# ==============================================================================

class CaptureType(str, enum.Enum):
    """Type of evidence captured by student"""
    PHOTO = "photo"
    VIDEO = "video"
    AUDIO = "audio"
    TEXT = "text"
    SKETCH = "sketch"
    MEASUREMENT = "measurement"


class NotebookEntryType(str, enum.Enum):
    """Type of reflection journal entry"""
    REFLECTION = "reflection"      # Guided prompts
    QUESTION = "question"          # Student curiosities
    DISCOVERY = "discovery"        # What they learned
    HYPOTHESIS = "hypothesis"      # Predictions
    FREEFORM = "freeform"         # Open writing


class AnnotationType(str, enum.Enum):
    """Type of annotation on evidence"""
    TEXT_LABEL = "text_label"
    BOX = "box"
    ARROW = "arrow"
    EXPLANATION = "explanation"


class CompetencyStatus(str, enum.Enum):
    """Status of competency achievement"""
    NOT_STARTED = "not_started"
    DEVELOPING = "developing"
    PROFICIENT = "proficient"
    ADVANCED = "advanced"


class TranscriptionStatus(str, enum.Enum):
    """Status of audio transcription"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# ==============================================================================
# STUDENT CAPTURE MODEL - Evidence of learning
# ==============================================================================

class StudentCapture(Base):
    """Evidence of learning captured by student during activities"""
    __tablename__ = "student_captures"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("learning_sessions.id"), nullable=True)
    
    # CAPTURE METADATA
    capture_type = Column(Enum(CaptureType), nullable=False, index=True)
    file_path = Column(String(512), nullable=False)  # Storage location (S3/local)
    file_size_bytes = Column(Integer)
    mime_type = Column(String(100))
    
    # LOCATION & TIME (Auto-captured)
    captured_at = Column(DateTime, default=datetime.utcnow, index=True)
    location_latitude = Column(Float, nullable=True)
    location_longitude = Column(Float, nullable=True)
    location_name = Column(String(255), nullable=True)
    
    # AUDIO-SPECIFIC (For ASR - Speech-to-Text)
    transcript = Column(Text, nullable=True)                    # ASR result text
    transcript_confidence = Column(Float, nullable=True)        # 0-1 confidence score
    transcript_language = Column(String(10), nullable=True)     # en, es, ar, ja
    transcript_status = Column(Enum(TranscriptionStatus), default=TranscriptionStatus.PENDING)
    transcript_source = Column(String(50), nullable=True)       # whisper, claude, openai
    
    # MEDIA METADATA
    duration_seconds = Column(Integer, nullable=True)           # For video/audio
    dimensions = Column(String(20), nullable=True)              # For photos: "1920x1080"
    description = Column(Text, nullable=True)                   # User-provided caption
    
    # AUDIT TRAIL
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # RELATIONSHIPS
    student = relationship("User")
    activity = relationship("Activity")
    session = relationship("LearningSession")
    annotations = relationship("StudentAnnotation", back_populates="capture")
    notebook_links = relationship("NotebookCaptureLink", back_populates="capture")
    
    __table_args__ = (
        Index('ix_student_captures_student_activity', 'student_id', 'activity_id'),
        Index('ix_student_captures_captured_at', 'captured_at'),
    )


# ==============================================================================
# STUDENT NOTEBOOK MODEL - Reflection journal
# ==============================================================================

class StudentNotebook(Base):
    """Student reflection journal entries"""
    __tablename__ = "student_notebooks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("learning_sessions.id"), nullable=True)
    
    # ENTRY CONTENT
    entry_type = Column(Enum(NotebookEntryType), default=NotebookEntryType.REFLECTION, index=True)
    prompt = Column(Text, nullable=True)                        # If guided reflection
    content = Column(Text, nullable=False)                      # Markdown-formatted reflection
    
    # LEARNING CONTEXT
    learning_objectives_tagged = Column(ARRAY(UUID(as_uuid=True)), default=list)
    competencies_addressed = Column(ARRAY(String), default=list)  # e.g., ["critical_thinking", "observation"]
    
    # REFLECTION QUALITY (Auto-calculated)
    reflection_depth = Column(String(20), default="surface")  # surface, developing, deep
    word_count = Column(Integer, default=0)
    
    # AUDIT TRAIL
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # RELATIONSHIPS
    student = relationship("User")
    activity = relationship("Activity")
    session = relationship("LearningSession")
    linked_captures = relationship("NotebookCaptureLink", back_populates="notebook")
    teacher_feedback = relationship("NotebookFeedback", back_populates="notebook", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('ix_student_notebooks_student_activity', 'student_id', 'activity_id'),
        Index('ix_student_notebooks_created_at', 'created_at'),
    )


# ==============================================================================
# STUDENT ANNOTATION MODEL - Markup on evidence
# ==============================================================================

class StudentAnnotation(Base):
    """Annotations on student evidence (mark-ups, labels, explanations)"""
    __tablename__ = "student_annotations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    capture_id = Column(UUID(as_uuid=True), ForeignKey("student_captures.id"), index=True)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    # ANNOTATION TYPE & CONTENT
    annotation_type = Column(Enum(AnnotationType), nullable=False)
    content = Column(Text, nullable=False)                      # Label text or explanation
    
    # VISUAL POSITION (For photo annotations)
    position_x = Column(Float, nullable=True)                   # Relative to image
    position_y = Column(Float, nullable=True)
    position_width = Column(Float, nullable=True)
    position_height = Column(Float, nullable=True)
    
    # LEARNING CONTEXT
    linked_objective = Column(String(255), nullable=True)
    linked_concept = Column(String(255), nullable=True)
    explanation = Column(Text)                                  # Why is this evidence important?
    
    # AUDIT TRAIL
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # RELATIONSHIPS
    capture = relationship("StudentCapture", back_populates="annotations")
    student = relationship("User")


# ==============================================================================
# NOTEBOOK-CAPTURE LINKING MODEL
# ==============================================================================

class NotebookCaptureLink(Base):
    """Links notebook entries to captured evidence"""
    __tablename__ = "notebook_capture_links"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    notebook_id = Column(UUID(as_uuid=True), ForeignKey("student_notebooks.id"), index=True)
    capture_id = Column(UUID(as_uuid=True), ForeignKey("student_captures.id"), index=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # RELATIONSHIPS
    notebook = relationship("StudentNotebook", back_populates="linked_captures")
    capture = relationship("StudentCapture", back_populates="notebook_links")
    
    __table_args__ = (
        Index('ix_notebook_capture_links_notebook_capture', 'notebook_id', 'capture_id'),
    )


# ==============================================================================
# NOTEBOOK FEEDBACK MODEL - Teacher feedback
# ==============================================================================

class NotebookFeedback(Base):
    """Teacher feedback on student reflections"""
    __tablename__ = "notebook_feedback"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    notebook_id = Column(UUID(as_uuid=True), ForeignKey("student_notebooks.id"), index=True)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    # FEEDBACK CONTENT
    comment = Column(Text, nullable=False)
    is_positive = Column(Boolean, default=True)
    
    # COMPETENCY ASSESSMENT
    competency_level = Column(String(50))  # emerging, developing, proficient, advanced
    
    # AUDIT TRAIL
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # RELATIONSHIPS
    notebook = relationship("StudentNotebook", back_populates="teacher_feedback")
    teacher = relationship("User")


# ==============================================================================
# STUDENT COMPETENCY MODEL - Progress tracking
# ==============================================================================

class StudentCompetency(Base):
    """Track student competency progress and achievement"""
    __tablename__ = "student_competencies"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    
    # COMPETENCY INFO
    competency_name = Column(String(255), index=True)
    description = Column(Text)
    category = Column(String(100))  # e.g., "critical_thinking", "collaboration"
    
    # PROGRESS TRACKING
    status = Column(Enum(CompetencyStatus), default=CompetencyStatus.NOT_STARTED, index=True)
    progress_percent = Column(Integer, default=0)               # 0-100%
    evidence_count = Column(Integer, default=0)                 # Number of supporting captures
    
    # ACHIEVEMENT DATES
    first_achieved_at = Column(DateTime, nullable=True)
    last_achieved_at = Column(DateTime, nullable=True)
    
    # AUDIT TRAIL
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # RELATIONSHIPS
    student = relationship("User")
    
    __table_args__ = (
        Index('ix_student_competencies_student_category', 'student_id', 'category'),
        Index('ix_student_competencies_status', 'status'),
    )