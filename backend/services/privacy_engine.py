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
    status:           str            # "ALLOWED" | "BLOCKED" | "WARNING" — the mode-dependent outcome actually applied to this request
    encryption_algo:  str            = "AES-256"
    retention_days:   int            = 365
    consent_required: bool           = False
    blocking_reason:  Optional[str]  = None
    rules_applied:    List[Dict[str, str]] = field(default_factory=list)
    warnings:         List[str]      = field(default_factory=list)
    # would_block is computed independent of ENFORCEMENT_MODE — True whenever
    # a real blocking condition was detected, even in "log" mode where
    # `status` is forced to ALLOWED. This is what makes ENFORCEMENT_MODE=log
    # actually useful for a rollout decision: every request's audit row
    # records what WOULD have happened under "block" mode, not just what did.
    would_block:      bool           = False


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


def _build_consent_rules(rule_def: Dict[str, Any]) -> List[ConsentRule]:
    """Build ConsentRule dataclass instances from the raw `consent_rules`
    list in a rule_definition dict (PRIVACY_BUGFIX_PLAN.md Bug 2).

    `consent_rules` is NOT a declared field on the canonical PrivacyRule
    schema (schemas/privacy_rule.py) -- it only round-trips through that
    model's `extra="allow"` passthrough as an untyped list of raw dicts, not
    validated/typed ConsentRule-shaped objects. Building directly from the
    raw rule_def dict here (shared by both the canonical-schema and
    raw-fallback branches of _deserialise_jurisdiction) is therefore more
    reliable than trusting the pydantic model's extra-field passthrough, and
    keeps both branches behaving identically for this field.

    Never raises: a malformed entry is skipped (logged) rather than
    aborting the whole jurisdiction's load over one bad consent-rule row.
    """
    out: List[ConsentRule] = []
    for raw in rule_def.get("consent_rules", []) or []:
        if not isinstance(raw, dict):
            continue
        try:
            out.append(ConsentRule(
                data_categories=list(raw.get("data_categories", []) or []),
                age_groups=list(raw.get("age_groups", []) or []),
                consent_type=raw.get("consent_type", ConsentType.NONE_REQUIRED.value),
                requires_parental_consent=bool(raw.get("requires_parental_consent", False)),
                parental_age_threshold=int(raw.get("parental_age_threshold", 16)),
                consent_withdrawal_allowed=bool(raw.get("consent_withdrawal_allowed", True)),
                transparency_required=bool(raw.get("transparency_required", True)),
            ))
        except Exception as exc:
            logger.warning(f"Could not parse consent_rules entry {raw!r}: {exc}")
    return out


