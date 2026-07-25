"""Fix activity enum names/values and add missing columns

Revision ID: 20260526_fix_enums_columns
Revises: 20260524_discovery_taxonomies_comprehensive
Create Date: 2026-05-26

Problems fixed by this migration:
1. ENUM NAME MISMATCH: initial migration created 'activitytype' (no underscore,
   uppercase values). The current model expects 'activity_type' (with underscore,
   lowercase values). This migration renames the enum and recreates its values.

2. ENUM VALUES MISMATCH: initial values were INQUIRY/DISCUSSION/HANDS_ON/VIRTUAL/HYBRID.
   Current model uses inquiry/field_observation/hands_on/project/discussion/experiment.

3. ACTIVITYSTATUS MISMATCH: initial migration created uppercase DRAFT/PUBLISHED/ARCHIVED
   as 'activitystatus'. Model now uses lowercase 'activity_status' enum.

4. MISSING COLUMNS: four columns in database.py are absent from both prior migrations:
   - assessment_type  (String 50)
   - is_shareable     (Boolean)
   - suggested_lessons (JSONB)
   - location_info    (Text)
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260526_fix_enums_columns'
down_revision = '20260524_discovery_taxonomies_comprehensive'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # STEP 1: Fix activity_type enum
    # The initial migration created enum named 'activitytype' with uppercase
    # values. PostgreSQL requires a multi-step process to rename/recreate enums.
    # =========================================================================

    # Create the correct new enum
    op.execute(sa.text("""
        DO $$
        BEGIN
            -- Create the new correctly-named enum if it doesn't exist
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
                CREATE TYPE activity_type AS ENUM (
                    'inquiry', 'field_observation', 'hands_on',
                    'project', 'discussion', 'experiment', 'discovery'
                );
            END IF;
        END
        $$;
    """))

    # Migrate the column: cast old enum → text → new enum
    # (PostgreSQL won't let you ALTER COLUMN type directly between enums)
    #
    # DROP DEFAULT first: whatever default this column currently carries
    # (e.g. a plain-text 'inquiry' from the original table creation) can't be
    # auto-cast to the new enum type by ALTER COLUMN TYPE, and Postgres
    # rejects the whole statement with "default ... cannot be cast
    # automatically" if a default is still attached. Re-added below with an
    # explicit cast once the column is actually the enum type.
    op.execute(sa.text("""
        ALTER TABLE activities ALTER COLUMN activity_type DROP DEFAULT;
    """))
    op.execute(sa.text("""
        ALTER TABLE activities
            ALTER COLUMN activity_type
            TYPE activity_type
            USING (
                CASE lower(activity_type::text)
                    WHEN 'inquiry'      THEN 'inquiry'::activity_type
                    WHEN 'discussion'   THEN 'discussion'::activity_type
                    WHEN 'hands_on'     THEN 'hands_on'::activity_type
                    WHEN 'virtual'      THEN 'field_observation'::activity_type
                    WHEN 'hybrid'       THEN 'project'::activity_type
                    WHEN 'discovery'    THEN 'discovery'::activity_type
                    ELSE 'inquiry'::activity_type
                END
            );
    """))
    op.execute(sa.text("""
        ALTER TABLE activities ALTER COLUMN activity_type SET DEFAULT 'inquiry'::activity_type;
    """))

    # Drop the old enum (safe now that the column no longer uses it)
    op.execute(sa.text("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activitytype') THEN
                DROP TYPE activitytype;
            END IF;
        END
        $$;
    """))

    # =========================================================================
    # STEP 2: Fix activity_status enum (same issue — uppercase/no-underscore)
    # =========================================================================

    op.execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_status') THEN
                CREATE TYPE activity_status AS ENUM ('draft', 'published', 'archived');
            END IF;
        END
        $$;
    """))

    # Same DROP DEFAULT / SET DEFAULT need as activity_type above.
    op.execute(sa.text("""
        ALTER TABLE activities ALTER COLUMN status DROP DEFAULT;
    """))
    op.execute(sa.text("""
        ALTER TABLE activities
            ALTER COLUMN status
            TYPE activity_status
            USING (lower(status::text)::activity_status);
    """))
    op.execute(sa.text("""
        ALTER TABLE activities ALTER COLUMN status SET DEFAULT 'draft'::activity_status;
    """))

    op.execute(sa.text("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activitystatus') THEN
                DROP TYPE activitystatus;
            END IF;
        END
        $$;
    """))

    # =========================================================================
    # STEP 3: Add columns present in database.py but missing from migrations
    # IF NOT EXISTS: main.py's own startup DDL (this repo's primary migration
    # mechanism per THREAD_HANDOFF.md -- Alembic is secondary) already adds
    # these same columns idempotently on every container boot, so a database
    # that's been running the app at all before this migration ever gets a
    # chance to run will already have them. Plain op.add_column() has no
    # built-in guard and fails with DuplicateColumn in exactly that case
    # (confirmed against a real production DB).
    # =========================================================================

    op.execute(sa.text("""
        ALTER TABLE activities ADD COLUMN IF NOT EXISTS
            assessment_type VARCHAR(50) DEFAULT 'formative';
    """))

    op.execute(sa.text("""
        ALTER TABLE activities ADD COLUMN IF NOT EXISTS
            is_shareable BOOLEAN NOT NULL DEFAULT false;
    """))

    op.execute(sa.text("""
        ALTER TABLE activities ADD COLUMN IF NOT EXISTS
            suggested_lessons JSONB;
    """))

    op.execute(sa.text("""
        ALTER TABLE activities ADD COLUMN IF NOT EXISTS
            location_info TEXT;
    """))

    # =========================================================================
    # STEP 4: Add user columns missing from initial migration
    # (first_name, last_name were in user.py model but not initial migration)
    # =========================================================================

    op.execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='users' AND column_name='first_name'
            ) THEN
                ALTER TABLE users ADD COLUMN first_name VARCHAR(100);
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='users' AND column_name='last_name'
            ) THEN
                ALTER TABLE users ADD COLUMN last_name VARCHAR(100);
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='users' AND column_name='role'
                AND udt_name = 'varchar'
            ) THEN
                -- role column already exists as enum userrole from initial migration
                NULL;
            END IF;
        END
        $$;
    """))


def downgrade() -> None:
    # Remove added columns
    op.drop_column('activities', 'location_info')
    op.drop_column('activities', 'suggested_lessons')
    op.drop_column('activities', 'is_shareable')
    op.drop_column('activities', 'assessment_type')

    # Restore old activitystatus enum
    op.execute(sa.text("""
        CREATE TYPE activitystatus AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
        ALTER TABLE activities
            ALTER COLUMN status
            TYPE activitystatus
            USING (upper(status::text)::activitystatus);
        DROP TYPE activity_status;
    """))

    # Restore old activitytype enum
    op.execute(sa.text("""
        CREATE TYPE activitytype AS ENUM ('INQUIRY', 'DISCUSSION', 'HANDS_ON', 'VIRTUAL', 'HYBRID');
        ALTER TABLE activities
            ALTER COLUMN activity_type
            TYPE activitytype
            USING (
                CASE activity_type::text
                    WHEN 'inquiry'           THEN 'INQUIRY'::activitytype
                    WHEN 'discussion'        THEN 'DISCUSSION'::activitytype
                    WHEN 'hands_on'          THEN 'HANDS_ON'::activitytype
                    WHEN 'field_observation' THEN 'VIRTUAL'::activitytype
                    WHEN 'project'           THEN 'HYBRID'::activitytype
                    ELSE 'INQUIRY'::activitytype
                END
            );
        DROP TYPE activity_type;
    """))
