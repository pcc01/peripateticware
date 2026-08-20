# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""SQLAlchemy models for Peripateticware"""

from sqlalchemy import Column, String, Integer, BigInteger, Float, DateTime, Date, Boolean, ForeignKey, Text, JSON, Enum, Index, UniqueConstraint, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from pgvector.sqlalchemy import Vector
from sqlalchemy.orm import relationship
from core.database import Base
from datetime import datetime
import uuid
import enum

# ── Canonical User model (defined in models/user.py, re-exported here) ────────
# All other models in this file reference User via string "User" in relationships
# so there is no circular import issue.
from models.user import User, UserRole  # noqa: F401
from core.encryption import EncryptedString  # noqa: F401


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
    bloom_level = Column(Integer)   # Target Bloom level
    marzano_level = Column(Integer)  # Target Marzano level

    # Content
    content_embedding = Column(Vector(384))  # For RAG
    raw_content = Column(JSONB)

    is_active = Column(Boolean, default=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)  # teacher who created this unit
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    learning_sessions = relationship("LearningSession", back_populates="curriculum")


class LearningSession(Base):
    """Learning session (inquiry path)"""
    __tablename__ = "learning_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    curriculum_id = Column(UUID(as_uuid=True), ForeignKey("curriculum_units.id"), nullable=True)
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

    # Aristotelian inquiry logs (raw artifacts for teachers)
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
    site_context = Column(JSONB)        # WHERE: location-based
    curriculum_context = Column(JSONB)  # WHY: learning objectives
    persona_context = Column(JSONB)     # HOW: student learning style

    # Reasoning output
    inquiry_path = Column(JSONB)         # Generated inquiry pathway
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
    operation = Column(String(50))   # create, update, delete
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
    INQUIRY    = "inquiry"
    DISCUSSION = "discussion"
    HANDS_ON   = "hands_on"
    VIRTUAL    = "virtual"
    HYBRID     = "hybrid"
    DISCOVERY  = "discovery"    # Scavenger hunt / discovery task (Phase 3)


class ActivityStatus(str, enum.Enum):
    """Activity status enumeration"""
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class Activity(Base):
    """Teacher-created learning activity with location-based and AI-enhanced features"""
    __tablename__ = "activities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)

    # =========================================================================
    # BASIC INFORMATION
    # =========================================================================
    title = Column(String(255), index=True, nullable=False)
    description = Column(Text, nullable=False)
    learning_objectives = Column(JSONB, default=list)

    # =========================================================================
    # LOCATION-BASED LEARNING
    # =========================================================================
    location_latitude = Column(Float, nullable=True)
    location_longitude = Column(Float, nullable=True)
    location_radius_meters = Column(Integer, default=100)
    location_name = Column(String(255), nullable=True)

    # WikiLocation data
    location_info = Column(Text, nullable=True)
    location_context_id = Column(UUID(as_uuid=True), nullable=True)
    # Structured Wikidata/Wikipedia place enrichment (see startup.py's
    # apply_* migration for this column for the full rationale) — the
    # teacher-facing WikiLocationInfo payload, saved as-is so students can
    # read it offline once the activity detail page has loaded.
    location_wiki_data = Column(JSONB, nullable=True)

    # =========================================================================
    # PHASE 5 ADDITIONS: Privacy & Location tracking
    # =========================================================================
    enriched_location_id = Column(UUID(as_uuid=True), ForeignKey("enriched_locations.id"), nullable=True)
    location_source = Column(String(50), nullable=True)  # osm, nominatim, wikidata, google
    privacy_jurisdiction_id = Column(String(100), index=True, nullable=True)
    privacy_compliant = Column(Boolean, default=False)
    last_compliance_check = Column(DateTime, nullable=True)
    # Phase 7: track which student's field note promoted this activity
    originator_student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # =========================================================================
    # METADATA
    # =========================================================================
    grade_level = Column(Integer, nullable=False)   # 3-12
    subject = Column(String(100), index=True, nullable=False)
    difficulty_level = Column(Integer, default=3)   # 1-5
    estimated_duration_minutes = Column(Integer, nullable=False)

    # =========================================================================
    # MATERIALS & RESOURCES
    # =========================================================================
    materials_needed = Column(JSONB, default=list)
    resources = Column(JSONB, default=list)

    # =========================================================================
    # CURRICULUM & ASSESSMENT
    # =========================================================================
    curriculum_unit_ids = Column(ARRAY(UUID(as_uuid=True)), default=list)
    assessment_type = Column(String(50), default='formative')

    # =========================================================================
    # TAXONOMY LEVELS
    # =========================================================================
    bloom_level = Column(Integer, nullable=False)
    marzano_level = Column(Integer, nullable=True)
    dok_level = Column(Integer, nullable=True)
    solo_level = Column(Integer, nullable=True)
    primary_framework = Column(String(50), default='blooms')
    rubric_id = Column(UUID(as_uuid=True), nullable=True)

    # =========================================================================
    # ACTIVITY TYPE & AI SUGGESTIONS
    # =========================================================================
    activity_type = Column(String(50), default="inquiry")  # inquiry | field_observation | hands_on | project | discussion | experiment | discovery
    suggested_lessons = Column(JSONB, default=list)

    # Author's choice: 'ai_chat' = students can open-ended chat with
    # AI-backed Peri during this activity (on top of the curated question
    # bank); 'curated_only' = students only get prompts from the curated,
    # on-device bank -- no live AI call. Defaults to 'ai_chat' to match
    # pre-2026-08-20 behavior (every activity had AI chat, with no way to
    # turn it off) for existing rows. See schemas/activities.py's
    # AIInteractionModeEnum for the full tradeoff shown to teachers.
    ai_interaction_mode = Column(String(20), default="ai_chat", nullable=False, server_default="ai_chat")

    # =========================================================================
    # DISCOVERY / SCAVENGER HUNT (Phase 3 — only used when activity_type=DISCOVERY)
    # =========================================================================
    discovery_mode = Column(String(50), nullable=True)
    # "location_based" = teacher specifies a location; "task_based" = student finds it anywhere
    discovery_task_description = Column(Text, nullable=True)
    discovery_location_required = Column(Boolean, default=False)
    discovery_documentation_requirements = Column(JSONB, nullable=True)
    # e.g. {"photos": true, "notes": true, "bloom_stage": true}
    discovery_success_criteria = Column(Text, nullable=True)
    discovery_difficulty_level = Column(Integer, default=2)  # 1-4
    discovery_time_limit_minutes = Column(Integer, nullable=True)
    discovery_location_gps_capture_enabled = Column(Boolean, default=True)
    discovery_location_sharing_rules = Column(JSONB, nullable=True)
    # e.g. {"only_on_submission": true, "require_permission": true}

    # =========================================================================
    # STUDENT MOBILE PHASE CONTENT (teacher-authored)
    # =========================================================================
    orient_phase = Column(Text, nullable=True)    # Shown before activity starts
    inquiry_phase = Column(Text, nullable=True)   # Shown during activity
    reflect_phase = Column(Text, nullable=True)   # Shown after activity completion

    # =========================================================================
    # STATUS & VISIBILITY
    # =========================================================================
    status = Column(String(50), default="draft", index=True)  # draft | published | archived
    is_active = Column(Boolean, default=True)
    is_shareable = Column(Boolean, default=False)
    share_scope = Column(String(20), default='org')  # 'org' | 'all'
    language = Column(String(50), nullable=True)         # content language e.g. 'English'
    created_locale = Column(String(10), nullable=True)   # UI locale active at creation, e.g. 'es', 'fr-CA' — analytics only, distinct from `language`
    state_standard = Column(String(100), nullable=True)  # US state curriculum standard e.g. 'CA'
    discipline = Column(String(100), nullable=True)      # academic discipline e.g. 'STEM'

    # =========================================================================
    # MEDIA ATTACHMENTS (teacher-uploaded content)
    # =========================================================================
    hero_image_url = Column(String(512), nullable=True)   # primary activity image
    attachments = Column(JSONB, default=list)              # list of {url, filename, size_bytes, content_type}

    # =========================================================================
    # TIMESTAMPS
    # =========================================================================
    view_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)

    # =========================================================================
    # RELATIONSHIPS
    # =========================================================================
    teacher = relationship("User", foreign_keys=[teacher_id])
    projects = relationship("Project", secondary="project_activities", back_populates="activities")
    sessions = relationship("LearningSession", back_populates="activity")
    # Phase 5 relationships
    cached_locations = relationship("CachedLocation", secondary="activity_locations", back_populates="activities_using")
    compliance_checks = relationship("ComplianceCheck", back_populates="activity")
    consent_logs = relationship("ConsentLog", back_populates="activity")
    retention_policies = relationship("DataRetentionPolicy", back_populates="activity")

    def __repr__(self):
        return f"<Activity(id={self.id}, title='{self.title}', subject='{self.subject}', grade_level={self.grade_level})>"

    def to_dict(self):
        return {
            'id': str(self.id),
            'teacher_id': str(self.teacher_id),
            'title': self.title,
            'description': self.description,
            'location_latitude': self.location_latitude,
            'location_longitude': self.location_longitude,
            'location_name': self.location_name,
            'location_info': self.location_info,
            'subject': self.subject,
            'grade_level': self.grade_level,
            'difficulty_level': self.difficulty_level,
            'estimated_duration_minutes': self.estimated_duration_minutes,
            'assessment_type': self.assessment_type,
            'bloom_level': self.bloom_level,
            'marzano_level': self.marzano_level,
            'dok_level': self.dok_level,
            'solo_level': self.solo_level,
            'primary_framework': self.primary_framework,
            'suggested_lessons': self.suggested_lessons,
            'status': self.status,
            'is_active': self.is_active,
            'is_shareable': self.is_shareable,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'published_at': self.published_at.isoformat() if self.published_at else None,
        }


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

    title = Column(String(255), index=True, nullable=False)
    description = Column(Text, nullable=False)

    grade_level = Column(Integer, nullable=False)
    subject = Column(String(100), index=True, nullable=False)
    duration_weeks = Column(Integer, nullable=False)

    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=True)

    # native_enum=False + values_callable: avoids relying on a Postgres native
    # enum type existing (SQLAlchemy's default implicit type name "projectstatus"
    # is never created by either bootstrap path — startup.py's fallback doesn't
    # create it at all, and database/init.sql creates a differently-named
    # "project_status_enum" instead). Stored as plain VARCHAR using the enum's
    # lowercase .value strings.
    status = Column(
        Enum(ProjectStatus, native_enum=False, values_callable=lambda e: [x.value for x in e]),
        default=ProjectStatus.PLANNING,
        index=True,
    )

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

    order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


