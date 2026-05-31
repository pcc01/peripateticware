# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Ensure homeschool_children table exists as a proper migration

Revision ID: 20260530_homeschool_children_table
Revises: 20260530_seed_sample_proposals
Create Date: 2026-05-30

The homeschool_children table was previously only created in main.py startup
DDL. This migration formalises it so Alembic tracks it and fresh installs
from migrations alone get the table.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260530_homeschool_children_table'
down_revision = '20260530_seed_sample_proposals'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS homeschool_children (
            id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
            parent_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            child_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            grade_level  INTEGER      DEFAULT 0,
            age_band     VARCHAR(10)  DEFAULT 'k6',
            created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
            UNIQUE(parent_id, child_id)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_hs_children_parent ON homeschool_children(parent_id)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_hs_children_child ON homeschool_children(child_id)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS homeschool_children"))
