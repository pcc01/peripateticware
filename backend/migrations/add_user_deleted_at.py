# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Add deleted_at column to users table for soft-delete support (P3-6).

Revision: 20260627_add_user_deleted_at
"""

from alembic import op
import sqlalchemy as sa

revision = "20260627_add_user_deleted_at"
down_revision = None  # set to previous revision head if chaining
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
    """)
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_deleted_at
        ON users(deleted_at) WHERE deleted_at IS NOT NULL;
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_users_deleted_at;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;")