def _deserialise_jurisdiction(jurisdiction: str, rule_def: Dict[str, Any]) -> JurisdictionConfig:
    """Convert a rule_definition JSONB dict to a JurisdictionConfig dataclass.

    Runs the dict through the canonical PrivacyRule schema first, so both the
    rich file format and the sparse DB-seed format are normalised the same way
    (case-insensitive framework, retention derived from data_retention when
    present, defaults filled). Falls back to raw .get() if the schema import
    isn't available for any reason — never crash a rule load.
    """
    try:
        from schemas.privacy_rule import PrivacyRule
        rd = dict(rule_def)
        rd.setdefault("jurisdiction_id", jurisdiction)
        rd.setdefault("jurisdiction_name", rule_def.get("jurisdiction_name", jurisdiction))
        rd.setdefault("country_code", rule_def.get("country_code", "XX"))
        rule = PrivacyRule.model_validate(rd)
        try:
            framework = PrivacyFramework(rule.framework)
        except ValueError:
            framework = PrivacyFramework.CUSTOM
        return JurisdictionConfig(
            jurisdiction_id=jurisdiction,
            jurisdiction_name=rule.jurisdiction_name,
            framework=framework,
            country_code=rule.country_code,
            subdivision_code=rule.subdivision_code,
            max_retention_days=rule.effective_max_retention_days(),
            encryption_required=rule.encryption_required,
            encryption_algorithm=rule.encryption_algorithm,
            student_data_sharing_allowed=rule.student_data_sharing_allowed,
            student_monitoring_allowed=rule.student_monitoring_allowed,
            student_profiling_allowed=rule.student_profiling_allowed,
            student_targeting_allowed=rule.student_targeting_allowed,
            requires_privacy_impact_assessment=rule.requires_privacy_impact_assessment,
            requires_data_protection_officer=rule.requires_data_protection_officer,
            version=rule.version,
            consent_rules=_build_consent_rules(rule_def),
            metadata={**rule.metadata, "_rule_definition": rule_def},
        )
    except Exception as exc:
        logger.warning(f"Canonical-schema parse failed for {jurisdiction}; using raw fallback: {exc}")
        framework_str = str(rule_def.get("framework", "custom")).lower()
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
            consent_rules=_build_consent_rules(rule_def),
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
# Jurisdiction ID aliasing
# ─────────────────────────────────────────────────────────────────────────────
# Three ID namespaces exist historically and MUST resolve to the same rules:
#   1. compliance_rules.jurisdiction seed keys:  "US", "US-COPPA", "US-CA", "EU"
#   2. config-file / privacy_seeder org IDs:     "ferpa_us", "coppa_us",
#      "ccpa_california", "gdpr_eu", "pipeda_canada", ...
#   3. legacy engine IDs:                        "US_FEDERAL", "US_FEDERAL_COPPA"
# When adding a new jurisdiction, use ONE id everywhere (recommended: the
# config-file style, e.g. "pdpa_singapore") — but if an alternate spelling
# already exists in data, add it here so lookups never silently miss.
JURISDICTION_ALIASES: Dict[str, str] = {
    "ferpa_us":          "US",
    "US_FEDERAL":        "US",
    "coppa_us":          "US-COPPA",
    "US_FEDERAL_COPPA":  "US-COPPA",
    "ccpa_california":   "US-CA",
    "gdpr_eu":           "EU",
}


