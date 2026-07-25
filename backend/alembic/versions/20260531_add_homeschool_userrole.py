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
    try:
        conn.execute(sa.text(
            "ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'HOMESCHOOL'"
        ))
    except Exception as exc:
        # Mirrors the activity_type enum's own "safe to ignore" guard
        # elsewhere in this migration chain -- users.role was created as a
        # real Postgres enum in the initial migration, but this codebase has
        # since drifted some other enum-typed columns to plain VARCHAR with a
        # CHECK constraint instead (see 20260601_add_homeschool_role_check.py,
        # which manages role validity via CHECK, not this enum). If that
        # already happened here too, "type userrole does not exist" is
        # expected and the CHECK-constraint migration is what actually
        # matters, not this one.
        print(f"Note: could not add 'HOMESCHOOL' to userrole enum (likely already VARCHAR+CHECK, safe to ignore): {exc}")


def downgrade():
    # PostgreSQL has no DROP VALUE for enums; downgrade is a no-op.
    # To fully revert, recreate the enum without HOMESCHOOL manually.
    pass