# ============================================================================
# PHASE 5/6 MODELS
# ============================================================================

class Notification(Base):
    """Notification system"""
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    title = Column(String(255))
    message = Column(EncryptedString(4000), nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EmailPreferences(Base):
    """Parent/user email preferences"""
    __tablename__ = "email_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    receive_notifications = Column(Boolean, default=True)
    receive_progress_updates = Column(Boolean, default=True)
    receive_announcements = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CompetencyStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    ACHIEVED    = "achieved"
    MASTERED    = "mastered"


class CaptureType(str, enum.Enum):
    PHOTO       = "photo"
    VIDEO       = "video"
    AUDIO       = "audio"
    TEXT        = "text"
    SKETCH      = "sketch"
    MEASUREMENT = "measurement"


class StudentCapture(Base):
    """Evidence of learning captured by student"""
    __tablename__ = "student_captures"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id  = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True)
    session_id  = Column(UUID(as_uuid=True), ForeignKey("learning_sessions.id"))

    # native_enum=False + values_callable: see ProjectStatus.status above for
    # why — same implicit-type-name mismatch bug (expects Postgres type
    # "capturetype", which no bootstrap path creates), plus this one also
    # fixes a values mismatch: SQLAlchemy's default sends the enum MEMBER
    # NAME ("TEXT", "PHOTO") rather than its value ("text", "photo"), which
    # doesn't match the lowercase values used elsewhere (fallback table's
    # DEFAULT 'photo', Pydantic validators, etc). This was the concrete bug
    # behind the "type capturetype does not exist" 500 on capture uploads.
    capture_type    = Column(
        Enum(CaptureType, native_enum=False, values_callable=lambda e: [x.value for x in e]),
        nullable=False,
    )
    file_path       = Column(EncryptedString(512), nullable=True)
    file_size_bytes = Column(Integer)
    mime_type       = Column(String(100))

    captured_at        = Column(DateTime, default=datetime.utcnow, index=True)
    location_latitude  = Column(Float, nullable=True)
    location_longitude = Column(Float, nullable=True)
    location_lat_enc   = Column(EncryptedString(200), nullable=True)  # encrypted GPS lat
    location_lon_enc   = Column(EncryptedString(200), nullable=True)  # encrypted GPS lon

    transcript            = Column(Text, nullable=True)
    transcript_confidence = Column(Float, nullable=True)
    transcript_language   = Column(String(10), nullable=True)

    duration_seconds = Column(Integer, nullable=True)
    dimensions       = Column(String(20), nullable=True)
    description      = Column(Text, nullable=True)

    annotations    = relationship("CaptureAnnotation", back_populates="capture")
    notebook_links = relationship("NotebookCaptureLink", back_populates="capture")

    __table_args__ = (
        Index('idx_student_captures_student',   'student_id'),
        Index('idx_student_captures_activity',  'activity_id'),
        Index('idx_student_captures_timestamp', 'captured_at'),
    )


