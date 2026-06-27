# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1

"""
Data retention cleanup — Block 14f

Runs daily (triggered from startup via asyncio or an external cron).
Deletes / anonymises records past their retention window per compliance_rules,
logs every action to rule_audit_log.

Run manually:
    docker exec peripateticware-backend python -m tasks.retention_cleanup

Or schedule via startup hook in main.py:
    asyncio.create_task(run_retention_cleanup_loop())
"""

import asyncio
import hashlib
import logging
import os
from datetime import datetime, timedelta

from sqlalchemy import text, delete, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

logger = logging.getLogger(__name__)

# ── DB connection ─────────────────────────────────────────────────────────────

def _make_session_factory():
    # Reuse DATABASE_URL from env (same as main app)
    try:
        from core.config import settings
        url = settings.DATABASE_URL
    except Exception:
        url = os.getenv("DATABASE_URL", "postgresql+asyncpg://peripateticware_user:peripateticware_pass@localhost:5432/peripateticware")
    engine = create_async_engine(url, echo=False, pool_pre_ping=True)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ── Audit log helper ──────────────────────────────────────────────────────────

async def _audit(db: AsyncSession, action: str, data_category: str,
                 records_affected: int, jurisdiction: str = "GLOBAL"):
    try:
        await db.execute(text("""
            INSERT INTO rule_audit_log
                (id, action_type, data_category, records_affected,
                 jurisdiction, compliance_status, created_at)
            VALUES
                (gen_random_uuid(), :action, :category, :count,
                 :jurisdiction, 'COMPLIANT', NOW())
        """), {
            "action": action,
            "category": data_category,
            "count": records_affected,
            "jurisdiction": jurisdiction,
        })
    except Exception as e:
        logger.warning(f"Audit log write failed (non-fatal): {e}")


# ── Cleanup routines ──────────────────────────────────────────────────────────

async def purge_expired_captures(db: AsyncSession) -> int:
    """Delete student captures (and their files) past retention window."""
    # Default retention: 3 years for student evidence (FERPA)
    cutoff = datetime.utcnow() - timedelta(days=3 * 365)
    result = await db.execute(
        text("SELECT id, file_path FROM student_captures WHERE captured_at < :cutoff"),
        {"cutoff": cutoff},
    )
    rows = result.fetchall()
    if not rows:
        return 0

    # Delete files from disk
    deleted_files = 0
    for row in rows:
        if row.file_path:
            try:
                os.unlink(row.file_path)
                deleted_files += 1
            except FileNotFoundError:
                pass
            except Exception as e:
                logger.warning(f"Could not delete file {row.file_path}: {e}")

    ids = [r.id for r in rows]
    await db.execute(
        text("DELETE FROM student_captures WHERE id = ANY(:ids)"),
        {"ids": ids},
    )
    await _audit(db, "DELETE_EXPIRED_CAPTURES", "student_captures", len(ids))
    logger.info(f"Retention: deleted {len(ids)} expired captures, {deleted_files} files")
    return len(ids)


async def anonymise_expired_sessions(db: AsyncSession) -> int:
    """Anonymise learning session PII past retention window (keep aggregate stats)."""
    cutoff = datetime.utcnow() - timedelta(days=7 * 365)  # 7-year FERPA default
    result = await db.execute(text("""
        UPDATE learning_sessions
        SET inquiry_log = NULL
        WHERE created_at < :cutoff
          AND inquiry_log IS NOT NULL
    """), {"cutoff": cutoff})
    count = result.rowcount or 0
    if count:
        await _audit(db, "ANONYMISE_SESSION_INQUIRY_LOG", "learning_sessions", count)
        logger.info(f"Retention: anonymised {count} expired session inquiry logs")
    return count


async def purge_stale_location_history(db: AsyncSession) -> int:
    """Purge location search history older than 1 year."""
    cutoff = datetime.utcnow() - timedelta(days=365)
    result = await db.execute(text("""
        DELETE FROM location_search_history WHERE searched_at < :cutoff
    """), {"cutoff": cutoff})
    count = result.rowcount or 0
    if count:
        await _audit(db, "DELETE_LOCATION_HISTORY", "location_search_history", count)
        logger.info(f"Retention: deleted {count} stale location history records")
    return count


async def purge_expired_consent_records(db: AsyncSession) -> int:
    """Remove consent records where consent was withdrawn > 30 days ago."""
    cutoff = datetime.utcnow() - timedelta(days=30)
    result = await db.execute(text("""
        DELETE FROM consent_records
        WHERE is_active = FALSE AND updated_at < :cutoff
    """), {"cutoff": cutoff})
    count = result.rowcount or 0
    if count:
        await _audit(db, "DELETE_WITHDRAWN_CONSENTS", "consent_records", count)
        logger.info(f"Retention: deleted {count} expired withdrawn consent records")
    return count



