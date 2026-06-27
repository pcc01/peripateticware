# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Migration: Add field-level encryption support

Steps:
1. Widen users.email and users.full_name columns to VARCHAR(600)
2. Add users.email_index column (VARCHAR(64), unique index)
3. Add student_captures.location_lat_enc and location_lon_enc columns
4. notifications.message is already TEXT — no schema change needed; TypeDecorator
   handles encrypt/decrypt transparently without a DDL change.
5. Backfill: re-encrypt existing plaintext values (run as a data migration)

Run order: run this migration AFTER deploying the new code that has
FIELD_ENCRYPTION_KEY set in env. The backfill function will encrypt existing rows.
"""

UPGRADE_SQL = """
-- Widen email and full_name to hold Fernet ciphertext (~60 bytes overhead)
ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(600);
ALTER TABLE users ALTER COLUMN full_name TYPE VARCHAR(600);

-- Blind index column for WHERE-clause email lookups
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_index VARCHAR(64);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_index
    ON users(email_index) WHERE email_index IS NOT NULL;

-- Encrypted GPS coordinate columns (original Float columns kept for backwards compat)
ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS location_lat_enc VARCHAR(200);
ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS location_lon_enc VARCHAR(200);
"""

DOWNGRADE_SQL = """
ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255);
ALTER TABLE users ALTER COLUMN full_name TYPE VARCHAR(255);
ALTER TABLE users DROP COLUMN IF EXISTS email_index;
DROP INDEX CONCURRENTLY IF EXISTS idx_users_email_index;
ALTER TABLE student_captures DROP COLUMN IF EXISTS location_lat_enc;
ALTER TABLE student_captures DROP COLUMN IF EXISTS location_lon_enc;
"""

BACKFILL_DESCRIPTION = """
After running the SQL migration, run the backfill:
    python backend/scripts/encrypt_existing_data.py

This will:
1. Read each user's plaintext email/full_name
2. Encrypt them with Fernet
3. Write the HMAC blind index to email_index
4. Update the row

IMPORTANT: Set FIELD_ENCRYPTION_KEY before running the backfill.
IMPORTANT: The backfill reads the raw DB value — if encryption is already on,
           the TypeDecorator will decrypt before the script sees it, so it is
           safe to re-run but will double-encrypt if the key changes. Always
           run with the same key used to encrypt.
"""
