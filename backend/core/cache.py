# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Redis cache management"""

import redis.asyncio as redis
from core.config import settings
import logging
import json
from typing import Any, Optional

logger = logging.getLogger(__name__)

redis_client: Optional[redis.Redis] = None


async def initialize_cache():
    """Initialize Redis connection"""
    global redis_client
    try:
        redis_client = await redis.from_url(settings.REDIS_URL)
        await redis_client.ping()
        logger.info("Redis connection established")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        raise


async def get_cache(key: str) -> Optional[Any]:
    """Get value from cache"""
    try:
        value = await redis_client.get(key)
        if value:
            return json.loads(value)
        return None
    except Exception as e:
        logger.error(f"Cache get error: {e}")
        return None


async def set_cache(key: str, value: Any, ttl: int = 3600) -> bool:
    """Set value in cache with TTL"""
    try:
        await redis_client.setex(key, ttl, json.dumps(value))
        return True
    except Exception as e:
        logger.error(f"Cache set error: {e}")
        return False


async def delete_cache(key: str) -> bool:
    """Delete value from cache"""
    try:
        await redis_client.delete(key)
        return True
    except Exception as e:
        logger.error(f"Cache delete error: {e}")
        return False


async def clear_cache_prefix(prefix: str) -> int:
    """Clear all keys with given prefix"""
    try:
        keys = await redis_client.keys(f"{prefix}:*")
        if keys:
            return await redis_client.delete(*keys)
        return 0
    except Exception as e:
        logger.error(f"Cache clear error: {e}")
        return 0


# ============================================================================
# TOKEN REVOCATION (JWT jti denylist)
# ============================================================================
# JWTs are stateless by design, so revoking one before its natural `exp`
# needs an external record. We track revoked token IDs (jti claim) here with
# a TTL equal to the token's own remaining lifetime — entries evict
# themselves the moment the token would have expired anyway, so this never
# grows unbounded. Used by /auth/logout (revoke on logout) and /auth/refresh
# (revoke the old token when a new one is minted, so a refreshed-away token
# can't keep being used — see routes/auth.py).
#
# Fails open on Redis errors (same convention as get_cache/set_cache above):
# a brief Redis outage degrades to "can't revoke early", not "nobody can log
# in", consistent with how the rest of this module already behaves.

_REVOKED_JTI_PREFIX = "revoked_jti"


async def revoke_token(jti: Optional[str], ttl_seconds: int) -> bool:
    """Mark a token's jti as revoked for (up to) the rest of its natural life."""
    if not jti or ttl_seconds <= 0:
        return False
    return await set_cache(f"{_REVOKED_JTI_PREFIX}:{jti}", True, ttl=ttl_seconds)


async def is_token_revoked(jti: Optional[str]) -> bool:
    """True if this jti was explicitly revoked (logout / superseded by refresh)."""
    if not jti:
        return False
    try:
        return (await get_cache(f"{_REVOKED_JTI_PREFIX}:{jti}")) is not None
    except Exception as e:
        logger.error(f"Token revocation check error: {e}")
        return False