class StudentNotebook(Base):
    """Student learning journal/portfolio"""
    __tablename__ = "student_notebooks"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id  = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True)

    where_notes       = Column(Text, nullable=True)
    why_notes         = Column(Text, nullable=True)
    how_notes         = Column(Text, nullable=True)
    learning_insights = Column(Text, nullable=True)
    next_steps        = Column(Text, nullable=True)
    rubric_scores     = Column(JSONB, nullable=True)

    is_submitted = Column(Boolean, default=False)
    created_at   = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)

    linked_captures  = relationship("NotebookCaptureLink", back_populates="notebook")
    teacher_feedback = relationship("NotebookFeedback", back_populates="notebook")

    __table_args__ = (
        Index('ix_student_notebooks_student',  'student_id'),
        Index('ix_student_notebooks_activity', 'activity_id'),
    )


class CaptureAnnotation(Base):
    """Teacher or system annotations on student captures"""
    __tablename__ = "capture_annotations"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    capture_id = Column(UUID(as_uuid=True), ForeignKey("student_captures.id"), index=True)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    annotation_type  = Column(String(50))
    linked_objective = Column(String(255), nullable=True)
    linked_concept   = Column(String(255), nullable=True)
    explanation      = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    capture = relationship("StudentCapture", back_populates="annotations")
    student = relationship("User")


class NotebookCaptureLink(Base):
    """Links notebook entries to captured evidence"""
    __tablename__ = "notebook_capture_links"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    notebook_id = Column(UUID(as_uuid=True), ForeignKey("student_notebooks.id"), index=True)
    capture_id  = Column(UUID(as_uuid=True), ForeignKey("student_captures.id"), index=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    notebook = relationship("StudentNotebook", back_populates="linked_captures")
    capture  = relationship("StudentCapture",  back_populates="notebook_links")

    __table_args__ = (
        Index('ix_notebook_capture_links_nb_cap', 'notebook_id', 'capture_id'),
    )


class NotebookFeedback(Base):
    """Teacher feedback on student reflections"""
    __tablename__ = "notebook_feedback"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    notebook_id = Column(UUID(as_uuid=True), ForeignKey("student_notebooks.id"), index=True)
    teacher_id  = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    comment          = Column(Text, nullable=False)
    is_positive      = Column(Boolean, default=True)
    competency_level = Column(String(50))

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    notebook = relationship("StudentNotebook", back_populates="teacher_feedback")
    teacher  = relationship("User")


class StudentCompetency(Base):
    """Track student competency progress and achievement"""
    __tablename__ = "student_competencies"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)

    competency_name = Column(String(255), index=True)
    description     = Column(Text)
    category        = Column(String(100))

    # native_enum=False + values_callable: see ProjectStatus.status above.
    status           = Column(
        Enum(CompetencyStatus, native_enum=False, values_callable=lambda e: [x.value for x in e]),
        default=CompetencyStatus.NOT_STARTED,
        index=True,
    )
    progress_percent = Column(Integer, default=0)
    evidence_count   = Column(Integer, default=0)

    first_achieved_at = Column(DateTime, nullable=True)
    last_achieved_at  = Column(DateTime, nullable=True)
    created_at        = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at        = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student = relationship("User")

    __table_args__ = (
        Index('ix_student_competencies_student_cat', 'student_id', 'category'),
        Index('ix_student_competencies_status',      'status'),
    )


# ── Phase 5: Privacy / Location models ───────────────────────────────────────

class PrivacyFramework(str, enum.Enum):
    GDPR   = "gdpr"
    CCPA   = "ccpa"
    COPPA  = "coppa"
    PIPEDA = "pipeda"
    LGPD   = "lgpd"
    PDPA   = "pdpa"
    CUSTOM = "custom"


class CachedLocation(Base):
    """Cached location from geographic search"""
    __tablename__ = "cached_locations"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name          = Column(String(255), nullable=False, index=True)
    latitude      = Column(Float, nullable=False)
    longitude     = Column(Float, nullable=False)
    location_type = Column(String(100), index=True)
    address       = Column(String(512))
    place_id      = Column(String(255), unique=True, index=True)

    rating             = Column(Float, nullable=True)
    user_ratings_total = Column(Integer, nullable=True)
    source             = Column(String(50), index=True)

    search_region        = Column(String(255), index=True)
    search_latitude      = Column(Float, index=True)
    search_longitude     = Column(Float, index=True)
    search_radius_meters = Column(Integer)

    cached_at    = Column(DateTime, default=datetime.utcnow, index=True)
    last_accessed = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    access_count = Column(Integer, default=1)

    enriched_data    = relationship("EnrichedLocation", uselist=False, back_populates="cached_location")
    activities_using = relationship("Activity", secondary="activity_locations", back_populates="cached_locations")

    __table_args__ = (
        Index('idx_cached_locations_geo',  'latitude', 'longitude'),
        Index('idx_cached_locations_type', 'location_type'),
    )


class EnrichedLocation(Base):
    """Location enriched with educational data from Wikipedia/Wikidata"""
    __tablename__ = "enriched_locations"

    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cached_location_id = Column(UUID(as_uuid=True), ForeignKey("cached_locations.id"), unique=True)

    subjects               = Column(ARRAY(String), default=list)
    keywords               = Column(ARRAY(String), default=list)
    learning_opportunities = Column(ARRAY(String), default=list)
    grade_levels           = Column(ARRAY(Integer), default=list)
    best_for_subjects      = Column(ARRAY(String), default=list)
    safety_considerations  = Column(ARRAY(String), default=list)
    accessibility          = Column(JSONB, default=dict)
    nearby_attractions     = Column(ARRAY(String), default=list)

    description             = Column(Text, nullable=True)
    image_url               = Column(String(512), nullable=True)
    wikipedia_url           = Column(String(512), nullable=True)
    wikidata_id             = Column(String(100), nullable=True)
    architect_or_artist     = Column(String(255), nullable=True)
    construction_date       = Column(String(100), nullable=True)
    historical_significance = Column(Text, nullable=True)

    enriched_at        = Column(DateTime, default=datetime.utcnow, index=True)
    enrichment_source  = Column(String(50))
    enrichment_quality = Column(Float, default=0.0)
    teacher_rating     = Column(Float, nullable=True)

    usage_count     = Column(Integer, default=0)
    last_used       = Column(DateTime, nullable=True)
    created_lessons = Column(Integer, default=0)

    cached_location = relationship("CachedLocation", back_populates="enriched_data")

    __table_args__ = (
        Index('idx_enriched_locations_usage', 'usage_count'),
    )


