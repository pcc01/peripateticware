# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Per-org sliding-window rate limiter for AI routes.

Usage (in a FastAPI route):
    from core.rate_limit import ai_rate_limit

    @router.post("/inference/inquiry")
    async def process_inquiry(
        request: InquiryRequest,
        db: AsyncSession = Depends(get_db),
        _: None = Depends(ai_rate_limit),   # enforces limit, raises 429 if exceeded
    ):
        ...

The dependency is intentionally non-blocking when:
  - The user is not authenticated (unauthenticated callers get a generous fallback limit)
  - Redis is unavailable (logs a warning, allows the request through)

This means adding it to a route that was previously open will not break
existing behaviour for unauthenticated callers.

Limits by license_tier:
  free / trial        →   5 requests/minute
  starter             →  10 requests/minute
  homeschool_family   →  10 requests/minute
  homeschool_coop     →  20 requests/minute
  school / school_byok→  50 requests/minute
  district            → 200 requests/minute
  enterprise          → 1000 requests/minute
  (unauthenticated)   →  15 requests/minute (IP-based)

Implementation: Redis sorted-set sliding window.
  Key:  ratelimit:ai:<org_id>  (or  ratelimit:ai:ip:<hashed_ip>)
  Score = timestamp in milliseconds
  Window = 60 seconds
  On each call: remove old members, add new, count, raise 429 if over.
"""

import hashlib
import logging
import time
from typing import Optional

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db

logger = logging.getLogger(__name__)

# ── Tier → requests-per-minute map ───────────────────────────────────────────

TIER_LIMITS: dict[str, int] = {
    "free":              5,
    "trial":             5,
    "starter":          10,
    "homeschool_family": 10,
    "homeschool_coop":   20,
    "school":            50,
    "school_byok":       50,
    "district":         200,
    "district_byok":    200,
    "enterprise":      1000,
}

_UNAUTHENTICATED_LIMIT = 15   # generous fallback for callers without a JWT
_WINDOW_SECONDS        = 60


# ── Redis connection (lazy, self-healing) ─────────────────────────────────────

_redis_pool: Optional[aioredis.Redis] = None


async def _get_redis() -> Optional[aioredis.Redis]:
    """
    Return a Redis client. Tries (in order):
      1. The global client from core.cache (already initialised at startup if present)
      2. A fresh connection from REDIS_URL
      3. None — caller must fail open
    Never raises.
    """
    global _redis_pool

    # 1. Try the cache module's global first (avoids opening a second connection pool)
    try:
        from core.cache import redis_client as _global
        if _global is not None:
            return _global
    except Exception:
        pass

    # 2. Try our own pool
    if _redis_pool is not None:
        try:
            await _redis_pool.ping()
            return _redis_pool
        except Exception:
            _redis_pool = None  # stale — will recreate below

    # 3. Create a new pool
    try:
        _redis_pool = await aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
        await _redis_pool.ping()
        return _redis_pool
    except Exception as exc:
        logger.warning(f"[rate_limit] Redis unavailable — rate limiting disabled: {exc}")
        return None


# ── Core sliding-window check ─────────────────────────────────────────────────

async def check_ai_rate_limit(
    redis: aioredis.Redis,
    identity: str,
    limit: int,
) -> None:
    """
    Sliding-window check using a Redis sorted set.
    Raises HTTPException(429) if the identity has exceeded `limit` calls
    in the last 60 seconds.

    Args:
        redis:    live Redis client
        identity: unique string per rate-limited entity (org_id or hashed IP)
        limit:    max requests allowed per minute
    """
    key      = f"ratelimit:ai:{identity}"
    now_ms   = int(time.time() * 1000)
    window   = _WINDOW_SECONDS * 1000   # ms

    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, 0, now_ms - window)          # evict old entries
    pipe.zadd(key, {str(now_ms): now_ms})                   # record this request
    pipe.zcard(key)                                         # count window entries
    pipe.expire(key, _WINDOW_SECONDS + 2)                   # TTL safety margin
    results = await pipe.execute()

    count: int = results[2]
    # Tracking only — never block. Log high usage for platform analytics.
    if count > limit:
        logger.info(
            f"[rate_limit] High usage (tracking only): identity={identity} "
            f"count={count} limit={limit} window={_WINDOW_SECONDS}s"
        )


# ── FastAPI dependency ────────────────────────────────────────────────────────

async def ai_rate_limit(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Optional[str]:
    """
    FastAPI dependency. Apply with `_: None = Depends(ai_rate_limit)`.

    Resolution order for identity + limit:
      1. Authenticated user → look up org_id + license_tier → per-org limit
      2. No valid JWT       → hashed client IP → unauthenticated limit
      3. Redis down         → log warning, allow through

    Returns org_id string if the user is authenticated and has an org, else None.
    (Returned value can be used by the route as the org_id for ai_router.complete().)
    """
    redis = await _get_redis()
    if redis is None:
        # Redis is down — fail open, log once per request
        logger.warning("[rate_limit] Skipping rate limit check — Redis unavailable")
        return None

    # ── Try to identify caller from JWT ──────────────────────────────────────
    org_id: Optional[str]     = None
    license_tier: Optional[str] = None

    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[len("Bearer "):]
        try:
            from core.security import SecurityManager
            user_id = SecurityManager.extract_user_id_from_token(token)
            if user_id:
                # Fetch org_id and license_tier in one query
                row = (await db.execute(
                    text("""
                        SELECT o.id::text, o.license_tier
                        FROM   users u
                        JOIN   organizations o ON o.id = u.org_id
                        WHERE  u.id = :uid
                        LIMIT  1
                    """),
                    {"uid": str(user_id)},
                )).fetchone()
                if row:
                    org_id       = row[0]
                    license_tier = row[1]
        except Exception as exc:
            # Bad token or DB hiccup — treat as unauthenticated
            logger.debug(f"[rate_limit] Could not resolve org from token: {exc}")

    # ── Determine identity string and limit ───────────────────────────────────
    if org_id and license_tier:
        limit    = TIER_LIMITS.get(license_tier, _UNAUTHENTICATED_LIMIT)
        identity = org_id
    else:
        # Fall back to hashed client IP (privacy-preserving)
        client_ip = (
            request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown")
        )
        identity  = "ip:" + hashlib.sha256(client_ip.encode()).hexdigest()[:16]
        limit     = _UNAUTHENTICATED_LIMIT

    await check_ai_rate_limit(redis, identity, limit)
    return org_id
