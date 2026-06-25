#!/usr/bin/env python3
"""
Migration: add orient_phase, inquiry_phase, reflect_phase columns to activities table.
Run once: python migrations/add_activity_phase_columns.py
"""
import asyncio
import os
import asyncpg

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/peripateticware")

SQL = """
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS orient_phase  TEXT,
  ADD COLUMN IF NOT EXISTS inquiry_phase TEXT,
  ADD COLUMN IF NOT EXISTS reflect_phase TEXT;
"""

async def main():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute(SQL)
        print("Migration complete: orient_phase, inquiry_phase, reflect_phase columns added.")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