class LocationSearchHistory(Base):
    """Track location searches for analytics"""
    __tablename__ = "location_search_history"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    latitude      = Column(Float, nullable=False)
    longitude     = Column(Float, nullable=False)
    radius_meters = Column(Integer, default=5000)
    search_query  = Column(String(255), nullable=True)

    results_count  = Column(Integer, default=0)
    cached_count   = Column(Integer, default=0)
    enriched_count = Column(Integer, default=0)

    teacher_id  = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), nullable=True)
    searched_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index('idx_location_search_geo',       'latitude', 'longitude'),
        Index('idx_location_search_timestamp', 'searched_at'),
        Index('idx_location_search_teacher',   'teacher_id'),
    )


class PopularDestinations(Base):
    """Materialized view of popular locations"""
    __tablename__ = "popular_destinations"

    id                   = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    enriched_location_id = Column(UUID(as_uuid=True), ForeignKey("enriched_locations.id"), unique=True)
    region               = Column(String(255), index=True)
    latitude             = Column(Float)
    longitude            = Column(Float)

    total_searches          = Column(Integer, default=0)
    total_lessons_generated = Column(Integer, default=0)
    unique_teachers         = Column(Integer, default=0)
    avg_teacher_rating      = Column(Float, default=0.0)
    avg_lesson_quality      = Column(Float, default=0.0)

    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    last_used    = Column(DateTime, nullable=True)

    __table_args__ = (
        Index('idx_popular_region',  'region'),
        Index('idx_popular_metrics', 'total_lessons_generated'),
    )


class LocationEnrichmentQueue(Base):
    """Background job queue for enriching locations"""
    __tablename__ = "location_enrichment_queue"

    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cached_location_id = Column(UUID(as_uuid=True), ForeignKey("cached_locations.id"), unique=True)

    priority     = Column(Integer, default=0)
    search_count = Column(Integer, default=1)

    status       = Column(String(50), default='pending')
    attempts     = Column(Integer, default=0)
    max_attempts = Column(Integer, default=3)
    last_error   = Column(Text, nullable=True)

    created_at    = Column(DateTime, default=datetime.utcnow, index=True)
    scheduled_for = Column(DateTime, index=True)
    processed_at  = Column(DateTime, nullable=True)

    __table_args__ = (
        Index('idx_enrichment_queue_status',   'status'),
        Index('idx_enrichment_queue_priority', 'priority'),
    )


class ActivityLocations(Base):
    """Junction: activities <-> cached_locations"""
    __tablename__ = "activity_locations"

    activity_id        = Column(UUID(as_uuid=True), ForeignKey("activities.id"),       primary_key=True)
    cached_location_id = Column(UUID(as_uuid=True), ForeignKey("cached_locations.id"), primary_key=True)
    selected_at        = Column(DateTime, default=datetime.utcnow)
    lesson_generated   = Column(Boolean, default=False)


class ComplianceCheck(Base):
    """Record of privacy compliance checks — audit trail"""
    __tablename__ = "compliance_checks"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True)

    jurisdiction_id  = Column(String(100), index=True)
    # native_enum=False + values_callable: see ProjectStatus.status above.
    framework        = Column(Enum(PrivacyFramework, native_enum=False, values_callable=lambda e: [x.value for x in e]))
    student_age      = Column(Integer)

    is_compliant     = Column(Boolean, default=False)
    issues           = Column(ARRAY(String), default=list)
    warnings         = Column(ARRAY(String), default=list)
    required_actions = Column(JSONB, default=dict)

    data_collection  = Column(ARRAY(String), default=list)
    third_parties    = Column(ARRAY(String), default=list)
    activity_purpose = Column(String(255))

    checked_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    timestamp          = Column(DateTime, default=datetime.utcnow, index=True)

    activity = relationship("Activity", back_populates="compliance_checks")

    __table_args__ = (
        Index('idx_compliance_activity',     'activity_id'),
        Index('idx_compliance_jurisdiction', 'jurisdiction_id'),
        Index('idx_compliance_timestamp',    'timestamp'),
    )


class ConsentLog(Base):
    """Track student/parent consent for privacy compliance"""
    __tablename__ = "consent_logs"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id  = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True, nullable=True)

    consent_type    = Column(String(50))
    data_categories = Column(ARRAY(String), default=list)
    purpose         = Column(String(255))
    jurisdiction_id = Column(String(100), index=True)

    given_by_student = Column(Boolean, default=False)
    given_by_parent  = Column(Boolean, default=False)
    parent_id        = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    consent_given_at = Column(DateTime, default=datetime.utcnow)
    expires_at       = Column(DateTime, nullable=True)
    withdrawn_at     = Column(DateTime, nullable=True)
    ip_address       = Column(String(45), nullable=True)
    user_agent       = Column(String(512), nullable=True)

    activity = relationship("Activity", back_populates="consent_logs")

    __table_args__ = (
        Index('idx_consent_student',      'student_id'),
        Index('idx_consent_activity',     'activity_id'),
        Index('idx_consent_jurisdiction', 'jurisdiction_id'),
    )


class DataRetentionPolicy(Base):
    """Define how long each type of data is retained"""
    __tablename__ = "data_retention_policies"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activity_id     = Column(UUID(as_uuid=True), ForeignKey("activities.id"), index=True)
    jurisdiction_id = Column(String(100), index=True)
    data_category   = Column(String(100))

    retention_days        = Column(Integer, nullable=False)
    purpose               = Column(String(255))
    deletion_method       = Column(String(50))
    can_archive           = Column(Boolean, default=False)
    archive_duration_days = Column(Integer, nullable=True)

    effective_date         = Column(DateTime, default=datetime.utcnow)
    deletion_scheduled_for = Column(DateTime, nullable=True)
    deletion_completed_at  = Column(DateTime, nullable=True)

    activity = relationship("Activity", back_populates="retention_policies")

    __table_args__ = (
        Index('idx_retention_activity',    'activity_id'),
        Index('idx_retention_jurisdiction','jurisdiction_id'),
        Index('idx_retention_scheduled',   'deletion_scheduled_for'),
    )


class PrivacyConfiguration(Base):
    """Loaded jurisdiction privacy configurations (auto-updated by IAPP crawler)"""
    __tablename__ = "privacy_configurations"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jurisdiction_id   = Column(String(100), unique=True, index=True)
    jurisdiction_name = Column(String(255))
    # native_enum=False + values_callable: see ProjectStatus.status above.
    framework         = Column(Enum(PrivacyFramework, native_enum=False, values_callable=lambda e: [x.value for x in e]))
    country_code      = Column(String(2), index=True)
    subdivision_code  = Column(String(10), nullable=True)

    config_json    = Column(JSONB, nullable=False)
    version        = Column(String(20))
    effective_date = Column(DateTime, nullable=False)
    sunset_date    = Column(DateTime, nullable=True)
    source_url     = Column(String(512), nullable=True)
    auto_discovered = Column(Boolean, default=False)
    loaded_at      = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_privacy_config_framework', 'framework'),
        Index('idx_privacy_config_country',   'country_code'),
    )


