# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add users.created_via and users.signup_locale

Revision ID: 20260914c_signup_source_locale
Revises: 20260914_user_parent_email
Create Date: 2026-09-14

Backs the new "notify admin on an external signup" feature. Deliberately
does NOT add an IP address column -- raw IP was the first design floated for
telling "you/your tooling" apart from a real stranger, and was rejected on
privacy grounds. What it uses instead:

  created_via    -- which code path created the row (see models/user.py's
                     comment for the full value list). Anything other than
                     'public_signup'/'invite_accept' is something only you
                     or your own tooling can trigger, so it's excluded from
                     notification by construction, not by matching an
                     address.
  signup_locale  -- the UI language the signup form was showing (e.g. 'en',
                     'fr'), same spirit as the existing signup_country_code/
                     ip_country_hint columns: a coarse, already-public-ish
                     hint included in the notification email for context,
                     not a new privacy-sensitive capture.

Existing rows get NULL for both -- there is no reliable way to backfill
"which path created this" or "what locale was showing" for history that
predates this column. See services/signup_alerts.py's module docstring for
the one-time heuristic review of pre-existing accounts instead.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260914c_signup_source_locale'
down_revision = '20260914_user_parent_email'
branch_labels = None
depends_on = None


def _table_exists(conn, table: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = :t"
    ), {"t": table}).fetchone())


def _column_exists(conn, table: str, column: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c"
    ), {"t": table, "c": column}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()

    if _table_exists(conn, 'users'):
        if not _column_exists(conn, 'users', 'created_via'):
            op.add_column('users', sa.Column('created_via', sa.String(length=30), nullable=True))
        if not _column_exists(conn, 'users', 'signup_locale'):
            op.add_column('users', sa.Column('signup_locale', sa.String(length=20), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, 'users'):
        if _column_exists(conn, 'users', 'signup_locale'):
            op.drop_column('users', 'signup_locale')
        if _column_exists(conn, 'users', 'created_via'):
            op.drop_column('users', 'created_via')
