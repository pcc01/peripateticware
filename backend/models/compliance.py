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

Extended by migration 20260618_privacy_regulation_catalog:
  - privacy_regulation_catalog
  - school_regulation_assignments
  - user_regulation_assignments
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Date, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID

from core.database import Base
from core.encryption import EncryptedString


class ComplianceRule(Base):
    """Versioned, admin-updatable JSON rule definitions."""

    __tablename__ = "compliance_rules"

    # rule_id / previous_version_id are genuinely UUID-typed in the live DB
    # (confirmed via information_schema against the running Postgres instance)
    # -- previously declared String(256) here, which mismatched the real
    # column type and caused a DatatypeMismatchError on ANY insert through
    # this ORM model (both POST /privacy/rules and the crawler's _upsert_rule
    # were affected; neither had ever been runtime-exercised before).
    rule_id             = Column(UUID(as_uuid=True), primary_key=True)
    regulation_id       = Column(String(256), nullable=False)
    version             = Column(String(10),  nullable=False)
    jurisdiction        = Column(String(50),  nullable=False, index=True)
    effective_date      = Column(DateTime,    nullable=False)
    sunset_date         = Column(DateTime,    nullable=True)
    rule_definition     = Column(JSONB,       nullable=False)
    created_by          = Column(String(100), default="system")
    created_at          = Column(DateTime,    default=datetime.utcnow)
    previous_version_id = Column(UUID(as_uuid=True), nullable=True)
    change_log          = Column(Text,        nullable=True)
    is_active           = Column(Boolean,     default=True,  nullable=False)
    audit_hash          = Column(String(256), nullable=True)
    regulation_type       = Column(String(20),  nullable=False, default='privacy')
    ai_student_permitted  = Column(Boolean,    nullable=False, default=True)
    ai_teacher_permitted  = Column(Boolean,    nullable=False, default=True)

    def __repr__(self) -> str:
        return "<ComplianceRule {} v{}>".format(self.rule_id, self.version)


class UserPrivacyPreference(Base):
    """Per-user privacy configuration for individual teacher and homeschool accounts."""

    __tablename__ = "user_privacy_preferences"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id     = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)

    ferpa_enabled        = Column(Boolean, nullable=False, default=False)
    coppa_enabled        = Column(Boolean, nullable=False, default=True)
    data_sharing_enabled = Column(Boolean, nullable=False, default=False)
    ai_enabled           = Column(Boolean, nullable=False, default=True)

    configured_at = Column(DateTime, nullable=True)

    org_id          = Column(UUID(as_uuid=True), nullable=True)
    org_governed    = Column(Boolean, nullable=False, default=False)
    org_governed_at = Column(DateTime, nullable=True)

    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return "<UserPrivacyPreference user={} org_governed={}>".format(self.user_id, self.org_governed)


class RuleAuditLog(Base):
    """Immutable INSERT-only audit trail for every data access event."""

    __tablename__ = "rule_audit_log"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id             = Column(String(256), nullable=True)
    data_access_id      = Column(UUID(as_uuid=True), nullable=True)
    student_id_hash     = Column(String(256), nullable=True)
    action              = Column(String(100), nullable=False)
    data_type           = Column(String(100), nullable=True)
    timestamp           = Column(DateTime,   default=datetime.utcnow, nullable=False)
    rules_applied       = Column(JSONB,      nullable=True)
    enforcement_actions = Column(JSONB,      nullable=True)
    compliance_status   = Column(String(20), nullable=False, default="COMPLIANT")
    actor_id            = Column(String(256), nullable=True)
    actor_role          = Column(String(50),  nullable=True)
    jurisdiction_ids    = Column(JSONB,      nullable=True)
    notes               = Column(Text,       nullable=True)

    def __repr__(self) -> str:
        return "<RuleAuditLog {} {} {}>".format(self.id, self.action, self.compliance_status)


class ConsentRecord(Base):
    """Parental / student consent tracking (COPPA / GDPR)."""

    __tablename__ = "consent_records"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id_hash = Column(String(256), nullable=False)
    jurisdiction    = Column(String(50),  nullable=False)
    consent_type    = Column(String(50),  nullable=False)
    data_categories = Column(JSONB,      nullable=False)
    granted_at      = Column(DateTime,   default=datetime.utcnow)
    granted_by      = Column(EncryptedString(256), nullable=True)
    withdrawn_at    = Column(DateTime,   nullable=True)
    is_active       = Column(Boolean,    default=True, nullable=False)
    consent_version = Column(String(10), nullable=True)
    ip_hash         = Column(String(256), nullable=True)
    user_agent_hash = Column(String(256), nullable=True)

    def __repr__(self) -> str:
        return "<ConsentRecord {} {} active={}>".format(self.id, self.consent_type, self.is_active)


