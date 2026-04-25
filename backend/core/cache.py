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
