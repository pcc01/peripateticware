# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Field-level encryption using Fernet (AES-128-CBC + HMAC-SHA256).

Usage:
    from core.encryption import EncryptedString, blind_index

    class User(Base):
        email      = Column(EncryptedString(255))   # stored encrypted
        email_index = Column(String(64), index=True) # HMAC blind index for WHERE lookups

    # When querying by email:
    from core.encryption import blind_index
    db.execute(select(User).where(User.email_index == blind_index(raw_email)))
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
from typing import Any, Optional

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import String
from sqlalchemy.engine.interfaces import Dialect
from sqlalchemy.types import TypeDecorator

logger = logging.getLogger(__name__)

_fernet: Optional[Fernet] = None
_hmac_key: Optional[bytes] = None
_encryption_enabled: bool = False

# Counts decrypt() calls that fell back to returning the raw value (i.e. the
# stored value was not a valid Fernet token). After the one-time migration
# (backend/scripts/encrypt_existing_data.py) this should stay at ZERO — any
# increase means a wrong/rotated key or genuinely corrupt data, NOT plaintext.
# Scrape this via /metrics or log-alert on it.
decrypt_fallback_count: int = 0

# When True, decrypt() raises instead of returning ciphertext on failure.
# Set PII_DECRYPT_STRICT=true AFTER the migration completes so a wrong key
# surfaces loudly instead of silently serving ciphertext as if it were data.
_DECRYPT_STRICT: bool = os.getenv("PII_DECRYPT_STRICT", "false").lower() == "true"


def _init_encryption() -> None:
    """Initialise Fernet and HMAC key from FIELD_ENCRYPTION_KEY env var."""
    global _fernet, _hmac_key, _encryption_enabled
    raw = os.getenv("FIELD_ENCRYPTION_KEY", "")
    if not raw:
        logger.warning(
            "FIELD_ENCRYPTION_KEY not set — field-level encryption DISABLED. "
            "Set this before deploying to production."
        )
        return
    try:
        # Fernet requires a 32-byte URL-safe base64 key.
        # Accept raw 32-byte hex or standard Fernet base64 key.
        key_bytes = raw.encode()
        if len(raw) == 44 and raw.endswith("="):
            # Looks like a proper Fernet key
            fernet_key = key_bytes
        else:
            # Treat as raw bytes / hex — derive a valid Fernet key via SHA-256
            raw_bytes = bytes.fromhex(raw) if len(raw) == 64 else raw.encode()
            fernet_key = base64.urlsafe_b64encode(hashlib.sha256(raw_bytes).digest())
        _fernet = Fernet(fernet_key)
        _hmac_key = hashlib.sha256(fernet_key + b":hmac").digest()
        _encryption_enabled = True
        logger.info("Field-level encryption ENABLED (Fernet + HMAC blind index)")
    except Exception as e:
        logger.error(f"Failed to initialise field encryption: {e} — encryption DISABLED")


# Initialise at import time
_init_encryption()


def encrypt(plaintext: str) -> str:
    """Encrypt a string. Returns ciphertext (base64 token). Passthrough if key not set."""
    if not _encryption_enabled or _fernet is None:
        return plaintext  # passthrough in dev
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """Decrypt a Fernet token.

    On failure the value is treated as pre-migration plaintext and returned
    as-is, BUT the fallback is now counted/logged (decrypt_fallback_count) so a
    wrong key doesn't silently serve ciphertext forever. Once the migration is
    done, set PII_DECRYPT_STRICT=true so failures raise instead of masquerading
    as data.
    """
    global decrypt_fallback_count
    if not _encryption_enabled or _fernet is None:
        return token
    try:
        return _fernet.decrypt(token.encode()).decode()
    except (InvalidToken, Exception) as exc:
        decrypt_fallback_count += 1
        logger.warning(
            "decrypt() fallback #%d — value is not a valid Fernet token "
            "(pre-migration plaintext, or WRONG/ROTATED KEY): %s",
            decrypt_fallback_count, type(exc).__name__,
        )
        if _DECRYPT_STRICT:
            raise
        return token


def blind_index(value: str) -> str:
    """Produce a deterministic HMAC-SHA256 hex digest for WHERE-clause lookups."""
    if not _encryption_enabled or _hmac_key is None:
        return value.lower().strip()  # normalise for consistent matching in dev
    return hmac.new(_hmac_key, value.lower().strip().encode(), hashlib.sha256).hexdigest()


def generate_key() -> str:
    """Generate a fresh Fernet key. Run once and store in FIELD_ENCRYPTION_KEY."""
    return Fernet.generate_key().decode()


def is_encrypted(value: Optional[str]) -> bool:
    """True if `value` is already a valid Fernet token under the current key.

    One-time backfill scripts (backend/scripts/encrypt_existing_data.py) need
    this to skip rows that are already encrypted — encrypt()/decrypt() alone
    have no way to tell "already encrypted" apart from "plaintext that
    happens to look odd," so a script that unconditionally re-encrypts every
    row on every run will double-wrap already-encrypted values: decrypt()
    then only unwraps the outer layer and returns ciphertext instead of the
    real plaintext, a silent corruption discovered in prod (2026-09) where a
    handful of rows created via a raw-SQL path had never been migrated
    alongside the rest.
    """
    if not _encryption_enabled or _fernet is None or not value:
        return False
    try:
        _fernet.decrypt(value.encode())
        return True
    except Exception:
        return False


class EncryptedString(TypeDecorator):
    """
    SQLAlchemy TypeDecorator that transparently encrypts on write and decrypts on read.

    Usage: replace Column(String(N)) with Column(EncryptedString(N))
    The underlying DB column stores the encrypted ciphertext (longer than N chars —
    Fernet adds ~60 bytes overhead; ensure the column is wide enough, e.g. 600 for a 255-char field).
    """
    impl = String
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Dialect) -> Optional[str]:
        """Encrypt before writing to DB."""
        if value is None:
            return None
        return encrypt(str(value))

    def process_result_value(self, value: Any, dialect: Dialect) -> Optional[str]:
        """Decrypt after reading from DB."""
        if value is None:
            return None
        return decrypt(str(value))
