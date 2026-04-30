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
