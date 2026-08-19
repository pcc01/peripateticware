# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add users.is_content_admin -- separates blog/pages access from role=ADMIN

Revision ID: 20260819c_content_admin_flag
Revises: 20260819b_page_blocks
Create Date: 2026-08-19

Prompted by finding ADMIN-role seed/demo accounts (test_admin,
test_platform, admin@example.com) active on prod with published, well-
known passwords -- role=ADMIN alone was sufficient to reach /admin/blog
and /admin/pages, so those accounts could too. is_content_admin is a
new, independent flag (same pattern as users.is_platform_admin) that
routes/blog.py and routes/page_content.py's admin routers now require
in addition to role=ADMIN. Defaults to false for every existing row --
nobody has content-admin access until explicitly granted.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260819c_content_admin_flag'
down_revision = '20260819b_page_blocks'
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": column}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, 'users', 'is_content_admin'):
        op.add_column(
            'users',
            sa.Column('is_content_admin', sa.Boolean(), nullable=False, server_default='false'),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, 'users', 'is_content_admin'):
        op.drop_column('users', 'is_content_admin')
