# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Add expiry, checksum, and processing_status to standards_sets

Revision ID: 20260530_standards_sets_expiry_and_cache
Revises: 20260530_seed_homeschool_demo_data
Create Date: 2026-05-30

Adds four columns to standards_sets:

  source_checksum   VARCHAR(64)  — SHA-256 of uploaded source file.
                                   On re-upload, matching checksum skips
                                   Ollama reprocessing (cache hit).

  processing_status VARCHAR(20)  — Ollama extraction lifecycle:
                                   pending | processing | complete | failed
                                   DEFAULT 'complete' for hand-authored sets.

  last_processed_at TIMESTAMP    — When Ollama last extracted criteria.
                                   NULL for manually entered sets.

  valid_until       DATE         — Academic validity window.
                                   state_standards  → July 31 of school year
                                   state_reporting  → Dec 31 of calendar year
                                   rubric/custom    → NULL (no expiry)
                                   Expired sets are flagged in the UI with
                                   a re-verify prompt.

Also back-fills valid_until on existing state_reporting sets to
2026-12-31 and state_standards sets to 2026-07-31.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260530_standards_sets_expiry_and_cache'
down_revision = '20260530_seed_homeschool_demo_data'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    def _col_exists(table: str, col: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name=:c"
        ), {"t": table, "c": col}).fetchone())

    if not _col_exists('standards_sets', 'source_checksum'):
        op.add_column('standards_sets',
            sa.Column('source_checksum', sa.String(64), nullable=True))

    if not _col_exists('standards_sets', 'processing_status'):
        op.add_column('standards_sets',
            sa.Column('processing_status', sa.String(20), nullable=False,
                      server_default='complete'))

    if not _col_exists('standards_sets', 'last_processed_at'):
        op.add_column('standards_sets',
            sa.Column('last_processed_at', sa.TIMESTAMP(), nullable=True))

    if not _col_exists('standards_sets', 'valid_until'):
        op.add_column('standards_sets',
            sa.Column('valid_until', sa.Date(), nullable=True))

    # Back-fill sensible defaults for existing rows
    op.execute(sa.text("""
        UPDATE standards_sets
        SET valid_until = '2026-07-31'
        WHERE type = 'state_standards' AND valid_until IS NULL
    """))
    op.execute(sa.text("""
        UPDATE standards_sets
        SET valid_until = '2026-12-31'
        WHERE type = 'state_reporting' AND valid_until IS NULL
    """))


def downgrade() -> None:
    op.drop_column('standards_sets', 'valid_until')
    op.drop_column('standards_sets', 'last_processed_at')
    op.drop_column('standards_sets', 'processing_status')
    op.drop_column('standards_sets', 'source_checksum')
