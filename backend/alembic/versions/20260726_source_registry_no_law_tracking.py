# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add has_no_known_legislation to privacy_source_registry

Revision ID: 20260726_source_registry_no_law_tracking
Revises: 20260725_privacy_source_registry
Create Date: 2026-07-26

Lets the monthly auto-renew job track and periodically re-check the ~51
countries confirmed (via a user-supplied IAPP directory export) to have no
privacy law today, distinct from a country that simply has no
privacy_source_registry row yet (never checked at all). A country whose law
gets enacted later should be "promoted" out of this state, not silently
still show has_no_known_legislation=TRUE forever.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260726_source_registry_no_law_tracking'
down_revision = '20260725_privacy_source_registry'
branch_labels = None
depends_on = None


def _col_exists(conn, table: str, col: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": col}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()
    if not _col_exists(conn, 'privacy_source_registry', 'has_no_known_legislation'):
        op.add_column('privacy_source_registry',
                       sa.Column('has_no_known_legislation', sa.Boolean(), nullable=False,
                                 server_default=sa.text('FALSE')))


def downgrade() -> None:
    conn = op.get_bind()
    if _col_exists(conn, 'privacy_source_registry', 'has_no_known_legislation'):
        op.drop_column('privacy_source_registry', 'has_no_known_legislation')
