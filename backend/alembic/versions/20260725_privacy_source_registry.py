# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add privacy_source_registry table

Revision ID: 20260725_privacy_source_registry
Revises: 20260725_privacy_catalog_resolver_columns
Create Date: 2026-07-25

Standalone reference table: country -> official regulator name / law name /
official source URL, used by privacy_discovery_service.py's Tier-2 lookup
(after the rich iapp_privacy_crawler.py adapters, before falling back to
general search+AI-recall discovery). Populated by a ONE-TIME bulk reference
pull, not an ongoing crawl -- distinct from privacy_regulation_catalog, which
holds synthesized rule *content*, not source pointers.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260725_privacy_source_registry'
down_revision = '20260725_privacy_catalog_resolver_columns'
branch_labels = None
depends_on = None


def _table_exists(conn, table: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name=:t"
    ), {"t": table}).fetchone())


def _index_exists(conn, index: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname=:i"
    ), {"i": index}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, 'privacy_source_registry'):
        op.create_table(
            'privacy_source_registry',
            sa.Column('id',              postgresql.UUID(as_uuid=True),
                      primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('country_code',    sa.String(4),   nullable=False),
            sa.Column('country_name',    sa.String(200), nullable=True),
            sa.Column('regulator_name',  sa.String(300), nullable=True),
            sa.Column('law_name',        sa.String(300), nullable=True),
            sa.Column('source_url',      sa.String(1000), nullable=True),
            sa.Column('iapp_detail_url', sa.String(1000), nullable=True),
            sa.Column('framework_guess', sa.String(50),  nullable=True),
            sa.Column('is_verified',     sa.Boolean(),   nullable=False, server_default=sa.text('FALSE')),
            sa.Column('fetched_at',      sa.DateTime(),  nullable=True),
            sa.Column('notes',           sa.Text(),      nullable=True),
            sa.Column('created_at',      sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
            sa.Column('updated_at',      sa.DateTime(),  nullable=False, server_default=sa.text('NOW()')),
            sa.UniqueConstraint('country_code', name='uq_source_registry_country'),
        )

    if not _index_exists(conn, 'idx_source_registry_country_code'):
        op.create_index('idx_source_registry_country_code', 'privacy_source_registry',
                         ['country_code'])


def downgrade() -> None:
    conn = op.get_bind()
    if _index_exists(conn, 'idx_source_registry_country_code'):
        op.drop_index('idx_source_registry_country_code', table_name='privacy_source_registry')
    if _table_exists(conn, 'privacy_source_registry'):
        op.drop_table('privacy_source_registry')
