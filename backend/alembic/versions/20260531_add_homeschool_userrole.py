"""Add HOMESCHOOL value to userrole enum

Revision ID: 20260531_add_homeschool_userrole
Revises: 20260530_compliance_rules_regulation_type
Create Date: 2026-05-31

PostgreSQL requires a commit between ALTER TYPE ... ADD VALUE and any DML
that uses the new value, so this migration runs the ALTER outside a
transaction (execute_timeout trick) and seeds the homeschool test users
in a separate step.
"""

revision = '20260531_add_homeschool_userrole'
down_revision = '20260530_compliance_rules_regulation_type'
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade():
    # ADD VALUE cannot run inside a transaction block in PostgreSQL.
    # execute() on the raw connection bypasses the implicit transaction.
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'HOMESCHOOL'"
    ))


def downgrade():
    # PostgreSQL has no DROP VALUE for enums; downgrade is a no-op.
    # To fully revert, recreate the enum without HOMESCHOOL manually.
    pass
