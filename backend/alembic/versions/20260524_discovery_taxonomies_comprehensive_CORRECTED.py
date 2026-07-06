"""Add Discovery Activities + Phase 5 Taxonomies (Comprehensive) - CORRECTED

Revision ID: 20260524_discovery_taxonomies_comprehensive
Revises: 84daf034be09
Create Date: 2026-05-24 01:00:00.000000

This migration adds:
1. All 4 taxonomy support (Bloom's, Marzano, DoK, SOLO)
2. Discovery/scavenger hunt activity fields
3. Privacy-compliant location tracking
4. WikiLocation context linking
5. Assessment rubric support

IMPORTANT BEFORE APPLYING:
1. Set down_revision to your current latest migration ID
2. Ensure assessment_rubrics table exists (from previous migration)
3. Ensure location_contexts table exists (from previous migration)
4. Run in development first to test
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import enum

# revision identifiers, used by Alembic.
revision = '20260524_discovery_taxonomies_comprehensive'
down_revision = '84daf034be09'
branch_labels = None
depends_on = None


# Define enums for use in migration
class ActivityType(str, enum.Enum):
    INQUIRY = "inquiry"
    DISCUSSION = "discussion"
    HANDS_ON = "hands_on"
    VIRTUAL = "virtual"
    HYBRID = "hybrid"
    DISCOVERY = "discovery"


class DiscoveryMode(str, enum.Enum):
    LOCATION_BASED = "location_based"
    TASK_BASED = "task_based"


def upgrade() -> None:
    """Upgrade: Add comprehensive activity features"""
    
    # Create enum types in PostgreSQL
    discovery_mode_enum = postgresql.ENUM(
        'location_based', 'task_based',
        name='discovery_mode',
        create_type=True
    )
    discovery_mode_enum.create(op.get_bind(), checkfirst=True)
    
    # Safely alter activity_type enum to include DISCOVERY.
    # NOTE (fixed): activities.activity_type was already converted to plain
    # VARCHAR elsewhere (see startup.py's apply_enum_and_core_column_migrations),
    # so this ALTER TYPE targets a Postgres enum that no longer applies — it will
    # always fail with "type activity_type does not exist" on a database that
    # went through that conversion. A plain try/except here does NOT protect the
    # rest of this migration: once a statement fails inside a Postgres
    # transaction, the whole transaction is aborted regardless of whether Python
    # catches the exception, so every op.add_column() below used to fail too
    # with "current transaction is aborted". Using a SAVEPOINT (begin_nested)
    # scopes the failure to just this statement.
    try:
        with op.get_bind().begin_nested():
            op.execute(
                sa.text("""
                    DO $$ BEGIN
                        ALTER TYPE activity_type ADD VALUE 'discovery';
                    EXCEPTION WHEN duplicate_object THEN null;
                    END $$;
                """)
            )
    except Exception as e:
        # Obsolete on databases where activity_type is already VARCHAR — safe to skip.
        print(f"Note: Could not add 'discovery' to activity_type enum (likely already VARCHAR, safe to ignore): {str(e)}")
    
    # ========================================================================
    # PHASE 5: Add Taxonomy Support (4 frameworks)
    # ========================================================================
    
    op.add_column('activities', sa.Column(
        'marzano_level',
        sa.Integer(),
        nullable=True,
        comment='Marzano taxonomy level (1-4)'
    ))
    
    op.add_column('activities', sa.Column(
        'dok_level',
        sa.Integer(),
        nullable=True,
        comment='Depth of Knowledge level (1-4)'
    ))
    
    op.add_column('activities', sa.Column(
        'solo_level',
        sa.Integer(),
        nullable=True,
        comment='SOLO taxonomy level (1-5)'
    ))
    
    op.add_column('activities', sa.Column(
        'primary_framework',
        sa.String(50),
        server_default='blooms',
        nullable=False,
        comment='Primary assessment framework: blooms, marzano, dok, solo, or custom'
    ))
    
    op.add_column('activities', sa.Column(
        'custom_framework_data',
        postgresql.JSONB(),
        nullable=True,
        comment='Custom framework data for future extensibility'
    ))
    
    # ========================================================================
    # PHASE 5: Assessment & Rubrics
    # PREREQUISITE: assessment_rubrics table must exist (from prior migration)
    # ========================================================================
    
    op.add_column('activities', sa.Column(
        'rubric_id',
        sa.UUID(as_uuid=True),
        sa.ForeignKey('assessment_rubrics.id', ondelete='SET NULL'),
        nullable=True,
        comment='Link to assessment rubric for grading'
    ))
    
    # ========================================================================
    # PHASE 5: WikiLocation Context
    # PREREQUISITE: location_contexts table must exist (from prior migration)
    # ========================================================================
    
    op.add_column('activities', sa.Column(
        'location_context_id',
        sa.UUID(as_uuid=True),
        sa.ForeignKey('location_contexts.id', ondelete='SET NULL'),
        nullable=True,
        comment='Link to cached Wikimedia location context'
    ))
    
    # ========================================================================
    # DISCOVERY/SCAVENGER HUNT MODE
    # ========================================================================
    
    op.add_column('activities', sa.Column(
        'discovery_mode',
        discovery_mode_enum,
        nullable=True,
        comment='Discovery mode: location_based or task_based (null for non-discovery activities)'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_task_description',
        sa.Text(),
        nullable=True,
        comment='Description of the discovery/scavenger hunt task'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_location_required',
        sa.Boolean(),
        server_default='false',
        nullable=False,
        comment='Teacher specifies location (true) or student documents location (false)'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_documentation_requirements',
        postgresql.JSONB(),
        nullable=True,
        comment='What student must document: photos, measurements, notes, sketches, etc. {photos: true, photo_count_minimum: 2, ...}'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_success_criteria',
        sa.Text(),
        nullable=True,
        comment='How teacher recognizes successful discovery (what to look for in documentation)'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_difficulty_level',
        sa.Integer(),
        nullable=True,
        comment='Discovery difficulty: 1=Easy, 2=Medium, 3=Hard, 4=Expert'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_time_limit_minutes',
        sa.Integer(),
        nullable=True,
        comment='Time limit to complete discovery in minutes (null = no limit)'
    ))
    
    # ========================================================================
    # PRIVACY & LOCATION TRACKING
    # ========================================================================
    
    op.add_column('activities', sa.Column(
        'location_source',
        sa.String(50),
        nullable=True,
        comment='How location was obtained: teacher_specified, gps_captured, student_documented'
    ))
    
    op.add_column('activities', sa.Column(
        'privacy_jurisdiction_id',
        sa.String(100),
        nullable=True,
        index=True,
        comment='Privacy jurisdiction: GDPR, COPPA, FERPA, etc.'
    ))
    
    op.add_column('activities', sa.Column(
        'privacy_compliant',
        sa.Boolean(),
        server_default='false',
        nullable=False,
        comment='Whether activity meets privacy compliance standards'
    ))
    
    op.add_column('activities', sa.Column(
        'last_compliance_check',
        sa.DateTime(),
        nullable=True,
        comment='Timestamp of last privacy compliance check'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_location_gps_capture_enabled',
        sa.Boolean(),
        server_default='true',
        nullable=False,
        comment='Auto-capture student GPS location when submitting discovery'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_location_sharing_rules',
        postgresql.JSONB(),
        nullable=True,
        comment='Privacy rules for location sharing: {only_on_submission: true, require_permission: true, share_with_teacher: true, ...}'
    ))
    
    # ========================================================================
    # CREATE INDEXES FOR PERFORMANCE
    # ========================================================================
    
    op.create_index(
        'ix_activities_marzano_level',
        'activities',
        ['marzano_level'],
        if_not_exists=True
    )
    
    op.create_index(
        'ix_activities_dok_level',
        'activities',
        ['dok_level'],
        if_not_exists=True
    )
    
    op.create_index(
        'ix_activities_solo_level',
        'activities',
        ['solo_level'],
        if_not_exists=True
    )
    
    op.create_index(
        'ix_activities_primary_framework',
        'activities',
        ['primary_framework'],
        if_not_exists=True
    )
    
    op.create_index(
        'ix_activities_discovery_mode',
        'activities',
        ['discovery_mode'],
        if_not_exists=True
    )
    
    op.create_index(
        'ix_activities_location_source',
        'activities',
        ['location_source'],
        if_not_exists=True
    )
    
    op.create_index(
        'ix_activities_privacy_jurisdiction',
        'activities',
        ['privacy_jurisdiction_id'],
        if_not_exists=True
    )
    
    op.create_index(
        'ix_activities_location_lat_lng',
        'activities',
        ['location_latitude', 'location_longitude'],
        if_not_exists=True
    )
    
    # ========================================================================
    # CREATE FOREIGN KEY INDEXES
    # ========================================================================
    
    op.create_index(
        'ix_activities_rubric_id',
        'activities',
        ['rubric_id'],
        if_not_exists=True
    )
    
    op.create_index(
        'ix_activities_location_context_id',
        'activities',
        ['location_context_id'],
        if_not_exists=True
    )


def downgrade() -> None:
    """Downgrade: Remove all new activity features
    
    IMPORTANT: This downgrade assumes clean migration state.
    If issues occur during downgrade, manual cleanup may be needed.
    """
    
    # ========================================================================
    # DROP INDEXES
    # ========================================================================
    
    op.drop_index('ix_activities_location_context_id', if_exists=True)
    op.drop_index('ix_activities_rubric_id', if_exists=True)
    op.drop_index('ix_activities_location_lat_lng', if_exists=True)
    op.drop_index('ix_activities_privacy_jurisdiction', if_exists=True)
    op.drop_index('ix_activities_location_source', if_exists=True)
    op.drop_index('ix_activities_discovery_mode', if_exists=True)
    op.drop_index('ix_activities_primary_framework', if_exists=True)
    op.drop_index('ix_activities_solo_level', if_exists=True)
    op.drop_index('ix_activities_dok_level', if_exists=True)
    op.drop_index('ix_activities_marzano_level', if_exists=True)
    
    # ========================================================================
    # DROP COLUMNS in reverse order (safer than upgrade order)
    # ========================================================================
    
    # Privacy & Location
    op.drop_column('activities', 'discovery_location_sharing_rules')
    op.drop_column('activities', 'discovery_location_gps_capture_enabled')
    op.drop_column('activities', 'last_compliance_check')
    op.drop_column('activities', 'privacy_compliant')
    op.drop_column('activities', 'privacy_jurisdiction_id')
    op.drop_column('activities', 'location_source')
    
    # Discovery/Scavenger Hunt
    op.drop_column('activities', 'discovery_time_limit_minutes')
    op.drop_column('activities', 'discovery_difficulty_level')
    op.drop_column('activities', 'discovery_success_criteria')
    op.drop_column('activities', 'discovery_documentation_requirements')
    op.drop_column('activities', 'discovery_location_required')
    op.drop_column('activities', 'discovery_task_description')
    op.drop_column('activities', 'discovery_mode')
    
    # Phase 5: WikiLocation & Rubrics
    op.drop_column('activities', 'location_context_id')
    op.drop_column('activities', 'rubric_id')
    
    # Phase 5: Taxonomies
    op.drop_column('activities', 'custom_framework_data')
    op.drop_column('activities', 'primary_framework')
    op.drop_column('activities', 'solo_level')
    op.drop_column('activities', 'dok_level')
    op.drop_column('activities', 'marzano_level')
    
    # Drop enums - with safe error handling
    try:
        # Only drop if not referenced elsewhere
        op.execute(sa.text("DROP TYPE IF EXISTS discovery_mode CASCADE"))
    except Exception as e:
        print(f"Note: Could not drop discovery_mode enum: {str(e)}")
        print("This is normal if the enum is still in use elsewhere.")


# ============================================================================
# HELPER FUNCTION FOR TESTING LOCALLY (Windows PowerShell)
# ============================================================================
# 
# To test this migration locally before applying to production:
#
# 1. Set down_revision to your current latest migration ID
# 2. Run in development environment:
#    ```powershell
#    # Navigate to backend folder
#    cd backend
#    
#    # Create test revision (don't apply yet)
#    python -m alembic revision --autogenerate -m "test_discovery_taxonomies"
#    
#    # Check migration looks good
#    type alembic/versions/20260524_discovery_taxonomies_comprehensive.py
#    
#    # Upgrade in DEV database
#    python -m alembic upgrade head
#    
#    # Test that application still works
#    python main.py
#    
#    # If everything works, downgrade to test rollback
#    python -m alembic downgrade -1
#    
#    # Then upgrade again
#    python -m alembic upgrade head
#    ```
#
# 3. If successful, apply to production database
# 4. If issues, check logs and report errors
