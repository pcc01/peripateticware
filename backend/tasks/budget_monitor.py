# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
APScheduler jobs for platform AI budget monitoring.

Jobs registered in startup.py's start_background_tasks():
  budget_alert_check()  — hourly.  Scans for orgs that crossed their monthly
                           alert threshold (flagged by services.ai_router.
                           _budget_check via a Redis key) and sends one FYI
                           email to the platform admin per org, per day.
  anomaly_detect()       — every 15 min. Flags orgs whose AI spend today is
                           an outlier (>= 3x their 7-day daily average, or a
                           new org spending > $5 with no history) and emails
                           the platform admin.
  monthly_summary()      — monthly (1st of the month). Emails the platform
                           admin a recap of which orgs went over their
                           monthly cap.

Scope note: everything in this module is *internal* usage monitoring /
alerting for Peripateticware's own AI provider bill (Anthropic / Ollama),
not customer billing or payment processing — no Paddle/Stripe integration,
no invoices, and it never blocks or throttles a request. Dollar figures
here are cost *estimates* used only to decide when to email an admin.

All three jobs fail silently (log + swallow) — a monitoring bug must never
take down the server or the APScheduler thread.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from core.config import settings
from core.rate_limit import _get_redis

logger = logging.getLogger(__name__)


# ── DB session factory (used by the scheduler, which runs outside request
#    context — mirrors services/batch_processor.py::_make_session) ──────────

def _make_session() -> async_sessionmaker:
    engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ── Admin recipient ──────────────────────────────────────────────────────────

def _admin_email() -> str:
    """Platform admin alert recipient — ADMIN_EMAIL, falling back to EMAIL_FROM."""
    try:
        return (getattr(settings, "ADMIN_EMAIL", "") or getattr(settings, "EMAIL_FROM", "") or "").strip()
    except Exception:
        return ""


def _month_label(dt: Optional[datetime] = None) -> str:
    dt = dt or datetime.now(timezone.utc)
    return dt.strftime("%B %Y")


# ── Internal monthly spend estimates by license tier ─────────────────────────
# Informational only — gives the admin a rough "expected vs actual" reference
# in the monthly summary email. NOT a customer price list, NOT used to
# compute or enforce any cap (that lives in platform_ai_budgets).
MONTHLY_ESTIMATES: dict = {
    "free":               5.00,
    "trial":               5.00,
    "starter":              5.00,
    "homeschool_family":    5.00,
    "homeschool_coop":      5.00,
    "school":              20.00,
    "school_byok":          0.00,   # org pays their own provider directly
    "district":           100.00,
    "district_byok":        0.00,
    "enterprise":          500.00,
}


# ── HTML builders ─────────────────────────────────────────────────────────────

def _row_html(cells: list) -> str:
    tds = "".join(f"<td style='padding:6px 10px;border-bottom:1px solid #e5e7eb'>{c}</td>" for c in cells)
    return f"<tr>{tds}</tr>"


def _build_alert_email(org_name: str, tier: str, total_spend: float, cap, task_rows: list) -> str:
    cap_str = f"${cap:.2f}" if cap is not None else "n/a"
    rows_html = "".join(
        _row_html([str(r[0]), str(r[1]), str(r[2] or 0), str(r[3] or 0), f"${float(r[4] or 0):.4f}"])
        for r in task_rows
    ) or "<tr><td colspan='5' style='padding:10px'>No task breakdown available</td></tr>"

    return f"""
    <p>{org_name} (tier: {tier}) has reached its AI usage alert threshold for {_month_label()}.</p>
    <p><b>Month-to-date spend:</b> ${total_spend:.4f} &nbsp; <b>Monthly cap:</b> {cap_str}</p>
    <table style="border-collapse:collapse;width:100%">
      <thead><tr>
        <th style="text-align:left;padding:6px 10px">Task</th>
        <th style="text-align:left;padding:6px 10px">Calls</th>
        <th style="text-align:left;padding:6px 10px">Tokens in</th>
        <th style="text-align:left;padding:6px 10px">Tokens out</th>
        <th style="text-align:left;padding:6px 10px">Cost</th>
      </tr></thead>
      <tbody>{rows_html}</tbody>
    </table>
    <p>This is an FYI monitoring alert — service was not interrupted.</p>
    """


