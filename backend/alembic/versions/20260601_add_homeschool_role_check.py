# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Add HOMESCHOOL to users_role_check constraint

Revision ID: 20260601_add_homeschool_role_check
Revises: 20260531_add_homeschool_userrole
Create Date: 2026-06-01

The users table was created with a CHECK constraint that only allows
STUDENT, TEACHER, PARENT, ADMIN. This migration drops that constraint
and recreates it with HOMESCHOOL added.
"""

revision = '20260601_add_homeschool_role_check'
down_revision = '20260531_add_homeschool_userrole'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check")
    op.execute("""
        ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role::text = ANY (
            ARRAY['STUDENT','TEACHER','PARENT','ADMIN','HOMESCHOOL']::text[]
        ))
    """)


def downgrade():
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check")
    op.execute("""
        ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role::text = ANY (
            ARRAY['STUDENT','TEACHER','PARENT','ADMIN']::text[]
        ))
    """)
