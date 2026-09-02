# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add users.mfa_enabled / mfa_secret / mfa_backup_codes -- opt-in TOTP MFA

Revision ID: 20260902_mfa_totp
Revises: 20260901_missing_fk_indexes
Create Date: 2026-09-02

Opt-in TOTP two-factor authentication, prompted by a 2026-09 security
review flagging the lack of MFA for Teacher/Admin accounts (which hold
student PII access) as the last open item after that review's dependency
and disk-encryption fixes. Opt-in, not enforced -- no existing account is
disrupted by this migration; every row gets mfa_enabled=false.

mfa_secret is Fernet-encrypted at rest (EncryptedString, same as
users.email/full_name) since a TOTP secret is exactly as sensitive as a
password -- possession of it lets someone generate valid codes forever.
mfa_backup_codes stores only bcrypt hashes of one-time codes, mirroring
users.hashed_password's pattern -- the plaintext codes are shown to the
user exactly once, at confirm/regenerate time, and never stored.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260902_mfa_totp'
down_revision = '20260901_missing_fk_indexes'
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": column}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, 'users', 'mfa_enabled'):
        op.add_column(
            'users',
            sa.Column('mfa_enabled', sa.Boolean(), nullable=False, server_default='false'),
        )
    if not _column_exists(conn, 'users', 'mfa_secret'):
        op.add_column(
            'users',
            sa.Column('mfa_secret', sa.String(600), nullable=True),
        )
    if not _column_exists(conn, 'users', 'mfa_backup_codes'):
        op.add_column(
            'users',
            sa.Column('mfa_backup_codes', postgresql.JSONB(), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, 'users', 'mfa_backup_codes'):
        op.drop_column('users', 'mfa_backup_codes')
    if _column_exists(conn, 'users', 'mfa_secret'):
        op.drop_column('users', 'mfa_secret')
    if _column_exists(conn, 'users', 'mfa_enabled'):
        op.drop_column('users', 'mfa_enabled')