# ============================================================================
# CLASS MODEL (stub — required by Phase 7)
# ============================================================================

class Class(Base):
    """A teacher's class / student group"""
    __tablename__ = "classes"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id  = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name        = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    grade_level = Column(Integer, nullable=True)
    school_year = Column(String(20), nullable=True)
    is_active   = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    teacher  = relationship("User")
    settings = relationship("ClassSettings", uselist=False, back_populates="class_obj")


# ============================================================================
# PHASE 7 MODELS: Student-Initiated Activities
# ============================================================================

class FieldNoteStatus(str, enum.Enum):
    DRAFT     = "draft"
    SHARED    = "shared"
    SUBMITTED = "submitted"
    PROMOTED  = "promoted"
    REJECTED  = "rejected"


class SelfProjectStatus(str, enum.Enum):
    PERSONAL = "personal"
    SHARED   = "shared"
    ARCHIVED = "archived"


class PeerProjectStatus(str, enum.Enum):
    DRAFT     = "draft"
    PENDING   = "pending_approval"
    PUBLISHED = "published"
    REJECTED  = "rejected"
    ARCHIVED  = "archived"


class PeerProjectAudience(str, enum.Enum):
    WHOLE_CLASS = "whole_class"
    SPECIFIC    = "specific_students"


class PeerProjectResponseStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED   = "completed"


class StudentSelfProject(Base):
    """Lightweight personal project container for organizing field notes"""
    __tablename__ = "student_self_projects"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    title           = Column(String(255), nullable=False)
    description     = Column(Text, nullable=True)
    cover_image_url = Column(String(500), nullable=True)
    status          = Column(String(30), default="personal", nullable=False)

    student     = relationship("User", foreign_keys=[student_id])
    field_notes = relationship("StudentFieldNote", back_populates="self_project",
                               cascade="save-update, merge")

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class StudentFieldNote(Base):
    """Student-initiated capture session, private by default"""
    __tablename__ = "student_field_notes"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    self_project_id = Column(UUID(as_uuid=True), ForeignKey("student_self_projects.id"),
                             nullable=True, index=True)
    # Set when the field note is captured during a live learning session — used
    # to join against session_events / EvidenceCapture for the professor
    # fieldwork map (GET /activities/{id}/fieldwork-locations). No FK
    # constraint on the raw table; kept unconstrained here to match.
    session_id      = Column(UUID(as_uuid=True), nullable=True, index=True)

    title       = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status      = Column(String(30), default="draft", nullable=False)

    location_latitude  = Column(Float, nullable=True)
    location_longitude = Column(Float, nullable=True)
    location_name      = Column(String(255), nullable=True)

    self_tagged_objective_ids = Column(ARRAY(UUID(as_uuid=True)), default=list, nullable=False)

    submitted_for_promotion_at = Column(DateTime, nullable=True)
    submitted_with_message     = Column(Text, nullable=True)
    reviewed_by_teacher_id     = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewed_at                = Column(DateTime, nullable=True)
    teacher_feedback           = Column(Text, nullable=True)
    promoted_activity_id       = Column(UUID(as_uuid=True), ForeignKey("activities.id"), nullable=True)
    promoted_at                = Column(DateTime, nullable=True)

    student           = relationship("User", foreign_keys=[student_id])
    reviewer          = relationship("User", foreign_keys=[reviewed_by_teacher_id])
    self_project      = relationship("StudentSelfProject", back_populates="field_notes")
    captures          = relationship("StudentFieldNoteCapture", back_populates="field_note",
                                     cascade="all, delete-orphan",
                                     order_by="StudentFieldNoteCapture.order")
    promoted_activity = relationship("Activity", foreign_keys=[promoted_activity_id])

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class StudentFieldNoteCapture(Base):
    """Junction: field_note <-> student_capture"""
    __tablename__ = "student_field_note_captures"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    field_note_id = Column(UUID(as_uuid=True), ForeignKey("student_field_notes.id"),
                           nullable=False, index=True)
    capture_id    = Column(UUID(as_uuid=True), ForeignKey("student_captures.id"),
                           nullable=False, index=True)
    # DB column is order_index, not order — database/init.sql avoids the
    # reserved SQL keyword; map the Python attribute to that real name so
    # this class doesn't drift from whichever schema-creation path actually
    # ran (init.sql on a fresh volume, vs. the ALTER/CREATE fallback in
    # startup.py, which previously assumed a literal "order" column and
    # 500'd with "column ... order does not exist" on any init.sql-bootstrapped DB).
    order         = Column("order_index", Integer, default=0, nullable=False)

    field_note = relationship("StudentFieldNote", back_populates="captures")
    capture    = relationship("StudentCapture")

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("field_note_id", "capture_id", name="uq_field_note_capture"),
    )


class StudentPeerProject(Base):
    """Activity created BY a student FOR classmates"""
    __tablename__ = "student_peer_projects"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    author_student_id = Column(UUID(as_uuid=True), ForeignKey("users.id"),   nullable=False, index=True)
    class_id          = Column(UUID(as_uuid=True), ForeignKey("classes.id"), nullable=False, index=True)

    title       = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)

    learning_objectives_text = Column(JSONB, default=list, nullable=False)
    guiding_prompts          = Column(JSONB, default=list, nullable=False)
    curriculum_objective_ids = Column(ARRAY(UUID(as_uuid=True)), default=list, nullable=False)
    allowed_capture_types    = Column(ARRAY(String), default=list, nullable=False)

    audience           = Column(String(30), default="whole_class", nullable=False)
    target_student_ids = Column(ARRAY(UUID(as_uuid=True)), default=list, nullable=False)

    status            = Column(String(30), default="draft", nullable=False)
    approval_required = Column(Boolean, default=True, nullable=False)

    approved_by_teacher_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    approved_at            = Column(DateTime, nullable=True)
    teacher_feedback       = Column(Text, nullable=True)
    published_at           = Column(DateTime, nullable=True)

    author_can_see_individual_responses = Column(Boolean, default=False, nullable=False)

    # Optional location — captured from student's GPS when they propose the activity
    location_latitude  = Column(Float, nullable=True)
    location_longitude = Column(Float, nullable=True)
    location_name      = Column(String(255), nullable=True)

    author           = relationship("User", foreign_keys=[author_student_id])
    approver         = relationship("User", foreign_keys=[approved_by_teacher_id])
    example_captures = relationship("PeerProjectExampleCapture", back_populates="peer_project",
                                    cascade="all, delete-orphan",
                                    order_by="PeerProjectExampleCapture.order")
    responses        = relationship("PeerProjectResponse", back_populates="peer_project",
                                    cascade="all, delete-orphan")

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PeerProjectExampleCapture(Base):
    """Junction: peer_project <-> example captures (author's inspiration samples)"""
    __tablename__ = "peer_project_example_captures"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    peer_project_id = Column(UUID(as_uuid=True), ForeignKey("student_peer_projects.id"),
                             nullable=False, index=True)
    capture_id      = Column(UUID(as_uuid=True), ForeignKey("student_captures.id"),
                             nullable=False, index=True)
    caption         = Column(Text, nullable=True)
    # DB column is order_index — see StudentFieldNoteCapture.order comment above.
    order           = Column("order_index", Integer, default=0, nullable=False)

    peer_project = relationship("StudentPeerProject", back_populates="example_captures")
    capture      = relationship("StudentCapture")

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("peer_project_id", "capture_id", name="uq_peer_project_example_capture"),
    )


