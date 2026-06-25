"""
AI routing tables — ai_task_config, ai_batch_queue, ai_api_keys,
and the teacher_notifications table used by batch_processor.

Revision: 20260602_ai_routing_tables
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision  = "20260602_ai_routing"
down_revision = None  # set to previous revision head if chaining
branch_labels = None
depends_on    = None


def upgrade():
    # ── ai_task_config ────────────────────────────────────────────────────────
    op.create_table(
        "ai_task_config",
        sa.Column("task_type",  sa.String(64), primary_key=True),
        sa.Column("provider",   sa.String(32), nullable=False, server_default="ollama"),
        sa.Column("model",      sa.String(128), nullable=True),
        sa.Column("enabled",    sa.Boolean, nullable=False, server_default="true"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column("updated_by", sa.String(128), nullable=True),
    )

    # ── ai_batch_queue ────────────────────────────────────────────────────────
    op.create_table(
        "ai_batch_queue",
        sa.Column("id",                   sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("task_type",            sa.String(64), nullable=False),
        sa.Column("entity_type",          sa.String(64), nullable=False),
        sa.Column("entity_id",            sa.String(64), nullable=False),
        sa.Column("prompt",               sa.Text, nullable=False),
        sa.Column("status",               sa.String(32), nullable=False, server_default="pending"),
        sa.Column("anthropic_batch_id",   sa.String(128), nullable=True),
        sa.Column("anthropic_request_id", sa.String(128), nullable=True),
        sa.Column("result",               JSONB, nullable=True),
        sa.Column("error_message",        sa.Text, nullable=True),
        sa.Column("fallback_used",        sa.Boolean, server_default="false"),
        sa.Column("created_at",           sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("submitted_at",         sa.DateTime(timezone=True), nullable=True),
        sa.Column("processed_at",         sa.DateTime(timezone=True), nullable=True),
        sa.Column("notified",             sa.Boolean, server_default="false"),
    )
    op.create_index("ix_ai_batch_queue_status",    "ai_batch_queue", ["status"])
    op.create_index("ix_ai_batch_queue_entity_id", "ai_batch_queue", ["entity_id"])
    op.create_index("ix_ai_batch_queue_batch_id",  "ai_batch_queue", ["anthropic_batch_id"])

    # ── ai_api_keys ───────────────────────────────────────────────────────────
    op.create_table(
        "ai_api_keys",
        sa.Column("provider",      sa.String(64), primary_key=True),
        sa.Column("encrypted_key", sa.Text, nullable=False),
        sa.Column("model",         sa.String(128), nullable=True),
        sa.Column("updated_at",    sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column("updated_by",    sa.String(128), nullable=True),
    )

    # ── teacher_notifications ─────────────────────────────────────────────────
    # Used by batch_processor to notify teachers when AI assessments complete.
    op.create_table(
        "teacher_notifications",
        sa.Column("id",         sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("teacher_id", sa.String(64), nullable=False, index=True),
        sa.Column("type",       sa.String(64), nullable=False),
        sa.Column("payload",    JSONB, nullable=True),
        sa.Column("is_read",    sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_teacher_notif_teacher_unread",
                    "teacher_notifications", ["teacher_id", "is_read"])


def downgrade():
    op.drop_table("teacher_notifications")
    op.drop_table("ai_api_keys")
    op.drop_table("ai_batch_queue")
    op.drop_table("ai_task_config")