# Privacy Regulation Catalog models (migration 20260618_privacy_regulation_catalog)


class PrivacyRegulationCatalog(Base):
    """User-facing display metadata for each privacy regulation."""

    __tablename__ = "privacy_regulation_catalog"
    __table_args__ = (
        UniqueConstraint('jurisdiction_code', 'framework', name='uq_catalog_jurisdiction_framework'),
    )

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id           = Column(String(256), nullable=True)
    short_name        = Column(String(100), nullable=False)
    full_name         = Column(String(500), nullable=False)
    jurisdiction_code = Column(String(50),  nullable=False)
    subdivision_code  = Column(String(10),  nullable=True)
    region            = Column(String(100), nullable=True)
    country_codes     = Column(JSONB,       nullable=True)
    framework         = Column(String(50),  nullable=False)
    summary           = Column(Text,        nullable=True)
    key_requirements  = Column(JSONB,       nullable=True)
    applies_to        = Column(JSONB,       nullable=True)
    age_threshold     = Column(Integer,     nullable=True)
    is_child_safety   = Column(Boolean,     nullable=False, default=False)
    is_featured       = Column(Boolean,     nullable=False, default=False)
    effective_date    = Column(Date,        nullable=True)
    source_url        = Column(String(1000), nullable=True)
    added_by_user_id  = Column(UUID(as_uuid=True), nullable=True)
    added_by_role     = Column(String(20),  nullable=True)
    is_active         = Column(Boolean,     nullable=False, default=True)
    is_verified       = Column(Boolean,     nullable=False, default=True)
    discovery_method  = Column(String(20),  nullable=True)
    last_synced_at    = Column(DateTime,    nullable=True)
    created_at        = Column(DateTime,    server_default="NOW()", nullable=False)
    updated_at        = Column(DateTime,    server_default="NOW()", nullable=False)

    def __repr__(self) -> str:
        return "<PrivacyRegulationCatalog {} ({})>".format(self.short_name, self.jurisdiction_code)


class PrivacySourceRegistry(Base):
    """
    Country -> official regulator/law source-pointer reference, populated by a
    one-time bulk pull (not an ongoing crawl). Used by privacy_discovery_service.py's
    Tier-2 lookup before falling back to general search+AI-recall discovery.
    """

    __tablename__ = "privacy_source_registry"
    __table_args__ = (
        UniqueConstraint('country_code', name='uq_source_registry_country'),
    )

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    country_code    = Column(String(4),   nullable=False)
    country_name    = Column(String(200), nullable=True)
    regulator_name  = Column(String(300), nullable=True)
    law_name        = Column(String(300), nullable=True)
    source_url      = Column(String(1000), nullable=True)
    iapp_detail_url = Column(String(1000), nullable=True)
    framework_guess = Column(String(50),  nullable=True)
    is_verified     = Column(Boolean,     nullable=False, default=False)
    fetched_at      = Column(DateTime,    nullable=True)
    notes           = Column(Text,        nullable=True)
    created_at      = Column(DateTime,    server_default="NOW()", nullable=False)
    updated_at      = Column(DateTime,    server_default="NOW()", nullable=False)

    def __repr__(self) -> str:
        return "<PrivacySourceRegistry {}>".format(self.country_code)


class SchoolRegulationAssignment(Base):
    """Which catalog regulations have been assigned to a school/org."""

    __tablename__ = "school_regulation_assignments"
    __table_args__ = (
        UniqueConstraint('org_id', 'catalog_id', name='uq_school_assignment_org_catalog'),
    )

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id      = Column(UUID(as_uuid=True), nullable=False)
    catalog_id  = Column(UUID(as_uuid=True), nullable=False)
    assigned_by = Column(UUID(as_uuid=True), nullable=True)
    assigned_at = Column(DateTime, server_default="NOW()", nullable=False)
    notes       = Column(Text, nullable=True)

    def __repr__(self) -> str:
        return "<SchoolRegulationAssignment org={} catalog={}>".format(self.org_id, self.catalog_id)


