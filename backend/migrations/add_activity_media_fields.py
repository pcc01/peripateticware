#!/usr/bin/env python3
"""
Migration: add hero_image_url and attachments columns to activities table.
Run once: python migrations/add_activity_media_fields.py
"""
import asyncio
import os
import asyncpg

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/peripateticware")

SQL = """
ALTER TABLE activities ADD COLUMN IF NOT EXISTS hero_image_url VARCHAR(512);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
"""

async def main():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute(SQL)
        print("Migration complete: hero_image_url and attachments columns added to activities.")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
