# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
seed_privacy_jurisdictions(db, org_id)

Derives the list of applicable privacy jurisdiction IDs for a newly-created
organisation based on its country_code, subdivision_code, has_under_13_students,
and org_type_v2.  Writes the result to organizations.privacy_jurisdiction_ids
and upserts a UserPrivacyPreference row for the org owner.

Called automatically by signup_service.create_user_and_org() at the end of
every TEACHER / HOMESCHOOL signup.

JURISDICTION_MAP covers:
  US (non-CA) + has_under_13      → coppa_us
  US (non-CA) + has_under_13 + school → coppa_us, ferpa_us
  US-CA + has_under_13            → coppa_us, ccpa_california (+ ferpa_us if school)
  EU member states                → gdpr_eu
  GB                              → gdpr_eu (UK GDPR; uses same config)
  CA (Canada)                     → pipeda_canada
  BR                              → lgpd_brazil
  SG                              → pdpa_singapore
  ZA                              → popia_za
  MX                              → lpdc_mx
  AR                              → aepd_ar
  Elsewhere + has_under_13        → coppa_us (conservative fallback for child safety)

A jurisdiction_id is only included if the corresponding config file exists under
backend/config/jurisdictions/{id}.json OR the compliance_rules table has a rule
with regulation_id matching the jurisdiction_id.  Missing IDs are logged and
skipped — never crash a signup.

OQ-4 resolution: A minimal ferpa_us.json is created by this module on first
import if it doesn't exist (see _ensure_ferpa_config() below).
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ── EU country codes (ISO 3166-1 alpha-2) ─────────────────────────────────────
EU_COUNTRIES = frozenset([
    'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI',
    'FR','GR','HR','HU','IE','IT','LT','LU','LV','MT',
    'NL','PL','PT','RO','SE','SI','SK',
])

# ── Path to jurisdiction config files ─────────────────────────────────────────
_CONFIG_DIR = os.path.join(os.path.dirname(__file__), '..', 'config', 'jurisdictions')

# ── Minimal FERPA config (created on first import if absent) ──────────────────
_FERPA_CONFIG = {
    "jurisdiction_id":  "ferpa_us",
    "name":             "FERPA",
    "full_name":        "Family Educational Rights and Privacy Act",
    "country_code":     "US",
    "subdivision_code": None,
    "applies_to":       ["school", "district"],
    "framework":        "ferpa",
    "description":      (
        "FERPA protects the privacy of student education records at "
        "institutions receiving federal funding. Grants parents/eligible "
        "students the right to access and correct records."
    ),
    "key_requirements": [
        "Annual notification of FERPA rights",
        "Written consent before disclosing PII from education records",
        "Right to review and request amendment of records",
        "Directory information policy",
    ],
    "data_categories_covered": ["education_records", "student_pii", "academic_performance"],
    "ai_student_permitted": True,
    "ai_teacher_permitted": True,
}