class UserRegulationAssignment(Base):
    """Which catalog regulations have been assigned by a solo teacher."""

    __tablename__ = "user_regulation_assignments"
    __table_args__ = (
        UniqueConstraint('user_id', 'catalog_id', name='uq_user_assignment_user_catalog'),
    )

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id     = Column(UUID(as_uuid=True), nullable=False)
    catalog_id  = Column(UUID(as_uuid=True), nullable=False)
    assigned_at = Column(DateTime, server_default="NOW()", nullable=False)
    notes       = Column(Text, nullable=True)

    def __repr__(self) -> str:
        return "<UserRegulationAssignment user={} catalog={}>".format(self.user_id, self.catalog_id)


class PrivacyNotice(Base):
    """Versioned privacy notices — the text users consent to."""

    __tablename__ = "privacy_notices"
    __table_args__ = (
        UniqueConstraint('version', 'jurisdiction', 'notice_type', name='uq_notice_version_jurisdiction_type'),
    )

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    version        = Column(String(20),  nullable=False)           # e.g. "1.0", "1.1"
    jurisdiction   = Column(String(50),  nullable=False, index=True)  # "gdpr_eu", "ccpa", "ferpa", "global"
    notice_type    = Column(String(50),  nullable=False)           # "privacy_policy" | "cookie_policy" | "data_processing"
    title          = Column(String(255), nullable=False)
    content        = Column(Text,        nullable=False)
    summary        = Column(Text,        nullable=True)            # plain-language summary
    effective_date = Column(DateTime,    nullable=False, default=datetime.utcnow)
    superseded_by  = Column(UUID(as_uuid=True), nullable=True)    # FK to newer version
    is_current     = Column(Boolean,     nullable=False, default=True)
    created_at     = Column(DateTime,    default=datetime.utcnow, nullable=False)
    created_by     = Column(String(100), nullable=True)

    def __repr__(self) -> str:
        return "<PrivacyNotice {} {} {} current={}>".format(
            self.jurisdiction, self.notice_type, self.version, self.is_current
        )


# ---------------------------------------------------------------------------
# Breach Incident — GDPR Art. 33/34
# ---------------------------------------------------------------------------

import enum as _enum   # avoid shadowing anything already imported


class BreachSeverity(str, _enum.Enum):
    LOW      = "low"        # no likely harm to individuals
    MEDIUM   = "medium"     # possible harm; requires DPA notification
    HIGH     = "high"       # likely high risk; requires user notification
    CRITICAL = "critical"   # immediate action required


class BreachStatus(str, _enum.Enum):
    DISCOVERED    = "discovered"    # just logged, clock running
    INVESTIGATING = "investigating" # root cause being determined
    CONTAINED     = "contained"     # breach stopped, notifying
    CLOSED        = "closed"        # all notifications done, post-mortem complete


class BreachIncident(Base):
    """
    GDPR Art. 33/34 breach incident log.

    Lifecycle:
      DISCOVERED → INVESTIGATING → CONTAINED → CLOSED
      DPA must be notified within 72h of discovery (dpa_deadline).
      Users must be notified if severity >= HIGH.
    """
    __tablename__ = "breach_incidents"

    id                    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Discovery
    discovered_at         = Column(DateTime, nullable=False, default=datetime.utcnow)
    reported_by           = Column(String(256), nullable=False)   # admin email or user ID
    description           = Column(Text, nullable=False)
    root_cause            = Column(Text, nullable=True)

    # Scope
    severity              = Column(String(20), nullable=False, default=BreachSeverity.MEDIUM)
    status                = Column(String(20), nullable=False, default=BreachStatus.DISCOVERED)
    affected_user_count   = Column(Integer, nullable=True)
    data_categories       = Column(JSONB, nullable=False, default=list)  # ["email","location",...]
    jurisdictions         = Column(JSONB, nullable=False, default=list)  # ["gdpr_eu","ccpa",...]

    # GDPR Art. 33: DPA notification
    dpa_notification_required  = Column(Boolean, nullable=False, default=True)
    dpa_deadline               = Column(DateTime, nullable=True)   # discovered_at + 72h
    dpa_notified_at            = Column(DateTime, nullable=True)
    dpa_reference_number       = Column(String(100), nullable=True)  # assigned by DPA

    # GDPR Art. 34: User notification
    user_notification_required = Column(Boolean, nullable=False, default=False)
    users_notified_at          = Column(DateTime, nullable=True)
    users_notified_count       = Column(Integer, nullable=True)

    # Audit
    containment_actions   = Column(Text, nullable=True)
    internal_notes        = Column(Text, nullable=True)
    created_at            = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at            = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_at             = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<BreachIncident {self.id} severity={self.severity} status={self.status}>"
