# Copyright (c) 2026 Paul Christopher Cerda
from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from core.database import Base

class UserRole(str, enum.Enum):
    STUDENT = "STUDENT"
    TEACHER = "TEACHER"
    PARENT = "PARENT"
    ADMIN = "ADMIN"
    HOMESCHOOL = "HOMESCHOOL"

class User(Base):
    __tablename__ = 'users'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    full_name = Column(String(255), nullable=True)
    role = Column(String(50), default='STUDENT', nullable=False, index=True)
    avatar_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    age_group = Column(String(20), nullable=True)
    requires_parental_consent = Column(Boolean, default=False)
    consent_token = Column(String(128), nullable=True)
    org_id = Column(UUID(as_uuid=True), nullable=True)
    primary_org_id = Column(UUID(as_uuid=True), nullable=True)
    signup_country_code = Column(String(10), nullable=True)
    is_platform_admin = Column(Boolean, default=False, nullable=False)
    invite_token_used = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    learning_sessions = relationship('LearningSession', back_populates='user')
    student_profile = relationship('StudentProfile', uselist=False, back_populates='user')

    def __repr__(self):
        return f'<User(email={self.email}, role={self.role})>'