def _build_anomaly_email(org_name: str, tier: str, today_spend: float, avg_daily: float) -> str:
    avg_str = f"${avg_daily:.4f}" if avg_daily else "no 7-day history"
    return f"""
    <p><b>Usage anomaly detected</b> for {org_name} (tier: {tier}).</p>
    <p>Today's spend so far: <b>${today_spend:.4f}</b> vs 7-day daily average: {avg_str}.</p>
    <p>This is an FYI monitoring alert — service was not interrupted.</p>
    """


def _build_monthly_summary_email(total_active_orgs, over_cap_rows: list) -> str:
    if over_cap_rows:
        rows_html = "".join(
            _row_html([str(r[1]), str(r[2]), f"${float(r[3] or 0):.4f}", f"${float(r[4] or 0):.2f}"])
            for r in over_cap_rows
        )
        over_cap_section = f"""
        <table style="border-collapse:collapse;width:100%">
          <thead><tr>
            <th style="text-align:left;padding:6px 10px">Org</th>
            <th style="text-align:left;padding:6px 10px">Tier</th>
            <th style="text-align:left;padding:6px 10px">Spend</th>
            <th style="text-align:left;padding:6px 10px">Cap</th>
          </tr></thead>
          <tbody>{rows_html}</tbody>
        </table>
        """
    else:
        over_cap_section = "<p>No organizations exceeded their monthly cap this period.</p>"

    return f"""
    <p><b>Monthly AI Usage Summary — {_month_label()}</b></p>
    <p>{total_active_orgs} organization(s) used AI features this month.</p>
    {over_cap_section}
    """


# ── budget_alert_check ────────────────────────────────────────────────────────

async def _send_threshold_alert(session: AsyncSession, org_id: str, admin_email: str) -> bool:
    """
    Build and send one FYI alert email for org_id to admin_email.
    Returns True if an email was sent, False if the org couldn't be resolved
    (e.g. deleted since the flag was set). Never raises — callers isolate
    one org's failure from the rest of the batch.
    """
    from services import email_service

    org_row = (await session.execute(
        text("SELECT name, license_tier, contact_email FROM organizations WHERE id = :org_id"),
        {"org_id": org_id},
    )).fetchone()
    if not org_row:
        logger.info(f"[budget_monitor] Skipping alert for {org_id} — org not found")
        return False

    org_name = org_row[0]
    tier     = org_row[1] if len(org_row) > 1 else "unknown"

    budget_row = (await session.execute(
        text("SELECT monthly_dollar_cap, alert_threshold_pct FROM platform_ai_budgets WHERE org_id = :org_id"),
        {"org_id": org_id},
    )).fetchone()
    cap = float(budget_row[0]) if budget_row else None

    task_rows = (await session.execute(text("""
        SELECT task_type, COUNT(*), SUM(tokens_in), SUM(tokens_out), SUM(cost_usd)
        FROM   platform_ai_ledger
        WHERE  org_id = :org_id
          AND  created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')
        GROUP  BY task_type
        ORDER  BY SUM(cost_usd) DESC NULLS LAST
    """), {"org_id": org_id})).fetchall()

    total_spend = sum(float(r[4] or 0) for r in task_rows)

    subject = f"[Peripateticware] AI Usage Update — {org_name}"
    html    = _build_alert_email(org_name, tier, total_spend, cap, task_rows)
    await email_service._send(admin_email, subject, html)
    return True


