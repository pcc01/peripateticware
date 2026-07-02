# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Signed, time-limited URL token service.

Usage
-----
Generate a token:
    token = SignedURL.generate(purpose="password_reset", payload={"user_id": str(uid)})
    link = f"https://app.example.com/reset?token={token}"

Validate a token (raises SignedURLError on failure):
    data = SignedURL.validate(token, purpose="password_reset")
    user_id = data["user_id"]

Purposes and default TTLs:
    password_reset       60 minutes
    email_verification   24 hours
    parent_consent       72 hours
    export_download       1 hour

How it works
------------
token = base64url( JSON payload ) + "." + HMAC-SHA256( base64url(payload) , SECRET_KEY )
The payload includes: purpose, exp (Unix timestamp), and any caller-supplied fields.
No database needed — the signature proves authenticity, exp proves freshness.
"""

import base64
import hashlib
import hmac
import json
import time
import os
import uuid
from typing import Any, Dict, Optional

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class SignedURLError(Exception):
    """Raised when a token is invalid, expired, or tampered with."""
    pass

class SignedURLExpired(SignedURLError):
    """Token is structurally valid but has passed its expiry time."""
    pass

# ---------------------------------------------------------------------------
# TTL registry (seconds)
# ---------------------------------------------------------------------------

DEFAULT_TTL: Dict[str, int] = {
    "password_reset":       60 * 60,        # 1 hour
    "email_verification":   24 * 60 * 60,   # 24 hours
    "parent_consent":       72 * 60 * 60,   # 72 hours
    "export_download":       1 * 60 * 60,   # 1 hour
    "media_access":              5 * 60,    # 5 minutes — short-lived <audio>/<img> src token
}

# ---------------------------------------------------------------------------
# Core service
# ---------------------------------------------------------------------------

class SignedURL:
    """HMAC-signed, time-limited token utilities."""

    @staticmethod
    def _secret() -> bytes:
        key = os.environ.get("SECRET_KEY", "dev-secret-change-before-deploy")
        return key.encode()

    @staticmethod
    def _b64_encode(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    @staticmethod
    def _b64_decode(s: str) -> bytes:
        # Restore padding
        padding = 4 - len(s) % 4
        if padding != 4:
            s += "=" * padding
        return base64.urlsafe_b64decode(s)

    @classmethod
    def _sign(cls, encoded_payload: str) -> str:
        sig = hmac.new(
            cls._secret(),
            encoded_payload.encode(),
            hashlib.sha256,
        ).digest()
        return cls._b64_encode(sig)

    @classmethod
    def generate(
        cls,
        purpose: str,
        payload: Optional[Dict[str, Any]] = None,
        ttl_seconds: Optional[int] = None,
    ) -> str:
        """
        Generate a signed token.

        Parameters
        ----------
        purpose : str
            One of the registered purposes (e.g. "password_reset").
        payload : dict, optional
            Arbitrary extra data to embed (e.g. {"user_id": "..."}).
        ttl_seconds : int, optional
            Override default TTL for this purpose.

        Returns
        -------
        str
            Opaque token string safe for URLs and email links.
        """
        ttl = ttl_seconds or DEFAULT_TTL.get(purpose, 3600)
        full_payload = {
            "purpose": purpose,
            "exp": int(time.time()) + ttl,
            # Unique per-token ID so a specific token (not the whole class of
            # tokens) can be marked "already used" — see validate(consume=True).
            "tid": uuid.uuid4().hex,
            **(payload or {}),
        }
        encoded = cls._b64_encode(json.dumps(full_payload, separators=(",", ":")).encode())
        sig = cls._sign(encoded)
        return f"{encoded}.{sig}"

    @classmethod
    async def validate(cls, token: str, purpose: str, consume: bool = False) -> Dict[str, Any]:
        """
        Validate a signed token and return its payload.

        Parameters
        ----------
        token : str
            Token string produced by generate().
        purpose : str
            Expected purpose — prevents tokens from one flow being used in another.
        consume : bool
            If True, atomically mark this specific token as used (via a Redis
            denylist keyed on its "tid", TTL'd to its remaining lifetime) and
            reject it if it was already consumed. Use consume=True for the
            action that actually spends the token (resetting the password,
            activating the account) and consume=False (default) for
            non-destructive checks (e.g. "is this link still valid?" before
            showing a form) that must not burn the token themselves.

            Without this, a leaked reset/verification link stays usable
            repeatedly until it naturally expires.

        Returns
        -------
        dict
            The embedded payload (minus internal fields).

        Raises
        ------
        SignedURLExpired
            Token signature is valid but the expiry time has passed.
        SignedURLError
            Token is malformed, signature mismatch, wrong purpose, or (when
            consume=True) has already been used once.
        """
        try:
            parts = token.split(".")
            if len(parts) != 2:
                raise SignedURLError("Malformed token")
            encoded_payload, provided_sig = parts
        except Exception:
            raise SignedURLError("Malformed token")

        # Constant-time signature comparison
        expected_sig = cls._sign(encoded_payload)
        if not hmac.compare_digest(expected_sig, provided_sig):
            raise SignedURLError("Invalid token signature")

        try:
            raw = cls._b64_decode(encoded_payload)
            data = json.loads(raw)
        except Exception:
            raise SignedURLError("Token payload could not be decoded")

        if data.get("purpose") != purpose:
            raise SignedURLError(f"Token purpose mismatch: expected '{purpose}'")

        if int(time.time()) > data.get("exp", 0):
            raise SignedURLExpired("Token has expired")

        if consume:
            from core.cache import get_cache, set_cache

            tid = data.get("tid")
            if tid:
                cache_key = f"used_signed_url:{tid}"
                try:
                    already_used = (await get_cache(cache_key)) is not None
                    if already_used:
                        raise SignedURLError("Token has already been used")
                    ttl = max(1, int(data.get("exp", 0) - time.time()))
                    await set_cache(cache_key, True, ttl=ttl)
                except SignedURLError:
                    raise
                except Exception:
                    # Fail open on cache errors — same convention as the rest
                    # of core/cache.py — a brief Redis outage shouldn't lock
                    # a legitimate user out of resetting their password.
                    pass

        # Return payload without internal fields
        return {k: v for k, v in data.items() if k not in ("purpose", "exp", "tid")}

    @classmethod
    def expires_in_minutes(cls, token: str) -> Optional[int]:
        """Return minutes remaining before expiry, or None if invalid/expired."""
        try:
            encoded_payload = token.split(".")[0]
            data = json.loads(cls._b64_decode(encoded_payload))
            remaining = data.get("exp", 0) - int(time.time())
            return max(0, remaining // 60) if remaining > 0 else 0
        except Exception:
            return None
