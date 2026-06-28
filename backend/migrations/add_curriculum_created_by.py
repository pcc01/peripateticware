# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

#!/usr/bin/env python3
"""
File: backend/migrations/add_curriculum_created_by.py

Security fix: Add created_by column to curriculum_units table.
Tracks which teacher created each curriculum unit — needed for RBAC/ownership checks.

Usage:
    python backend/migrations/add_curriculum_created_by.py

This script is idempotent — can be run multiple times safely (uses IF NOT EXISTS).
"""

import sys
import os
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text
from core.database import SessionLocal


def migrate():
    """Execute the migration"""
    logger.info("Starting migration: add_curriculum_created_by")

    db = SessionLocal()
    try:
        # Verify connection
        db.execute(text("SELECT 1"))
        logger.info("Database connection OK")

        # Add created_by column (idempotent)
        db.execute(text(
            "ALTER TABLE curriculum_units "
            "ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id)"
        ))
        db.commit()
        logger.info("Column curriculum_units.created_by added (or already exists)")

        # Add index for owner lookups
        db.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_curriculum_units_created_by "
            "ON curriculum_units(created_by) WHERE created_by IS NOT NULL"
        ))
        db.commit()
        logger.info("Index idx_curriculum_units_created_by created (or already exists)")

        logger.info("Migration complete: add_curriculum_created_by")
        return True

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False

    finally:
        db.close()


if __name__ == "__main__":
    try:
        success = migrate()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        logger.info("Migration cancelled by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
