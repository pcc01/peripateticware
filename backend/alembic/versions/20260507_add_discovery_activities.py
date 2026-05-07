"""Add Discovery/Scavenger Hunt Activity Type

Revision ID: 20260507_discovery_activities
Revises: (current head)
Create Date: 2026-05-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260507_discovery_activities'
down_revision = None  # Set this to your current migration ID
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add discovery/scavenger hunt activity fields"""
    
    # Add new columns to activities table
    op.add_column('activities', sa.Column(
        'discovery_mode',
        sa.String(50),
        nullable=True,
        comment='Discovery mode: location_based or task_based'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_task_description',
        sa.Text(),
        nullable=True,
        comment='Description of the discovery task/scavenger hunt'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_location_required',
        sa.Boolean(),
        default=False,
        nullable=False,
        comment='Teacher specifies location (mode A) or student documents location (mode B)'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_documentation_requirements',
        postgresql.JSONB(),
        nullable=True,
        comment='What student must document: {photos: true, measurements: true, notes: true, bloom_stage: true, etc}'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_success_criteria',
        sa.Text(),
        nullable=True,
        comment='How teacher knows student found the correct item/location'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_difficulty_level',
        sa.Integer(),
        default=2,
        nullable=True,
        comment='Difficulty: 1=Easy, 2=Medium, 3=Hard, 4=Expert'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_time_limit_minutes',
        sa.Integer(),
        nullable=True,
        comment='Time limit to complete discovery in minutes'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_location_gps_capture_enabled',
        sa.Boolean(),
        default=True,
        nullable=False,
        comment='Auto-capture student GPS location when submitting (with permission)'
    ))
    
    op.add_column('activities', sa.Column(
        'discovery_location_sharing_rules',
        postgresql.JSONB(),
        nullable=True,
        comment='Privacy rules: when location is shared {only_on_submission: true, require_permission: true, etc}'
    ))
    
    # Create index on discovery_mode for faster queries
    op.create_index(
        'ix_activities_discovery_mode',
        'activities',
        ['discovery_mode'],
        if_not_exists=True
    )


def downgrade() -> None:
    """Remove discovery activity fields"""
    
    # Drop index
    op.drop_index('ix_activities_discovery_mode', if_exists=True)
    
    # Drop columns
    op.drop_column('activities', 'discovery_location_sharing_rules')
    op.drop_column('activities', 'discovery_location_gps_capture_enabled')
    op.drop_column('activities', 'discovery_time_limit_minutes')
    op.drop_column('activities', 'discovery_difficulty_level')
    op.drop_column('activities', 'discovery_success_criteria')
    op.drop_column('activities', 'discovery_documentation_requirements')
    op.drop_column('activities', 'discovery_location_required')
    op.drop_column('activities', 'discovery_task_description')
    op.drop_column('activities', 'discovery_mode')

