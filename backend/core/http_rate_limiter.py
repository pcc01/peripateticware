# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Shared slowapi rate limiter — global default limit (main.py) + per-route
stricter limits (auth.py, reset.py, privacy.py's /consent).

Lives outside main.py so route modules can `from core.http_rate_limiter import
limiter` and add `@limiter.limit(...)` without importing back into main.py
(main.py imports the route modules while it's still executing its own
top-level code, so a route module importing `main.limiter` would be a
circular import racing against main.py's own initialisation order).

Previously this Limiter was instantiated in main.py and registered on
app.state, but nothing ever called `app.add_middleware(SlowAPIMiddleware)` —
without it, slowapi's `default_limits` never actually run, and every
`@_rate_limit(...)` decorator in auth.py was a literal no-op (see that
file's git history). Both gaps are fixed here: main.py now adds
SlowAPIMiddleware, and route modules get a real `limiter.limit(...)`
decorator instead of a no-op shim.
"""

import logging

logger = logging.getLogger(__name__)

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware

    from core.config import settings

    def _client_ip(request):
        """Rate-limit key that works behind Cloudflare Tunnel / reverse proxies.

        Behind cloudflared every request reaches uvicorn from the tunnel's
        local IP, so keying on get_remote_address alone puts ALL users in one
        shared bucket (one noisy user rate-limits everyone) and makes
        per-attacker throttling of /auth/login impossible.

        Preference order:
          1. CF-Connecting-IP — set by Cloudflare, not spoofable through CF
          2. X-Forwarded-For (first hop) — for other reverse proxies
          3. socket peer address — direct connections / dev
        NOTE: only trust these headers when the app is actually behind the
        proxy that sets them (it is, per the Cloudflare Tunnel deployment).
        """
        cf_ip = request.headers.get("CF-Connecting-IP")
        if cf_ip:
            return cf_ip.strip()
        xff = request.headers.get("X-Forwarded-For")
        if xff:
            return xff.split(",")[0].strip()
        return get_remote_address(request)

    # storage_uri=REDIS_URL is required, not cosmetic: prod runs gunicorn with
    # 4 worker processes (docker-compose.prod.yml), and slowapi's default
    # storage ("memory://") is per-process. Without a shared backend, each
    # worker keeps its own independent counter, so a client bouncing across
    # workers gets up to ~4x the intended limit. Redis makes the count global
    # across all workers, same as core/rate_limit.py's AI limiter already does.
    try:
        limiter = Limiter(
            key_func=_client_ip,
            default_limits=["200/minute"],
            storage_uri=settings.REDIS_URL,
        )
    except Exception:
        logger.exception(
            "Failed to attach Redis storage to the rate limiter — falling back "
            "to per-process in-memory storage (limits will be ~4x looser under "
            "gunicorn's multiple workers, but still enforced)."
        )
        limiter = Limiter(key_func=_client_ip, default_limits=["200/minute"])
    RATE_LIMIT_ENABLED = True

except ImportError:
    logger.warning("slowapi not installed — rate limiting DISABLED")

    class _NoOpLimiter:
        """Fallback so `@limiter.limit(...)` stays safe to use even without slowapi installed."""

        def limit(self, *_args, **_kwargs):
            def _decorator(fn):
                return fn
            return _decorator

    limiter = _NoOpLimiter()
    RATE_LIMIT_ENABLED = False
    RateLimitExceeded = Exception  # never raised in this branch
    _rate_limit_exceeded_handler = None
    SlowAPIMiddleware = None


# ─────────────────────────────────────────────────────────────────────────────
# Global per-IP rate limit  (pure-ASGI, independent of slowapi)
# ─────────────────────────────────────────────────────────────────────────────
# slowapi's `default_limits` are supposed to be enforced globally once
# SlowAPIMiddleware is attached — but in this app they silently are NOT
# (verified 2026-09-02 with a load test: 112k requests from one IP, zero 429s,
# while per-route `@limiter.limit("5/minute")` on /auth/login DID 429 on the
# 6th hit). Rather than keep fighting slowapi's middleware, this is a small,
# deterministic hard ceiling per client IP, backed by the same Redis (shared
# across gunicorn workers), written as pure-ASGI so it never wraps `send` and
# is therefore safe for the app's streaming (SSE) endpoints.
import os as _os
import time as _time

# requests/minute per client IP. 0 disables. Default 600 (10 r/s) is generous
# enough for a NAT'd classroom sharing one public IP but still stops a single
# host from hammering the API.
GLOBAL_HTTP_RATE_LIMIT = int(_os.getenv("GLOBAL_HTTP_RATE_LIMIT", "600"))
_GLOBAL_WINDOW_S = 60
_GLOBAL_EXEMPT_PREFIXES = ("/health", "/metrics", "/openapi.json", "/docs", "/redoc")


def _ip_from_scope(scope) -> str:
    headers = {k.decode("latin1").lower(): v.decode("latin1") for k, v in scope.get("headers", [])}
    cf = headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    xff = headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


async def _global_under_limit(ip: str) -> bool:
    """Sliding-window check in Redis. Fails OPEN if Redis is unreachable."""
    try:
        from core.rate_limit import _get_redis  # reuse the AI limiter's pool
        redis = await _get_redis()
        if redis is None:
            return True
        key = f"ratelimit:http:{ip}"
        now_ms = int(_time.time() * 1000)
        window_ms = _GLOBAL_WINDOW_S * 1000
        pipe = redis.pipeline()
        pipe.zremrangebyscore(key, 0, now_ms - window_ms)
        # unique member per call (perf_counter_ns) so two requests in the same
        # millisecond both count instead of collapsing to one zadd update
        pipe.zadd(key, {f"{now_ms}-{_time.perf_counter_ns()}": now_ms})
        pipe.zcard(key)
        pipe.expire(key, _GLOBAL_WINDOW_S + 2)
        results = await pipe.execute()
        return int(results[2]) <= GLOBAL_HTTP_RATE_LIMIT
    except Exception as exc:  # noqa: BLE001 — never let the limiter break traffic
        logger.warning("global rate limit check failed open: %s", exc)
        return True


class GlobalRateLimitMiddleware:
    """Hard per-IP request ceiling. Add via `app.add_middleware(...)`."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or GLOBAL_HTTP_RATE_LIMIT <= 0:
            return await self.app(scope, receive, send)
        if scope.get("method") == "OPTIONS" or scope.get("path", "").startswith(_GLOBAL_EXEMPT_PREFIXES):
            return await self.app(scope, receive, send)

        if not await _global_under_limit(_ip_from_scope(scope)):
            from starlette.responses import JSONResponse
            resp = JSONResponse(
                {"detail": f"Rate limit exceeded: {GLOBAL_HTTP_RATE_LIMIT} requests per {_GLOBAL_WINDOW_S}s. Please slow down."},
                status_code=429,
                headers={"Retry-After": str(_GLOBAL_WINDOW_S)},
            )
            return await resp(scope, receive, send)
        return await self.app(scope, receive, send)
