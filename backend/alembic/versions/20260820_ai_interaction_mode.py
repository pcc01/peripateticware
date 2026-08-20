# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add activities.ai_interaction_mode -- author's choice of AI chat vs curated-only

Revision ID: 20260820_ai_interaction_mode
Revises: 20260819e_retire_legacy_admin_auth
Create Date: 2026-08-20

Every activity previously got AI-backed "Ask Peri" chat with no way for the
author to turn it off -- and the landing page still described AI as
something that "requires Ollama running locally or an Anthropic API key"
even after this deployment's own Anthropic key was configured. This column
lets the activity's author (teacher, or the AI-authoring flow) choose
'ai_chat' (open-ended AI conversation available, on top of the curated
on-device question bank) or 'curated_only' (curated bank only, no live AI
call, fully offline-capable, identical wording every time). See
schemas/activities.py's AIInteractionModeEnum for the full tradeoff shown
in the activity builder.

Defaults to 'ai_chat' for every existing row, matching pre-2026-08-20
behavior exactly -- this migration changes what authors *can* choose for
new/edited activities, not what already-published ones do.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260820_ai_interaction_mode'
down_revision = '20260819e_retire_legacy_admin_auth'
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": column}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, 'activities', 'ai_interaction_mode'):
        op.add_column(
            'activities',
            sa.Column('ai_interaction_mode', sa.String(length=20), nullable=False, server_default='ai_chat'),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, 'activities', 'ai_interaction_mode'):
        op.drop_column('activities', 'ai_interaction_mode')
