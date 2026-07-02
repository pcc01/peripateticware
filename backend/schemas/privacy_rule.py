# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Canonical privacy-rule schema (Pydantic v2).

ONE schema, used by all three consumers so a rule means the same thing
everywhere:
  1. services/privacy_config_loader.py  — parses JSON files on disk
  2. services/privacy_engine.py          — deserialises compliance_rules.rule_definition
  3. routes/privacy.py POST /rules       — validates admin-submitted rules (422 on error)

Design goals
------------
- Accept the RICH file format (student_age_categories, consent_requirements,
  prohibited_data_collection, data_retention, compliance_checks, ...).
- Also accept the SPARSE DB-seed format (flat scalars: max_retention_days,
  encryption_required, student_data_sharing_allowed, ...).
- Everything except identity fields is optional with a safe default, so an
  admin can start minimal and grow the rule over time.
- `extra="allow"` keeps forward-compat: unknown keys are preserved, not
  rejected, so adding a new section to a file doesn't require a code change
  before it can be stored (it just won't be enforced until the engine reads it).

To ADD A NEW ENFORCED FIELD: add it here (typed, defaulted), then read it in
privacy_engine. To ADD A NEW JURISDICTION: no code change — drop a JSON file or
POST /rules with a body that validates against this schema. See
docs/ADDING_A_JURISDICTION.md.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# Enum values are lowercase to match services.privacy_engine.PrivacyFramework.
_KNOWN_FRAMEWORKS = {
    "gdpr", "ccpa", "coppa", "ferpa", "pipeda", "lgpd", "pdpa", "appi",
    "privacy_act_au", "dpdp", "pipa", "lfpdppp", "popia", "uae_dp",
    "privacy_act_nz", "il_ppl", "nfadp",
    "eu_ai_act", "us_ai_eo", "us_ca_ai", "cn_ai", "gb_ai", "ca_aida", "sg_ai",
    "custom",
}


class AgeCategory(BaseModel):
    model_config = ConfigDict(extra="allow")
    min_age: int = Field(ge=0, le=150)
    max_age: int = Field(ge=0, le=150)


class ComplianceCheck(BaseModel):
    model_config = ConfigDict(extra="allow")
    required: bool = True
    severity: str = "error"  # "error" | "warning" | "info"
    description: Optional[str] = None
    required_for_ages: Optional[List[int]] = None  # e.g. [0, 12]

    @field_validator("severity")
    @classmethod
    def _severity_valid(cls, v: str) -> str:
        allowed = {"error", "warning", "info"}
        if v not in allowed:
            raise ValueError(f"severity must be one of {sorted(allowed)}, got '{v}'")
        return v


class RetentionEntry(BaseModel):
    model_config = ConfigDict(extra="allow")
    retention_months: Optional[int] = Field(default=None, ge=0)
    deletion_method: Optional[str] = None
    archival_allowed: bool = False


class PrivacyRule(BaseModel):
    """The canonical, validated representation of one jurisdiction's rules."""

    model_config = ConfigDict(extra="allow")

    # ── Identity (required) ──────────────────────────────────────────────────
    jurisdiction_id: str = Field(min_length=1)
    jurisdiction_name: str = Field(min_length=1)
    country_code: str = Field(min_length=2, max_length=8)
    framework: str = "custom"

    # ── Identity (optional) ──────────────────────────────────────────────────
    subdivision_code: Optional[str] = None
    version: str = "1.0"
    description: Optional[str] = None
    effective_date: Optional[str] = None
    sunset_date: Optional[str] = None
    last_updated: Optional[str] = None

    # ── Rich sections (file format) ──────────────────────────────────────────
    student_age_categories: Dict[str, AgeCategory] = Field(default_factory=dict)
    consent_requirements: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    prohibited_data_collection: Dict[str, List[str]] = Field(default_factory=dict)
    allowed_data_collection: Dict[str, List[str]] = Field(default_factory=dict)
    third_party_restrictions: Dict[str, List[str]] = Field(default_factory=dict)
    data_retention: Dict[str, RetentionEntry] = Field(default_factory=dict)
    compliance_checks: Dict[str, ComplianceCheck] = Field(default_factory=dict)
    special_restrictions: Dict[str, Any] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    requirements: List[str] = Field(default_factory=list)

    # ── Flat scalars (DB-seed format + strictest-merge inputs) ───────────────
    max_retention_days: int = Field(default=365, ge=0)
    encryption_required: bool = False
    encryption_algorithm: str = "AES-256"
    student_data_sharing_allowed: bool = False
    student_monitoring_allowed: bool = False
    student_profiling_allowed: bool = False
    student_targeting_allowed: bool = False
    requires_privacy_impact_assessment: bool = False
    requires_data_protection_officer: bool = False
    requires_incident_reporting: bool = True
    incident_reporting_days: int = Field(default=72, ge=0)
    requires_breach_notification: bool = True
    breach_notification_threshold: int = Field(default=10, ge=0)

    metadata: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("framework")
    @classmethod
    def _framework_known(cls, v: str) -> str:
        v = str(v).lower()
        if v not in _KNOWN_FRAMEWORKS:
            # Don't hard-fail — unknown frameworks are allowed as "custom" so a
            # new law can be added before the enum is updated. Normalise instead.
            return "custom"
        return v

    @field_validator(
        "max_retention_days", "incident_reporting_days", "breach_notification_threshold",
        mode="before",
    )
    @classmethod
    def _none_to_default(cls, v, info):
        # Some source baselines legitimately carry null (e.g. GDPR has no fixed
        # retention cap → max_retention_days: None). Coerce null to the field's
        # default so the value is still ingestible and downstream min()/merge
        # math never sees None. The default is conservative (a finite cap).
        if v is None:
            return cls.model_fields[info.field_name].default
        return v

    def effective_max_retention_days(self) -> int:
        """Prefer the richest source: min over data_retention if present, else the flat scalar."""
        months = [e.retention_months for e in self.data_retention.values() if e.retention_months is not None]
        if months:
            return min(min(months) * 30, self.max_retention_days)
        return self.max_retention_days

    def parental_consent_age_ceiling(self) -> Optional[int]:
        """Highest max_age among age categories whose consent requires parental consent."""
        ceiling: Optional[int] = None
        for cat_name, req in self.consent_requirements.items():
            if not isinstance(req, dict):
                continue
            if req.get("parental_consent_required"):
                cat = self.student_age_categories.get(cat_name)
                if cat is not None:
                    ceiling = cat.max_age if ceiling is None else max(ceiling, cat.max_age)
        return ceiling


def validate_rule_definition(data: Dict[str, Any]) -> PrivacyRule:
    """Validate a raw dict against the canonical schema. Raises pydantic ValidationError."""
    return PrivacyRule.model_validate(data)
