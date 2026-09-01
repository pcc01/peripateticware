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
from prometheus_client import Counter
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
#
# Two forms of the same counter, deliberately:
#   - decrypt_fallback_count (plain int): per-process, used only in the log
#     line below — cheap, no dependency on /metrics being scraped.
#   - _decrypt_fallback_metric (Prometheus Counter): the one that's actually
#     observable in production. Previously this comment said "scrape via
#     /metrics" but nothing ever mounted a /metrics endpoint (prometheus-client
#     was a pinned, unused dependency) and gunicorn's 4 worker processes each
#     have an independent `decrypt_fallback_count`, so a wrong/rotated key
#     was invisible short of grepping container logs for the literal string
#     "decrypt() fallback". prometheus_client's multiprocess mode (see
#     main.py's /metrics mount + gunicorn.conf.py's child_exit hook) is what
#     actually aggregates this across all 4 workers.
decrypt_fallback_count: int = 0


class _NoOpCounter:
    """Stand-in used when a real Counter can't be created for any reason.
    Observability code must never be able to crash the app it's observing —
    confirmed the hard way: PROMETHEUS_MULTIPROC_DIR being set makes
    Counter() require that directory to exist THE MOMENT it's instantiated,
    in any process that inherits the env var. `alembic upgrade head` (which
    imports this module transitively via models.database -> models.user)
    runs before gunicorn.conf.py's on_starting hook creates that directory,
    and hit exactly this on a real prod deploy — FileNotFoundError took the
    whole container down before gunicorn ever started. That specific race is
    fixed at the compose level (docker-compose.prod.yml now mkdir's the
    directory before alembic runs), but a metric silently degrading to a
    no-op instead of a second latent way to crash the app is the correct
    posture regardless of what causes some future Counter() call to fail."""

    def inc(self, *_args, **_kwargs) -> None:
        pass


def _get_or_create_counter(name: str, description: str):
    """
    Counter(name, ...) raises ValueError("Duplicated timeseries...") if a
    collector with that name is already registered on the default global
    REGISTRY — which happens the moment this module is imported a second
    time in the same process. That's not a hypothetical: tests/test_encryption.py's
    _reload_encryption() helper does exactly this (del sys.modules + re-import)
    for test isolation, and hitting it crashed collection for unrelated test
    files too (pytest running one process for the whole suite). Reuse the
    already-registered collector instead of re-registering.
    """
    try:
        return Counter(name, description)
    except ValueError:
        try:
            from prometheus_client import REGISTRY
            return REGISTRY._names_to_collectors[name]  # type: ignore[return-value]
        except Exception as exc:
            logger.error(f"Could not reuse existing '{name}' collector — metric disabled: {exc}")
            return _NoOpCounter()
    except Exception as exc:
        # e.g. PROMETHEUS_MULTIPROC_DIR set but the directory doesn't exist
        # yet (see _NoOpCounter's docstring) — degrade the metric, not the app.
        logger.error(f"Could not create '{name}' metric — metric disabled: {exc}")
        return _NoOpCounter()


_decrypt_fallback_metric = _get_or_create_counter(
    "pii_decrypt_fallback_total",
    "Count of decrypt() calls that fell back to returning a non-Fernet value "
    "as-is. Should stay at zero after the one-time PII-encryption migration; "
    "any increase means a wrong/rotated FIELD_ENCRYPTION_KEY or corrupt data.",
)

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
        _decrypt_fallback_metric.inc()
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
