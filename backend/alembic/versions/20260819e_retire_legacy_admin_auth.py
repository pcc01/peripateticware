# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Retire legacy admin_users auth: drop admin_audit_logs' FK to it

Revision ID: 20260819e_retire_legacy_admin_auth
Revises: 20260819d_org_scoping
Create Date: 2026-08-19

Part of retiring the separate admin_users/AdminSession login system
(routes/admin.py's /env, /llm/test, /audit-logs, /audit-logs/summary now
run on the main JWT + role=ADMIN, same as every other /admin/* route --
see that file for the full rationale, including the hardcoded DEMO_ADMIN
fallback credential this removes).

admin_audit_logs.admin_id had a FK to admin_users(id). New rows now
store the acting user's users.id instead (from the JWT), which would
violate that FK on every single insert. Dropping the constraint --
NOT retargeting it to users(id) -- because existing historical rows'
admin_id values reference admin_users.id, and those don't correspond to
any users.id (they're different tables with independently-generated
UUIDs); a straight retarget would fail immediately on any existing data.
admin_id stays a plain nullable UUID column, just without referential
integrity enforcement -- it was already only ever used for display/
filtering, never joined against in a way that required the constraint.

admin_users and admin_sessions tables themselves are left in place
(not dropped) -- harmless once nothing authenticates against them, and
dropping them destroys the historical login record for zero benefit.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260819e_retire_legacy_admin_auth'
down_revision = '20260819d_org_scoping'
branch_labels = None
depends_on = None


def _constraint_exists(conn, table: str, constraint: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.table_constraints "
        "WHERE table_name=:t AND constraint_name=:c"
    ), {"t": table, "c": constraint}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()
    if _constraint_exists(conn, 'admin_audit_logs', 'admin_audit_logs_admin_id_fkey'):
        op.drop_constraint('admin_audit_logs_admin_id_fkey', 'admin_audit_logs', type_='foreignkey')


def downgrade() -> None:
    conn = op.get_bind()
    if not _constraint_exists(conn, 'admin_audit_logs', 'admin_audit_logs_admin_id_fkey'):
        op.create_foreign_key(
            'admin_audit_logs_admin_id_fkey', 'admin_audit_logs', 'admin_users',
            ['admin_id'], ['id'],
        )
