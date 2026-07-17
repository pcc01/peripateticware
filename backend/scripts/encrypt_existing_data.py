#!/usr/bin/env python3
# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
One-time backfill script: encrypt all existing plaintext PII in the database.
Run AFTER deploying code with FIELD_ENCRYPTION_KEY set AND after running the
SQL migration in migrations/add_field_encryption.py.

Usage:
    FIELD_ENCRYPTION_KEY=<key> python backend/scripts/encrypt_existing_data.py

Generate a key:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""
import asyncio
import logging
import sys
import os

# Add backend to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text
from core.database import get_session_factory
from core.encryption import encrypt, blind_index, _encryption_enabled

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


async def backfill_users(db) -> int:
    """Encrypt email and full_name for all users; populate email_index."""
    rows = (await db.execute(text("SELECT id, email, full_name FROM users"))).fetchall()
    updated = 0
    skipped = 0
    for row in rows:
        uid, email, full_name = row
        try:
            enc_email = encrypt(email) if email else None
            idx = blind_index(email) if email else None
            enc_name = encrypt(full_name) if full_name else None
            await db.execute(text("""
                UPDATE users
                SET email = :email, email_index = :idx, full_name = :name
                WHERE id = :id
            """), {"email": enc_email, "idx": idx, "name": enc_name, "id": str(uid)})
            updated += 1
        except Exception as e:
            logger.error("Failed to encrypt user %s: %s", uid, e)
            skipped += 1
    logger.info("Users: encrypted %d/%d rows (%d skipped)", updated, len(rows), skipped)
    return updated


async def backfill_captures(db) -> int:
    """Populate location_lat_enc / location_lon_enc from existing Float columns."""
    rows = (await db.execute(text(
        "SELECT id, location_latitude, location_longitude FROM student_captures "
        "WHERE location_latitude IS NOT NULL"
    ))).fetchall()
    updated = 0
    skipped = 0
    for row in rows:
        cid, lat, lon = row
        try:
            enc_lat = encrypt(str(lat)) if lat is not None else None
            enc_lon = encrypt(str(lon)) if lon is not None else None
            await db.execute(text("""
                UPDATE student_captures
                SET location_lat_enc = :lat, location_lon_enc = :lon
                WHERE id = :id
            """), {"lat": enc_lat, "lon": enc_lon, "id": str(cid)})
            updated += 1
        except Exception as e:
            logger.error("Failed to encrypt capture %s: %s", cid, e)
            skipped += 1
    logger.info("Captures: encrypted %d/%d rows (%d skipped)", updated, len(rows), skipped)
    return updated


async def backfill_capture_file_paths(db) -> int:
    """
    RF-4: StudentCapture.file_path switched from plain VARCHAR(512) to
    EncryptedString(512) (models/database.py). Encrypt any existing plaintext
    file_path values in place — same idempotency caveat as backfill_users:
    running this twice would double-encrypt a row. If this script grows a
    second run, guard with a "looks like a Fernet token already" check before
    re-encrypting (not done here to match the existing backfill_users/
    backfill_captures pattern in this file, which has the same caveat).
    """
    rows = (await db.execute(text(
        "SELECT id, file_path FROM student_captures WHERE file_path IS NOT NULL"
    ))).fetchall()
    updated = 0
    skipped = 0
    for row in rows:
        cid, file_path = row
        try:
            enc_path = encrypt(file_path) if file_path else None
            await db.execute(text("""
                UPDATE student_captures
                SET file_path = :file_path
                WHERE id = :id
            """), {"file_path": enc_path, "id": str(cid)})
            updated += 1
        except Exception as e:
            logger.error("Failed to encrypt capture file_path %s: %s", cid, e)
            skipped += 1
    logger.info("Capture file_paths: encrypted %d/%d rows (%d skipped)", updated, len(rows), skipped)
    return updated


async def backfill_consent_granted_by(db) -> int:
    """
    RF-4: ConsentRecord.granted_by switched from plain VARCHAR(256) to
    EncryptedString(256) (models/compliance.py). Encrypt any existing
    plaintext granted_by values (email addresses) in place.
    """
    rows = (await db.execute(text(
        "SELECT id, granted_by FROM consent_records WHERE granted_by IS NOT NULL"
    ))).fetchall()
    updated = 0
    skipped = 0
    for row in rows:
        rid, granted_by = row
        try:
            enc_val = encrypt(granted_by) if granted_by else None
            await db.execute(text("""
                UPDATE consent_records
                SET granted_by = :granted_by
                WHERE id = :id
            """), {"granted_by": enc_val, "id": str(rid)})
            updated += 1
        except Exception as e:
            logger.error("Failed to encrypt consent_records.granted_by %s: %s", rid, e)
            skipped += 1
    logger.info("consent_records.granted_by: encrypted %d/%d rows (%d skipped)", updated, len(rows), skipped)
    return updated


async def main() -> None:
    if not _encryption_enabled:
        logger.error(
            "FIELD_ENCRYPTION_KEY is not set — cannot run backfill. "
            "Set the env var and retry."
        )
        sys.exit(1)

    logger.info("Starting PII encryption backfill...")
    async_session_factory = get_session_factory()
    async with async_session_factory() as db:
        await backfill_users(db)
        await backfill_captures(db)
        await backfill_capture_file_paths(db)
        await backfill_consent_granted_by(db)
        await db.commit()
    logger.info("Backfill complete. All changes committed.")


if __name__ == "__main__":
    asyncio.run(main())