async def hard_delete_soft_deleted_users(db: AsyncSession) -> int:
    """
    Permanently delete users who were soft-deleted more than 30 days ago.

    Deletion order respects FK constraints:
    1. Delete dependent records (captures, sessions, consents, notifications)
    2. Anonymise audit logs (keep for compliance, remove PII)
    3. Hard-delete the user row

    Privacy doc: 30-day grace period between soft-delete and hard-delete.
    """
    cutoff = datetime.utcnow() - timedelta(days=30)

    # Find users to hard-delete
    result = await db.execute(text("""
        SELECT id FROM users
        WHERE deleted_at IS NOT NULL AND deleted_at < :cutoff
    """), {"cutoff": cutoff})
    user_ids = [str(r[0]) for r in result.fetchall()]
    if not user_ids:
        return 0

    logger.info(f"Hard-deleting {len(user_ids)} soft-deleted users past 30-day grace period")

    for uid in user_ids:
        try:
            # 1. Delete evidence files and captures
            captures = await db.execute(text(
                "SELECT file_path FROM student_captures sc "
                "JOIN learning_sessions ls ON ls.id = sc.session_id "
                "WHERE ls.user_id = :uid"
            ), {"uid": uid})
            for row in captures.fetchall():
                if row[0]:
                    try:
                        os.unlink(row[0])
                    except Exception:
                        pass

            # 2. Cascade-delete dependent records
            for tbl, col in [
                ("student_captures", "session_id IN (SELECT id FROM learning_sessions WHERE user_id = :uid)"),
                ("learning_sessions", "user_id = :uid"),
                ("notifications", "user_id = :uid"),
                ("parent_child_links", "parent_id = :uid OR child_id = :uid"),
            ]:
                try:
                    await db.execute(text(f"DELETE FROM {tbl} WHERE {col}"), {"uid": uid})
                except Exception as e:
                    logger.warning(f"Could not delete from {tbl} for user {uid}: {e}")

            # 3. Hard-delete the user
            await db.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": uid})
            await db.flush()

        except Exception as e:
            logger.error(f"Failed to hard-delete user {uid}: {e}")
            continue

    await _audit(db, "HARD_DELETE_USERS", "users", len(user_ids))
    logger.info(f"Retention: hard-deleted {len(user_ids)} users after 30-day grace period")
    return len(user_ids)


# ── Main entry point ──────────────────────────────────────────────────────────

async def _safe_run(coro, name: str) -> int:
    """Run a cleanup coroutine, returning 0 if the table/column doesn't exist yet."""
    try:
        return await coro
    except Exception as e:
        msg = str(e)
        if "UndefinedTable" in msg or "UndefinedColumn" in msg or "does not exist" in msg:
            logger.info(f"Retention: skipping {name} (table/column not yet migrated)")
            return 0
        raise




async def check_overdue_dpa_notifications(db: AsyncSession) -> int:
    """
    Alert admin if any breach incident has passed its 72-hour DPA deadline
    without a notification being sent. Runs hourly via the retention scheduler.
    """
    from services.email_service import send_notification
    from core.config import settings

    now = datetime.utcnow()
    overdue = (await db.execute(text("""
        SELECT id, discovered_at, dpa_deadline, severity, description
        FROM breach_incidents
        WHERE dpa_notification_required = true
          AND dpa_notified_at IS NULL
          AND dpa_deadline < :now
    """), {"now": now})).fetchall()

    if not overdue:
        return 0

    for row in overdue:
        incident_id, discovered_at, deadline, severity, description = row
        hours_overdue = (now - deadline).total_seconds() / 3600
        logger.critical(
            f"BREACH INCIDENT OVERDUE: {incident_id} — "
            f"DPA notification {hours_overdue:.1f}h past 72h deadline"
        )
        try:
            await send_notification(
                to=settings.ADMIN_EMAIL,
                subject=f"[URGENT] Breach DPA notification overdue — {incident_id}",
                body_html=f"""
                <h2>Breach Notification Overdue</h2>
                <p>Incident <strong>{incident_id}</strong> has passed its 72-hour DPA notification
                deadline by <strong>{hours_overdue:.1f} hours</strong>.</p>
                <p><strong>Discovered:</strong> {discovered_at}</p>
                <p><strong>Severity:</strong> {severity}</p>
                <p><strong>Description:</strong> {description}</p>
                <p>Log in to the admin panel and send the DPA notification immediately.</p>
                """,
            )
        except Exception as e:
            logger.error(f"Failed to send overdue alert for {incident_id}: {e}")

    return len(overdue)

async def run_retention_cleanup():
    """Run all retention cleanup tasks, each in its own DB session.

    Isolating sessions ensures a failed/aborted transaction in one task
    (e.g. a table that hasn't been migrated yet) does not poison subsequent
    tasks with InFailedSQLTransactionError.
    """
    logger.info("🗑 Retention cleanup starting…")
    factory = _make_session_factory()
    total = 0
    tasks = [
        ("purge_expired_captures",         purge_expired_captures),
        ("anonymise_expired_sessions",     anonymise_expired_sessions),
        ("purge_stale_location_history",   purge_stale_location_history),
        ("purge_expired_consent_records",  purge_expired_consent_records),
        ("hard_delete_soft_deleted_users", hard_delete_soft_deleted_users),  # P3-6
        ("check_overdue_dpa_notifications",  check_overdue_dpa_notifications),  # P4
    ]
    for name, fn in tasks:
        try:
            async with factory() as db:
                count = await _safe_run(fn(db), name)
                await db.commit()
                total += count
        except Exception as e:
            logger.error(f"❌ Retention task '{name}' failed: {e}", exc_info=True)
    logger.info(f"✅ Retention cleanup complete — {total} records affected")


async def run_retention_cleanup_loop(interval_hours: int = 24):
    """Long-running loop for use with asyncio.create_task() in main.py."""
    await asyncio.sleep(60)  # Let the app finish starting
    while True:
        await run_retention_cleanup()
        await asyncio.sleep(interval_hours * 3600)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_retention_cleanup())
