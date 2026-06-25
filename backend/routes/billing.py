# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Billing status API for org admins.

Routes (prefix /api/v1/billing, registered in main.py):

  GET  /status   — current subscription state, tier, trial days remaining
  GET  /portal   — redirect to Paddle customer portal for self-service
"""

import logging
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.dependencies import get_current_user
from models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/status")
async def billing_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return current billing state for the calling user's org.
    Safe to call from any role — returns empty state if no org linked.
    """
    if not current_user.org_id:
        return {
            "org_id":           None,
            "license_tier":     "free",
            "license_status":   "active",
            "has_subscription": False,
            "trial_active":     False,
            "trial_days_left":  None,
            "grace_period":     False,
            "grace_days_left":  None,
            "manage_url":       None,
        }

    row = (await db.execute(text("""
        SELECT license_tier, license_status, trial_started_at,
               grace_period_started_at, paddle_customer_id,
               paddle_subscription_id, subscription_ends_at, name
        FROM   organizations WHERE id = :oid
    """), {"oid": str(current_user.org_id)})).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Organisation not found")

    now   = datetime.now(timezone.utc)
    tier  = row["license_tier"] or "free"
    status = row["license_status"] or "active"

    # Trial state
    trial_active    = status == "trial"
    trial_days_left = None
    if trial_active and row["trial_started_at"]:
        ts = row["trial_started_at"]
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        trial_days_left = max(0, 31 - (now - ts).days)

    # Grace period state
    grace_period    = status == "grace_period"
    grace_days_left = None
    if grace_period and row["grace_period_started_at"]:
        gs = row["grace_period_started_at"]
        if gs.tzinfo is None:
            gs = gs.replace(tzinfo=timezone.utc)
        grace_days_left = max(0, 30 - (now - gs).days)

    return {
        "org_id":           str(current_user.org_id),
        "org_name":         row["name"],
        "license_tier":     tier,
        "license_status":   status,
        "has_subscription": bool(row["paddle_subscription_id"]),
        "trial_active":     trial_active,
        "trial_days_left":  trial_days_left,
        "grace_period":     grace_period,
        "grace_days_left":  grace_days_left,
        "manage_url":       (
            f"{settings.FRONTEND_URL}/billing/manage"
            if row["paddle_customer_id"] else None
        ),
    }


@router.get("/portal")
async def billing_portal(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a Paddle customer portal URL and redirect.
    Requires a valid Paddle customer_id for the org.
    """
    if not current_user.org_id:
        raise HTTPException(status_code=403, detail="No organisation linked")

    row = (await db.execute(text("""
        SELECT paddle_customer_id, paddle_subscription_id
        FROM   organizations WHERE id = :oid
    """), {"oid": str(current_user.org_id)})).first()

    if not row or not row[0]:
        raise HTTPException(
            status_code=404,
            detail="No active Paddle subscription found. "
                   "Complete checkout first to access the billing portal.",
        )

    customer_id = row[0]

    if not settings.PADDLE_API_KEY:
        # Paddle not configured — redirect to a placeholder
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/billing")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{settings.PADDLE_API_URL}/customers/{customer_id}/portal-sessions",
                headers={
                    "Authorization": f"Bearer {settings.PADDLE_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={},
            )
        if resp.status_code == 201:
            portal_url = resp.json().get("data", {}).get("urls", {}).get("general", {}).get("overview")
            if portal_url:
                return RedirectResponse(url=portal_url)
    except Exception as exc:
        logger.error(f"[billing] Paddle portal session error: {exc}")

    # Fallback if Paddle request fails
    return RedirectResponse(url=f"{settings.FRONTEND_URL}/billing")
