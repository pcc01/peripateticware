# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
GPS-tracking consent lookup, shared across the jurisdiction engine
(services/privacy_engine.py) and the wayfinding/session routes.

Moved here (2026-09) from routes/sessions.py, where it was a private,
route-local helper — services/privacy_engine.py needed it too (to make
enforce_on_submission() consent-aware instead of blocking unconditionally),
and routes are only ever supposed to import FROM services, never the
reverse. routes/sessions.py re-exports this under its old name
(`_check_gps_consent`) so routes/projects.py and the test suite need no
changes.
"""

import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def check_gps_consent(
    db: AsyncSession,
    student_id,
    activity_id,
) -> bool:
    """Return True if active GPS-tracking consent exists for this student+activity.

    consent_logs is a real, pre-existing append-only audit table (student_id
    is a genuine FK to users.id, not a hash -- see database/init.sql /
    models.database.ConsentLog). "Active consent" = the most recent
    gps_tracking row for this student+activity that hasn't been withdrawn
    or expired and was actually granted (by the student or a parent).
    """
    if not activity_id:
        return False
    try:
        result = await db.execute(
            text("""
                SELECT id FROM consent_logs
                WHERE student_id   = CAST(:sid AS uuid)
                  AND consent_type = 'gps_tracking'
                  AND activity_id  = CAST(:aid AS uuid)
                  AND (given_by_student = TRUE OR given_by_parent = TRUE)
                  AND withdrawn_at IS NULL
                  AND (expires_at IS NULL OR expires_at > NOW())
                ORDER BY consent_given_at DESC
                LIMIT 1
            """),
            {"sid": str(student_id), "aid": str(activity_id)},
        )
        row = result.fetchone()
        return row is not None
    except Exception as exc:
        logger.warning(f"check_gps_consent non-fatal error: {exc}")
        return False
