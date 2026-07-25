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

OQ-4 resolution: A minimal ferpa_us.json is created on first import of
services.privacy_jurisdiction_resolver (see _ensure_ferpa_config() there) if
it doesn't exist.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from services.privacy_jurisdiction_resolver import (
    derive_jurisdiction_ids as _derive_jurisdiction_ids,
    verify_jurisdictions as _verify_jurisdictions,
)

logger = logging.getLogger(__name__)

# NOTE: EU_COUNTRIES, the FERPA-config bootstrap, _derive_jurisdiction_ids, and
# _verify_jurisdictions used to live here directly. They were extracted into
# services/privacy_jurisdiction_resolver.py so the same derivation logic can be
# called on-demand (POST /privacy/jurisdictions/resolve, the mobile catalog
# assign action, the monthly auto-renew job) instead of only at signup time.
# Re-imported above under their original private names so the rest of this
# file — and seed_privacy_jurisdictions()'s existing behavior — is unchanged.


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
