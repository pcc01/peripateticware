# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add privacy regulation catalog tables

Revision ID: 20260618_privacy_regulation_catalog
Revises: 20260607_org_jurisdiction
Create Date: 2026-06-18

Adds:
  privacy_regulation_catalog     — user-facing display metadata for each regulation
  school_regulation_assignments  — which regulations assigned to a school/org
  user_regulation_assignments    — which regulations assigned to a solo teacher
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260618_privacy_regulation_catalog'
down_revision = ('20260607_org_jurisdiction', '20260612_add_agent_runs')
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    def _col_exists(table: str, col: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name=:t AND column_name=:c"
        ), {"t": table, "c": col}).fetchone())

    def _table_exists(table: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM information_schema.tables WHERE table_name=:t"
        ), {"t": table}).fetchone())

    def _index_exists(index: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM pg_indexes WHERE indexname=:i"
        ), {"i": index}).fetchone())

    def _constraint_exists(constraint: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM information_schema.table_constraints WHERE constraint_name=:c"
        ), {"c": constraint}).fetchone())

    # ── privacy_regulation_catalog ────────────────────────────────────────────
    if not _table_exists('privacy_regulation_catalog'):
        op.create_table(
            'privacy_regulation_catalog',
            sa.Column('id', postgresql.UUID(as_uuid=True),
                      primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('rule_id',          sa.String(256),  nullable=True),
            sa.Column('short_name',       sa.String(100),  nullable=False),
            sa.Column('full_name',        sa.String(500),  nullable=False),
            sa.Column('jurisdiction_code', sa.String(50),  nullable=False),
            sa.Column('region',           sa.String(100),  nullable=True),
            sa.Column('country_codes',    postgresql.JSONB(), nullable=True),
            sa.Column('framework',        sa.String(50),   nullable=False),
            sa.Column('summary',          sa.Text(),       nullable=True),
            sa.Column('key_requirements', postgresql.JSONB(), nullable=True),
            sa.Column('applies_to',       postgresql.JSONB(), nullable=True),
            sa.Column('age_threshold',    sa.Integer(),    nullable=True),
            sa.Column('is_child_safety',  sa.Boolean(),    nullable=False, server_default=sa.text('FALSE')),
            sa.Column('is_featured',      sa.Boolean(),    nullable=False, server_default=sa.text('FALSE')),
            sa.Column('effective_date',   sa.Date(),       nullable=True),
            sa.Column('source_url',       sa.String(1000), nullable=True),
            sa.Column('added_by_user_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('added_by_role',    sa.String(20),   nullable=True),
            sa.Column('is_active',        sa.Boolean(),    nullable=False, server_default=sa.text('TRUE')),
            sa.Column('created_at',       sa.DateTime(),   nullable=False, server_default=sa.text('NOW()')),
            sa.Column('updated_at',       sa.DateTime(),   nullable=False, server_default=sa.text('NOW()')),
            sa.UniqueConstraint('jurisdiction_code', 'framework', name='uq_catalog_jurisdiction_framework'),
        )

    # Indexes for privacy_regulation_catalog
    if not _index_exists('idx_catalog_framework_active'):
        op.create_index('idx_catalog_framework_active', 'privacy_regulation_catalog',
                        ['framework', 'is_active'])
    if not _index_exists('idx_catalog_jurisdiction_code'):
        op.create_index('idx_catalog_jurisdiction_code', 'privacy_regulation_catalog',
                        ['jurisdiction_code'])
    if not _index_exists('idx_catalog_featured_active'):
        op.create_index('idx_catalog_featured_active', 'privacy_regulation_catalog',
                        ['is_featured', 'is_active'])

    # ── school_regulation_assignments ─────────────────────────────────────────
    if not _table_exists('school_regulation_assignments'):
        op.create_table(
            'school_regulation_assignments',
            sa.Column('id', postgresql.UUID(as_uuid=True),
                      primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('org_id',     postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('catalog_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('assigned_by', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('assigned_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
            sa.Column('notes',      sa.Text(), nullable=True),
            sa.UniqueConstraint('org_id', 'catalog_id', name='uq_school_assignment_org_catalog'),
        )

    if not _index_exists('idx_school_assign_org'):
        op.create_index('idx_school_assign_org', 'school_regulation_assignments', ['org_id'])
    if not _index_exists('idx_school_assign_catalog'):
        op.create_index('idx_school_assign_catalog', 'school_regulation_assignments', ['catalog_id'])

    # ── user_regulation_assignments ───────────────────────────────────────────
    if not _table_exists('user_regulation_assignments'):
        op.create_table(
            'user_regulation_assignments',
            sa.Column('id', postgresql.UUID(as_uuid=True),
                      primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('user_id',    postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('catalog_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('assigned_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
            sa.Column('notes',      sa.Text(), nullable=True),
            sa.UniqueConstraint('user_id', 'catalog_id', name='uq_user_assignment_user_catalog'),
        )

    if not _index_exists('idx_user_assign_user'):
        op.create_index('idx_user_assign_user', 'user_regulation_assignments', ['user_id'])
    if not _index_exists('idx_user_assign_catalog'):
        op.create_index('idx_user_assign_catalog', 'user_regulation_assignments', ['catalog_id'])


def downgrade() -> None:
    op.drop_table('user_regulation_assignments')
    op.drop_table('school_regulation_assignments')
    op.drop_table('privacy_regulation_catalog')
