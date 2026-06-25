# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
License JWT issuance (Ed25519).

issue_license_jwt(org_id, tier, valid_until) → compact JWT signed with
the platform's Ed25519 private key.  The JWT is stored nowhere sensitive —
it can be re-issued at any time.  Clients can verify it with the public key.

Key management:
  Private key: LICENSE_PRIVATE_KEY_B64 env var (base64-encoded PEM)
  Public  key: LICENSE_PUBLIC_KEY_B64  env var (base64-encoded PEM)
  If env vars are absent, a random ephemeral key pair is generated at startup
  (suitable for development only — restarts invalidate all tokens).

Usage:
    from services.license_service import issue_license_jwt, verify_license_jwt

    jwt_str = issue_license_jwt(org_id="...", tier="school", valid_until=date)
    payload = verify_license_jwt(jwt_str)   # raises if invalid/expired
"""

from __future__ import annotations

import base64
import logging
import os
from datetime import date, datetime, timezone
from typing import Any, Optional

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives import serialization

logger = logging.getLogger(__name__)

# ── Key loading / generation ──────────────────────────────────────────────────

_PRIVATE_KEY: Optional[Ed25519PrivateKey] = None
_PUBLIC_KEY:  Optional[Ed25519PublicKey]  = None


def _load_keys() -> tuple[Ed25519PrivateKey, Ed25519PublicKey]:
    global _PRIVATE_KEY, _PUBLIC_KEY
    if _PRIVATE_KEY and _PUBLIC_KEY:
        return _PRIVATE_KEY, _PUBLIC_KEY

    priv_b64 = os.getenv("LICENSE_PRIVATE_KEY_B64")
    pub_b64  = os.getenv("LICENSE_PUBLIC_KEY_B64")

    if priv_b64 and pub_b64:
        priv_pem = base64.b64decode(priv_b64)
        pub_pem  = base64.b64decode(pub_b64)
        _PRIVATE_KEY = serialization.load_pem_private_key(priv_pem, password=None)  # type: ignore[assignment]
        _PUBLIC_KEY  = serialization.load_pem_public_key(pub_pem)  # type: ignore[assignment]
        logger.info("[license_service] Ed25519 keys loaded from environment")
    else:
        logger.warning(
            "[license_service] LICENSE_PRIVATE_KEY_B64 not set — "
            "generating ephemeral key pair (dev only, not suitable for production)"
        )
        _PRIVATE_KEY = Ed25519PrivateKey.generate()
        _PUBLIC_KEY  = _PRIVATE_KEY.public_key()

    return _PRIVATE_KEY, _PUBLIC_KEY


# ── JWT encode/decode (manual — no python-jose Ed25519 support in all versions) ──

import json
import hmac
import struct


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    s += "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)


def issue_license_jwt(
    org_id: str,
    tier: str,
    valid_until: date,
    extra: Optional[dict] = None,
) -> str:
    """
    Issue a compact license JWT signed with Ed25519.

    Payload claims:
      sub  — org_id
      tier — license tier string
      exp  — Unix timestamp of valid_until (end of day UTC)
      iat  — issuance time
    """
    priv, _ = _load_keys()

    exp = int(datetime(valid_until.year, valid_until.month, valid_until.day,
                       23, 59, 59, tzinfo=timezone.utc).timestamp())
    iat = int(datetime.now(timezone.utc).timestamp())

    payload: dict[str, Any] = {
        "sub":  org_id,
        "tier": tier,
        "exp":  exp,
        "iat":  iat,
    }
    if extra:
        payload.update(extra)

    header  = _b64url(json.dumps({"alg": "EdDSA", "typ": "JWT"}).encode())
    claims  = _b64url(json.dumps(payload).encode())
    signing_input = f"{header}.{claims}".encode()

    signature = priv.sign(signing_input)
    return f"{header}.{claims}.{_b64url(signature)}"


def verify_license_jwt(token: str) -> dict:
    """
    Verify an Ed25519 license JWT.  Returns the payload dict on success.
    Raises ValueError on invalid signature or expiry.
    """
    _, pub = _load_keys()

    try:
        header_b64, claims_b64, sig_b64 = token.split(".")
    except ValueError:
        raise ValueError("Malformed JWT (expected 3 parts)")

    signing_input = f"{header_b64}.{claims_b64}".encode()
    sig = _b64url_decode(sig_b64)

    try:
        pub.verify(sig, signing_input)
    except Exception:
        raise ValueError("Invalid JWT signature")

    payload = json.loads(_b64url_decode(claims_b64))
    exp = payload.get("exp", 0)
    if exp < datetime.now(timezone.utc).timestamp():
        raise ValueError("License JWT has expired")

    return payload


async def refresh_org_license(db, org_id: str) -> Optional[str]:
    """
    Re-issue a license JWT for an org using its current DB tier/valid_until.
    Returns the JWT string, or None if the org doesn't exist.
    """
    from sqlalchemy import text
    row = (await db.execute(
        text("SELECT license_tier, license_valid_until FROM organizations WHERE id = :oid"),
        {"oid": org_id},
    )).first()
    if not row:
        return None
    tier, valid_until = row
    if valid_until is None:
        # Default: 30 days from now
        from datetime import timedelta
        valid_until = (datetime.now(timezone.utc) + timedelta(days=30)).date()
    if hasattr(valid_until, 'date'):
        valid_until = valid_until.date()
    return issue_license_jwt(org_id=org_id, tier=tier or "free", valid_until=valid_until)
