"""
Activity completion mode — Field Activity vs Field + Reflection.

Adds:
  activities.completion_mode         VARCHAR(20) DEFAULT 'field_only'
  activities.require_field_approval  BOOLEAN     DEFAULT FALSE
  activity_submissions.completion_phase    VARCHAR(20)
  activity_submissions.field_phase_status  VARCHAR(30)
  activity_submissions.field_phase_feedback TEXT
  activity_submissions.field_phase_reviewed_at TIMESTAMP
  activity_submissions.reflection_status   VARCHAR(20)
  activity_submissions.reflection_content  JSONB
  activity_submissions.linked_field_note_id UUID FK student_field_notes

Revision: 20260602_completion_mode
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "20260602_completion_mode"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # ── activities ─────────────────────────────────────────────────────────────
    op.add_column("activities",
        sa.Column("completion_mode", sa.String(20), nullable=False, server_default="field_only"))
    op.add_column("activities",
        sa.Column("require_field_approval", sa.Boolean, nullable=False, server_default="false"))

    # ── activity_submissions ───────────────────────────────────────────────────
    # completion_phase tracks which phase the submission is currently in
    #   field_work   — student is doing / has done field work
    #   reflection   — field work done, student writing reflection
    #   complete     — all phases done
    op.add_column("activity_submissions",
        sa.Column("completion_phase", sa.String(20), nullable=False, server_default="complete"))

    # field_phase_status mirrors existing review flow but for field phase only
    #   not_applicable  — field_only activity, no field phase tracking needed
    #   in_progress     — student doing field work
    #   submitted       — field work done, awaiting teacher review (gated) or ready for reflection
    #   reviewed        — teacher left comments, student can proceed (ungated)
    #   approved        — teacher explicitly unlocked reflection (gated mode)
    #   rejected        — teacher sent back for more field work
    op.add_column("activity_submissions",
        sa.Column("field_phase_status", sa.String(30), nullable=False, server_default="not_applicable"))
    op.add_column("activity_submissions",
        sa.Column("field_phase_feedback", sa.Text, nullable=True))
    op.add_column("activity_submissions",
        sa.Column("field_phase_reviewed_at", sa.DateTime(timezone=True), nullable=True))

    # reflection_status
    #   not_applicable  — field_only activity
    #   not_started     — field work done, reflection not begun
    #   in_progress     — student is writing
    #   submitted       — submitted for final teacher review
    op.add_column("activity_submissions",
        sa.Column("reflection_status", sa.String(20), nullable=False, server_default="not_applicable"))
    op.add_column("activity_submissions",
        sa.Column("reflection_content", JSONB, nullable=True))
    op.add_column("activity_submissions",
        sa.Column("linked_field_note_id", UUID(as_uuid=True), nullable=True))

    # FK to student_field_notes if table exists
    try:
        op.create_foreign_key(
            "fk_submissions_field_note",
            "activity_submissions", "student_field_notes",
            ["linked_field_note_id"], ["id"],
            ondelete="SET NULL",
        )
    except Exception:
        pass  # table may not exist in all environments; FK is advisory

    op.create_index(
        "ix_activity_submissions_field_phase_status",
        "activity_submissions", ["field_phase_status"]
    )
    op.create_index(
        "ix_activity_submissions_reflection_status",
        "activity_submissions", ["reflection_status"]
    )


def downgrade():
    op.drop_index("ix_activity_submissions_reflection_status", "activity_submissions")
    op.drop_index("ix_activity_submissions_field_phase_status", "activity_submissions")
    try:
        op.drop_constraint("fk_submissions_field_note", "activity_submissions", type_="foreignkey")
    except Exception:
        pass
    for col in ["linked_field_note_id", "reflection_content", "reflection_status",
                "field_phase_reviewed_at", "field_phase_feedback", "field_phase_status",
                "completion_phase"]:
        op.drop_column("activity_submissions", col)
    op.drop_column("activities", "require_field_approval")
    op.drop_column("activities", "completion_mode")
