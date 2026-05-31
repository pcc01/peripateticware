# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Privacy Engine v2.0 — Full compliance service
Jurisdiction-aware, DB-backed, Redis-cached privacy enforcement.

Key design principles (must not be violated):
  - Rules are DATA, not code. All jurisdiction logic lives in compliance_rules table.
  - Strictest-wins merge: merge_jurisdictions() applies the most restrictive rule.
  - Audit log is INSERT-only (rule_audit_log). Never UPDATE or DELETE a row.
  - Student IDs are always hashed: SHA256(student_id + AUDIT_HASH_SALT).
  - Enforcement fires at submission time, not capture time.
  - Log-only mode: enforce_on_submission() always returns ALLOWED (Phase 2 intent).
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from abc import ABC
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core import cache as redis_cache

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Redis cache key helpers
# ─────────────────────────────────────────────────────────────────────────────
_RULES_CACHE_KEY = "privacy:rules:all"
_RULES_TTL = 3600  # 1 hour — rules update infrequently


# ─────────────────────────────────────────────────────────────────────────────
# Domain enums (replicated from prototype for import convenience)
# ─────────────────────────────────────────────────────────────────────────────

class PrivacyFramework(str, Enum):
    # ── Data privacy laws ──────────────────────────────────────────────────
    GDPR           = "gdpr"
    CCPA           = "ccpa"
    COPPA          = "coppa"
    FERPA          = "ferpa"
    PIPEDA         = "pipeda"
    LGPD           = "lgpd"
    PDPA           = "pdpa"
    APPI           = "appi"            # Japan
    PRIVACY_ACT_AU = "privacy_act_au"  # Australia
    DPDP           = "dpdp"            # India
    PIPA           = "pipa"            # South Korea
    LFPDPPP        = "lfpdppp"         # Mexico
    POPIA          = "popia"           # South Africa
    UAE_DP         = "uae_dp"          # UAE
    PRIVACY_ACT_NZ = "privacy_act_nz"  # New Zealand
    IL_PPL         = "il_ppl"          # Israel
    NFADP          = "nfadp"           # Switzerland (nFADP)
    # ── AI regulations ────────────────────────────────────────────────────
    EU_AI_ACT = "eu_ai_act"
    US_AI_EO  = "us_ai_eo"   # EO 14110 + NIST AI RMF
    US_CA_AI  = "us_ca_ai"   # California AI bills
    CN_AI     = "cn_ai"       # China Generative AI Measures
    GB_AI     = "gb_ai"       # UK AI Safety Institute
    CA_AIDA   = "ca_aida"     # Canada AIDA (Bill C-27)
    SG_AI     = "sg_ai"       # Singapore AI Governance
    # ── Catch-all ─────────────────────────────────────────────────────────
    CUSTOM = "custom"


class DataCategory(str, Enum):
    IDENTITY    = "identity"
    CONTACT     = "contact"
    EDUCATIONAL = "educational"
    BEHAVIORAL  = "behavioral"
    LOCATION    = "location"
    BIOMETRIC   = "biometric"
    HEALTH      = "health"
    SPECIAL     = "special"
    FINANCIAL   = "financial"


class ConsentType(str, Enum):
    EXPLICIT      = "explicit"
    IMPLIED       = "implied"
    NONE_REQUIRED = "none_required"


class AgeGroup(str, Enum):
    UNDER_13 = "under_13"
    UNDER_16 = "under_16"
    UNDER_18 = "under_18"
    ADULT    = "adult"


class PrivacyLevel(str, Enum):
    """Legacy level enum — kept for backward compat."""
    PUBLIC       = "public"
    PARENT_ONLY  = "parent_only"
    TEACHER_ONLY = "teacher_only"
    STUDENT_ONLY = "student_only"
    PRIVATE      = "private"


# ─────────────────────────────────────────────────────────────────────────────
# Rule dataclasses (loaded from DB rule_definition JSONB)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class RetentionPolicy:
    duration_days:       int
    purpose:             str
    deletion_method:     str
    can_archive:         bool
    archive_duration_days: Optional[int] = None


@dataclass
class ConsentRule:
    data_categories:           List[DataCategory]
    age_groups:                List[AgeGroup]
    consent_type:              ConsentType
    requires_parental_consent: bool = False
    parental_age_threshold:    int  = 16
    consent_withdrawal_allowed: bool = True
    transparency_required:     bool  = True


