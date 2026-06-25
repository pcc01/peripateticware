# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
APScheduler jobs for platform AI budget monitoring.

Jobs registered in main.py lifespan:
  budget_alert_check()  — runs hourly, emails / logs orgs at alert threshold
  anomaly_detect()      — runs every 15 min, flags orgs with spike > 3× 7-day average

Both jobs fail silently — never crash the server over monitoring.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def budget_alert_check(db: AsyncSession) -> None:
    """
    Check all orgs with active budgets.  Log (and optionally email) any that
    have crossed their alert_threshold_pct this calendar month.
    """
    try:
        now         = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        budgets = (await db.execute(text("""
            SELECT b.org_id,
                   b.monthly_token_limit,
                   b.monthly_cost_limit_usd,
                   b.alert_threshold_pct,
                   b.hard_stop,
                   COALESCE(SUM(l.total_tokens), 0)  AS used_tokens,
                   COALESCE(SUM(l.cost_usd), 0)      AS used_cost
            FROM   platform_ai_budgets b
            LEFT   JOIN platform_ai_ledger l
                   ON  l.org_id = b.org_id
                   AND l.created_at >= :ms
            GROUP  BY b.org_id,
                      b.monthly_token_limit, b.monthly_cost_limit_usd,
                      b.alert_threshold_pct, b.hard_stop
        """), {"ms": month_start})).fetchall()

        for row in budgets:
            (org_id, tok_limit, cost_limit, alert_pct,
             hard_stop, used_tokens, used_cost) = row

            alerts = []

            if tok_limit and tok_limit > 0:
                pct = (int(used_tokens) / tok_limit) * 100
                if pct >= alert_pct:
                    alerts.append(
                        f"tokens {int(used_tokens):,}/{tok_limit:,} ({pct:.0f}%)"
                    )

            if cost_limit:
                cl  = Decimal(str(cost_limit))
                uc  = Decimal(str(used_cost))
                pct = float(uc / cl * 100) if cl else 0
                if pct >= alert_pct:
                    alerts.append(
                        f"cost ${float(uc):.4f}/${float(cl):.2f} ({pct:.0f}%)"
                    )

            if alerts:
                logger.warning(
                    f"[budget_monitor] Org {org_id} budget alert — {'; '.join(alerts)}"
                    + (" (HARD STOP active)" if hard_stop else "")
                )
                # TODO: wire email_service here for email alerts

    except Exception as exc:
        logger.error(f"[budget_monitor] budget_alert_check error: {exc}", exc_info=True)


async def anomaly_detect(db: AsyncSession) -> None:
    """
    Detect orgs whose usage in the last 15 minutes is > 3× their
    15-minute average over the past 7 days.
    """
    try:
        now      = datetime.now(timezone.utc)
        window   = now - timedelta(minutes=15)
        week_ago = now - timedelta(days=7)

        # Recent spike: tokens in last 15 min per org
        recent = (await db.execute(text("""
            SELECT org_id, SUM(total_tokens) AS recent_tokens
            FROM   platform_ai_ledger
            WHERE  created_at >= :w
            GROUP  BY org_id
            HAVING SUM(total_tokens) > 0
        """), {"w": window})).fetchall()

        if not recent:
            return

        # 7-day average per 15-min window per org
        # Count of distinct 15-min slots in 7 days = 7*24*4 = 672
        _SLOTS = 7 * 24 * 4

        avg_rows = (await db.execute(text("""
            SELECT org_id, COALESCE(SUM(total_tokens), 0) / :slots AS avg_per_slot
            FROM   platform_ai_ledger
            WHERE  created_at BETWEEN :week_ago AND :w
            GROUP  BY org_id
        """), {"slots": _SLOTS, "w": window, "week_ago": week_ago})).fetchall()

        avg_map: dict[str, float] = {str(r[0]): float(r[1]) for r in avg_rows}

        for org_id, recent_tokens in recent:
            sid  = str(org_id)
            avg  = avg_map.get(sid, 0.0)
            if avg > 0 and float(recent_tokens) > (avg * 3):
                logger.warning(
                    f"[budget_monitor] ANOMALY — org {sid}: "
                    f"{int(recent_tokens)} tokens in 15 min "
                    f"vs 7-day avg {avg:.0f} (×{float(recent_tokens)/avg:.1f})"
                )
                # TODO: trigger alert / temporary throttle

    except Exception as exc:
        logger.error(f"[budget_monitor] anomaly_detect error: {exc}", exc_info=True)