class PeerProjectResponse(Base):
    """A classmate's response to a Peer Project"""
    __tablename__ = "peer_project_responses"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    peer_project_id = Column(UUID(as_uuid=True), ForeignKey("student_peer_projects.id"),
                             nullable=False, index=True)
    student_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"),
                             nullable=False, index=True)

    status            = Column(String(30), default="in_progress", nullable=False)
    notebook_entry_id = Column(UUID(as_uuid=True), ForeignKey("student_notebooks.id"), nullable=True)
    completed_at      = Column(DateTime, nullable=True)

    peer_project   = relationship("StudentPeerProject", back_populates="responses")
    student        = relationship("User", foreign_keys=[student_id])
    captures       = relationship("PeerProjectResponseCapture", back_populates="response",
                                  cascade="all, delete-orphan",
                                  order_by="PeerProjectResponseCapture.order")
    notebook_entry = relationship("StudentNotebook", foreign_keys=[notebook_entry_id])

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("peer_project_id", "student_id", name="uq_peer_project_response_student"),
    )


class PeerProjectResponseCapture(Base):
    """Junction: peer_project_response <-> student_capture"""
    __tablename__ = "peer_project_response_captures"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    response_id = Column(UUID(as_uuid=True), ForeignKey("peer_project_responses.id"),
                         nullable=False, index=True)
    capture_id  = Column(UUID(as_uuid=True), ForeignKey("student_captures.id"),
                         nullable=False, index=True)
    # DB column is order_index — see StudentFieldNoteCapture.order comment above.
    order       = Column("order_index", Integer, default=0, nullable=False)

    response    = relationship("PeerProjectResponse", back_populates="captures")
    capture     = relationship("StudentCapture")

    __table_args__ = (
        UniqueConstraint("response_id", "capture_id", name="uq_response_capture"),
    )


# ============================================================================
# CLASS SETTINGS  (Phase 7)
# Per-class configuration for student-initiated features.
# One row per class; created when first class setting is changed.
# ============================================================================

class ClassSettings(Base):
    __tablename__ = "class_settings"

    id       = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    class_id = Column(UUID(as_uuid=True), ForeignKey("classes.id"),
                      nullable=False, unique=True, index=True)

    # Peer Project settings
    # "teacher_gate"  — teacher must approve before classmates see the project
    # "auto_publish"  — project is live immediately after student submits
    peer_project_approval_mode = Column(String(20), default="teacher_gate", nullable=False)

    # Whether the peer project author can see individual classmate responses
    peer_project_author_sees_individual_responses = Column(Boolean, default=False, nullable=False)

    # Global toggle: can any student in this class create peer projects?
    students_can_create_peer_projects = Column(Boolean, default=True, nullable=False)

    # Global toggle: can any student in this class create field notes?
    students_can_create_field_notes   = Column(Boolean, default=True, nullable=False)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Reverse side of Class.settings — required to satisfy back_populates="class_obj"
    class_obj = relationship("Class", back_populates="settings")


# ============================================================================
# ADMIN MODELS  (Admin Panel)
# Separate admin users, audit log, and in-DB sessions.
# Note: ADMIN_SESSIONS in routes/admin.py is in-memory for the demo;
#       these tables support a future persistent implementation.
# ============================================================================

class AdminUserModel(Base):
    """Admin panel users — separate from the main users table"""
    __tablename__ = "admin_users"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username      = Column(String(100), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    role          = Column(String(50), default="admin", nullable=False)
    is_active     = Column(Boolean, default=True, nullable=False)
    last_login    = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AdminAuditLog(Base):
    """Audit log for admin actions"""
    __tablename__ = "admin_audit_logs"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id     = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True, index=True)
    action       = Column(String(200), nullable=False)
    resource     = Column(String(200), nullable=True)
    details      = Column(JSONB, nullable=True)
    ip_address   = Column(String(45), nullable=True)
    user_agent   = Column(Text, nullable=True)
    success      = Column(Boolean, default=True, nullable=False)
    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    admin = relationship("AdminUserModel")


class AdminSession(Base):
    """Persistent admin sessions (supplements the in-memory ADMIN_SESSIONS dict)"""
    __tablename__ = "admin_sessions"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id   = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=False, index=True)
    token_hash = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    revoked    = Column(Boolean, default=False, nullable=False)

    admin = relationship("AdminUserModel")


# =============================================================================
# SHARED INFRASTRUCTURE — STANDARDS, RUBRICS & EXPORT
# =============================================================================

class StandardsSet(Base):
    """
    A named set of criteria used for rubrics, curriculum standards, or
    homeschool state reporting requirements.
    type: 'rubric' | 'curriculum' | 'state_reporting'
    owner_id: teacher/homeschool user, or NULL for admin-managed global sets
    """
    __tablename__ = "standards_sets"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name        = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    type        = Column(String(50), nullable=False, index=True)   # rubric | curriculum | state_reporting
    owner_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    state_code  = Column(String(10), nullable=True)                 # e.g. "TX", "CA" for state_reporting
    is_global   = Column(Boolean, default=False)                    # True = admin-managed, visible to all
    source_file = Column(String(512), nullable=True)                # original upload filename
    criteria    = Column(JSONB, default=list)                       # [{id, name, description, category, required, weight}]
    # Cache / expiry columns — written by routes/standards.py.create_standards_set.
    # These were missing from the model/DDL, causing a TypeError on save ("save failed").
    source_checksum   = Column(String(64), nullable=True)            # SHA-256 hex of source upload
    processing_status = Column(String(20), nullable=True, default="complete")  # pending|processing|complete|failed
    last_processed_at = Column(DateTime, nullable=True)
    valid_until       = Column(Date, nullable=True)                  # re-verify/re-upload by this date
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner       = relationship("User", foreign_keys=[owner_id])
    mappings    = relationship("ActivityStandardsMap", back_populates="standards_set",
                               cascade="all, delete-orphan")