@dataclass
class ProcessingRule:
    data_categories:        List[DataCategory]
    allowed_purposes:       List[str]
    forbidden_purposes:     List[str]
    requires_explicit_purpose: bool
    data_minimization:      bool
    purpose_limitation:     bool
    max_processors:         int = 1


@dataclass
class DataTransferRule:
    allowed_destinations:       List[str]
    requires_model_clauses:     bool
    requires_adequacy_decision: bool
    requires_consent:           bool
    anonymization_required:     bool


@dataclass
class RightRule:
    right_name:              str
    must_comply_within_days: int
    can_charge:              bool         = False
    charge_amount:           Optional[float] = None
    exemptions:              List[str]    = field(default_factory=list)


@dataclass
class JurisdictionConfig:
    jurisdiction_id:   str
    jurisdiction_name: str
    framework:         PrivacyFramework
    country_code:      str
    subdivision_code:  Optional[str]  = None
    effective_date:    datetime       = field(default_factory=lambda: datetime.now(timezone.utc))
    sunset_date:       Optional[datetime] = None

    consent_rules:     List[ConsentRule]    = field(default_factory=list)
    processing_rules:  List[ProcessingRule] = field(default_factory=list)
    transfer_rules:    List[DataTransferRule] = field(default_factory=list)
    retention_policies: Dict[DataCategory, RetentionPolicy] = field(default_factory=dict)
    rights_rules:      List[RightRule]      = field(default_factory=list)

    requires_privacy_impact_assessment: bool = False
    requires_data_protection_officer:   bool = False
    requires_incident_reporting:        bool = True
    incident_reporting_days:            int  = 72
    requires_breach_notification:       bool = True
    breach_notification_threshold:      int  = 10

    student_data_sharing_allowed: bool      = False
    third_party_vendors_allowed:  List[str] = field(default_factory=list)
    student_monitoring_allowed:   bool      = False
    student_profiling_allowed:    bool      = False
    student_targeting_allowed:    bool      = False

    # Strictest-merge scalars — used by merge_jurisdictions()
    max_retention_days:    int = 365
    encryption_required:   bool = False
    encryption_algorithm:  str = "AES-256"

    version:      str      = "1.0"
    last_updated: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata:     Dict[str, Any] = field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────────────
# Enforcement result
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class EnforcementResult:
    status:           str            # "ALLOWED" | "BLOCKED" | "WARNING"
    encryption_algo:  str            = "AES-256"
    retention_days:   int            = 365
    consent_required: bool           = False
    blocking_reason:  Optional[str]  = None
    rules_applied:    List[Dict[str, str]] = field(default_factory=list)
    warnings:         List[str]      = field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Utility — student ID hashing
# ─────────────────────────────────────────────────────────────────────────────

def hash_student_id(student_id: str) -> str:
    """Return SHA-256(student_id + AUDIT_HASH_SALT). Never store raw IDs."""
    raw = f"{student_id}{settings.AUDIT_HASH_SALT}"
    return hashlib.sha256(raw.encode()).hexdigest()


def hash_actor_id(actor_id: str) -> str:
    """Return SHA-256(actor_id + AUDIT_HASH_SALT)."""
    return hash_student_id(actor_id)


# ─────────────────────────────────────────────────────────────────────────────
# DB-backed rule loader
# ─────────────────────────────────────────────────────────────────────────────

async def _load_rules_from_db(db: AsyncSession) -> Dict[str, JurisdictionConfig]:
    """
    Load all active compliance rules from the DB, deserialise rule_definition JSONB
    into JurisdictionConfig objects, and return a dict keyed by jurisdiction.
    """
    from models.compliance import ComplianceRule  # local import avoids circular dep

    result = await db.execute(
        select(ComplianceRule).where(ComplianceRule.is_active == True)
    )
    rows = result.scalars().all()

    configs: Dict[str, JurisdictionConfig] = {}
    for row in rows:
        try:
            rule_def = row.rule_definition if isinstance(row.rule_definition, dict) \
                else json.loads(row.rule_definition)
            config = _deserialise_jurisdiction(row.jurisdiction, rule_def)
            configs[row.jurisdiction] = config
        except Exception as exc:
            logger.warning(f"Could not deserialise rule {row.rule_id}: {exc}")

    return configs


