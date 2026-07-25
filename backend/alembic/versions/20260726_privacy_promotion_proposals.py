# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add privacy_promotion_proposals table

Revision ID: 20260726_privacy_promotion_proposals
Revises: 20260726_source_registry_no_law_tracking
Create Date: 2026-07-26

Holds the monthly no-legislation-country recheck's findings so a country
never gets silently promoted out of the GDPR default -- an admin reviews
the monthly report and explicitly approves via scripts/apply_promotion.py
before anything actually changes in compliance_rules/privacy_regulation_
catalog/the shared gdpr_eu row.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260726_privacy_promotion_proposals'
down_revision = '20260726_source_registry_no_law_tracking'
branch_labels = None
depends_on = None


def _table_exists(conn, table: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name=:t"
    ), {"t": table}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, 'privacy_promotion_proposals'):
        op.create_table(
            'privacy_promotion_proposals',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                      server_default=sa.text('gen_random_uuid()')),
            sa.Column('country_code', sa.String(4), nullable=False),
            sa.Column('country_name', sa.String(200), nullable=True),
            sa.Column('ai_findings', postgresql.JSONB(), nullable=False,
                      comment='Full AI response that triggered this proposal (law_exists, confidence, summary, etc.)'),
            sa.Column('status', sa.String(20), nullable=False, server_default='proposed',
                      comment='proposed | approved | rejected | applied'),
            sa.Column('reviewed_by', sa.String(200), nullable=True),
            sa.Column('reviewed_at', sa.DateTime(), nullable=True),
            sa.Column('applied_at', sa.DateTime(), nullable=True),
            sa.Column('resulting_jurisdiction_id', sa.String(100), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
            sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        )
        op.create_index('idx_promotion_proposals_status', 'privacy_promotion_proposals', ['status'])
        op.create_index('idx_promotion_proposals_country', 'privacy_promotion_proposals', ['country_code'])


def downgrade() -> None:
    op.drop_index('idx_promotion_proposals_country', table_name='privacy_promotion_proposals')
    op.drop_index('idx_promotion_proposals_status', table_name='privacy_promotion_proposals')
    op.drop_table('privacy_promotion_proposals')
