# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
SQLAlchemy models for Phase 6 student-facing features.

New tables (created via student_schema.sql or Alembic migration):
  - evidence_captures   : media / text / sketch captured during an activity
  - notebook_entries    : student reflections (freeform / guided / structured)
  - activity_submissions: compiled work submitted to teacher for grading

These models extend the existing database.py without touching it.
Import them alongside database.py models wherever needed.
"""

from sqlalchemy import (
    Column, String, Integer, Float, DateTime,
    Boolean, ForeignKey, Text, Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from core.database import Base
from datetime import datetime
import uuid
import enum


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class CaptureTypeEnum(str, enum.Enum):
    PHOTO       = "photo"
    VIDEO       = "video"
    AUDIO       = "audio"
    TEXT        = "text"
    SKETCH      = "sketch"
    MEASUREMENT = "measurement"


class ReflectionTypeEnum(str, enum.Enum):
    FREEFORM    = "freeform"
    GUIDED      = "guided"
    STRUCTURED  = "structured"


class SubmissionStatusEnum(str, enum.Enum):
    DRAFT     = "draft"
    SUBMITTED = "submitted"
    GRADED    = "graded"


# ---------------------------------------------------------------------------
# EvidenceCapture
# ---------------------------------------------------------------------------

class EvidenceCapture(Base):
    """
    A single piece of evidence (photo, audio, text, sketch, etc.) captured
    by a student while completing an activity session.
    """
    __tablename__ = "evidence_captures"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign keys
    session_id  = Column(UUID(as_uuid=True), ForeignKey("learning_sessions.id"),
                         index=True, nullable=False)
    student_id  = Column(UUID(as_uuid=True), ForeignKey("users.id"),
                         index=True, nullable=False)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"),
                         index=True, nullable=False)

    # Capture metadata
    capture_type     = Column(String(50),  nullable=False)   # photo/video/audio/text/sketch/measurement
    title            = Column(String(255), nullable=True)
    description      = Column(Text,        nullable=True)

    # Media storage — local filesystem or S3 presigned URL
    file_url         = Column(Text,        nullable=True)
    file_size_bytes  = Column(Integer,     nullable=True)
    duration_seconds = Column(Integer,     nullable=True)    # audio / video

    # ASR transcription (Tier 3 offline Whisper or online)
    transcription    = Column(Text,        nullable=True)

    # Learning context chosen by student at capture time
    learning_objectives = Column(JSONB, default=list)        # list[str] objective IDs
    competencies        = Column(JSONB, default=list)        # list[str] competency tags

    # GPS snapshot at moment of capture
    location_latitude  = Column(Float, nullable=True)
    location_longitude = Column(Float, nullable=True)

    # Optional async AI quality analysis (populated after upload)
    ai_analysis = Column(JSONB, nullable=True)               # {quality_score, insights}

    # Raw device metadata (EXIF, sensor readings, etc.) -- renamed from metadata
    device_metadata = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships (read-only references — no back-populates to avoid
    # touching existing models in database.py)
    session  = relationship("LearningSession", foreign_keys=[session_id],
                            lazy="select")
    student  = relationship("User",            foreign_keys=[student_id],
                            lazy="select")

    def to_dict(self) -> dict:
        return {
            "id":                   str(self.id),
            "session_id":           str(self.session_id),
            "student_id":           str(self.student_id),
            "activity_id":          str(self.activity_id),
            "capture_type":         self.capture_type,
            "title":                self.title,
            "description":          self.description,
            "file_url":             self.file_url,
            "file_size_bytes":      self.file_size_bytes,
            "duration_seconds":     self.duration_seconds,
            "transcription":        self.transcription,
            "learning_objectives":  self.learning_objectives or [],
            "competencies":         self.competencies or [],
            "location_latitude":    self.location_latitude,
            "location_longitude":   self.location_longitude,
            "ai_analysis":          self.ai_analysis,
            "created_at":           self.created_at.isoformat() if self.created_at else None,
        }


# ---------------------------------------------------------------------------
# NotebookEntry
# ---------------------------------------------------------------------------

class NotebookEntry(Base):
    """
    A student reflection or notebook entry written during or after an activity.
    Three modes: freeform (open text), guided (teacher-prompted questions),
    structured (predefined fields for claims / evidence / reasoning).
    """
    __tablename__ = "notebook_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign keys
    session_id  = Column(UUID(as_uuid=True), ForeignKey("learning_sessions.id"),
                         index=True, nullable=False)
    student_id  = Column(UUID(as_uuid=True), ForeignKey("users.id"),
                         index=True, nullable=False)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"),
                         index=True, nullable=False)

    # Entry content
    reflection_type = Column(String(50),  nullable=False, default="freeform")
    title           = Column(String(255), nullable=True)
    content         = Column(Text,        nullable=False)

    # Learning context
    learning_objectives = Column(JSONB, default=list)
    competencies        = Column(JSONB, default=list)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    session = relationship("LearningSession", foreign_keys=[session_id], lazy="select")
    student = relationship("User",            foreign_keys=[student_id], lazy="select")

    def to_dict(self) -> dict:
        return {
            "id":                   str(self.id),
            "session_id":           str(self.session_id),
            "student_id":           str(self.student_id),
            "activity_id":          str(self.activity_id),
            "reflection_type":      self.reflection_type,
            "title":                self.title,
            "content":              self.content,
            "learning_objectives":  self.learning_objectives or [],
            "competencies":         self.competencies or [],
            "created_at":           self.created_at.isoformat() if self.created_at else None,
            "updated_at":           self.updated_at.isoformat() if self.updated_at else None,
        }


# ---------------------------------------------------------------------------
# ActivitySubmission
# ---------------------------------------------------------------------------

class ActivitySubmission(Base):
    """
    The final compiled submission for a student's completed activity.
    Created as a draft on first evidence capture; transitioned to 'submitted'
    when the student taps Submit; 'graded' once the teacher scores it.
    """
    __tablename__ = "activity_submissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign keys
    student_id  = Column(UUID(as_uuid=True), ForeignKey("users.id"),
                         index=True, nullable=False)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id"),
                         index=True, nullable=False)
    session_id  = Column(UUID(as_uuid=True), ForeignKey("learning_sessions.id"),
                         nullable=True)

    # Lifecycle status
    submission_status = Column(String(50), default="draft", index=True)

    # Snapshot of all evidence + reflections at submit time
    compiled_evidence = Column(JSONB, nullable=True)

    # Teacher assessment (populated after grading)
    teacher_feedback = Column(Text,  nullable=True)
    grade            = Column(Float, nullable=True)
    rubric_scores    = Column(JSONB, nullable=True)   # {criterion_id: score}

    # Timestamps
    submitted_at = Column(DateTime, nullable=True)
    graded_at    = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    student = relationship("User",            foreign_keys=[student_id], lazy="select")
    session = relationship("LearningSession", foreign_keys=[session_id], lazy="select")

    def to_dict(self) -> dict:
        return {
            "id":                str(self.id),
            "student_id":        str(self.student_id),
            "activity_id":       str(self.activity_id),
            "session_id":        str(self.session_id) if self.session_id else None,
            "submission_status": self.submission_status,
            "compiled_evidence": self.compiled_evidence,
            "teacher_feedback":  self.teacher_feedback,
            "grade":             self.grade,
            "rubric_scores":     self.rubric_scores,
            "submitted_at":      self.submitted_at.isoformat() if self.submitted_at else None,
            "graded_at":         self.graded_at.isoformat()    if self.graded_at    else None,
            "created_at":        self.created_at.isoformat()   if self.created_at   else None,
        }
