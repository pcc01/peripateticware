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