def resolve_jurisdiction_id(jid: str, configs: Dict[str, JurisdictionConfig]) -> Optional[str]:
    """Return the key under which `jid` exists in `configs`, honouring aliases."""
    if jid in configs:
        return jid
    alias = JURISDICTION_ALIASES.get(jid)
    if alias and alias in configs:
        return alias
    # Reverse direction: caller passed a canonical key, configs use the alias
    for k, v in JURISDICTION_ALIASES.items():
        if v == jid and k in configs:
            return k
    return None


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

    Strategy:
      1. Use the student's organization's privacy_jurisdiction_ids (seeded at
         signup by privacy_seeder from country/subdivision/under-13 answers).
      2. Add coppa_us if the student's age < 13 and it isn't already present.
      3. Fall back to ["US_FEDERAL"] (FERPA baseline) only when no org data
         exists — previously this fallback was ALL the function did, so a
         GDPR-territory org still got US-only rules.
    """
    from models.user import User  # local import

    applicable: List[str] = []
    user = None

    try:
        result = await db.execute(select(User).where(User.id == student_id))
        user = result.scalar_one_or_none()

        if user is not None and getattr(user, "org_id", None):
            from sqlalchemy import text as _text
            row = (await db.execute(
                _text("SELECT privacy_jurisdiction_ids FROM organizations WHERE id = :oid"),
                {"oid": str(user.org_id)},
            )).scalar_one_or_none()
            if row:
                ids = row if isinstance(row, list) else json.loads(row)
                applicable = [str(j) for j in ids if j]
    except Exception as exc:
        logger.warning(f"identify_jurisdiction: org jurisdiction lookup failed: {exc}")

    if not applicable:
        applicable = ["US_FEDERAL"]  # conservative FERPA baseline

    try:
        # BUG FIX (2026-09): this used to check `user.age`, an attribute that
        # does not exist anywhere on the User model (only `age_group` --
        # 'under_13'|'under_16'|'under_18'|'adult'|None -- and
        # `requires_parental_consent`, both set by
        # routes/classrooms.py::accept_invite from an optional date_of_birth).
        # getattr(user, "age", None) was always None, so this branch never
        # fired -- confirmed live: a FERPA-only or unmapped-jurisdiction org
        # got zero blocking on sensitive evidence for a real under-13 student,
        # because the ONLY jurisdiction signal was the org's self-reported
        # has_under_13 flag from teacher signup, never re-checked per student.
        # Fixed to use the real fields, matching the same "who counts as a
        # minor" predicate routes/sessions.py's location gate and
        # wayfinding_consent.py::age_floor_rung already use, so this override
        # never disagrees with those existing gates. Appending coppa_us here
        # can only tighten merge_jurisdictions()'s strictest-wins result
        # (all()/any()/min() across jurisdictions), never loosen it -- a
        # lenient org can never undermine a genuinely under-13 student's
        # protection.
        if user is not None:
            age_group = getattr(user, "age_group", None)
            requires_consent = bool(getattr(user, "requires_parental_consent", False))
            if age_group == "under_13" or requires_consent:
                if not any(j in ("coppa_us", "US_FEDERAL_COPPA", "US-COPPA") for j in applicable):
                    applicable.append("coppa_us")
    except Exception as exc:
        logger.warning(f"identify_jurisdiction: could not evaluate user age_group: {exc}")

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

    resolved = [resolve_jurisdiction_id(jid, configs) for jid in jurisdiction_ids]
    relevant = [configs[r] for r in resolved if r is not None]

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
        # BUG FIX (2026-09-12, PRIVACY_BUGFIX_PLAN.md Bug 2): this constructor
        # call used to omit consent_rules entirely, same gap as
        # _deserialise_jurisdiction's own JurisdictionConfig(...) calls (now
        # fixed there too) -- meaning even after wiring consent_rules through
        # deserialization, every REAL call site (none passes an explicit
        # jurisdiction_id to enforce_on_submission() today, so all of them go
        # through this merge path) would still see an empty consent_rules
        # list here and the age-differentiated check below would be
        # permanently dead code. Union (not strictest-single-pick) is the
        # correct strictest-wins semantics for a list of independently
        # triggerable rules: enforce_on_submission() treats "any one matching
        # rule requires consent" as sufficient, so any jurisdiction's rule
        # applying is enough, exactly like the any()/all() scalars above.
        consent_rules=[cr for c in relevant for cr in c.consent_rules],
    )

    return merged


async def _has_valid_consent(
    *,
    db: Optional[AsyncSession],
    student_id: str,
    activity_id: Optional[str],
    evidence_types: List[str],
) -> bool:
    """Return True if real, already-granted consent covers this submission.

    Unifies the two consent records this engine previously never looked at:
      - gps/location evidence tied to a known activity: activity-scoped
        consent in consent_logs (consent_type='gps_tracking'), via the same
        services.gps_consent.check_gps_consent() routes/sessions.py uses for
        its own GPS gate -- one shared source of truth, not two.
      - everything else (including gps/location with no activity_id): the
        blanket ConsentRecord(consent_type='parental', is_active=True) row
        that routes/privacy.py::record_consent already writes when a parent
        uses the emailed consent link -- previously a one-way "reactivate
        the account" side effect that nothing else ever read.

    This only ever turns a "must block" into "allowed because consent
    genuinely exists" -- it never suppresses the jurisdiction-driven
    requirement itself (callers still see consent_required=True either way).

    Fails CLOSED (returns False) on any lookup error or missing db -- an
    enforcement gate must never treat an error as "consent granted".
    """
    if db is None:
        return False
    try:
        gps_like = {"gps", "location"}
        if activity_id and any(e in gps_like for e in evidence_types):
            from services.gps_consent import check_gps_consent
            if await check_gps_consent(db, student_id, activity_id):
                return True

        from models.compliance import ConsentRecord
        result = await db.execute(
            select(ConsentRecord.id).where(
                ConsentRecord.student_id_hash == hash_student_id(str(student_id)),
                ConsentRecord.consent_type == "parental",
                ConsentRecord.is_active == True,
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None
    except Exception as exc:
        logger.warning(f"enforce_on_submission: consent lookup failed (failing closed): {exc}")
        return False


# Loose evidence-type -> DataCategory mapping for the age-differentiated
# consent check below (PRIVACY_BUGFIX_PLAN.md Bug 2). Deliberately
# conservative: only evidence types with an unambiguous DataCategory
# counterpart in the actual seeded consent_rules data are mapped ("gps"/
# "location" -> location, "biometric" -> biometric). "audio"/"video"/"photo"
# are part of the outer `sensitive` set (they still drive the existing
# student_monitoring_allowed check above) but have no corresponding
# DataCategory in the current seed data's consent_rules.data_categories
# lists -- mapping them to one would be inventing rule semantics the seed
# data doesn't actually specify, not implementing what's already there.
_EVIDENCE_DATA_CATEGORY: Dict[str, str] = {
    "gps": DataCategory.LOCATION.value,
    "location": DataCategory.LOCATION.value,
    "biometric": DataCategory.BIOMETRIC.value,
}


async def _get_student_age_group(student_id: str, db: Optional[AsyncSession]) -> Optional[str]:
    """Look up the student's own age_group ('under_13'|'under_16'|'under_18'|
    'adult'|None) directly.

    A small, dedicated lookup rather than overloading identify_jurisdiction()'s
    return contract -- that function returns List[str] of jurisdiction ids,
    a shape already tested and consumed as exactly that everywhere else.
    Fails closed (returns None) on any error; callers must treat None as
    "cannot apply an age-differentiated rule", never as "adult".
    """
    if db is None:
        return None
    try:
        from models.user import User
        result = await db.execute(select(User.age_group).where(User.id == student_id))
        return result.scalar_one_or_none()
    except Exception as exc:
        logger.warning(f"enforce_on_submission: age_group lookup failed: {exc}")
        return None


async def enforce_on_submission(
    student_id: str,
    data_type: str,
    jurisdiction_id: Optional[str] = None,
    evidence_types: Optional[List[str]] = None,
    db: Optional[AsyncSession] = None,
    activity_id: Optional[str] = None,
) -> EnforcementResult:
    """
    Main enforcement gate called before student evidence is written.

    Behaviour is controlled by settings.ENFORCEMENT_MODE:
      "log"   — evaluate rules, record signals, ALWAYS return ALLOWED (default)
      "warn"  — return status="WARNING" with reasons, but still allow the write
      "block" — return status="BLOCKED" with blocking_reason; caller MUST refuse

    If jurisdiction_id is not supplied, the applicable jurisdictions are derived
    from the student's org via identify_jurisdiction() + strictest-wins merge —
    so callers no longer have to know the jurisdiction to get enforcement.
    """
    mode = str(getattr(settings, "ENFORCEMENT_MODE", "log")).lower()

    rules_applied: List[Dict[str, str]] = []
    warnings: List[str] = []
    blocking_reasons: List[str] = []
    encryption_algo = "AES-256"
    retention_days = 365
    consent_required = False

    config: Optional[JurisdictionConfig] = None
    if db:
        try:
            if jurisdiction_id:
                configs = await _get_cached_rules(db)
                _rk = resolve_jurisdiction_id(jurisdiction_id, configs)
                config = configs.get(_rk) if _rk else None
                if config:
                    rules_applied.append({"jurisdiction": jurisdiction_id, "version": config.version})
            else:
                # Derive from the student's org and merge strictest-wins.
                jids = await identify_jurisdiction(student_id, None, db)
                config = await merge_jurisdictions(jids, db)
                rules_applied.append({"jurisdiction": ",".join(jids), "version": config.version})
        except Exception as exc:
            logger.warning(f"enforce_on_submission: rule lookup failed: {exc}")

    if config:
        encryption_algo = config.encryption_algorithm
        retention_days = config.max_retention_days
        if not config.student_data_sharing_allowed and data_type in ("student_evidence", "learning_session"):
            warnings.append(f"Jurisdiction restricts student data sharing for {data_type}")
        # Under strict frameworks, location/biometric evidence needs consent.
        sensitive = {"gps", "location", "audio", "video", "photo", "biometric"}
        if evidence_types and any(e.lower() in sensitive for e in evidence_types):
            if not config.student_monitoring_allowed:
                consent_required = True
                # BUG FIX (2026-09): this used to block unconditionally --
                # consent_required was set but never actually checked against
                # anything, so even a family that had genuinely already
                # consented (via routes/privacy.py::record_consent, or a
                # prior GPS-specific consent_logs grant) would show
                # would_block=True forever, with no way to ever satisfy the
                # requirement. Now checks the real consent state before
                # blocking; consent_required stays True either way so the
                # audit trail keeps recording that this write relied on
                # consent (satisfied or not).
                has_consent = await _has_valid_consent(
                    db=db,
                    student_id=student_id,
                    activity_id=activity_id,
                    evidence_types=[e.lower() for e in evidence_types],
                )
                if not has_consent:
                    blocking_reasons.append(
                        "Sensitive evidence (location/audio/video/biometric) requires "
                        "consent under the applicable jurisdiction, and no active "
                        "consent record was found"
                    )

            # BUG FIX (2026-09-12, PRIVACY_BUGFIX_PLAN.md Bug 2): every
            # age_group consumer in this codebase used to treat age_group as
            # a binary under_13-vs-everything-else split -- under_16/under_18
            # students got identical treatment to adults everywhere,
            # including here, even though GDPR/CCPA's own seeded
            # consent_rules data specifies an additional teen-consent
            # requirement (age_groups + requires_parental_consent) this
            # engine never consulted. This check is INDEPENDENT of the
            # student_monitoring_allowed branch above -- it can fire even
            # when that org-level check passes (student_monitoring_allowed=
            # True), so it adds a genuinely new, separately-triggerable
            # reason rather than just duplicating the existing one. Only
            # ever additive/tightening: an empty config.consent_rules (any
            # jurisdiction without an age-differentiated rule, e.g. plain
            # FERPA/COPPA) or a student with no age_group on file leaves
            # this branch a no-op.
            evidence_categories = {
                _EVIDENCE_DATA_CATEGORY[e]
                for e in (e.lower() for e in evidence_types)
                if e in _EVIDENCE_DATA_CATEGORY
            }
            if config.consent_rules and evidence_categories:
                student_age_group = await _get_student_age_group(student_id, db)
                if student_age_group:
                    matching_rule = next(
                        (
                            r for r in config.consent_rules
                            if r.requires_parental_consent
                            # AgeGroup/DataCategory are `str` Enum subclasses, so a
                            # plain string (age_group column value, or a raw
                            # unconverted entry from _build_consent_rules) compares
                            # equal to the enum member by value -- deliberately NOT
                            # str()-ing these first: str(AgeGroup.UNDER_16) returns
                            # "AgeGroup.UNDER_16", not "under_16", which would make
                            # every comparison here silently always miss.
                            and student_age_group in r.age_groups
                            and evidence_categories & set(r.data_categories)
                        ),
                        None,
                    )
                    if matching_rule is not None:
                        consent_required = True
                        has_age_consent = await _has_valid_consent(
                            db=db,
                            student_id=student_id,
                            activity_id=activity_id,
                            evidence_types=[e.lower() for e in evidence_types],
                        )
                        if not has_age_consent:
                            blocking_reasons.append(
                                f"Student's age group ('{student_age_group}') requires "
                                "parental consent for this data category under the "
                                "applicable jurisdiction's age-based consent rule, and no "
                                "active consent record was found"
                            )

    # Decide status by mode.
    if mode == "block" and blocking_reasons:
        status_val = "BLOCKED"
    elif blocking_reasons or warnings:
        status_val = "WARNING" if mode in ("warn", "block") else "ALLOWED"
    else:
        status_val = "ALLOWED"

    return EnforcementResult(
        status=status_val,
        encryption_algo=encryption_algo,
        retention_days=retention_days,
        consent_required=consent_required,
        blocking_reason="; ".join(blocking_reasons) if blocking_reasons else None,
        rules_applied=rules_applied,
        warnings=warnings + blocking_reasons,
        would_block=bool(blocking_reasons),
    )


async def _record_enforcement_audit(
    *,
    result: EnforcementResult,
    student_id: str,
    actor_role: str,
    action: str,
    data_type: str,
    evidence_types: Optional[List[str]],
    notes: Optional[str],
    activity_id: Optional[str] = None,
    override_status: Optional[str] = None,
) -> None:
    """
    Write one durable rule_audit_log row capturing what the engine actually
    detected — not just the mode-collapsed `status`. This is the fix for a
    2026-09 gap: ENFORCEMENT_MODE=log was evaluating real rule violations
    (populating `warnings`/`blocking_reason`) and then discarding that detail
    entirely, because every caller (a) never captured enforce_or_raise's
    return value and (b) only 2 of 9 write paths even called audit_submission
    afterward. The audit row's `compliance_status` column stays mode-aware
    (ALLOWED/WARNING/BLOCKED, matching what actually happened to the
    request — unchanged contract), but `enforcement_actions` now always
    records `would_block` (computed independent of mode) plus the actual
    warnings/blocking_reason text, so an admin can query "what would this
    request have done under block mode" without ever having flipped the
    switch — the whole point of running in log mode first.

    override_status (PRIVACY_BUGFIX_PLAN.md Bug 3): when provided, used as
    `compliance_status` INSTEAD OF `result.status`. `result.status` is
    computed entirely inside enforce_on_submission() from the global
    ENFORCEMENT_MODE, with no knowledge of a caller-specific
    force_block_on_would_block decision. enforce_or_raise() is the only
    caller that knows both `result.status` AND whether it's about to force-
    block anyway — it passes the request's REAL, actually-applied outcome
    here so `compliance_status` never disagrees with whether a 403 was
    actually raised. audit_submission() (the other caller) has no
    force-block concept at all and never passes this, so its behavior is
    unchanged: `result.status` is used verbatim, exactly as before.

    Uses an ISOLATED session (its own short-lived connection via
    get_session_factory()), never the caller's request-scoped `db`.
    enforce_or_raise() is called from ~9 places mid-request, always BEFORE
    the caller's own db.add() for the actual write (verified across every
    call site) — sharing that session here and having this commit/rollback
    it would either commit the caller's not-yet-validated write early, or
    wipe out unrelated pending state on an audit-write failure. An isolated
    session makes the audit write genuinely non-blocking: it can fail (DB
    hiccup, whatever) without touching the caller's transaction at all,
    matching the "must never affect the main request" contract this engine
    has always documented but only partly delivered.
    """
    try:
        from core.database import get_session_factory

        enforcement_actions = {
            "mode": str(getattr(settings, "ENFORCEMENT_MODE", "log")).lower(),
            "would_block": result.would_block,
            "warnings": result.warnings,
            "blocking_reason": result.blocking_reason,
            "consent_required": result.consent_required,
            "evidence_types": evidence_types or [],
            "activity_id": activity_id,
        }
        session_factory = get_session_factory()
        async with session_factory() as audit_db:
            await log_access(
                actor_id=student_id,
                actor_role=actor_role,
                action=action,
                data_type=data_type,
                student_id=student_id,
                rules_applied=result.rules_applied,
                compliance_status=override_status if override_status is not None else result.status,
                db=audit_db,
                enforcement_actions=enforcement_actions,
                notes=notes,
            )
    except Exception as exc:
        # Audit-trail failure must never surface to the caller — same
        # guarantee as before, just now impossible to violate the caller's
        # own transaction along the way (see docstring above).
        logger.warning(f"privacy_engine: audit write failed (non-blocking): {exc}")


async def enforce_or_raise(
    student_id: str,
    data_type: str,
    db: Optional[AsyncSession],
    evidence_types: Optional[List[str]] = None,
    actor_role: str = "student",
    action: Optional[str] = None,
    notes: Optional[str] = None,
    activity_id: Optional[str] = None,
    force_block_on_would_block: bool = False,
) -> Optional[EnforcementResult]:
    """
    Pre-write enforcement gate for a route handler, extracted from the
    pattern originally used only by student_activities.py::add_evidence_capture
    (the one write path this engine was actually wired into — see
    docs/... 2026-09 audit). Runs enforce_on_submission() and raises
    HTTPException(403) on BLOCKED; in "log"/"warn" mode this never raises.
    Mirrors that route's behaviour on lookup failure: log and allow rather
    than fail the whole request over a privacy-engine error.

    As of the 2026-09 audit-trail fix, this ALSO writes a durable audit row
    (via an isolated session — see _record_enforcement_audit) every time it
    runs, regardless of mode or outcome — previously the result was computed
    and silently discarded unless the caller separately called
    audit_submission() (only 2 of 9 call sites did).

    force_block_on_would_block: defaults to False, so every pre-existing call
    site is byte-for-byte unaffected (the block decision reduces to exactly
    `result.status == "BLOCKED"`, same as always). Pass True only for a write
    that's irreversible the instant it happens (live GPS position/track
    streaming) where waiting on the global ENFORCEMENT_MODE=block rollout
    would mean the region-based check is silently inert while an existing,
    unconditional age-based check on the same endpoint is not — an asymmetry
    that would itself undermine the region's rule. See
    routes/sessions.py::log_session_event / _require_effective_rung.
    """
    from fastapi import HTTPException, status as _status

    try:
        result = await enforce_on_submission(
            student_id=student_id, data_type=data_type, evidence_types=evidence_types, db=db,
            activity_id=activity_id,
        )
        # BUG FIX (2026-09-12, PRIVACY_BUGFIX_PLAN.md Bug 3): compute the
        # REAL, actually-applied outcome BEFORE writing the audit row, not
        # after. result.status alone (mode="log"/"warn") can say "ALLOWED"/
        # "WARNING" while should_block below is about to raise a real 403
        # via force_block_on_would_block -- the audit write used to run
        # first and record result.status verbatim, so compliance_status
        # could read "ALLOWED" for a request that was, two lines later,
        # genuinely blocked. effective_status is what actually happened to
        # this request; pass it through so the two can never disagree.
        should_block = result.status == "BLOCKED" or (force_block_on_would_block and result.would_block)
        effective_status = "BLOCKED" if should_block else result.status
        if db is not None:
            await _record_enforcement_audit(
                result=result,
                student_id=student_id,
                actor_role=actor_role,
                action=action or f"ENFORCE_{data_type.upper()}",
                data_type=data_type,
                evidence_types=evidence_types,
                notes=notes,
                activity_id=activity_id,
                override_status=effective_status,
            )
        if should_block:
            raise HTTPException(
                status_code=_status.HTTP_403_FORBIDDEN,
                detail=result.blocking_reason or "Submission blocked by privacy policy",
            )
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"Pre-write enforcement check failed (allowing): {exc}")
        return None


async def audit_submission(
    student_id: str,
    actor_role: str,
    action: str,
    data_type: str,
    db: AsyncSession,
    evidence_types: Optional[List[str]] = None,
    notes: Optional[str] = None,
) -> None:
    """
    Post-write, log-only privacy audit — same non-blocking pattern as
    enforce_or_raise's pre-write call in add_evidence_capture. Never raises;
    a failure here must not undo an already-committed write. Deliberately
    re-evaluates enforce_on_submission() rather than reusing whatever
    enforce_or_raise() saw pre-write, in case anything relevant (consent
    granted, jurisdiction changed) changed between the gate and the commit.
    """
    try:
        result = await enforce_on_submission(
            student_id=student_id, data_type=data_type, evidence_types=evidence_types, db=db,
        )
        await _record_enforcement_audit(
            result=result,
            student_id=student_id,
            actor_role=actor_role,
            action=action,
            data_type=data_type,
            evidence_types=evidence_types,
            notes=notes,
        )
    except Exception as exc:
        logger.warning(f"Privacy audit failed (non-blocking): {exc}")


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
        timestamp=datetime.utcnow(),
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

        collected_raw = activity_data.get("data_collection", []) or []
        collected = {str(c).lower() for c in collected_raw}

        # ── DATA-DRIVEN checks (rules are DATA, not code) ─────────────────────
        # The original hardcoded COPPA/GDPR branches are replaced by reading the
        # rule_definition stashed in config.metadata["_rule_definition"] by
        # _deserialise_jurisdiction. If the rich definition isn't present we fall
        # back to the two legacy checks so behaviour never regresses.
        rule_def = (config.metadata or {}).get("_rule_definition")
        if rule_def:
            # 1. prohibited_data_collection is keyed by age-category name; find
            #    the category matching this student's age and flag any overlap.
            age_cats = rule_def.get("student_age_categories", {}) or {}
            prohibited = rule_def.get("prohibited_data_collection", {}) or {}
            for cat_name, bounds in age_cats.items():
                try:
                    lo, hi = int(bounds.get("min_age", 0)), int(bounds.get("max_age", 150))
                except (AttributeError, TypeError, ValueError):
                    continue
                if lo <= student_age <= hi:
                    banned = {str(x).lower() for x in prohibited.get(cat_name, [])}
                    # Match loosely: any collected category that is a substring of,
                    # or contains, a banned token (e.g. "location" vs "exact_location_continuous").
                    for c in collected:
                        if any(c in b or b in c for b in banned):
                            sev = "error"
                            checks = rule_def.get("compliance_checks", {}) or {}
                            msg = f"{config.framework.value.upper()}: '{c}' not permitted for age {student_age} ({cat_name})"
                            (issues if sev == "error" else warnings).append(msg)
            # 2. special_restrictions with allowed=False → warn/deny.
            for name, spec in (rule_def.get("special_restrictions", {}) or {}).items():
                if isinstance(spec, dict) and spec.get("allowed") is False:
                    key = name.lower().replace("_", "")
                    if any(key in c.replace("_", "") or c.replace("_", "") in key for c in collected):
                        issues.append(
                            f"{config.framework.value.upper()}: {name.replace('_',' ')} restricted "
                            f"({spec.get('exception') or 'no exception'})"
                        )
        else:
            # Legacy fallback (no rich definition available).
            if student_age < 13 and config.framework == PrivacyFramework.COPPA:
                if collected & {"behavioral", "location"}:
                    issues.append("COPPA: Cannot collect behavioral/location data from under-13 students")
            if student_age < 16 and config.framework == PrivacyFramework.GDPR:
                if "special" in collected:
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
# Publish-time compliance check — per-org jurisdiction resolution
# ─────────────────────────────────────────────────────────────────────────────

async def check_activity_compliance_for_org(
    teacher_id: str,
    activity_id: str,
    activity_data: Dict[str, Any],
    student_age_proxy: int,
    checker: "PrivacyComplianceChecker",
    db: AsyncSession,
) -> Tuple[bool, List[str], List[str]]:
    """Publish-time compliance check, correctly scoped to the ACTIVITY'S OWN
    org (via its teacher) instead of the single process-wide
    settings.ACTIVE_JURISDICTION every org was being checked against before
    (PRIVACY_BUGFIX_PLAN.md Bug 1).

    Resolves the applicable jurisdiction ids for `teacher_id` via
    identify_jurisdiction() -- exactly like enforce_on_submission() does when
    no explicit jurisdiction_id is supplied -- then checks EACH resolved
    jurisdiction individually via checker.check_activity_compliance() and
    unions the results (strictest wins: if ANY applicable jurisdiction
    raises a genuine issue, the aggregate does too), per this module's own
    "strictest-wins" design principle (see module docstring).

    Deliberately does NOT go through merge_jurisdictions(): that produces a
    single merged JurisdictionConfig carrying only scalar/boolean
    strictest-wins fields (student_monitoring_allowed, etc.) and drops
    metadata["_rule_definition"] entirely -- but
    check_activity_compliance()'s whole data-driven decision logic reads
    only from a single jurisdiction's own rule_definition
    (config.metadata["_rule_definition"]). A merged config would have
    nothing for it to read.

    Unresolved/unseeded jurisdiction ids are skipped rather than passed to
    check_activity_compliance() (which would just return its own
    "Unknown jurisdiction: ..." sentinel for them) -- this fails open for an
    org whose jurisdiction genuinely isn't seeded yet, matching this
    endpoint's existing fail-open contract, instead of newly hard-blocking
    every publish for jurisdictions nobody has authored rule data for.
    """
    jurisdiction_ids = await identify_jurisdiction(teacher_id, None, db)

    all_issues: List[str] = []
    all_warnings: List[str] = []
    for jid in jurisdiction_ids:
        resolved = resolve_jurisdiction_id(jid, checker.configurations)
        if resolved is None:
            continue  # unseeded jurisdiction -- fail open, not a genuine issue
        _, issues, warnings = checker.check_activity_compliance(
            activity_id, activity_data, student_age_proxy, resolved,
        )
        all_issues.extend(issues)
        all_warnings.extend(warnings)

    return len(all_issues) == 0, all_issues, all_warnings


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
