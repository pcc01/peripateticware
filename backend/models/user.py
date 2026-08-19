# Copyright (c) 2026 Paul Christopher Cerda
from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from core.database import Base
from core.encryption import EncryptedString

class UserRole(str, enum.Enum):
    STUDENT = "STUDENT"
    TEACHER = "TEACHER"
    PARENT = "PARENT"
    ADMIN = "ADMIN"
    HOMESCHOOL = "HOMESCHOOL"

class User(Base):
    __tablename__ = 'users'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(EncryptedString(600), unique=True, nullable=False, index=True)
    email_index = Column(String(64), nullable=True, index=True, unique=True)
    username = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    full_name = Column(EncryptedString(600), nullable=True)
    role = Column(String(50), default='STUDENT', nullable=False, index=True)
    avatar_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    deleted_at = Column(DateTime, nullable=True, index=True)  # soft-delete timestamp (P3-6)
    age_group = Column(String(20), nullable=True)
    requires_parental_consent = Column(Boolean, default=False)
    consent_token = Column(String(128), nullable=True)
    org_id = Column(UUID(as_uuid=True), nullable=True)
    primary_org_id = Column(UUID(as_uuid=True), nullable=True)
    signup_country_code = Column(String(10), nullable=True)
    state_code = Column(String(10), nullable=True)  # P1-5: homeschool state reporting
    is_platform_admin = Column(Boolean, default=False, nullable=False)
    # Gates /admin/blog and /admin/pages -- deliberately independent of
    # role='ADMIN' (same pattern as is_platform_admin above). role=ADMIN
    # alone is NOT sufficient: ADMIN-role test/demo seed accounts
    # (test_admin, admin@example.com) exist with published, well-known
    # passwords and must not automatically get content-editing access just
    # by having that role. See core.dependencies.get_current_content_admin.
    is_content_admin = Column(Boolean, default=False, nullable=False, server_default='false')
    # Blocks PUT/DELETE /admin/users/{id} outright (see routes/admin.py) --
    # set on seed/demo/test accounts (admin, test_admin, teacher@example.com,
    # etc.) so a tester's own actions can't delete or alter a fixture the
    # next tester needs to find intact. See the 2026-08-19 org-scoping
    # migration's PROTECTED_USERNAMES for the full list.
    is_protected = Column(Boolean, default=False, nullable=False, server_default='false')
    invite_token_used = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    learning_sessions = relationship('LearningSession', back_populates='user')
    student_profile = relationship('StudentProfile', uselist=False, back_populates='user')

    def __repr__(self):
        return f'<User(email={self.email}, role={self.role})>'
