# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Parent portal tables: parent_messages, parent_settings, notifications columns

Revision ID: a3f9c2e81b4d
Revises: 20260625_add_consent_token_to_users
Create Date: 2026-06-27

Adds:
  parent_messages     — messages between teachers and parents
  parent_settings     — per-parent UI/notification preferences
  notifications.type              — info | achievement | concern | message | reminder
  notifications.related_child_id  — FK to users(id) for child context
  notifications.action_url        — deep-link for notification CTA
"""

from alembic import op
import sqlalchemy as sa

revision = 'a3f9c2e81b4d'
down_revision = '20260625_add_consent_token_to_users'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. parent_messages
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS parent_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            to_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subject      VARCHAR(500) NOT NULL,
            body         TEXT NOT NULL,
            conversation_id UUID NOT NULL DEFAULT gen_random_uuid(),
            read_at      TIMESTAMP,
            created_at   TIMESTAMP DEFAULT NOW(),
            updated_at   TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_parent_messages_to_user
            ON parent_messages(to_user_id, created_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_parent_messages_conversation
            ON parent_messages(conversation_id)
    """)

    # ------------------------------------------------------------------
    # 2. Extra columns on notifications
    # ------------------------------------------------------------------
    op.execute("""
        ALTER TABLE notifications
            ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'info'
    """)
    op.execute("""
        ALTER TABLE notifications
            ADD COLUMN IF NOT EXISTS related_child_id UUID REFERENCES users(id)
    """)
    op.execute("""
        ALTER TABLE notifications
            ADD COLUMN IF NOT EXISTS action_url VARCHAR(500)
    """)

    # ------------------------------------------------------------------
    # 3. parent_settings
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS parent_settings (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            parent_id  UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            dark_mode  BOOLEAN DEFAULT false,
            language   VARCHAR(10) DEFAULT 'en',
            email_frequency          VARCHAR(20) DEFAULT 'weekly',
            notifications_enabled    BOOLEAN DEFAULT true,
            push_notifications_enabled BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS parent_settings")
    op.execute("ALTER TABLE notifications DROP COLUMN IF EXISTS action_url")
    op.execute("ALTER TABLE notifications DROP COLUMN IF EXISTS related_child_id")
    op.execute("ALTER TABLE notifications DROP COLUMN IF EXISTS type")
    op.execute("DROP TABLE IF EXISTS parent_messages")
