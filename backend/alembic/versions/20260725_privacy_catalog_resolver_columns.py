# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add jurisdiction-resolver columns to privacy_regulation_catalog

Revision ID: 20260725_privacy_catalog_resolver_columns
Revises: 20260716_add_session_id_to_field_notes
Create Date: 2026-07-25

Adds four columns needed by the new self-service jurisdiction resolver
(backend/services/privacy_jurisdiction_resolver.py) and the monthly
auto-renew job:

  subdivision_code — precise ISO state/province code (e.g. 'US-TX') for
                      exact matching, distinct from the existing free-text
                      `region` column (district/city/local-law detail).
  last_synced_at    — drives auto-renew cadence checks.
  is_verified        — FALSE for AI-discovered entries pending human/legal
                      review; TRUE for seed files, curated crawler sources,
                      and admin-authored entries.
  discovery_method  — seed | admin_manual | crawler_adapter | ai_search_synthesis
"""

from alembic import op
import sqlalchemy as sa

revision = '20260725_privacy_catalog_resolver_columns'
down_revision = '20260716_add_session_id_to_field_notes'
branch_labels = None
depends_on = None


def _col_exists(conn, table: str, col: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": col}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()

    if not _col_exists(conn, 'privacy_regulation_catalog', 'subdivision_code'):
        op.add_column('privacy_regulation_catalog',
                       sa.Column('subdivision_code', sa.String(10), nullable=True))

    if not _col_exists(conn, 'privacy_regulation_catalog', 'last_synced_at'):
        op.add_column('privacy_regulation_catalog',
                       sa.Column('last_synced_at', sa.DateTime(), nullable=True))

    if not _col_exists(conn, 'privacy_regulation_catalog', 'is_verified'):
        op.add_column('privacy_regulation_catalog',
                       sa.Column('is_verified', sa.Boolean(), nullable=False,
                                 server_default=sa.text('TRUE')))

    if not _col_exists(conn, 'privacy_regulation_catalog', 'discovery_method'):
        op.add_column('privacy_regulation_catalog',
                       sa.Column('discovery_method', sa.String(20), nullable=True))

    # Index for the resolver's country+subdivision lookup path
    result = conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname='idx_catalog_country_subdivision'"
    )).fetchone()
    if not result:
        op.create_index('idx_catalog_country_subdivision', 'privacy_regulation_catalog',
                         ['subdivision_code'])


def downgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname='idx_catalog_country_subdivision'"
    )).fetchone()
    if result:
        op.drop_index('idx_catalog_country_subdivision', table_name='privacy_regulation_catalog')
    for col in ('discovery_method', 'is_verified', 'last_synced_at', 'subdivision_code'):
        if _col_exists(conn, 'privacy_regulation_catalog', col):
            op.drop_column('privacy_regulation_catalog', col)