def _ensure_ferpa_config() -> None:
    """Create a minimal ferpa_us.json if it does not exist."""
    path = os.path.join(_CONFIG_DIR, 'ferpa_us.json')
    if not os.path.exists(path):
        try:
            os.makedirs(_CONFIG_DIR, exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(_FERPA_CONFIG, f, indent=2)
            logger.info("[privacy_seeder] Created minimal ferpa_us.json")
        except OSError as e:
            logger.warning(f"[privacy_seeder] Could not write ferpa_us.json: {e}")


# Ensure FERPA config exists when module is first imported
_ensure_ferpa_config()


def _config_exists(jurisdiction_id: str) -> bool:
    """Return True if a config JSON file exists for this jurisdiction_id."""
    path = os.path.join(_CONFIG_DIR, f'{jurisdiction_id}.json')
    return os.path.exists(path)


async def _rule_exists(db: AsyncSession, jurisdiction_id: str) -> bool:
    """Return True if any compliance_rule references this jurisdiction_id."""
    try:
        row = (await db.execute(
            text("SELECT 1 FROM compliance_rules WHERE jurisdiction = :jid LIMIT 1"),
            {"jid": jurisdiction_id},
        )).first()
        return row is not None
    except Exception:
        return False


async def _verify_jurisdictions(db: AsyncSession, ids: List[str]) -> List[str]:
    """
    Filter the list to only jurisdiction IDs that have a config file OR
    a compliance_rule row.  Unknown IDs are logged and dropped.
    """
    verified = []
    for jid in ids:
        if _config_exists(jid):
            verified.append(jid)
        elif await _rule_exists(db, jid):
            verified.append(jid)
        else:
            logger.warning(
                f"[privacy_seeder] Jurisdiction '{jid}' not found in config files "
                f"or compliance_rules — skipping"
            )
    return verified


def _derive_jurisdiction_ids(
    country_code:      Optional[str],
    subdivision_code:  Optional[str],
    has_under_13:      bool,
    org_type_v2:       Optional[str],
) -> List[str]:
    """
    Pure function — returns the list of applicable jurisdiction IDs given
    organisation attributes.  Does NOT check whether the configs exist.
    """
    cc   = (country_code or '').upper()
    sub  = (subdivision_code or '').upper()   # e.g. 'US-CA'
    is_school = org_type_v2 in ('school', 'district', 'enterprise')
    ids: List[str] = []

    if cc == 'US':
        is_california = sub in ('US-CA', 'CA')
        if has_under_13:
            ids.append('coppa_us')
        if is_school:
            ids.append('ferpa_us')
        if is_california:
            ids.append('ccpa_california')

    elif cc == 'GB':
        # UK GDPR — use the EU GDPR config for now
        ids.append('gdpr_eu')

    elif cc == 'CA':
        ids.append('pipeda_canada')

    elif cc == 'BR':
        ids.append('lgpd_brazil')

    elif cc == 'AU':
        ids.append('privacy_act_au')

    elif cc == 'SG':
        ids.append('pdpa_singapore')

    elif cc == 'ZA':
        ids.append('popia_za')

    elif cc == 'MX':
        ids.append('lpdc_mx')

    elif cc == 'AR':
        ids.append('aepd_ar')

    elif cc in EU_COUNTRIES:
        ids.append('gdpr_eu')

    else:
        # Conservative fallback for all other countries: COPPA if under-13
        if has_under_13:
            ids.append('coppa_us')

    # Deduplicate while preserving order
    seen: set = set()
    return [x for x in ids if not (x in seen or seen.add(x))]  # type: ignore[func-returns-value]


async def seed_privacy_jurisdictions(
    db:     AsyncSession,
    org_id: str,
) -> List[str]:
    """
    Main entry point.  Derives and saves jurisdiction IDs for the given org.

    Returns the list of jurisdiction_ids that were actually stored.

    On any DB error the function logs and returns an empty list — it must
    never crash a signup.

    Implementation note: all DB writes are wrapped in a SAVEPOINT (nested
    transaction via db.begin_nested()) so that a failure here only rolls back
    the seeder's own writes and never aborts the outer signup transaction.
    Without this, a DBAPI error inside the seeder poisons the shared
    AsyncSession connection and causes the subsequent db.commit() in auth.py
    to fail or silently drop the user/org rows that were already flushed.
    """
    # ── Step 1: read-only — derive jurisdiction IDs (no writes yet) ──────────
    try:
        row = (await db.execute(
            text("""
                SELECT country_code, subdivision_code, has_under_13_students, org_type_v2
                FROM   organizations
                WHERE  id = :oid
            """),
            {"oid": org_id},
        )).first()

        if row is None:
            logger.warning(f"[privacy_seeder] Org {org_id} not found — cannot seed")
            return []

        country_code     = row[0]
        subdivision_code = row[1]
        has_under_13     = bool(row[2]) if row[2] is not None else True
        org_type_v2      = row[3]

        candidate_ids = _derive_jurisdiction_ids(
            country_code, subdivision_code, has_under_13, org_type_v2
        )
        verified_ids = await _verify_jurisdictions(db, candidate_ids)

    except Exception as exc:
        logger.error(
            f"[privacy_seeder] Error reading org {org_id} attributes: {exc}",
            exc_info=True,
        )
        return []

    # ── Step 2: writes — inside a SAVEPOINT so any error here cannot abort
    #    the outer signup transaction on the shared AsyncSession connection. ───
    try:
        async with db.begin_nested():
            # 4. Write jurisdiction IDs to the org row
            await db.execute(
                text("""
                    UPDATE organizations
                    SET    privacy_jurisdiction_ids = CAST(:ids AS JSONB),
                           updated_at = NOW()
                    WHERE  id = :oid
                """),
                {"ids": json.dumps(verified_ids), "oid": org_id},
            )

            # 5. Upsert UserPrivacyPreference for the org owner
            owner_row = (await db.execute(
                text("""
                    SELECT user_id FROM organization_members
                    WHERE  org_id = :oid AND role = 'owner'
                    LIMIT  1
                """),
                {"oid": org_id},
            )).first()

            if owner_row:
                owner_id = str(owner_row[0])
                ferpa_on = 'ferpa_us' in verified_ids
                coppa_on = 'coppa_us' in verified_ids
                pref_id  = str(uuid.uuid4())
                now      = datetime.now(timezone.utc)

                await db.execute(
                    text("""
                        INSERT INTO user_privacy_preferences
                            (id, user_id, ferpa_enabled, coppa_enabled,
                             data_sharing_enabled, ai_enabled,
                             org_governed, org_id, org_governed_at,
                             configured_at, created_at, updated_at)
                        VALUES
                            (:id, :uid, :ferpa, :coppa,
                             FALSE, TRUE,
                             TRUE, :oid, :now,
                             :now, :now, :now)
                        ON CONFLICT (user_id) DO UPDATE SET
                            ferpa_enabled    = EXCLUDED.ferpa_enabled,
                            coppa_enabled    = EXCLUDED.coppa_enabled,
                            org_governed     = TRUE,
                            org_id           = EXCLUDED.org_id,
                            org_governed_at  = EXCLUDED.org_governed_at,
                            configured_at    = EXCLUDED.configured_at,
                            updated_at       = EXCLUDED.updated_at
                    """),
                    {
                        "id":    pref_id,
                        "uid":   owner_id,
                        "ferpa": ferpa_on,
                        "coppa": coppa_on,
                        "oid":   org_id,
                        "now":   now,
                    },
                )

                logger.info(
                    f"[privacy_seeder] Org {org_id}: seeded jurisdictions "
                    f"{verified_ids}, "
                    f"ferpa={ferpa_on} coppa={coppa_on} for owner={owner_id}"
                )
            else:
                logger.warning(
                    f"[privacy_seeder] No owner found for org {org_id} — "
                    f"skipping UserPrivacyPreference upsert"
                )

    except Exception as exc:
        # Savepoint was automatically rolled back by the context manager.
        # The outer signup transaction is still alive and commits normally.
        logger.error(
            f"[privacy_seeder] DB write failed for org {org_id} "
            f"(savepoint rolled back, signup still succeeds): {exc}",
            exc_info=True,
        )
        return []

    return verified_ids
