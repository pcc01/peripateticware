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
