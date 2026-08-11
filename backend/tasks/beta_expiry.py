# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Daily sweep that ends full-access beta licenses once their trial window
has passed.

Beta orgs are created by services/signup_service.py (license_tier='beta',
license_status='active', license_valid_until = signup time +
settings.BETA_TRIAL_DAYS) whenever someone signs up through the
SIGNUP_MODE=invite_only gate in routes/auth.py. 'beta' is ranked at the top
of TIER_ORDER (services/license_validator.py) — full access to every
tier-gated feature and the same $500/mo AI budget cap as 'enterprise'
(services/ai_router.py TIER_BUDGET_DEFAULTS) — for the duration of the trial.

beta_expiry_check() finds orgs where license_tier='beta' and
license_valid_until has passed, and downgrades them to 'free' with the
standard free-tier seat limits (3 teachers / 1 classroom / 30 students).
license_valid_until itself is left untouched (a record of when the trial
ended) rather than cleared.

To extend or end an individual org's beta access before this job would,
use PUT /api/v1/platform/orgs/{org_id}/license (routes/platform_admin.py).
To change the default trial length for *future* signups, change
BETA_TRIAL_DAYS in .env and restart the backend.

Registered in startup.py's start_background_tasks(), daily at 03:00 UTC —
staggered from retention_cleanup (02:00) and budget monitor jobs (hourly/
15-min) on the same shared APScheduler instance. Never raises — a scheduler
bug here must never take down the process.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Sentinel actor_id for platform_audit_log rows written by scheduled jobs
# rather than a human platform admin — no real user id fits, and the column
# is NOT NULL. Keep in sync with any other automated-actor writes.
_SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000"

# Free-tier defaults a downgraded beta org reverts to — matches the values
# services/signup_service.py gives every non-beta TEACHER/HOMESCHOOL signup.
_FREE_TIER_LIMITS = {"max_teachers": 3, "max_classrooms": 1, "max_students": 30, "max_per_classroom": 30}


async def _expire_one(db: AsyncSession, org_id: str, org_name: str) -> None:
    """Downgrade a single org from beta to free. Never raises."""
    try:
        await db.execute(text("""
            UPDATE organizations
            SET license_tier = 'free',
                max_teachers = :max_teachers,
                max_classrooms = :max_classrooms,
                max_students = :max_students,
                max_students_per_classroom = :max_per_classroom,
                updated_at = NOW()
            WHERE id = :oid
        """), {"oid": org_id, **_FREE_TIER_LIMITS})

        await db.execute(text("""
            INSERT INTO platform_audit_log (id, actor_id, action, target_type, target_id, detail, created_at)
            VALUES (:id, :actor, 'beta_expired', 'org', :oid, CAST(:detail AS JSONB), :now)
        """), {
            "id":     str(uuid.uuid4()),
            "actor":  _SYSTEM_ACTOR_ID,
            "oid":    org_id,
            "detail": f'{{"reason": "license_valid_until passed", "org_name": {org_name!r}}}',
            "now":    datetime.now(timezone.utc),
        })
        await db.commit()
        logger.info(f"[beta_expiry] Downgraded '{org_name}' ({org_id}) from beta to free")
    except Exception as exc:
        await db.rollback()
        logger.warning(f"[beta_expiry] Failed to expire org {org_id}: {exc}")


async def beta_expiry_check() -> None:
    """
    Find every org still on license_tier='beta' whose license_valid_until
    has passed, downgrade each to 'free', and (best-effort) email the
    platform admin a summary. Never raises.
    """
    from core.database import get_session_factory

    try:
        factory = get_session_factory()
        async with factory() as db:
            rows = (await db.execute(text("""
                SELECT id, name, license_valid_until
                FROM organizations
                WHERE license_tier = 'beta'
                  AND license_valid_until IS NOT NULL
                  AND license_valid_until < NOW()
            """))).fetchall()

            if not rows:
                return

            expired = []
            for row in rows:
                org_id, org_name = str(row[0]), row[1]
                await _expire_one(db, org_id, org_name)
                expired.append((org_name, row[2]))

        logger.info(f"[beta_expiry] Swept {len(expired)} org(s) past their beta trial")

        # Best-effort admin notification — a failure here must not undo the
        # downgrades above, which already committed.
        try:
            from core.config import settings
            from services import email_service

            admin = (getattr(settings, "ADMIN_EMAIL", "") or getattr(settings, "EMAIL_FROM", "") or "").strip()
            if admin and expired:
                rows_html = "".join(
                    f"<tr><td style='padding:6px 10px'>{name}</td>"
                    f"<td style='padding:6px 10px'>{valid_until}</td></tr>"
                    for name, valid_until in expired
                )
                html = f"""
                <p><b>{len(expired)} beta org(s)</b> just passed their trial window and were
                downgraded to the Free tier.</p>
                <table style="border-collapse:collapse;width:100%">
                  <thead><tr>
                    <th style="text-align:left;padding:6px 10px">Org</th>
                    <th style="text-align:left;padding:6px 10px">Beta expired</th>
                  </tr></thead>
                  <tbody>{rows_html}</tbody>
                </table>
                <p>Extend or re-grant beta access anytime via
                PUT /api/v1/platform/orgs/&#123;org_id&#125;/license.</p>
                """
                await email_service._send(admin, f"[Peripateticware] {len(expired)} beta account(s) expired", html)
        except Exception as exc:
            logger.warning(f"[beta_expiry] Summary email failed (non-fatal): {exc}")

    except Exception as exc:
        logger.warning(f"[beta_expiry] beta_expiry_check failed: {exc}")
