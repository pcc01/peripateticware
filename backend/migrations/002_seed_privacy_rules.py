# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Privacy Rules Seed — 002
Inserts one active compliance_rules row for each supported jurisdiction:
  FERPA  (US Federal)
  COPPA  (US Federal, children under 13)
  GDPR   (European Union)
  CCPA   (California, USA)
  LGPD   (Brazil)
  PIPEDA (Canada)

Run this script once after applying migration 20260527_privacy_engine_tables:
  python backend/migrations/002_seed_privacy_rules.py

The script is idempotent — it uses INSERT … ON CONFLICT DO NOTHING.
Rules are data, not code: update them through the admin UI or POST
/api/v1/privacy/rules without touching this file.
"""

import asyncio
import uuid
import hashlib
import json
import os
import sys
from datetime import datetime

# Allow running from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://peripateticware_user:peripateticware_secure_password_dev@postgres:5432/peripateticware",
)

# ─────────────────────────────────────────────────────────────────────────────
# Rule definitions
# Each dict is the full rule_definition JSONB column value.
# Schema mirrors JurisdictionConfig from privacy_engine.py.
# ─────────────────────────────────────────────────────────────────────────────

SEED_RULES = [
    # ── FERPA ─────────────────────────────────────────────────────────────────
    {
        "rule_id": "FERPA-1974-US-FEDERAL-v2.1",
        "regulation_id": "FERPA-1974-US-FEDERAL",
        "version": "2.1",
        "jurisdiction": "US_FEDERAL",
        "effective_date": "2024-11-01T00:00:00Z",
        "rule_definition": {
            "jurisdiction_id": "US_FEDERAL",
            "jurisdiction_name": "United States Federal — FERPA",
            "framework": "ferpa",
            "country_code": "US",
            "description": "Family Educational Rights and Privacy Act. Protects student education records. Applies to all schools receiving federal funding.",
            "age_threshold_parental_consent": 18,
            "consent_rules": [
                {
                    "data_categories": ["educational", "behavioral"],
                    "age_groups": ["under_18", "adult"],
                    "consent_type": "none_required",
                    "requires_parental_consent": False,
                    "note": "FERPA uses rights transfer, not consent-based model. Parents have rights until student turns 18."
                }
            ],
            "processing_rules": [
                {
                    "data_categories": ["educational", "behavioral", "identity"],
                    "allowed_purposes": ["lesson_delivery", "grading", "assessment", "administrative"],
                    "forbidden_purposes": ["commercial_advertising", "third_party_sale"],
                    "requires_explicit_purpose": True,
                    "data_minimization": True,
                    "purpose_limitation": True
                }
            ],
            "retention_policies": {
                "educational": {"duration_days": 3650, "purpose": "Educational records", "deletion_method": "crypto_erasure", "can_archive": True, "archive_duration_days": 1825},
                "behavioral": {"duration_days": 1095, "purpose": "Behavioral tracking", "deletion_method": "purge", "can_archive": False}
            },
            "rights_rules": [
                {"right_name": "access", "must_comply_within_days": 45, "can_charge": True, "exemptions": []},
                {"right_name": "amendment", "must_comply_within_days": 30, "can_charge": False, "exemptions": ["legitimate_educational_interest"]},
                {"right_name": "deletion", "must_comply_within_days": 30, "can_charge": False, "exemptions": ["audit_records"]}
            ],
            "student_data_sharing_allowed": False,
            "student_monitoring_allowed": False,
            "student_profiling_allowed": False,
            "student_targeting_allowed": False,
            "requires_breach_notification": True,
            "breach_notification_threshold": 1,
            "requires_incident_reporting": True,
            "incident_reporting_days": 72,
            "encryption_required": False,
            "encryption_algorithm": None,
            "audit_log_retention_days": 3650
        },
        "change_log": "Initial seed — FERPA annual review 2024, no substantive changes from v2.0",
        "created_by": "seed_script"
    },

    # ── COPPA ─────────────────────────────────────────────────────────────────
    {
        "rule_id": "COPPA-1998-US-FEDERAL-v1.4",
        "regulation_id": "COPPA-1998-US-FEDERAL",
        "version": "1.4",
        "jurisdiction": "US_FEDERAL_COPPA",
        "effective_date": "2013-07-01T00:00:00Z",
        "rule_definition": {
            "jurisdiction_id": "US_FEDERAL_COPPA",
            "jurisdiction_name": "United States Federal — COPPA",
            "framework": "coppa",
            "country_code": "US",
            "description": "Children's Online Privacy Protection Act. Applies to users under age 13. Requires verifiable parental consent before collecting personal data.",
            "age_threshold_parental_consent": 13,
            "consent_rules": [
                {
                    "data_categories": ["identity", "contact", "location", "behavioral", "biometric"],
                    "age_groups": ["under_13"],
                    "consent_type": "explicit",
                    "requires_parental_consent": True,
                    "parental_age_threshold": 13,
                    "consent_withdrawal_allowed": True,
                    "transparency_required": True,
                    "note": "Verifiable parental consent required before any personal data collection from under-13 users."
                }
            ],
            "processing_rules": [
                {
                    "data_categories": ["identity", "contact", "location", "behavioral"],
                    "allowed_purposes": ["lesson_delivery", "account_management"],
                    "forbidden_purposes": ["behavioral_advertising", "profiling", "third_party_sharing", "commercial_targeting"],
                    "requires_explicit_purpose": True,
                    "data_minimization": True,
                    "purpose_limitation": True,
                    "max_processors": 1
                }
            ],
            "retention_policies": {
                "identity": {"duration_days": 365, "purpose": "Account maintenance", "deletion_method": "purge", "can_archive": False},
                "location": {"duration_days": 30, "purpose": "Activity geolocation", "deletion_method": "purge", "can_archive": False},
                "behavioral": {"duration_days": 180, "purpose": "Learning progress", "deletion_method": "anonymize", "can_archive": False}
            },
            "rights_rules": [
                {"right_name": "parental_access", "must_comply_within_days": 30, "can_charge": False, "exemptions": []},
                {"right_name": "deletion", "must_comply_within_days": 10, "can_charge": False, "exemptions": []},
                {"right_name": "consent_withdrawal", "must_comply_within_days": 5, "can_charge": False, "exemptions": []}
            ],
            "student_data_sharing_allowed": False,
            "student_monitoring_allowed": False,
            "student_profiling_allowed": False,
            "student_targeting_allowed": False,
            "requires_breach_notification": True,
            "breach_notification_threshold": 1,
            "location_data_restricted": True,
            "audio_video_restricted": True,
            "encryption_required": False,
            "audit_log_retention_days": 1825
        },
        "change_log": "Initial seed — FTC 2013 rule update incorporated",
        "created_by": "seed_script"
    },

    # ── GDPR ──────────────────────────────────────────────────────────────────
    {
        "rule_id": "GDPR-2018-EU-v1.0",
        "regulation_id": "GDPR-2018-EU",
        "version": "1.0",
        "jurisdiction": "EU",
        "effective_date": "2018-05-25T00:00:00Z",
        "rule_definition": {
            "jurisdiction_id": "EU",
            "jurisdiction_name": "European Union — GDPR",
            "framework": "gdpr",
            "country_code": "EU",
            "description": "General Data Protection Regulation. Applies to processing of personal data of EU residents regardless of where the processor is located.",
            "age_threshold_parental_consent": 16,
            "gdpr_applies": True,
            "eu_ai_act_applies": True,
            "consent_rules": [
                {
                    "data_categories": ["identity", "contact", "location", "biometric", "health", "special"],
                    "age_groups": ["under_16", "adult"],
                    "consent_type": "explicit",
                    "requires_parental_consent": True,
                    "parental_age_threshold": 16,
                    "consent_withdrawal_allowed": True,
                    "transparency_required": True
                }
            ],
            "processing_rules": [
                {
                    "data_categories": ["identity", "contact", "location", "behavioral", "educational"],
                    "allowed_purposes": ["lesson_delivery", "assessment", "account_management", "safety"],
                    "forbidden_purposes": ["commercial_profiling", "behavioral_advertising", "unauthorized_transfer"],
                    "requires_explicit_purpose": True,
                    "data_minimization": True,
                    "purpose_limitation": True,
                    "lawful_basis_required": True,
                    "lawful_bases": ["consent", "legitimate_interest", "legal_obligation"]
                }
            ],
            "transfer_rules": [
                {
                    "allowed_destinations": ["EU", "EEA", "UK", "adequacy_decision_countries"],
                    "requires_model_clauses": True,
                    "requires_adequacy_decision": True,
                    "requires_consent": True,
                    "anonymization_required": False
                }
            ],
            "retention_policies": {
                "identity": {"duration_days": 1095, "purpose": "Account lifecycle", "deletion_method": "crypto_erasure", "can_archive": False},
                "educational": {"duration_days": 1095, "purpose": "Educational records", "deletion_method": "anonymize", "can_archive": True, "archive_duration_days": 730},
                "location": {"duration_days": 90, "purpose": "Activity geolocation", "deletion_method": "purge", "can_archive": False},
                "behavioral": {"duration_days": 365, "purpose": "Learning analytics", "deletion_method": "anonymize", "can_archive": False}
            },
            "rights_rules": [
                {"right_name": "access",       "must_comply_within_days": 30, "can_charge": False, "exemptions": []},
                {"right_name": "rectification", "must_comply_within_days": 30, "can_charge": False, "exemptions": []},
                {"right_name": "erasure",       "must_comply_within_days": 30, "can_charge": False, "exemptions": ["legal_obligation", "public_interest"]},
                {"right_name": "portability",   "must_comply_within_days": 30, "can_charge": False, "exemptions": []},
                {"right_name": "objection",     "must_comply_within_days": 30, "can_charge": False, "exemptions": ["legitimate_interest"]}
            ],
            "requires_privacy_impact_assessment": True,
            "requires_data_protection_officer": True,
            "requires_breach_notification": True,
            "breach_notification_threshold": 1,
            "requires_incident_reporting": True,
            "incident_reporting_days": 72,
            "student_data_sharing_allowed": False,
            "student_profiling_allowed": False,
            "student_targeting_allowed": False,
            "encryption_required": True,
            "encryption_algorithm": "AES-256",
            "data_residency_region": "eu-west-1",
            "audit_log_retention_days": 1095
        },
        "change_log": "Initial seed — GDPR Art. 5, 6, 7, 12–23, 25, 32, 33",
        "created_by": "seed_script"
    },

    # ── CCPA ──────────────────────────────────────────────────────────────────
    {
        "rule_id": "CCPA-2020-US-CA-v3.1",
        "regulation_id": "CCPA-2020-US-CA",
        "version": "3.1",
        "jurisdiction": "US_CA",
        "effective_date": "2020-01-01T00:00:00Z",
        "rule_definition": {
            "jurisdiction_id": "US_CA",
            "jurisdiction_name": "California, USA — CCPA/CPRA",
            "framework": "ccpa",
            "country_code": "US",
            "subdivision_code": "CA",
            "description": "California Consumer Privacy Act + California Privacy Rights Act amendments. Applies to for-profit businesses collecting personal information of California residents.",
            "age_threshold_parental_consent": 16,
            "consent_rules": [
                {
                    "data_categories": ["identity", "contact", "location", "behavioral", "biometric"],
                    "age_groups": ["under_16", "adult"],
                    "consent_type": "explicit",
                    "requires_parental_consent": True,
                    "parental_age_threshold": 13,
                    "consent_withdrawal_allowed": True,
                    "opt_out_sale_required": True
                }
            ],
            "processing_rules": [
                {
                    "data_categories": ["identity", "contact", "location", "behavioral"],
                    "allowed_purposes": ["lesson_delivery", "assessment", "account_management", "service_improvement"],
                    "forbidden_purposes": ["sale_to_third_parties", "targeted_advertising", "profiling_for_decisions"],
                    "requires_explicit_purpose": True,
                    "data_minimization": True,
                    "purpose_limitation": True
                }
            ],
            "retention_policies": {
                "identity": {"duration_days": 1095, "purpose": "Account management", "deletion_method": "crypto_erasure", "can_archive": False},
                "educational": {"duration_days": 1095, "purpose": "CA Education Code 3-year requirement", "deletion_method": "anonymize", "can_archive": True, "archive_duration_days": 730},
                "location": {"duration_days": 365, "purpose": "Geolocation services", "deletion_method": "purge", "can_archive": False},
                "behavioral": {"duration_days": 365, "purpose": "Learning analytics", "deletion_method": "anonymize", "can_archive": False}
            },
            "rights_rules": [
                {"right_name": "know",       "must_comply_within_days": 45, "can_charge": False, "exemptions": []},
                {"right_name": "deletion",   "must_comply_within_days": 45, "can_charge": False, "exemptions": ["legal_obligation", "security"]},
                {"right_name": "opt_out",    "must_comply_within_days": 15, "can_charge": False, "exemptions": []},
                {"right_name": "non_discrimination", "must_comply_within_days": 1, "can_charge": False, "exemptions": []}
            ],
            "student_data_sharing_allowed": False,
            "student_profiling_allowed": False,
            "student_targeting_allowed": False,
            "requires_breach_notification": True,
            "breach_notification_threshold": 500,
            "requires_incident_reporting": True,
            "incident_reporting_days": 72,
            "encryption_required": True,
            "encryption_algorithm": "AES-256",
            "data_residency_region": "us-west-2",
            "audit_log_retention_days": 1095,
            "privacy_policy_required": True,
            "do_not_sell_link_required": True
        },
        "change_log": "v3.1 — CPRA amendments effective Jan 2023 incorporated",
        "created_by": "seed_script"
    },

    # ── LGPD ──────────────────────────────────────────────────────────────────
    {
        "rule_id": "LGPD-2020-BR-v1.0",
        "regulation_id": "LGPD-2020-BR",
        "version": "1.0",
        "jurisdiction": "BR",
        "effective_date": "2020-09-18T00:00:00Z",
        "rule_definition": {
            "jurisdiction_id": "BR",
            "jurisdiction_name": "Brazil — LGPD",
            "framework": "lgpd",
            "country_code": "BR",
            "description": "Lei Geral de Proteção de Dados. Brazil's comprehensive data protection law, closely modelled on GDPR.",
            "age_threshold_parental_consent": 18,
            "consent_rules": [
                {
                    "data_categories": ["identity", "contact", "location", "behavioral", "biometric", "health"],
                    "age_groups": ["under_18", "adult"],
                    "consent_type": "explicit",
                    "requires_parental_consent": True,
                    "parental_age_threshold": 18,
                    "consent_withdrawal_allowed": True,
                    "transparency_required": True
                }
            ],
            "processing_rules": [
                {
                    "data_categories": ["identity", "contact", "location", "behavioral", "educational"],
                    "allowed_purposes": ["lesson_delivery", "assessment", "account_management", "legal_obligation"],
                    "forbidden_purposes": ["unauthorized_profiling", "sale_to_third_parties"],
                    "requires_explicit_purpose": True,
                    "data_minimization": True,
                    "purpose_limitation": True
                }
            ],
            "retention_policies": {
                "identity": {"duration_days": 1825, "purpose": "Account lifecycle", "deletion_method": "crypto_erasure", "can_archive": False},
                "educational": {"duration_days": 1825, "purpose": "Educational records", "deletion_method": "anonymize", "can_archive": True, "archive_duration_days": 1095},
                "location": {"duration_days": 90, "purpose": "Activity geolocation", "deletion_method": "purge", "can_archive": False}
            },
            "rights_rules": [
                {"right_name": "access",       "must_comply_within_days": 15, "can_charge": False, "exemptions": []},
                {"right_name": "correction",   "must_comply_within_days": 15, "can_charge": False, "exemptions": []},
                {"right_name": "deletion",     "must_comply_within_days": 15, "can_charge": False, "exemptions": ["legal_obligation"]},
                {"right_name": "portability",  "must_comply_within_days": 15, "can_charge": False, "exemptions": []},
                {"right_name": "information",  "must_comply_within_days": 15, "can_charge": False, "exemptions": []}
            ],
            "requires_data_protection_officer": True,
            "requires_breach_notification": True,
            "breach_notification_threshold": 1,
            "incident_reporting_days": 72,
            "student_data_sharing_allowed": False,
            "student_profiling_allowed": False,
            "encryption_required": True,
            "encryption_algorithm": "AES-256",
            "data_residency_region": "sa-east-1",
            "audit_log_retention_days": 1825
        },
        "change_log": "Initial seed — LGPD enforcement began Aug 2021",
        "created_by": "seed_script"
    },

    # ── PIPEDA ────────────────────────────────────────────────────────────────
    {
        "rule_id": "PIPEDA-2001-CA-v1.0",
        "regulation_id": "PIPEDA-2001-CA",
        "version": "1.0",
        "jurisdiction": "CA_FEDERAL",
        "effective_date": "2004-01-01T00:00:00Z",
        "rule_definition": {
            "jurisdiction_id": "CA_FEDERAL",
            "jurisdiction_name": "Canada Federal — PIPEDA",
            "framework": "pipeda",
            "country_code": "CA",
            "description": "Personal Information Protection and Electronic Documents Act. Canada's federal private-sector privacy law. Requires meaningful consent for collection, use, and disclosure.",
            "age_threshold_parental_consent": 18,
            "consent_rules": [
                {
                    "data_categories": ["identity", "contact", "location", "behavioral", "educational"],
                    "age_groups": ["under_18", "adult"],
                    "consent_type": "explicit",
                    "requires_parental_consent": True,
                    "parental_age_threshold": 18,
                    "consent_withdrawal_allowed": True,
                    "meaningful_consent_required": True
                }
            ],
            "processing_rules": [
                {
                    "data_categories": ["identity", "contact", "location", "behavioral", "educational"],
                    "allowed_purposes": ["lesson_delivery", "assessment", "account_management"],
                    "forbidden_purposes": ["undisclosed_purpose", "sale_without_consent"],
                    "requires_explicit_purpose": True,
                    "data_minimization": True,
                    "purpose_limitation": True
                }
            ],
            "retention_policies": {
                "identity": {"duration_days": 2555, "purpose": "Account lifecycle", "deletion_method": "purge", "can_archive": False},
                "educational": {"duration_days": 2555, "purpose": "Educational records", "deletion_method": "anonymize", "can_archive": True, "archive_duration_days": 1825},
                "location": {"duration_days": 365, "purpose": "Activity geolocation", "deletion_method": "purge", "can_archive": False},
                "behavioral": {"duration_days": 2555, "purpose": "Learning analytics", "deletion_method": "anonymize", "can_archive": True}
            },
            "rights_rules": [
                {"right_name": "access",     "must_comply_within_days": 30, "can_charge": True, "charge_amount": 0, "exemptions": []},
                {"right_name": "correction", "must_comply_within_days": 30, "can_charge": False, "exemptions": []},
                {"right_name": "complaint",  "must_comply_within_days": 1,  "can_charge": False, "exemptions": []}
            ],
            "requires_privacy_impact_assessment": False,
            "requires_breach_notification": True,
            "breach_notification_threshold": 1,
            "incident_reporting_days": 72,
            "student_data_sharing_allowed": False,
            "student_profiling_allowed": False,
            "encryption_required": False,
            "encryption_algorithm": None,
            "data_residency_region": "ca-central-1",
            "audit_log_retention_days": 2555
        },
        "change_log": "Initial seed — PIPEDA 10 Fair Information Principles",
        "created_by": "seed_script"
    },
]


def compute_hash(rule_definition: dict) -> str:
    """SHA-256 of the canonical JSON representation of rule_definition."""
    canonical = json.dumps(rule_definition, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def seed(engine) -> None:
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        for rule in SEED_RULES:
            rule_def = rule["rule_definition"]
            audit_hash = compute_hash(rule_def)

            await session.execute(
                text("""
                    INSERT INTO compliance_rules (
                        rule_id, regulation_id, version, jurisdiction,
                        effective_date, rule_definition, created_by,
                        change_log, is_active, audit_hash
                    ) VALUES (
                        :rule_id, :regulation_id, :version, :jurisdiction,
                        :effective_date, cast(:rule_definition as jsonb), :created_by,
                        :change_log, true, :audit_hash
                    )
                    ON CONFLICT (rule_id) DO NOTHING
                """),
                {
                    "rule_id": str(uuid.uuid5(uuid.NAMESPACE_DNS, rule["rule_id"])),
                    "regulation_id": rule["regulation_id"],
                    "version": rule["version"],
                    "jurisdiction": rule["jurisdiction"],
                    "effective_date": datetime.fromisoformat(rule["effective_date"].replace("Z", "")),
                    "rule_definition": json.dumps(rule_def),
                    "created_by": rule["created_by"],
                    "change_log": rule["change_log"],
                    "audit_hash": audit_hash,
                },
            )
            print(f"  ✓ Seeded: {rule['rule_id']}")

        await session.commit()


async def main() -> None:
    print("Peripateticware — Privacy Rules Seed (002)")
    print(f"Target DB: {DATABASE_URL.split('@')[-1]}")
    print()

    engine = create_async_engine(DATABASE_URL, echo=False)

    try:
        await seed(engine)
        print()
        print(f"✅ {len(SEED_RULES)} jurisdiction rules seeded successfully.")
    except Exception as exc:
        print(f"❌ Seed failed: {exc}")
        raise
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