async def budget_alert_check() -> None:
    """
    FYI-only budget alert job. Prefers scanning Redis for the
    `budget_alert:{org_id}:{month}` flags set by
    services.ai_router._budget_check() (cheap — no DB scan needed). Falls
    back to a direct DB query for orgs at/over their alert threshold if
    Redis is unavailable. Never raises.
    """
    admin = _admin_email()
    if not admin:
        logger.info("[budget_monitor] ADMIN_EMAIL/EMAIL_FROM not configured — skipping budget_alert_check")
        return

    try:
        redis = await _get_redis()
    except Exception as exc:
        logger.warning(f"[budget_monitor] Redis unavailable, falling back to DB: {exc}")
        redis = None

    factory = _make_session()

    if redis is not None:
        org_ids: list = []
        key_by_org: dict = {}
        try:
            cursor = 0
            while True:
                cursor, keys = await redis.scan(cursor, match="budget_alert:*", count=100)
                for k in keys:
                    key_str = k.decode() if isinstance(k, bytes) else k
                    parts = key_str.split(":")
                    if len(parts) >= 2:
                        org_id = parts[1]
                        org_ids.append(org_id)
                        key_by_org[org_id] = key_str
                if not cursor:
                    break
        except Exception as exc:
            logger.warning(f"[budget_monitor] Redis scan failed, falling back to DB: {exc}")
            redis = None
            org_ids = []

        if redis is not None:
            if not org_ids:
                return
            async with factory() as session:
                for org_id in org_ids:
                    try:
                        sent = await _send_threshold_alert(session, org_id, admin)
                        if sent:
                            await redis.expire(key_by_org[org_id], 86400)
                    except Exception as exc:
                        logger.warning(f"[budget_monitor] Alert failed for org {org_id}: {exc}")
            return

    # ── DB fallback (no Redis) ────────────────────────────────────────────
    try:
        async with factory() as session:
            try:
                rows = (await session.execute(text("""
                    SELECT b.org_id
                    FROM   platform_ai_budgets b
                    JOIN   platform_ai_ledger l
                           ON  l.org_id = b.org_id
                           AND l.created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')
                    GROUP  BY b.org_id, b.monthly_dollar_cap, b.alert_threshold_pct
                    HAVING COALESCE(SUM(l.cost_usd), 0)
                           >= b.monthly_dollar_cap * b.alert_threshold_pct / 100.0
                """))).fetchall()
            except Exception as exc:
                logger.warning(f"[budget_monitor] Fallback query failed: {exc}")
                return

            for row in rows:
                org_id = row[0]
                try:
                    await _send_threshold_alert(session, org_id, admin)
                except Exception as exc:
                    logger.warning(f"[budget_monitor] Alert failed for org {org_id}: {exc}")
    except Exception as exc:
        logger.warning(f"[budget_monitor] budget_alert_check failed: {exc}")


# ── anomaly_detect ────────────────────────────────────────────────────────────

_ANOMALY_MIN_TODAY_SPEND = 1.0    # ignore noise — orgs barely using AI today
_ANOMALY_MULTIPLIER      = 3.0    # today's spend >= 3x the 7-day daily average
_ANOMALY_NEW_ORG_MIN     = 5.0    # no history at all, but already spent > $5 today


