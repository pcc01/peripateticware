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
    """Decrypt a Fernet token. Falls back to returning the value as-is if it's plaintext
    (for migration compatibility — plaintext rows from before encryption was enabled)."""
    if not _encryption_enabled or _fernet is None:
        return token
    try:
        return _fernet.decrypt(token.encode()).decode()
    except (InvalidToken, Exception):
        # Value is likely pre-migration plaintext — return as-is
        return token


def blind_index(value: str) -> str:
    """Produce a deterministic HMAC-SHA256 hex digest for WHERE-clause lookups."""
    if not _encryption_enabled or _hmac_key is None:
        return value.lower().strip()  # normalise for consistent matching in dev
    return hmac.new(_hmac_key, value.lower().strip().encode(), hashlib.sha256).hexdigest()


def generate_key() -> str:
    """Generate a fresh Fernet key. Run once and store in FIELD_ENCRYPTION_KEY."""
    return Fernet.generate_key().decode()


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
