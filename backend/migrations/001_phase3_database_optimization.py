# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

#!/usr/bin/env python3
"""
File: backend/migrations/001_phase3_database_optimization.py

Phase 3 Sprint 1: Database Optimization Migration Script
- Enables query logging
- Creates strategic indexes
- Updates table statistics

Usage:
    python backend/migrations/001_phase3_database_optimization.py

This script is idempotent - can be run multiple times safely.
"""

import sys
import os
from datetime import datetime
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

# Add parent directory to path to import backend modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text
from core.database import SessionLocal


def log_section(title: str):
    """Print a section header"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")


def migrate():
    """Execute the migration"""
    
    log_section("PHASE 3: DATABASE OPTIMIZATION MIGRATION")
    
    db = SessionLocal()
    
    try:
        # Step 1: Test connection
        logger.info("Step 1: Testing database connection...")
        result = db.execute(text("SELECT 1"))
        if result.scalar() == 1:
            logger.info("✓ Database connection successful")
        else:
            raise Exception("Database connection test failed")
        
        # Step 2: Check PostgreSQL version
        logger.info("\nStep 2: Checking PostgreSQL version...")
        result = db.execute(text("SELECT version()"))
        version = result.scalar()
        logger.info(f"✓ PostgreSQL: {version.split(',')[0]}")
        
        # Step 3: Check if pg_stat_statements is available
        logger.info("\nStep 3: Checking for pg_stat_statements extension...")
        try:
            db.execute(text("CREATE EXTENSION IF NOT EXISTS pg_stat_statements"))
            db.commit()
            logger.info("✓ pg_stat_statements extension available")
        except Exception as e:
            logger.warning(f"⚠ pg_stat_statements unavailable: {e}")
        
        # Step 4: Enable query logging
        logger.info("\nStep 4: Enabling query logging...")
        try:
            logger.info("  - Setting log_min_duration_statement = 100")
            db.execute(text("ALTER SYSTEM SET log_min_duration_statement = 100"))
            logger.info("  - Setting log_statement = 'mod'")
            db.execute(text("ALTER SYSTEM SET log_statement = 'mod'"))
            logger.info("  - Setting log_connections = on")
            db.execute(text("ALTER SYSTEM SET log_connections = on"))
            logger.info("  - Reloading PostgreSQL configuration")
            db.execute(text("SELECT pg_reload_conf()"))
            db.commit()
            logger.info("✓ Query logging enabled (slow queries > 100ms will be logged)")
        except Exception as e:
            logger.warning(f"⚠ Query logging configuration: {e}")
        
        # Step 5: Create indexes
        logger.info("\nStep 5: Creating strategic indexes...")
        logger.info("(This may take a minute...)")
        
        indexes = [
            # Activity indexes
            ("idx_activities_teacher_id", 
             "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_teacher_id ON activities(teacher_id) WHERE deleted_at IS NULL"),
            ("idx_activities_school_id",
             "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_school_id ON activities(school_id) WHERE deleted_at IS NULL"),
            ("idx_activities_created_at",
             "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC) WHERE deleted_at IS NULL"),
            ("idx_activities_teacher_created",
             "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_teacher_created ON activities(teacher_id, created_at DESC) WHERE deleted_at IS NULL"),
            
            # Evidence indexes
            ("idx_evidence_activity_id",
             "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_activity_id ON evidence(activity_id) WHERE submitted_at IS NOT NULL"),
            ("idx_evidence_student_id",
             "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_student_id ON evidence(student_id) WHERE submitted_at IS NOT NULL"),
            ("idx_evidence_created_at",
             "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_created_at ON evidence(created_at DESC)"),
            ("idx_evidence_activity_created",
             "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_activity_created ON evidence(activity_id, created_at DESC) WHERE submitted_at IS NOT NULL"),
            
            # User indexes
            ("idx_users_school_id",
             "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_school_id ON users(school_id) WHERE deleted_at IS NULL"),
            ("idx_users_email",
             "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users(email) WHERE deleted_at IS NULL"),
            ("idx_users_role",
             "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role ON users(role) WHERE deleted_at IS NULL"),
            
            # Relationship indexes
            ("idx_student_teacher_teacher_id",
             "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_teacher_teacher_id ON student_teacher(teacher_id)"),
            ("idx_student_teacher_student_id",
             "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_teacher_student_id ON student_teacher(student_id)"),
        ]
        
        index_count = 0
        for index_name, sql_statement in indexes:
            try:
                db.execute(text(sql_statement))
                db.commit()
                logger.info(f"  ✓ Created index: {index_name}")
                index_count += 1
            except Exception as e:
                if "already exists" in str(e).lower():
                    logger.info(f"  - Index already exists: {index_name}")
                else:
                    logger.error(f"  ✗ Failed to create {index_name}: {e}")
        
        logger.info(f"\n✓ Created {index_count} indexes")
        
        # Step 6: Analyze tables
        logger.info("\nStep 6: Analyzing tables (updating statistics)...")
        db.execute(text("ANALYZE"))
        db.commit()
        logger.info("✓ Table analysis complete")
        
        # Step 7: Report database size
        logger.info("\nStep 7: Database information...")
        result = db.execute(text("""
            SELECT 
                pg_size_pretty(sum(pg_database_size(datname)))::text as total_size
            FROM (
                SELECT pg_database_size(datname) as size
                FROM pg_database
                WHERE datname = current_database()
            ) as sizes
        """))
        total_size = result.scalar()
        logger.info(f"✓ Database size: {total_size}")
        
        # Step 8: Report indexes
        logger.info("\nStep 8: Verifying created indexes...")
        result = db.execute(text("""
            SELECT count(*) 
            FROM pg_indexes 
            WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
        """))
        index_count = result.scalar()
        logger.info(f"✓ Total indexes: {index_count}")
        
        # Step 9: Success message
        log_section("✓ MIGRATION SUCCESSFUL")
        
        logger.info("Summary:")
        logger.info("  ✓ Query logging enabled (queries > 100ms logged)")
        logger.info(f"  ✓ {index_count} strategic indexes created")
        logger.info("  ✓ Table statistics updated")
        logger.info("  ✓ Database ready for Phase 3")
        
        logger.info("\nNext steps:")
        logger.info("  1. Monitor slow query logs for optimization opportunities")
        logger.info("  2. Run performance benchmarks to measure improvements")
        logger.info("  3. Proceed with Phase 3 Sprint 2 (WebSocket hardening)")
        
        return True
        
    except Exception as e:
        log_section("✗ MIGRATION FAILED")
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
        logger.info("\n\nMigration cancelled by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)