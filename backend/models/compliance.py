# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
SQLAlchemy ORM models for the privacy engine tables.

Maps to the three tables created in migration 20260527_privacy_engine_tables:
  - compliance_rules
  - rule_audit_log
  - consent_records

Extended by migration 20260530_compliance_rules_regulation_type:
  - compliance_rules.regulation_type       ('privacy' | 'ai' | 'data_protection')
  - compliance_rules.ai_student_permitted  (bool, fast enforcement column)
  - compliance_rules.ai_teacher_permitted  (bool, fast enforcement column)
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from core.database import Base


class ComplianceRule(Base):
    """Versioned, admin-updatable JSON rule definitions."""

    __tablename__ = "compliance_rules"

    rule_id             = Column(String(256), primary_key=True)
    regulation_id       = Column(String(256), nullable=False)
    version             = Column(String(10),  nullable=False)
    jurisdiction        = Column(String(50),  nullable=False, index=True)
    effective_date      = Column(DateTime,    nullable=False)
    sunset_date         = Column(DateTime,    nullable=True)
    rule_definition     = Column(JSONB,       nullable=False)
    created_by          = Column(String(100), default="system")
    created_at          = Column(DateTime,    default=lambda: datetime.now(timezone.utc))
    previous_version_id = Column(String(256), nullable=True)
    change_log          = Column(Text,        nullable=True)
    is_active           = Column(Boolean,     default=True,  nullable=False)
    audit_hash          = Column(String(256), nullable=True)
    # Regulation category — added migration 20260530_compliance_rules_regulation_type
    # 'privacy'         — data privacy laws (GDPR, COPPA, CCPA, LGPD, PDPA, etc.)
    # 'ai'              — AI-specific regulations (EU AI Act, EO 14110, CN Generative AI, etc.)
    # 'data_protection' — broader frameworks spanning both
    regulation_type       = Column(String(20),  nullable=False, default='privacy')
    # Denormalised convenience flags for fast enforcement queries.
    # True = permitted in that context; False = prohibited / requires review.
    # Defaults to True so existing privacy rules are unaffected.
    ai_student_permitted  = Column(Boolean,    nullable=False, default=True)
    ai_teacher_permitted  = Column(Boolean,    nullable=False, default=True)

    def __repr__(self) -> str:
        return f"<ComplianceRule {self.rule_id} v{self.version}>"


class RuleAuditLog(Base):
    """
    Immutable INSERT-only audit trail for every data access event.
    Never UPDATE or DELETE rows in this table.
    """

    __tablename__ = "rule_audit_log"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id             = Column(String(256), nullable=True)
    data_access_id      = Column(UUID(as_uuid=True), nullable=True)
    student_id_hash     = Column(String(256), nullable=True)   # SHA-256(student_id + salt)
    action              = Column(String(100), nullable=False)
    data_type           = Column(String(100), nullable=True)
    timestamp           = Column(DateTime,   default=lambda: datetime.now(timezone.utc), nullable=False)
    rules_applied       = Column(JSONB,      nullable=True)
    enforcement_actions = Column(JSONB,      nullable=True)
    compliance_status   = Column(String(20), nullable=False, default="COMPLIANT")
    actor_id            = Column(String(256), nullable=True)   # hashed
    actor_role          = Column(String(50),  nullable=True)
    jurisdiction_ids    = Column(JSONB,      nullable=True)
    notes               = Column(Text,       nullable=True)

    def __repr__(self) -> str:
        return f"<RuleAuditLog {self.id} {self.action} {self.compliance_status}>"


class ConsentRecord(Base):
    """Parental / student consent tracking (COPPA / GDPR)."""

    __tablename__ = "consent_records"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id_hash = Column(String(256), nullable=False)
    jurisdiction    = Column(String(50),  nullable=False)
    consent_type    = Column(String(50),  nullable=False)   # parental_consent | student_assent
    data_categories = Column(JSONB,      nullable=False)
    granted_at      = Column(DateTime,   default=lambda: datetime.now(timezone.utc))
    granted_by      = Column(String(256), nullable=True)    # hashed parent/guardian ID
    withdrawn_at    = Column(DateTime,   nullable=True)
    is_active       = Column(Boolean,    default=True, nullable=False)
    consent_version = Column(String(10), nullable=True)
    ip_hash         = Column(String(256), nullable=True)
    user_agent_hash = Column(String(256), nullable=True)

    def __repr__(self) -> str:
        return f"<ConsentRecord {self.id} {self.consent_type} active={self.is_active}>"
