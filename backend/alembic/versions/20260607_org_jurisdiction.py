# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add org jurisdiction columns + users.primary_org_id

Revision ID: 20260607_org_jurisdiction
Revises: 20260601_add_homeschool_role_check
Create Date: 2026-06-07

Adds:
  To organizations table:
    - country_code         VARCHAR(10)  nullable
    - subdivision_code     VARCHAR(20)  nullable  (e.g. 'US-CA')
    - has_under_13_students BOOLEAN     NOT NULL DEFAULT true
    - privacy_jurisdiction_ids  JSONB   nullable  DEFAULT '[]'
    - ip_country_hint      VARCHAR(10)  nullable
    - org_type_v2          VARCHAR(50)  nullable
      Values: 'individual_teacher' | 'homeschool_family' | 'homeschool_coop'
              | 'school' | 'district' | 'enterprise'
      Supplements existing 'type' column — do NOT drop type.

  To users table:
    - primary_org_id       UUID  nullable  FK organizations(id) ON DELETE SET NULL
    - signup_country_code  VARCHAR(10)  nullable

  Index:
    - organizations(country_code)
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260607_org_jurisdiction'
down_revision = '20260606_platform_ledger'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    def _col_exists(table: str, col: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name=:t AND column_name=:c"
        ), {"t": table, "c": col}).fetchone())

    def _index_exists(index: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM pg_indexes WHERE indexname=:i"
        ), {"i": index}).fetchone())

    def _fk_exists(constraint: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM information_schema.table_constraints "
            "WHERE constraint_name=:c AND constraint_type='FOREIGN KEY'"
        ), {"c": constraint}).fetchone())

    # ── organizations table ───────────────────────────────────────────────────

    if not _col_exists('organizations', 'country_code'):
        op.add_column('organizations',
            sa.Column('country_code', sa.String(10), nullable=True))

    if not _col_exists('organizations', 'subdivision_code'):
        op.add_column('organizations',
            sa.Column('subdivision_code', sa.String(20), nullable=True))

    if not _col_exists('organizations', 'has_under_13_students'):
        op.add_column('organizations',
            sa.Column('has_under_13_students', sa.Boolean(),
                      nullable=False, server_default=sa.text('TRUE')))

    if not _col_exists('organizations', 'privacy_jurisdiction_ids'):
        op.add_column('organizations',
            sa.Column('privacy_jurisdiction_ids', postgresql.JSONB(),
                      nullable=True, server_default=sa.text("'[]'")))

    if not _col_exists('organizations', 'ip_country_hint'):
        op.add_column('organizations',
            sa.Column('ip_country_hint', sa.String(10), nullable=True))

    if not _col_exists('organizations', 'org_type_v2'):
        op.add_column('organizations',
            sa.Column('org_type_v2', sa.String(50), nullable=True))

    if not _index_exists('idx_organizations_country_code'):
        op.create_index(
            'idx_organizations_country_code',
            'organizations',
            ['country_code'],
        )

    # ── users table ───────────────────────────────────────────────────────────

    if not _col_exists('users', 'primary_org_id'):
        op.add_column('users',
            sa.Column('primary_org_id',
                      postgresql.UUID(as_uuid=True),
                      nullable=True))

    if not _col_exists('users', 'signup_country_code'):
        op.add_column('users',
            sa.Column('signup_country_code', sa.String(10), nullable=True))

    # FK: primary_org_id → organizations(id)  ON DELETE SET NULL
    if not _fk_exists('fk_users_primary_org_id'):
        op.create_foreign_key(
            'fk_users_primary_org_id',
            'users', 'organizations',
            ['primary_org_id'], ['id'],
            ondelete='SET NULL',
        )


def downgrade() -> None:
    op.drop_constraint('fk_users_primary_org_id', 'users', type_='foreignkey')
    op.drop_column('users', 'signup_country_code')
    op.drop_column('users', 'primary_org_id')

    op.drop_index('idx_organizations_country_code', table_name='organizations')
    op.drop_column('organizations', 'org_type_v2')
    op.drop_column('organizations', 'ip_country_hint')
    op.drop_column('organizations', 'privacy_jurisdiction_ids')
    op.drop_column('organizations', 'has_under_13_students')
    op.drop_column('organizations', 'subdivision_code')
    op.drop_column('organizations', 'country_code')