async def _anomaly_detect_impl(session: AsyncSession) -> None:
    from datetime import date, timedelta
    from services import email_service

    today_rows = (await session.execute(text("""
        SELECT l.org_id, SUM(l.cost_usd) AS today_spend, o.name, o.license_tier
        FROM   platform_ai_ledger l
        JOIN   organizations o ON o.id = l.org_id
        WHERE  l.created_at >= CURRENT_DATE
        GROUP  BY l.org_id, o.name, o.license_tier
        HAVING SUM(l.cost_usd) > :min_spend
    """), {"min_spend": _ANOMALY_MIN_TODAY_SPEND})).fetchall()

    if not today_rows:
        return

    # Bind the 7-day window as parameters (rather than a literal CURRENT_DATE
    # in the SQL text) so this query is unambiguously distinct from the
    # "today" query above for anything inspecting the raw SQL string.
    _today = date.today()
    _week_ago = _today - timedelta(days=7)
    avg_rows = (await session.execute(text("""
        SELECT org_id, AVG(daily_spend) AS avg_daily
        FROM (
            SELECT org_id, DATE(created_at) AS d, SUM(cost_usd) AS daily_spend
            FROM   platform_ai_ledger
            WHERE  created_at >= :week_start
              AND  created_at <  :week_end
            GROUP  BY org_id, DATE(created_at)
        ) daily
        GROUP BY org_id
    """), {"week_start": _week_ago, "week_end": _today})).fetchall()
    avg_map = {row[0]: float(row[1] or 0) for row in avg_rows}

    admin = _admin_email()
    if not admin:
        return

    for row in today_rows:
        org_id, today_spend, org_name, tier = row[0], float(row[1] or 0), row[2], row[3]
        avg_daily = avg_map.get(org_id)

        is_anomaly = False
        if avg_daily and avg_daily > 0:
            if today_spend >= _ANOMALY_MULTIPLIER * avg_daily:
                is_anomaly = True
        elif today_spend > _ANOMALY_NEW_ORG_MIN:
            is_anomaly = True

        if not is_anomaly:
            continue

        try:
            subject = f"[Peripateticware] Usage anomaly — {org_name}"
            html    = _build_anomaly_email(org_name, tier, today_spend, avg_daily or 0.0)
            await email_service._send(admin, subject, html)
        except Exception as exc:
            logger.warning(f"[budget_monitor] Anomaly alert failed for org {org_id}: {exc}")


async def anomaly_detect(db: Optional[AsyncSession] = None) -> None:
    """
    Flags orgs whose AI spend today is an outlier: >= 3x their 7-day daily
    average, or (for orgs with no 7-day history yet) more than $5 spent
    today. Emails the platform admin once per qualifying org per run.

    Two calling conventions:
      - anomaly_detect(db) — caller already has an open session; it's used
        directly and not closed here.
      - anomaly_detect() — no session provided; opens and closes its own via
        _make_session(), as used by the APScheduler job.

    Never raises — a monitoring bug must never crash the scheduler.
    """
    if db is not None:
        try:
            await _anomaly_detect_impl(db)
        except Exception as exc:
            logger.warning(f"[budget_monitor] anomaly_detect failed: {exc}")
        return

    try:
        factory = _make_session()
        async with factory() as session:
            await _anomaly_detect_impl(session)
    except Exception as exc:
        logger.warning(f"[budget_monitor] anomaly_detect failed: {exc}")


# ── monthly_summary ────────────────────────────────────────────────────────────

async def monthly_summary() -> None:
    """
    Monthly recap emailed to the platform admin: how many orgs used AI
    features this month, and which (if any) exceeded their monthly cap. No
    email is sent if there was no AI usage at all this month. Never raises.
    """
    admin = _admin_email()
    if not admin:
        return

    try:
        from services import email_service

        factory = _make_session()
        async with factory() as session:
            total = (await session.execute(text(
                "SELECT COUNT(DISTINCT org_id) FROM platform_ai_ledger "
                "WHERE created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')"
            ))).scalar()

            if not total:
                return

            over_cap_rows = (await session.execute(text("""
                SELECT b.org_id, o.name, o.license_tier, SUM(l.cost_usd) AS spend, b.monthly_dollar_cap
                FROM   platform_ai_ledger l
                JOIN   platform_ai_budgets b ON b.org_id = l.org_id
                JOIN   organizations o       ON o.id = l.org_id
                WHERE  l.created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')
                GROUP  BY b.org_id, o.name, o.license_tier, b.monthly_dollar_cap
                HAVING SUM(l.cost_usd) >= b.monthly_dollar_cap
                ORDER  BY spend DESC
            """))).fetchall()

            subject = f"[Peripateticware] Monthly AI Usage Summary — {_month_label()}"
            html    = _build_monthly_summary_email(total, over_cap_rows)
            await email_service._send(admin, subject, html)
    except Exception as exc:
        logger.warning(f"[budget_monitor] monthly_summary failed: {exc}")
