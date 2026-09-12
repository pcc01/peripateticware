# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Privacy Rules Data Migration — 003
Bugfix for PRIVACY_BUGFIX_PLAN.md Bug 1 ("activity-publish jurisdiction
mismatch — compounding rule-data gap"):
services.privacy_engine.PrivacyComplianceChecker.check_activity_compliance()
only ever produces a genuine issue by reading
rule_def["student_age_categories"], rule_def["prohibited_data_collection"],
and rule_def["special_restrictions"] out of a jurisdiction's rule_definition
(config.metadata["_rule_definition"]) — but 002_seed_privacy_rules.py's
DB-seeded rule_definition payloads never included those three keys for ANY
jurisdiction, so this gate has been structurally unable to produce a real
compliance issue for any org, ever, regardless of which jurisdiction it
checked. This migration copies those three keys from the already-authored,
richer backend/config/jurisdictions/*.json files into the corresponding DB
rows' rule_definition, for jurisdictions that already have a compliance_rules
row (seeded by 002). This is a data-only change (copying already-authored
rule content), not new rule authoring.

Does NOT touch 002_seed_privacy_rules.py itself — migrations are treated as
immutable once applied in this repo's convention (see e.g. add_user_state_code.py,
add_activity_media_fields.py, all of which are new files rather than edits to
earlier ones). This is an additive UPDATE against already-seeded rows.

Scope note — READ BEFORE ASSUMING ALL 11 JURISDICTIONS ARE COVERED:
PRIVACY_BUGFIX_PLAN.md named 11 jurisdictions with rich JSON data authored
(aepd_ar, ccpa_california, coppa_us, ferpa_us, gdpr_eu, lgpd_brazil, lpdc_mx,
pdpa_singapore, pipeda_canada, popia_za, privacy_act_au). Only 6 of those 11
actually have a compliance_rules DB row today — ferpa_us, coppa_us, gdpr_eu,
ccpa_california, lgpd_brazil, pipeda_canada (see 002_seed_privacy_rules.py's
SEED_RULES; confirmed by grepping every migrations/*.py file for
"INSERT INTO compliance_rules" — only 002 does this, for exactly these 6).
The other 5 (aepd_ar, lpdc_mx, pdpa_singapore, popia_za, privacy_act_au) have
an authored JSON file under backend/config/jurisdictions/ but were NEVER
SEEDED into compliance_rules at all: there is no row for this migration to
update, and no org can resolve to them today regardless of this fix
(_load_rules_from_db() only reads active compliance_rules rows — the rich
JSON files are not loaded on this path at all, per the plan's own
"Compounding finding"). That is a separate, pre-existing seed-data gap this
migration does not create and cannot fix without also writing a brand-new
INSERT-based seed for those 5 jurisdictions — flagged explicitly here (and in
the dev agent's report) rather than silently only updating a subset with no
explanation.

ferpa_us's JSON file has empty {} for all three keys (FERPA's rights-transfer
model isn't organized around age-banded prohibited-collection lists the way
COPPA/GDPR/CCPA/LGPD are) — included for completeness/consistency, but
contributes no new prohibited-collection data; ferpa_us's publish-time check
remains unable to produce a genuine issue via this mechanism after this
migration, same as before, which is an accurate reflection of FERPA's actual
rule shape, not a residual bug.

Idempotent: merges (not overwrites) the three keys into the existing
rule_definition dict and recomputes audit_hash the same way
002_seed_privacy_rules.py does (SHA-256 of json.dumps(rule_definition,
sort_keys=True)) — re-running this script after it already succeeded
produces the same merged dict and the same hash, i.e. a no-op UPDATE.

Usage:
    python backend/migrations/003_add_activity_compliance_rule_fields.py

IMPORTANT — Redis cache TTL (flagged by the plan, unresolved by this script):
_get_cached_rules()'s Redis cache (_RULES_CACHE_KEY, 1h TTL,
services/privacy_engine.py) will keep serving the OLD rule_definition
(without these three keys) to any process that already has it cached, until
the TTL expires or something calls invalidate_rules_cache(). This script does
NOT invalidate that cache itself (no reliable Redis context at migration
time in every environment) — after running this in prod, either wait out the
1-hour TTL, or explicitly call
`await services.privacy_engine.invalidate_rules_cache()` once (e.g. from a
one-off admin shell / management command), before assuming the fix is live.
Do NOT rely on POST /privacy/reload-config for this — per
PRIVACY_BUGFIX_PLAN.md's "Compounding finding", that endpoint's effect on the
shared checker singleton is wiped by the very next publish_activity call, so
it is not an equivalent substitute for invalidating the cache that
_get_cached_rules() itself reads from.
"""

import asyncio
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from core.database import get_engine

# Copied verbatim from the corresponding backend/config/jurisdictions/*.json
# files (student_age_categories / prohibited_data_collection /
# special_restrictions keys only) — not new rule authoring, per the plan's
# explicit instruction to copy already-authored data rather than invent new
# rule semantics.
RULE_FIELD_UPDATES = {
    "ferpa_us": {
        "student_age_categories": {},
        "prohibited_data_collection": {},
        "special_restrictions": {},
    },
    "coppa_us": {
        "student_age_categories": {
            "young_child": {"min_age": 0, "max_age": 12},
            "child_boundary": {"min_age": 13, "max_age": 13},
            "teen": {"min_age": 14, "max_age": 17},
            "adult": {"min_age": 18, "max_age": 150},
        },
        "prohibited_data_collection": {
            "young_child": [
                "email_address_persistent", "phone_number", "social_security_number",
                "credit_card_number", "exact_location_continuous",
                "photo_with_identifying_info", "video_with_identifying_info",
                "audio_with_identifying_info",
            ],
            "child_boundary": [],
            "teen": [],
            "adult": [],
        },
        "special_restrictions": {
            "location_data": {
                "allowed": False, "exception": "with_parental_consent",
                "description": "Location tracking generally not allowed for children under 13 without parental consent",
            },
            "photos_videos_audio": {
                "allowed": False, "exception": "anonymous_only",
                "description": "Cannot collect identifiable photos, videos, or audio from children under 13",
            },
            "persistent_identifiers": {
                "allowed": False,
                "description": "Cannot use cookies or persistent identifiers to track children under 13",
            },
        },
    },
    "gdpr_eu": {
        "student_age_categories": {
            "young_child": {"min_age": 0, "max_age": 7},
            "child": {"min_age": 8, "max_age": 13},
            "teen": {"min_age": 14, "max_age": 17},
            "adult": {"min_age": 18, "max_age": 150},
        },
        "prohibited_data_collection": {
            "young_child": [
                "biometric_data", "genetic_data", "health_records",
                "criminal_records", "location_tracking_continuous",
            ],
            "child": [
                "biometric_data", "genetic_data", "health_records",
                "criminal_records", "location_tracking_continuous",
            ],
            "teen": ["genetic_data", "criminal_records"],
            "adult": [],
        },
        "special_restrictions": {
            "location_data": {
                "allowed": True, "requires_explicit_consent": True,
                "requires_processing_agreement": True, "retention_months": 3,
                "description": "Location data highly regulated, short retention required",
            },
            "automatic_decision_making": {
                "allowed": False,
                "description": "Automated decision-making affecting child's educational opportunity prohibited",
            },
            "profiling": {
                "allowed": False,
                "description": "Automated profiling of children prohibited",
            },
        },
    },
    "ccpa_california": {
        "student_age_categories": {
            "minor": {"min_age": 0, "max_age": 17},
            "adult": {"min_age": 18, "max_age": 150},
        },
        "prohibited_data_collection": {
            "minor": ["data_sale_without_parental_consent"],
            "adult": [],
        },
        "special_restrictions": {
            "sensitive_personal_information": {
                "allowed": True, "requires_explicit_consent": True, "retention_months": 6,
                "description": "Sensitive data (SSN, health, etc.) highly restricted",
            },
            "profiling": {
                "allowed": True, "restrictions": "cannot_materially_affect_rights",
                "description": "Cannot use profiling in way that materially affects educational opportunity",
            },
        },
    },
    "lgpd_brazil": {
        "student_age_categories": {
            "child": {"min_age": 0, "max_age": 13},
            "young_adult": {"min_age": 14, "max_age": 17},
            "adult": {"min_age": 18, "max_age": 150},
        },
        "prohibited_data_collection": {
            "child": ["profiling_for_decisions", "automated_decision_making_effects"],
            "young_adult": [],
            "adult": [],
        },
        "special_restrictions": {},
    },
    "pipeda_canada": {
        "student_age_categories": {
            "child": {"min_age": 0, "max_age": 15},
            "young_adult": {"min_age": 16, "max_age": 17},
            "adult": {"min_age": 18, "max_age": 150},
        },
        "prohibited_data_collection": {},
        "special_restrictions": {},
    },
}


def compute_hash(rule_definition: dict) -> str:
    """Identical to 002_seed_privacy_rules.py's compute_hash — SHA-256 of the
    canonical (sorted-key) JSON representation, so a re-run after success is
    a true no-op (same merged dict -> same hash -> same row content, and the
    UPDATE is harmless even if applied twice)."""
    canonical = json.dumps(rule_definition, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def run() -> None:
    async with get_engine().begin() as conn:
        for jurisdiction, new_fields in RULE_FIELD_UPDATES.items():
            row = (await conn.execute(
                text(
                    "SELECT rule_id, rule_definition FROM compliance_rules "
                    "WHERE jurisdiction = :jurisdiction AND is_active = true "
                    "ORDER BY effective_date DESC LIMIT 1"
                ),
                {"jurisdiction": jurisdiction},
            )).first()

            if row is None:
                print(
                    f"  ! No active compliance_rules row for '{jurisdiction}' — skipped "
                    f"(pre-existing seed gap; see this file's module docstring)."
                )
                continue

            rule_id, rule_definition = row
            rule_def = rule_definition if isinstance(rule_definition, dict) else json.loads(rule_definition)

            merged = dict(rule_def)
            merged.update(new_fields)  # only the 3 targeted keys; everything else untouched

            new_hash = compute_hash(merged)

            await conn.execute(
                text(
                    "UPDATE compliance_rules "
                    "SET rule_definition = cast(:rule_definition as jsonb), audit_hash = :audit_hash "
                    "WHERE rule_id = :rule_id"
                ),
                {
                    "rule_definition": json.dumps(merged),
                    "audit_hash": new_hash,
                    "rule_id": rule_id,
                },
            )
            print(
                f"  ✓ Updated {jurisdiction} (rule_id={rule_id}) with "
                f"student_age_categories/prohibited_data_collection/special_restrictions"
            )


if __name__ == "__main__":
    asyncio.run(run())
    print()
    print("Migration 003_add_activity_compliance_rule_fields complete.")
    print(
        "Reminder: invalidate the Redis rules cache (or wait out its 1h TTL) "
        "before assuming this fix is live in prod — see this file's module docstring."
    )
