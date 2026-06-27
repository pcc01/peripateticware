#!/usr/bin/env python3
# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Migration: create privacy_notices table (P3-3 consent management).
Run once: python migrations/add_privacy_notices_table.py

Idempotent — uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
"""
import asyncio
import os
import asyncpg

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://peripateticware_user:peripateticware_secure_password_dev@postgres:5432/peripateticware",
)

SQL = """
CREATE TABLE IF NOT EXISTS privacy_notices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(20) NOT NULL,
    jurisdiction VARCHAR(50) NOT NULL,
    notice_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    effective_date TIMESTAMP NOT NULL DEFAULT NOW(),
    superseded_by UUID,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100),
    CONSTRAINT uq_notice_version_jurisdiction_type UNIQUE (version, jurisdiction, notice_type)
);

CREATE INDEX IF NOT EXISTS idx_privacy_notices_jurisdiction
    ON privacy_notices(jurisdiction, notice_type, is_current);
"""


async def main() -> None:
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute(SQL)
        print("Migration complete: privacy_notices table created (or already exists).")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
