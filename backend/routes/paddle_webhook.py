# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Paddle webhook handler.

Route: POST /webhooks/paddle  (public — no Bearer auth, Paddle signs the payload)

Paddle uses HMAC-SHA256 to sign every webhook notification.
The signature is in the Paddle-Signature header:
  ts=<timestamp>;h1=<hex-hmac>

We verify by computing HMAC-SHA256(secret, ts + ":" + raw_body) and comparing.

Events handled
--------------
subscription.created   → activate org, set tier from price_id, store Paddle IDs
subscription.updated   → update tier / status on plan change
subscription.cancelled → set grace_period_started_at; full downgrade runs after
                         grace period ends (handled by trial_expiry_check job)
transaction.payment_failed → warning email to org contact email

Every event writes one row to platform_audit_log.
"""

import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from fastapi import Depends
from services.license_validator import TIER_LIMITS


async def _apply_tier_limits(db: AsyncSession, org_id: str, tier: str) -> None:
    """Bump the org's seat caps to match `tier` (no-op for tiers not in the
    map, e.g. custom enterprise deals whose limits are set by hand)."""
    limits = TIER_LIMITS.get(tier)
    if not limits or not org_id:
        return
    await db.execute(text("""
        UPDATE organizations
        SET    max_teachers                = :max_teachers,
               max_classrooms              = :max_classrooms,
               max_students                = :max_students,
               max_students_per_classroom  = :max_students_per_classroom,
               updated_at                  = NOW()
        WHERE  id = :org_id
    """), {**limits, "org_id": org_id})

logger = logging.getLogger(__name__)
router = APIRouter(tags=["webhooks"])

# ── Tier resolution ───────────────────────────────────────────────────────────

# Fallback map if PADDLE_PRICE_MAP is not configured in .env
_DEFAULT_TIER_MAP = {
    "starter":  "starter",
    "school":   "school",
    "district": "district",
    "enterprise": "enterprise",
    "homeschool_family": "homeschool_family",
    "homeschool_coop":   "homeschool_coop",
}


def _resolve_tier(price_id: str) -> str:
    """Map a Paddle price_id to an internal license_tier string."""
    configured = settings.PADDLE_PRICE_MAP
    if configured:
        return configured.get(price_id, "starter")
    # Fallback: if price_id contains a known tier name, use it
    for tier in _DEFAULT_TIER_MAP:
        if tier in price_id.lower():
            return tier
    return "starter"


# ── Signature verification ────────────────────────────────────────────────────

def _verify_paddle_signature(raw_body: bytes, signature_header: str) -> bool:
    """
    Verify Paddle webhook signature.
    Header format: ts=1234567890;h1=abc123...
    Signed data:   {ts}:{raw_body}
    """
    if not settings.PADDLE_WEBHOOK_SECRET:
        # SECURITY: fail open ONLY in development. In any other environment an
        # unset secret must reject all webhooks — otherwise anyone who can
        # reach POST /webhooks/paddle can forge subscription.created events
        # and grant themselves (or any org) a paid license tier for free.
        if settings.ENVIRONMENT.lower() == "development":
            logger.warning("[paddle] PADDLE_WEBHOOK_SECRET not set — skipping signature check (development only)")
            return True
        logger.error("[paddle] PADDLE_WEBHOOK_SECRET not set in non-development environment — rejecting webhook")
        return False

    try:
        parts = dict(p.split("=", 1) for p in signature_header.split(";") if "=" in p)
        ts      = parts.get("ts", "")
        h1_recv = parts.get("h1", "")
        signed  = f"{ts}:{raw_body.decode()}".encode()
        h1_calc = hmac.new(
            settings.PADDLE_WEBHOOK_SECRET.encode(),
            signed,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(h1_recv, h1_calc)
    except Exception as exc:
        logger.error(f"[paddle] Signature verification error: {exc}")
        return False


# ── Audit helper ──────────────────────────────────────────────────────────────

async def _audit(db: AsyncSession, action: str, org_id: str | None, meta: dict):
    await db.execute(text("""
        INSERT INTO platform_audit_log (id, actor_user_id, action, target_org_id, metadata, created_at)
        VALUES (:id, NULL, :action, :org_id, CAST(:meta AS jsonb), NOW())
    """), {
        "id":     str(uuid.uuid4()),
        "action": action,
        "org_id": org_id,
        "meta":   json.dumps(meta),
    })


# ── Event handlers ────────────────────────────────────────────────────────────

async def _handle_subscription_created(db: AsyncSession, data: dict):
    """
    A new subscription was created.
    Activate the org: set tier from price_id, mark active, store Paddle IDs.
    """
    sub_id      = data.get("id", "")
    customer_id = data.get("customer_id", "")
    status      = data.get("status", "active")
    items       = data.get("items", [])
    price_id    = items[0]["price"]["id"] if items else ""
    tier        = _resolve_tier(price_id)

    # Custom data: org_id should be passed in checkout custom_data
    custom_data = data.get("custom_data") or {}
    org_id = custom_data.get("org_id") or data.get("custom_data", {}).get("org_id")

    if not org_id:
        logger.warning(f"[paddle] subscription.created: no org_id in custom_data — sub={sub_id}")
        return

    await db.execute(text("""
        UPDATE organizations
        SET    license_tier          = :tier,
               license_status        = 'active',
               paddle_customer_id    = :cid,
               paddle_subscription_id = :sid,
               paddle_price_id       = :price_id,
               trial_started_at      = COALESCE(trial_started_at, NOW()),
               updated_at            = NOW()
        WHERE  id = :org_id
    """), {"tier": tier, "cid": customer_id, "sid": sub_id,
           "price_id": price_id, "org_id": org_id})

    await _apply_tier_limits(db, org_id, tier)

    await _audit(db, "subscription_created", org_id, {
        "subscription_id": sub_id, "tier": tier, "price_id": price_id,
        "paddle_status": status,
    })
    logger.info(f"[paddle] subscription.created org={org_id} tier={tier} sub={sub_id}")


async def _handle_subscription_updated(db: AsyncSession, data: dict):
    """
    Plan change or renewal update.
    Re-resolve tier from price_id and update status.
    """
    sub_id   = data.get("id", "")
    status   = data.get("status", "active")
    items    = data.get("items", [])
    price_id = items[0]["price"]["id"] if items else ""
    tier     = _resolve_tier(price_id)

    # Map Paddle statuses to internal
    internal_status = {
        "active":   "active",
        "past_due": "active",   # keep active, warn separately
        "paused":   "suspended",
        "cancelled": "grace_period",
    }.get(status, "active")

    result = await db.execute(text("""
        UPDATE organizations
        SET    license_tier            = :tier,
               license_status          = :status,
               paddle_subscription_id  = :sid,
               paddle_price_id         = :price_id,
               updated_at              = NOW()
        WHERE  paddle_subscription_id = :sid
        RETURNING id
    """), {"tier": tier, "status": internal_status,
           "sid": sub_id, "price_id": price_id})

    row = result.fetchone()
    org_id = str(row[0]) if row else None
    if org_id and internal_status == "active":
        await _apply_tier_limits(db, org_id, tier)
    await _audit(db, "subscription_updated", org_id, {
        "subscription_id": sub_id, "tier": tier,
        "paddle_status": status, "internal_status": internal_status,
    })
    logger.info(f"[paddle] subscription.updated org={org_id} tier={tier} status={internal_status}")


async def _handle_subscription_cancelled(db: AsyncSession, data: dict):
    """
    Subscription cancelled. Set grace_period_started_at.
    The trial_expiry_check job will downgrade to free after 30 days.
    """
    sub_id = data.get("id", "")

    result = await db.execute(text("""
        UPDATE organizations
        SET    license_status          = 'grace_period',
               grace_period_started_at = NOW(),
               updated_at              = NOW()
        WHERE  paddle_subscription_id = :sid
        RETURNING id, contact_email, name
    """), {"sid": sub_id})

    row = result.fetchone()
    if not row:
        logger.warning(f"[paddle] subscription.cancelled: no org found for sub={sub_id}")
        return

    org_id, contact_email, org_name = str(row[0]), row[1], row[2]
    await _audit(db, "subscription_cancelled", org_id, {"subscription_id": sub_id})

    # Send cancellation email
    if contact_email:
        try:
            from services.email_service import send_notification
            from core.config import settings as _s
            await send_notification(
                contact_email,
                f"Your {org_name} subscription has been cancelled",
                (
                    f"Your Peripateticware subscription has been cancelled. "
                    f"Your account will remain active for 30 days, after which it "
                    f"will revert to the free tier. "
                    f"<a href='{_s.FRONTEND_URL}/billing'>Reactivate your subscription</a> "
                    f"at any time to keep your current plan."
                ),
            )
        except Exception as exc:
            logger.warning(f"[paddle] Cancellation email failed: {exc}")

    logger.info(f"[paddle] subscription.cancelled org={org_id}")


async def _handle_payment_failed(db: AsyncSession, data: dict):
    """Payment failed — send warning email, do not change tier or block service."""
    sub_id     = data.get("subscription_id", "")
    amount     = data.get("details", {}).get("totals", {}).get("grand_total", "?")
    currency   = data.get("currency_code", "USD")

    result = await db.execute(text("""
        SELECT id, contact_email, name FROM organizations
        WHERE  paddle_subscription_id = :sid
    """), {"sid": sub_id})
    row = result.fetchone()
    if not row:
        return

    org_id, contact_email, org_name = str(row[0]), row[1], row[2]
    await _audit(db, "payment_failed", org_id, {
        "subscription_id": sub_id, "amount": str(amount), "currency": currency,
    })

    if contact_email:
        try:
            from services.email_service import send_notification
            from core.config import settings as _s
            await send_notification(
                contact_email,
                f"Payment issue with your {org_name} account",
                (
                    f"A payment of {currency} {amount} for your Peripateticware subscription "
                    f"could not be processed. Your service continues uninterrupted while we retry. "
                    f"<a href='{_s.FRONTEND_URL}/billing'>Update your payment details</a> "
                    f"to avoid any interruption."
                ),
            )
        except Exception as exc:
            logger.warning(f"[paddle] Payment failed email error: {exc}")

    logger.info(f"[paddle] payment_failed org={org_id}")


# ── Webhook endpoint ──────────────────────────────────────────────────────────

_HANDLERS = {
    "subscription.created":   _handle_subscription_created,
    "subscription.updated":   _handle_subscription_updated,
    "subscription.cancelled": _handle_subscription_cancelled,
    "transaction.payment_failed": _handle_payment_failed,
}


@router.post("/webhooks/paddle", status_code=200)
async def paddle_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Receives and processes Paddle webhook events.
    Paddle requires a 200 response within 5 seconds; all processing is synchronous
    but fast (DB writes only, emails fire-and-forget).
    """
    raw_body = await request.body()
    sig_header = request.headers.get("Paddle-Signature", "")

    if not _verify_paddle_signature(raw_body, sig_header):
        logger.warning("[paddle] Invalid webhook signature — rejecting")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = payload.get("event_type", "")
    event_data = payload.get("data", {})

    logger.info(f"[paddle] Received event: {event_type}")

    handler = _HANDLERS.get(event_type)
    if handler:
        try:
            await handler(db, event_data)
            await db.commit()
        except Exception as exc:
            await db.rollback()
            logger.error(f"[paddle] Handler error for {event_type}: {exc}")
            # Return 200 anyway — Paddle will retry if we return 5xx
    else:
        logger.debug(f"[paddle] Unhandled event type: {event_type}")

    return {"received": True, "event_type": event_type}
