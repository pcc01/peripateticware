# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add consent_token column to users for COPPA parental-consent flow

Revision ID: 20260625_add_consent_token_to_users
Revises: 20260618_privacy_regulation_catalog
Create Date: 2026-06-25

Adds:
  users.consent_token  — random URL-safe token used in the parent consent link
                         sent when an under-13 student accepts a classroom invite.
                         NULL for all other users.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260625_add_consent_token_to_users'
down_revision = '20260618_privacy_regulation_catalog'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    col_exists = bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'users' AND column_name = 'consent_token'"
    )).fetchone())

    if not col_exists:
        op.add_column('users', sa.Column('consent_token', sa.String(128), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'consent_token')
