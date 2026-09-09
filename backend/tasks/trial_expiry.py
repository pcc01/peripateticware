# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Daily sweep that ends the 30-day free trial for homeschool / individual orgs
that never subscribed.

At signup, services/signup_service.py sets an org to
license_tier='free', license_status='trial', trial_started_at=NOW().
During the trial the paid features (coverage report, standards compliance
report, portfolio export — see routes/homeschool.py::_homeschool_features_unlocked)
are unlocked. Nothing else in the app moved a trial off 'trial', so a trial
that was never converted stayed open forever.

trial_expiry_check() finds orgs still on license_status='trial' whose
trial_started_at is older than TRIAL_DAYS, and moves them to
license_status='grace_period' with grace_period_started_at=NOW(). That:
  - re-locks the paid features (the helper only unlocks 'trial', not 'grace_period')
  - makes GET /billing/status report grace_period=True + grace_days_left, which
    turns TrialExpiryBanner red and keeps prompting for a subscription.

A paid subscription (Paddle subscription.created) sets license_status='active'
and is unaffected by this job. Full downgrade after the grace period is a
separate concern — grace already restricts the paid features, and the org
keeps read access to its own data.

Registered in startup.py's start_background_tasks(), daily at 03:15 UTC —
staggered from beta_expiry (03:00). Never raises.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Keep in sync with routes/billing.py::TRIAL_DAYS and the "30-day free trial"
# copy on the marketing site.
TRIAL_DAYS = 30

_SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000"


async def _expire_one(db: AsyncSession, org_id: str, org_name: str) -> None:
    """Move one org from trial to grace_period. Never raises."""
    try:
        await db.execute(text("""
            UPDATE organizations
            SET license_status          = 'grace_period',
                grace_period_started_at = COALESCE(grace_period_started_at, NOW()),
                updated_at              = NOW()
            WHERE id = :oid
        """), {"oid": org_id})

        await db.execute(text("""
            INSERT INTO platform_audit_log
                (id, actor_id, action, target_type, target_id, detail, created_at)
            VALUES
                (:id, :actor, 'trial_expired', 'org', :oid, CAST(:detail AS JSONB), :now)
        """), {
            "id":     str(uuid.uuid4()),
            "actor":  _SYSTEM_ACTOR_ID,
            "oid":    org_id,
            "detail": f'{{"reason": "30-day free trial ended", "org_name": {org_name!r}}}',
            "now":    datetime.now(timezone.utc),
        })
        await db.commit()
        logger.info(f"[trial_expiry] '{org_name}' ({org_id}) trial → grace_period")
    except Exception as exc:
        await db.rollback()
        logger.warning(f"[trial_expiry] Failed to expire org {org_id}: {exc}")


async def trial_expiry_check() -> None:
    """
    Find every org still on license_status='trial' whose trial_started_at is
    older than TRIAL_DAYS and move it to grace_period. Never raises.
    """
    from core.database import get_session_factory

    try:
        factory = get_session_factory()
        async with factory() as db:
            rows = (await db.execute(text(f"""
                SELECT id, name
                FROM organizations
                WHERE license_status = 'trial'
                  AND trial_started_at IS NOT NULL
                  AND trial_started_at < NOW() - INTERVAL '{TRIAL_DAYS} days'
            """))).fetchall()

            if not rows:
                return

            for row in rows:
                await _expire_one(db, str(row[0]), row[1])

        logger.info(f"[trial_expiry] Swept {len(rows)} org(s) past their free trial")

    except Exception as exc:
        logger.warning(f"[trial_expiry] trial_expiry_check failed: {exc}")
