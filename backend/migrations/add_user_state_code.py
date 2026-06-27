# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
#!/usr/bin/env python3
"""
Migration: add_user_state_code.py
P1-5 — Add state_code column to users table for homeschool state reporting.

Usage:
    python backend/migrations/add_user_state_code.py

Idempotent — uses IF NOT EXISTS.
"""

import sys
import os
import asyncio
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from core.database import engine


async def run():
    async with engine.begin() as conn:
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS state_code VARCHAR(10);")
        )
        logger.info("Column users.state_code ensured (VARCHAR 10, nullable).")


if __name__ == "__main__":
    asyncio.run(run())
    logger.info("Migration add_user_state_code complete.")
