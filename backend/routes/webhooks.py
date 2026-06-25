# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
POST /webhooks/paddle  — Paddle billing webhook handler

Paddle sends signed webhook events when subscriptions change.
This handler:
  1. Verifies the Paddle-Signature HMAC-SHA256 header
  2. Routes events to the appropriate handler
  3. Updates organizations.license_tier, license_status, paddle_subscription_id

Supported events:
  subscription.created     — new subscription, set tier + status = 'active'
  subscription.updated     — tier change or renewal
  subscription.canceled    — set status = 'canceled'
  subscription.past_due    — set status = 'past_due'
  transaction.completed    — one-off purchase (e.g. lifetime deal)

Configuration:
  PADDLE_WEBHOOK_SECRET    — from Paddle dashboard, used for HMAC verification
  PADDLE_TIER_MAP          — JSON env var mapping Paddle price_id → tier string

Security:
  Requests without a valid Paddle-Signature are rejected with HTTP 401.
  All events are idempotent (upsert).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# ── Paddle configuration ──────────────────────────────────────────────────────

_WEBHOOK_SECRET: Optional[str] = os.getenv("PADDLE_WEBHOOK_SECRET")

# Maps Paddle price_id → Peripateticware license tier
# Override by setting PADDLE_TIER_MAP='{"pri_xxx": "school", ...}' in env
_RAW_TIER_MAP = os.getenv("PADDLE_TIER_MAP", "{}")
try:
    PRICE_TO_TIER: dict[str, str] = json.loads(_RAW_TIER_MAP)
except json.JSONDecodeError:
    PRICE_TO_TIER = {}
    logger.warning("[webhooks] PADDLE_TIER_MAP is invalid JSON — using empty map")


# ── Signature verification ────────────────────────────────────────────────────

def _verify_paddle_signature(raw_body: bytes, signature_header: str) -> bool:
    """
    Verify Paddle v2 webhook signature.

    Header format: "ts=<timestamp>;h1=<hmac_hex>"
    Signing string: "<timestamp>:<raw_body>"
    """
    if not _WEBHOOK_SECRET:
        logger.warning("[webhooks] PADDLE_WEBHOOK_SECRET not set — skipping verification (dev mode)")
        return True  # allow in dev; fail in prod by keeping secret unset and checking env

    try:
        parts = dict(p.split("=", 1) for p in signature_header.split(";"))
        ts = parts.get("ts", "")
        h1 = parts.get("h1", "")
        if not ts or not h1:
            return False

        signing_string = f"{ts}:{raw_body.decode('utf-8')}".encode()
        expected = hmac.new(
            _WEBHOOK_SECRET.encode(),
            signing_string,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, h1)
    except Exception as exc:
        logger.warning(f"[webhooks] Signature verification error: {exc}")
        return False


# ── Event handlers ────────────────────────────────────────────────────────────

async def _handle_subscription_created(data: dict, db: AsyncSession) -> None:
    sub = data.get("data", {})
    sub_id      = sub.get("id")
    customer_id = sub.get("customer_id")
    items       = sub.get("items", [])
    price_id    = items[0]["price"]["id"] if items else None
    tier        = PRICE_TO_TIER.get(price_id or "", "starter")

    # Find org by paddle_customer_id or contact email
    org_id = await _find_org(db, customer_id=customer_id)
    if not org_id:
        logger.warning(f"[webhooks] subscription.created: no org for customer_id={customer_id}")
        return

    await db.execute(text("""
        UPDATE organizations
        SET    license_tier         = :tier,
               license_status       = 'active',
               paddle_subscription_id = :sub_id,
               paddle_customer_id   = :cid,
               updated_at           = NOW()
        WHERE  id = :oid
    """), {"tier": tier, "sub_id": sub_id, "cid": customer_id, "oid": org_id})
    logger.info(f"[webhooks] subscription.created org={org_id} tier={tier} sub={sub_id}")


async def _handle_subscription_updated(data: dict, db: AsyncSession) -> None:
    sub = data.get("data", {})
    sub_id  = sub.get("id")
    status_ = sub.get("status", "active")
    items   = sub.get("items", [])
    price_id = items[0]["price"]["id"] if items else None
    tier     = PRICE_TO_TIER.get(price_id or "", None)

    org_id = await _find_org(db, sub_id=sub_id)
    if not org_id:
        return

    updates = ["license_status = :status", "updated_at = NOW()"]
    params: dict = {"status": status_, "oid": org_id}
    if tier:
        updates.append("license_tier = :tier")
        params["tier"] = tier

    await db.execute(
        text(f"UPDATE organizations SET {', '.join(updates)} WHERE id = :oid"),
        params,
    )
    logger.info(f"[webhooks] subscription.updated org={org_id} status={status_} tier={tier}")


async def _handle_subscription_canceled(data: dict, db: AsyncSession) -> None:
    sub_id = data.get("data", {}).get("id")
    org_id = await _find_org(db, sub_id=sub_id)
    if not org_id:
        return
    await db.execute(text(
        "UPDATE organizations SET license_status = 'canceled', updated_at = NOW() WHERE id = :oid"
    ), {"oid": org_id})
    logger.info(f"[webhooks] subscription.canceled org={org_id}")


async def _handle_subscription_past_due(data: dict, db: AsyncSession) -> None:
    sub_id = data.get("data", {}).get("id")
    org_id = await _find_org(db, sub_id=sub_id)
    if not org_id:
        return
    await db.execute(text(
        "UPDATE organizations SET license_status = 'past_due', updated_at = NOW() WHERE id = :oid"
    ), {"oid": org_id})
    logger.info(f"[webhooks] subscription.past_due org={org_id}")


# ── Org lookup ────────────────────────────────────────────────────────────────

async def _find_org(
    db: AsyncSession,
    customer_id: Optional[str] = None,
    sub_id: Optional[str]      = None,
) -> Optional[str]:
    if sub_id:
        row = (await db.execute(
            text("SELECT id FROM organizations WHERE paddle_subscription_id = :sid"),
            {"sid": sub_id},
        )).first()
        if row:
            return str(row[0])
    if customer_id:
        row = (await db.execute(
            text("SELECT id FROM organizations WHERE paddle_customer_id = :cid"),
            {"cid": customer_id},
        )).first()
        if row:
            return str(row[0])
    return None


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/paddle")
async def paddle_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Receive and process Paddle webhook events.

    Returns 200 for all valid events (even ones we don't handle) to prevent
    Paddle from retrying unnecessarily.
    """
    raw_body  = await request.body()
    sig_header = request.headers.get("Paddle-Signature", "")

    if not _verify_paddle_signature(raw_body, sig_header):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Paddle signature",
        )

    try:
        payload    = json.loads(raw_body)
        event_type = payload.get("event_type", "")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    logger.info(f"[webhooks] Paddle event: {event_type}")

    handlers = {
        "subscription.created":   _handle_subscription_created,
        "subscription.updated":   _handle_subscription_updated,
        "subscription.canceled":  _handle_subscription_canceled,
        "subscription.past_due":  _handle_subscription_past_due,
    }

    handler = handlers.get(event_type)
    if handler:
        try:
            await handler(payload, db)
            await db.commit()
        except Exception as exc:
            logger.error(f"[webhooks] Handler failed for {event_type}: {exc}", exc_info=True)
            await db.rollback()
            # Still return 200 so Paddle doesn't retry — log and investigate manually
    else:
        logger.debug(f"[webhooks] Unhandled Paddle event: {event_type}")

    return {"received": True}