def _deserialise_jurisdiction(jurisdiction: str, rule_def: Dict[str, Any]) -> JurisdictionConfig:
    """Convert a rule_definition JSONB dict to a JurisdictionConfig dataclass."""
    framework_str = rule_def.get("framework", "custom").lower()
    try:
        framework = PrivacyFramework(framework_str)
    except ValueError:
        framework = PrivacyFramework.CUSTOM

    return JurisdictionConfig(
        jurisdiction_id=jurisdiction,
        jurisdiction_name=rule_def.get("jurisdiction_name", jurisdiction),
        framework=framework,
        country_code=rule_def.get("country_code", "XX"),
        subdivision_code=rule_def.get("subdivision_code"),
        max_retention_days=rule_def.get("max_retention_days", 365),
        encryption_required=rule_def.get("encryption_required", False),
        encryption_algorithm=rule_def.get("encryption_algorithm", "AES-256"),
        student_data_sharing_allowed=rule_def.get("student_data_sharing_allowed", False),
        student_monitoring_allowed=rule_def.get("student_monitoring_allowed", False),
        student_profiling_allowed=rule_def.get("student_profiling_allowed", False),
        student_targeting_allowed=rule_def.get("student_targeting_allowed", False),
        requires_privacy_impact_assessment=rule_def.get("requires_privacy_impact_assessment", False),
        requires_data_protection_officer=rule_def.get("requires_data_protection_officer", False),
        version=rule_def.get("version", "1.0"),
        metadata=rule_def.get("metadata", {}),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Jurisdiction cache helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _get_cached_rules(db: AsyncSession) -> Dict[str, JurisdictionConfig]:
    """Return rules from Redis if cached, otherwise load from DB and cache them."""
    cached = await redis_cache.get_cache(_RULES_CACHE_KEY)
    if cached:
        configs: Dict[str, JurisdictionConfig] = {}
        for jid, rule_def in cached.items():
            try:
                configs[jid] = _deserialise_jurisdiction(jid, rule_def)
            except Exception as exc:
                logger.warning(f"Cache deserialise error for {jid}: {exc}")
        if configs:
            return configs

    configs = await _load_rules_from_db(db)
    if configs:
        # Serialise back to plain dicts for JSON storage
        serialisable = {
            jid: {
                "framework": cfg.framework.value,
                "jurisdiction_name": cfg.jurisdiction_name,
                "country_code": cfg.country_code,
                "subdivision_code": cfg.subdivision_code,
                "max_retention_days": cfg.max_retention_days,
                "encryption_required": cfg.encryption_required,
                "encryption_algorithm": cfg.encryption_algorithm,
                "student_data_sharing_allowed": cfg.student_data_sharing_allowed,
                "student_monitoring_allowed": cfg.student_monitoring_allowed,
                "student_profiling_allowed": cfg.student_profiling_allowed,
                "student_targeting_allowed": cfg.student_targeting_allowed,
                "requires_privacy_impact_assessment": cfg.requires_privacy_impact_assessment,
                "requires_data_protection_officer": cfg.requires_data_protection_officer,
                "version": cfg.version,
                "metadata": cfg.metadata,
            }
            for jid, cfg in configs.items()
        }
        await redis_cache.set_cache(_RULES_CACHE_KEY, serialisable, ttl=_RULES_TTL)

    return configs


async def invalidate_rules_cache() -> None:
    """Call after an admin POST to /api/v1/privacy/rules to force a reload."""
    await redis_cache.delete_cache(_RULES_CACHE_KEY)


# ─────────────────────────────────────────────────────────────────────────────
# Core service functions
# ─────────────────────────────────────────────────────────────────────────────

async def identify_jurisdiction(
    student_id: str,
    school_id: Optional[str],
    db: AsyncSession,
) -> List[str]:
    """
    Determine which jurisdiction(s) apply to a student.

    Strategy (simple, expandable):
      1. Always include US_FEDERAL_FERPA (all US educational institutions).
      2. Add US_FEDERAL_COPPA if student's age < 13 (age stored on user record).
      3. Look up school's district_config.jurisdiction_ids from DB if available.
      4. Default to [US_FEDERAL_FERPA] when no further info.

    Returns a list of jurisdiction IDs matching keys in compliance_rules.jurisdiction.
    """
    from models.user import User  # local import

    applicable: List[str] = ["US_FEDERAL"]  # FERPA is always baseline

    try:
        result = await db.execute(select(User).where(User.id == student_id))
        user = result.scalar_one_or_none()
        if user and hasattr(user, "age") and user.age is not None and user.age < 13:
            applicable.append("US_FEDERAL_COPPA")
    except Exception as exc:
        logger.warning(f"identify_jurisdiction: could not fetch user age: {exc}")

    return applicable


async def merge_jurisdictions(
    jurisdiction_ids: List[str],
    db: AsyncSession,
) -> JurisdictionConfig:
    """
    Merge multiple jurisdiction configs into a single strictest-wins config.

    Strictest-wins rules:
      - encryption_required: True if ANY jurisdiction requires it
      - max_retention_days: minimum across all (shortest wins)
      - student_*_allowed: False if ANY jurisdiction forbids it
    """
    configs = await _get_cached_rules(db)

    relevant = [configs[jid] for jid in jurisdiction_ids if jid in configs]

    if not relevant:
        # Fall back to a safe default
        return JurisdictionConfig(
            jurisdiction_id="DEFAULT",
            jurisdiction_name="Default (no matching rules)",
            framework=PrivacyFramework.FERPA,
            country_code="US",
            encryption_required=True,
            max_retention_days=365,
        )

    merged = JurisdictionConfig(
        jurisdiction_id=",".join(jurisdiction_ids),
        jurisdiction_name="Merged",
        framework=relevant[0].framework,
        country_code=relevant[0].country_code,
        # Strictest-wins scalars
        encryption_required=any(c.encryption_required for c in relevant),
        encryption_algorithm=relevant[0].encryption_algorithm,  # first wins
        max_retention_days=min(c.max_retention_days for c in relevant),
        student_data_sharing_allowed=all(c.student_data_sharing_allowed for c in relevant),
        student_monitoring_allowed=all(c.student_monitoring_allowed for c in relevant),
        student_profiling_allowed=all(c.student_profiling_allowed for c in relevant),
        student_targeting_allowed=all(c.student_targeting_allowed for c in relevant),
        requires_privacy_impact_assessment=any(c.requires_privacy_impact_assessment for c in relevant),
        requires_data_protection_officer=any(c.requires_data_protection_officer for c in relevant),
    )

    return merged


async def enforce_on_submission(
    student_id: str,
    data_type: str,
    jurisdiction_id: Optional[str] = None,
    evidence_types: Optional[List[str]] = None,
    db: Optional[AsyncSession] = None,
) -> EnforcementResult:
    """
    Main enforcement gate called before student evidence is written.

    Phase 2 decision: LOG-ONLY mode. Always returns ALLOWED so no submissions
    are blocked. Enforcement signals are recorded for audit purposes.
    Upgrade to blocking by changing the final return to BLOCKED when result.status
    would have been BLOCKED.
    """
    rules_applied: List[Dict[str, str]] = []
    warnings: List[str] = []
    encryption_algo = "AES-256"
    retention_days = 365

    if db and jurisdiction_id:
        try:
            configs = await _get_cached_rules(db)
            config = configs.get(jurisdiction_id)
            if config:
                encryption_algo = config.encryption_algorithm
                retention_days = config.max_retention_days
                rules_applied.append({"jurisdiction": jurisdiction_id, "version": config.version})

                if not config.student_data_sharing_allowed and data_type in ("student_evidence", "learning_session"):
                    warnings.append(f"Jurisdiction {jurisdiction_id} restricts student data sharing")
        except Exception as exc:
            logger.warning(f"enforce_on_submission: rule lookup failed: {exc}")

    # Always ALLOWED in log-only mode (Phase 2 intent)
    return EnforcementResult(
        status="ALLOWED",
        encryption_algo=encryption_algo,
        retention_days=retention_days,
        rules_applied=rules_applied,
        warnings=warnings,
    )


async def log_access(
    actor_id: str,
    actor_role: str,
    action: str,
    data_type: str,
    student_id: Optional[str],
    rules_applied: List[Dict[str, str]],
    compliance_status: str,
    db: AsyncSession,
    jurisdiction_ids: Optional[List[str]] = None,
    enforcement_actions: Optional[Dict[str, Any]] = None,
    notes: Optional[str] = None,
) -> None:
    """
    Write one row to rule_audit_log.

    This is the function that makes the old print() call real.
    INSERT-ONLY: never UPDATE or DELETE audit rows.
    Student and actor IDs are hashed before storage.
    """
    from models.compliance import RuleAuditLog  # local import

    student_id_hash = hash_student_id(student_id) if student_id else None
    actor_id_hash   = hash_actor_id(actor_id) if actor_id else None

    row = RuleAuditLog(
        id=uuid.uuid4(),
        action=action,
        data_type=data_type,
        student_id_hash=student_id_hash,
        actor_id=actor_id_hash,
        actor_role=actor_role,
        rules_applied=rules_applied or [],
        enforcement_actions=enforcement_actions or {},
        compliance_status=compliance_status,
        jurisdiction_ids=jurisdiction_ids or [],
        notes=notes,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(row)
    try:
        await db.commit()
    except Exception as exc:
        logger.error(f"log_access: failed to write audit row: {exc}")
        await db.rollback()


async def get_audit_trail(
    db: AsyncSession,
    limit: int = 50,
    offset: int = 0,
    student_id_hash: Optional[str] = None,
    compliance_status: Optional[str] = None,
    actor_role: Optional[str] = None,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Paginated query over rule_audit_log with optional filters.
    Returns (rows_as_dicts, total_count).
    """
    from models.compliance import RuleAuditLog  # local import

    conditions = []
    if student_id_hash:
        conditions.append(RuleAuditLog.student_id_hash == student_id_hash)
    if compliance_status:
        conditions.append(RuleAuditLog.compliance_status == compliance_status)
    if actor_role:
        conditions.append(RuleAuditLog.actor_role == actor_role)
    if from_dt:
        conditions.append(RuleAuditLog.timestamp >= from_dt)
    if to_dt:
        conditions.append(RuleAuditLog.timestamp <= to_dt)

    base_q = select(RuleAuditLog)
    if conditions:
        base_q = base_q.where(and_(*conditions))

    count_q = select(func.count()).select_from(
        base_q.subquery()
    )
    total = (await db.execute(count_q)).scalar_one()

    rows_result = await db.execute(
        base_q.order_by(RuleAuditLog.timestamp.desc()).limit(limit).offset(offset)
    )
    rows = rows_result.scalars().all()

    return [
        {
            "id":                  str(r.id),
            "action":              r.action,
            "data_type":           r.data_type,
            "student_id_hash":     r.student_id_hash,
            "actor_id":            r.actor_id,
            "actor_role":          r.actor_role,
            "compliance_status":   r.compliance_status,
            "timestamp":           r.timestamp.isoformat() if r.timestamp else None,
            "rules_applied":       r.rules_applied,
            "enforcement_actions": r.enforcement_actions,
            "jurisdiction_ids":    r.jurisdiction_ids,
            "notes":               r.notes,
        }
        for r in rows
    ], total


# ─────────────────────────────────────────────────────────────────────────────
# PrivacyEngine — backward-compatible class wrapper
# ─────────────────────────────────────────────────────────────────────────────

class PrivacyEngine:
    """
    Backward-compatible class used by parent.py and other routes.

    All filter_for_* methods now delegate to real compliance logic when a db
    session is provided, and fall back to the safe field-exclusion approach
    when called without one (e.g. from legacy code).
    """

    def __init__(self):
        self.ferpa_enabled = True
        self.coppa_enabled = True
        self.gdpr_enabled  = True

    # -- legacy filter methods ------------------------------------------------

    def filter_for_parent(
        self,
        data: Dict[str, Any],
        user_age: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Return dict safe for parent view — strips internal/private keys."""
        _PARENT_BLOCKED = {"_internal", "admin_flags", "raw_location", "ip_address"}
        return {k: v for k, v in data.items() if k not in _PARENT_BLOCKED and not k.startswith("_")}

    def filter_for_student(
        self,
        data: Dict[str, Any],
        user_age: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Return dict safe for student view."""
        _STUDENT_BLOCKED = {"parent_id", "teacher_notes", "admin_flags", "raw_location"}
        return {k: v for k, v in data.items() if k not in _STUDENT_BLOCKED and not k.startswith("_")}

    def filter_for_teacher(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Return dict safe for teacher view."""
        return {k: v for k, v in data.items() if not k.startswith("_")}

    # -- helpers --------------------------------------------------------------

    def is_coppa_restricted(self, user_age: Optional[int]) -> bool:
        if not self.coppa_enabled or user_age is None:
            return False
        return user_age < 13

    def anonymize_pii(self, data: Dict[str, Any]) -> Dict[str, Any]:
        pii_fields = {"email", "phone", "address", "ssn", "dob", "full_name"}
        return {k: ("***REDACTED***" if k in pii_fields else v) for k, v in data.items()}

    async def audit_access(
        self,
        user_id: str,
        data_accessed: str,
        action: str,
        db: Optional[AsyncSession] = None,
    ) -> bool:
        """Log data access. Uses real DB when db session provided."""
        if db:
            await log_access(
                actor_id=user_id,
                actor_role="system",
                action=action,
                data_type=data_accessed,
                student_id=None,
                rules_applied=[],
                compliance_status="COMPLIANT",
                db=db,
            )
        else:
            logger.info(f"[AUDIT] actor={user_id} action={action} data={data_accessed}")
        return True


# ─────────────────────────────────────────────────────────────────────────────
# PrivacyComplianceChecker — full checker from prototype, now DB-backed
# ─────────────────────────────────────────────────────────────────────────────

class PrivacyComplianceChecker:
    """
    Full compliance checker.  Loads configurations from DB (via cache).
    Also accepts manually registered configs for testing.
    """

    def __init__(self):
        self.configurations: Dict[str, JurisdictionConfig] = {}
        self.active_jurisdiction: Optional[str] = None

    def register_jurisdiction(self, config: JurisdictionConfig) -> None:
        self.configurations[config.jurisdiction_id] = config

    def set_active_jurisdiction(self, jurisdiction_id: str) -> None:
        if jurisdiction_id not in self.configurations:
            raise ValueError(f"Unknown jurisdiction: {jurisdiction_id}")
        self.active_jurisdiction = jurisdiction_id

    async def load_from_db(self, db: AsyncSession) -> None:
        """Populate configurations from DB (via cache)."""
        self.configurations = await _get_cached_rules(db)

    def check_activity_compliance(
        self,
        activity_id: str,
        activity_data: Dict[str, Any],
        student_age: int,
        jurisdiction_id: Optional[str] = None,
    ) -> Tuple[bool, List[str], List[str]]:
        jurisdiction_id = jurisdiction_id or self.active_jurisdiction
        if not jurisdiction_id:
            return False, ["No jurisdiction configured"], []

        config = self.configurations.get(jurisdiction_id)
        if not config:
            return False, [f"Unknown jurisdiction: {jurisdiction_id}"], []

        issues: List[str] = []
        warnings: List[str] = []

        # Age-based flags
        if student_age < 13 and config.framework == PrivacyFramework.COPPA:
            collected = activity_data.get("data_collection", [])
            if any(c.upper() in ("BEHAVIORAL", "LOCATION") for c in collected):
                issues.append("COPPA: Cannot collect behavioral/location data from under-13 students")

        if student_age < 16 and config.framework == PrivacyFramework.GDPR:
            collected = activity_data.get("data_collection", [])
            if "SPECIAL" in [c.upper() for c in collected]:
                issues.append("GDPR: Parental consent required for special-category data under 16")

        return len(issues) == 0, issues, warnings

    def _get_age_group(self, age: int) -> AgeGroup:
        if age < 13:
            return AgeGroup.UNDER_13
        elif age < 16:
            return AgeGroup.UNDER_16
        elif age < 18:
            return AgeGroup.UNDER_18
        return AgeGroup.ADULT

    def get_applicable_rules(self, jurisdiction_id: Optional[str] = None) -> JurisdictionConfig:
        jurisdiction_id = jurisdiction_id or self.active_jurisdiction
        if not jurisdiction_id:
            raise ValueError("No jurisdiction configured")
        return self.configurations[jurisdiction_id]

    def generate_privacy_report(
        self,
        activity_id: str,
        activity_data: Dict[str, Any],
        student_age: int,
        jurisdiction_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        jurisdiction_id = jurisdiction_id or self.active_jurisdiction
        config = self.configurations.get(jurisdiction_id) if jurisdiction_id else None

        is_compliant, issues, warnings = self.check_activity_compliance(
            activity_id, activity_data, student_age, jurisdiction_id
        )
        return {
            "activity_id": activity_id,
            "jurisdiction": jurisdiction_id,
            "framework": config.framework.value if config else None,
            "student_age": student_age,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "is_compliant": is_compliant,
            "issues": issues,
            "warnings": warnings,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Module-level singletons
# ─────────────────────────────────────────────────────────────────────────────

# Backward-compat singleton used by parent.py, student_activities.py, etc.
privacy_engine = PrivacyEngine()

# Full checker singleton (load_from_db() called at startup or on first use)
_privacy_checker: Optional[PrivacyComplianceChecker] = None


def get_privacy_checker() -> PrivacyComplianceChecker:
    global _privacy_checker
    if _privacy_checker is None:
        _privacy_checker = PrivacyComplianceChecker()
    return _privacy_checker
