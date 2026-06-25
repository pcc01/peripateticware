"""Add agent_runs table for AI agent audit log

Revision ID: 20260612_add_agent_runs
Revises: 20260601_add_homeschool_role_check
Create Date: 2026-06-12

Supports the project's radical-transparency and FERPA-style provenance
requirements for every AI agent invocation.  No raw student PII is stored;
subject_id is a UUID reference only.
"""

revision = '20260612_add_agent_runs'
down_revision = '20260601_add_homeschool_role_check'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


def upgrade():
    op.create_table(
        'agent_runs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('agent_name', sa.String(100), nullable=False),
        sa.Column('provider', sa.String(20), nullable=False),
        sa.Column('model', sa.String(120), nullable=False),
        sa.Column('user_id', UUID(as_uuid=True), nullable=True),
        sa.Column('subject_type', sa.String(60), nullable=True),
        sa.Column('subject_id', UUID(as_uuid=True), nullable=True),
        sa.Column('input_summary', sa.Text(), nullable=True),
        sa.Column('output_ref', sa.String(255), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('latency_ms', sa.Integer(), nullable=True),
        sa.Column('token_usage', JSONB(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='success'),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_index('ix_agent_runs_agent_name', 'agent_runs', ['agent_name'])
    op.create_index('ix_agent_runs_user_id',    'agent_runs', ['user_id'])
    op.create_index('ix_agent_runs_subject_id', 'agent_runs', ['subject_id'])
    op.create_index('ix_agent_runs_created_at', 'agent_runs', ['created_at'])


def downgrade():
    op.drop_index('ix_agent_runs_created_at', table_name='agent_runs')
    op.drop_index('ix_agent_runs_subject_id', table_name='agent_runs')
    op.drop_index('ix_agent_runs_user_id',    table_name='agent_runs')
    op.drop_index('ix_agent_runs_agent_name', table_name='agent_runs')
    op.drop_table('agent_runs')