class ActivityStandardsMap(Base):
    """Maps an activity to criteria within a standards set."""
    __tablename__ = "activity_standards_map"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activity_id     = Column(UUID(as_uuid=True), ForeignKey("activities.id"), nullable=False, index=True)
    standards_set_id= Column(UUID(as_uuid=True), ForeignKey("standards_sets.id"), nullable=False, index=True)
    criterion_id    = Column(String(100), nullable=False)           # matches criteria[].id in the set
    coverage_level  = Column(String(50), default="partial")         # partial | full | exceeds
    notes           = Column(Text, nullable=True)
    mapped_by       = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    ai_suggested    = Column(Boolean, default=False)
    created_at      = Column(DateTime, default=datetime.utcnow)

    activity        = relationship("Activity", foreign_keys=[activity_id])
    standards_set   = relationship("StandardsSet", back_populates="mappings")
    mapper          = relationship("User", foreign_keys=[mapped_by])

    __table_args__ = (
        # One mapping per activity+set+criterion
        __import__('sqlalchemy').UniqueConstraint(
            "activity_id", "standards_set_id", "criterion_id",
            name="uq_activity_standards_criterion"
        ),
    )


class RagDocument(Base):
    """
    Chunked, embedded text for semantic retrieval (RAG).

    Source types:
      - 'standards'    → from StandardsSet criteria (rubric / curriculum / state_reporting)
      - 'curriculum'   → from CurriculumUnit raw_content
      - 'homeschool'   → from homeschool state requirement uploads
      - 'custom'       → manually ingested via /api/v1/inference/ingest

    One row per text chunk.  Large documents are split into ≤512-token chunks
    before embedding.  Multiple chunks share the same source_id.
    """
    __tablename__ = "rag_documents"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_type = Column(String(50),  nullable=False, index=True)   # standards|curriculum|homeschool|custom
    source_id   = Column(String(255), nullable=True,  index=True)   # UUID of parent record (or filename)
    source_name = Column(String(512), nullable=True)                 # human-readable name of parent record
    chunk_index = Column(Integer,     nullable=False, default=0)     # 0-based position within source
    content     = Column(Text,        nullable=False)                # raw text of this chunk
    metadata_   = Column("metadata", JSONB, default=dict)            # {grade_level, subject, state_code, …}
    embedding   = Column(Vector(384), nullable=True)                 # 384-dim, provider-configurable (see embedding_service.py)
    owner_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    # Graph-aware retrieval link (migration 20260816c_rag_documents_node_link,
    # PRD-graphrag-migration-2026-08-16.md §4.3): which exact graph node this
    # chunk represents, so retrieval can expand from it via
    # standards_items.parent_id / standards_associations / content_alignments
    # instead of only ever doing flat vector search. FK-less by design — see
    # that migration's docstring. Nullable: chunks indexed before this
    # migration, or without a real graph node, are still findable by vector
    # search alone, just not expandable.
    node_type   = Column(String(50), nullable=True)   # standards_item|jurisdiction|activity|curriculum_unit
    node_id     = Column(UUID(as_uuid=True), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_rag_documents_node", "node_type", "node_id"),
    )


# ============================================================================
# CASE-SHAPED STANDARDS GRAPH  (migration 20260807_case_standards.py)
#
# These tables were created by that migration but never had ORM models —
# scripts/ingest_case_standards.py already imports Jurisdiction/
# StandardsSource/StandardsFramework/StandardsItem/StandardsAssociation from
# this module (has since the migration landed) and would ImportError on the
# very first line that touches them. Columns/constraints here mirror that
# migration's DDL exactly; do not drift the two without a follow-up migration.
#
# This is also the graph substrate PRD-graphrag-migration-2026-08-16.md's
# retrieval rewrite (§3) walks: standards_items.parent_id for hierarchy,
# standards_associations for typed cross-edges, jurisdictions.parent_id for
# place hierarchy.
# ============================================================================

class Jurisdiction(Base):
    """One row per place or issuing agency: country, state/province, county,
    city, district, or non-geographic organization (WIDA, College Board,
    etc. — not every CASE issuing agency has a single geographic home).
    Self-referencing parent_id gives the place hierarchy content_alignments'
    graph expansion walks (US -> Idaho -> a district)."""
    __tablename__ = "jurisdictions"

    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    country_code       = Column(String(4),   nullable=False)             # ISO 3166-1: US, ...
    subdivision_code   = Column(String(20),  nullable=True)              # ISO 3166-2: US-ID, or synthetic
    parent_id          = Column(UUID(as_uuid=True), ForeignKey("jurisdictions.id", ondelete="SET NULL"),
                                 nullable=True, index=True)
    level              = Column(String(20),  nullable=False)             # country|state|county|city|district|organization
    name               = Column(String(300), nullable=False)
    name_local         = Column(String(300), nullable=True)
    is_issuing_agency  = Column(Boolean, nullable=False, default=False)
    external_ref       = Column(String(50),  nullable=True, index=True)  # source's own short code, e.g. 'GA'
    created_at         = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at         = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    parent   = relationship("Jurisdiction", remote_side=[id])

    __table_args__ = (
        CheckConstraint(
            "level IN ('country','state','county','city','district','organization')",
            name="ck_jurisdictions_level",
        ),
        UniqueConstraint("country_code", "subdivision_code", name="uq_jurisdictions_country_subdivision"),
        Index("idx_jurisdictions_country_code", "country_code"),
    )


class StandardsSource(Base):
    """Polling registry: one row per upstream CASE server or aggregator mirror."""
    __tablename__ = "standards_sources"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name                = Column(String(300), nullable=False)
    source_type         = Column(String(20),  nullable=False)   # case_api|html_page|pdf|ecs_index
    base_url            = Column(String(500), nullable=False)
    jurisdiction_id     = Column(UUID(as_uuid=True), ForeignKey("jurisdictions.id", ondelete="SET NULL"),
                                  nullable=True, index=True)
    is_authoritative    = Column(Boolean, nullable=False, default=True)   # agency's own server vs. mirror
    poll_frequency_days = Column(Integer, nullable=False, default=7)
    last_polled_at      = Column(DateTime, nullable=True)
    last_changed_at     = Column(DateTime, nullable=True)
    last_status         = Column(String(500), nullable=True)
    content_hash        = Column(String(64),  nullable=True)
    created_at          = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at          = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    jurisdiction = relationship("Jurisdiction")

    __table_args__ = (
        CheckConstraint(
            "source_type IN ('case_api','html_page','pdf','ecs_index')",
            name="ck_standards_sources_type",
        ),
    )


