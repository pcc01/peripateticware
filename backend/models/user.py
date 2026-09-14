# Copyright (c) 2026 Paul Christopher Cerda
from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
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
    # Persisted 2026-09-14 (previously a one-shot request field at
    # accept_invite time, used once to send the initial consent email, then
    # discarded — see routes/classrooms.py::accept_invite and
    # routes/student.py::request_guardian_consent, which needs a stored
    # address to resend to later). Encrypted like `email` above — same PII
    # sensitivity.
    parent_email = Column(EncryptedString(600), nullable=True)
    last_consent_request_at = Column(DateTime, nullable=True)
    # org_id/primary_org_id: the primary multi-tenant filter column, used
    # throughout org-scoped queries (ai_router._budget_check,
    # platform_ai_ledger.org_id, etc.) but never indexed.
    org_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    primary_org_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    signup_country_code = Column(String(10), nullable=True)
    # Which UI locale the signup form was displaying in (e.g. 'en', 'fr',
    # 'pt-BR') -- the frontend's active react-i18next language, forwarded as
    # a plain string, same "coarse hint, not real telemetry" spirit as
    # signup_country_code/ip_country_hint above. No IP address is ever
    # captured or stored (deliberate call — see services/signup_alerts.py).
    signup_locale = Column(String(20), nullable=True)
    # Which code path created this account: 'public_signup' (POST
    # /auth/signup), 'invite_accept' (classroom join link), 'admin_panel'
    # (routes/admin.py create_admin_user), 'homeschool_child_added'
    # (routes/homeschool.py create_child), 'seed_script' (dev/demo fixtures).
    # NULL means the row predates this column (2026-09-14) — no path is known
    # for it either way. Drives the new-account admin-notification decision
    # in services/signup_alerts.py: only 'public_signup'/'invite_accept' rows
    # are candidates for a real stranger, everything else is something you or
    # your own tooling did on purpose.
    created_via = Column(String(30), nullable=True)
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
    # ── MFA (TOTP, opt-in) ──────────────────────────────────────────────
    # mfa_secret stays populated but mfa_enabled=False during an
    # unconfirmed setup attempt (see routes/auth.py's /mfa/setup) — that's
    # safe, since nothing grants access on secret presence alone, only on
    # mfa_enabled. mfa_backup_codes holds bcrypt-hashed one-time codes,
    # never the plaintext (shown to the user exactly once, at confirm
    # time) — [{"hash": "$2b$...", "used": false}, ...].
    mfa_enabled = Column(Boolean, default=False, nullable=False, server_default='false')
    mfa_secret = Column(EncryptedString(600), nullable=True)
    mfa_backup_codes = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    learning_sessions = relationship('LearningSession', back_populates='user')
    student_profile = relationship('StudentProfile', uselist=False, back_populates='user')

    def __repr__(self):
        return f'<User(email={self.email}, role={self.role})>'