class StandardsFramework(Base):
    """CASE CFDocument — a standards framework (e.g. 'Idaho Content Standards
    for Mathematics, 2021')."""
    __tablename__ = "standards_frameworks"

    id     = Column(UUID(as_uuid=True), primary_key=True)  # = CASE identifier GUID; never re-minted
    source_id      = Column(UUID(as_uuid=True), ForeignKey("standards_sources.id", ondelete="RESTRICT"),
                             nullable=False)
    jurisdiction_id = Column(UUID(as_uuid=True), ForeignKey("jurisdictions.id", ondelete="SET NULL"),
                              nullable=True, index=True)
    title           = Column(String(500), nullable=False)
    subject         = Column(String(200), nullable=True, index=True)   # widened by 20260807b_widen_standards_subject
    version         = Column(String(50),  nullable=True)
    adoption_status = Column(String(50),  nullable=True)
    official_source_url = Column(String(1000), nullable=False)
    case_uri             = Column(String(1000), nullable=True)
    last_change_datetime = Column(DateTime, nullable=True)
    is_authoritative_over_uploads = Column(Boolean, nullable=False, default=True)
    raw        = Column(JSONB, nullable=False)   # full CFDocument, for forward-compat
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    source       = relationship("StandardsSource")
    jurisdiction = relationship("Jurisdiction")
    items        = relationship("StandardsItem", back_populates="framework",
                                 cascade="all, delete-orphan")


class StandardsItem(Base):
    """CASE CFItem — a single standard/cluster/domain within a framework.
    parent_id denormalizes the isChildOf association for cheap hierarchy
    walks without joining standards_associations."""
    __tablename__ = "standards_items"

    id           = Column(UUID(as_uuid=True), primary_key=True)  # = CASE GUID; the alignment key
    framework_id = Column(UUID(as_uuid=True), ForeignKey("standards_frameworks.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    human_coding_scheme = Column(String(200), nullable=True)     # 'CCSS.MATH.4.NF.A.1'
    full_statement       = Column(Text, nullable=False)
    education_levels     = Column(ARRAY(String(10)), nullable=True)   # CASE educationLevel, e.g. ['04']
    item_type            = Column(String(50), nullable=True)     # 'Standard', 'Cluster', 'Domain', ...
    parent_id            = Column(UUID(as_uuid=True), ForeignKey("standards_items.id", ondelete="SET NULL"),
                                   nullable=True, index=True)
    list_enumeration      = Column(String(50), nullable=True)    # ordering within parent
    last_change_datetime  = Column(DateTime, nullable=True)
    is_retired            = Column(Boolean, nullable=False, default=False)  # soft-delete; never hard-delete a GUID with alignments
    raw        = Column(JSONB, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    framework = relationship("StandardsFramework", back_populates="items")
    parent    = relationship("StandardsItem", remote_side=[id])
    revisions = relationship("StandardsItemRevision", back_populates="item",
                              cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_standards_items_education_levels", "education_levels", postgresql_using="gin"),
    )


class StandardsAssociation(Base):
    """CASE CFAssociation — typed cross-edges beyond the denormalized
    isChildOf parent_id: exactMatchOf, isRelatedTo, precedes, etc.
    origin/destination are plain UUID columns (no FK) matching the original
    migration — CASE associations can reference items across frameworks that
    may not have been ingested yet, so a hard FK would block partial ingest."""
    __tablename__ = "standards_associations"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    framework_id        = Column(UUID(as_uuid=True), ForeignKey("standards_frameworks.id", ondelete="CASCADE"),
                                  nullable=False, index=True)
    origin_item_id      = Column(UUID(as_uuid=True), nullable=False, index=True)
    destination_item_id = Column(UUID(as_uuid=True), nullable=False)
    association_type    = Column(String(50), nullable=False)   # isChildOf|exactMatchOf|isRelatedTo|precedes|...
    raw                 = Column(JSONB, nullable=True)

    framework = relationship("StandardsFramework")


class StandardsItemRevision(Base):
    """Change log / review queue for upstream standards edits — feeds the
    admin 'upstream changes' queue (PRD §9, §10)."""
    __tablename__ = "standards_item_revisions"

    id            = Column(BigInteger, primary_key=True, autoincrement=True)
    item_id       = Column(UUID(as_uuid=True), ForeignKey("standards_items.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    detected_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    change_type   = Column(String(20), nullable=False)   # added|text_changed|moved|retired
    old_value     = Column(JSONB, nullable=True)
    new_value     = Column(JSONB, nullable=True)
    review_status = Column(String(20), nullable=False, default="pending", index=True)  # pending|acknowledged|realigned

    item = relationship("StandardsItem", back_populates="revisions")

    __table_args__ = (
        CheckConstraint(
            "change_type IN ('added','text_changed','moved','retired')",
            name="ck_standards_item_revisions_change_type",
        ),
    )


# ============================================================================
# CONTENT <-> STANDARDS ALIGNMENT
# (PRD-standards-alignment-engine-2026-07-31_1.md §7.3, finished per
#  PRD-graphrag-migration-2026-08-16.md §4.1 — the missing link between
#  Activity/CurriculumUnit content and the standards_items graph.)
# ============================================================================

class ContentAlignment(Base):
    """
    Content <-> standard edge. Polymorphic on content_type because both
    Activity and CurriculumUnit are alignable content types today (a hard FK
    to activities.id alone would miss CurriculumUnit) — same reasoning as
    ActivityStandardsMap, which this table supersedes for CASE-sourced
    standards. ActivityStandardsMap stays as the legacy read path for
    existing rows / teacher-uploaded StandardsSet criteria until the
    StandardsSet graph fold (plan §4.2 / §6 Phase 3) is done.

    Learner-facing surfaces must read only status='approved' rows.
    """
    __tablename__ = "content_alignments"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    content_id   = Column(UUID(as_uuid=True), nullable=False, index=True)
    content_type = Column(String(50), nullable=False)   # 'activity' | 'curriculum_unit'
    item_id      = Column(UUID(as_uuid=True), ForeignKey("standards_items.id"), nullable=False, index=True)

    alignment_type = Column(String(50), nullable=False, default="teaches")  # teaches|assesses|requires|extends
    method         = Column(String(20), nullable=False)                    # ai_suggested|manual
    confidence     = Column(Float, nullable=True)                          # model confidence for ai_suggested
    status         = Column(String(20), nullable=False, default="suggested")  # suggested|approved|rejected

    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    rationale   = Column(Text, nullable=True)   # model or reviewer explanation, shown in admin UI

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    item     = relationship("StandardsItem")
    reviewer = relationship("User", foreign_keys=[reviewed_by])

    __table_args__ = (
        CheckConstraint(
            "alignment_type IN ('teaches','assesses','requires','extends')",
            name="ck_content_alignments_type",
        ),
        CheckConstraint(
            "method IN ('ai_suggested','manual')",
            name="ck_content_alignments_method",
        ),
        CheckConstraint(
            "status IN ('suggested','approved','rejected')",
            name="ck_content_alignments_status",
        ),
        UniqueConstraint("content_id", "item_id", "alignment_type", name="uq_content_alignment"),
        Index("idx_content_alignments_content", "content_id", "content_type"),
        Index("idx_content_alignments_item_approved", "item_id",
              postgresql_where=status == "approved"),
    )
