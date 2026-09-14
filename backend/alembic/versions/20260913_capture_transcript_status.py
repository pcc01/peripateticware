# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add transcript_status to student_captures

Revision ID: 20260913_capture_transcript_status
Revises: 20260902c_wayfinding_analytics
Create Date: 2026-09-13

Adds student_captures.transcript_status ('pending' | 'completed' | 'failed' |
'disabled'). Before this, a NULL `transcript` on an AUDIO capture couldn't be
told apart as "still processing" vs. "ASR unavailable" vs. "never attempted" —
this shipped alongside removing the OpenAI/Claude cloud fallback tiers from
ASRService (see backend/services/asr_service.py and
AUDIO_TRANSCRIPTION_ON_DEVICE_HANDOFF.md).

Mirrors models/database.py (StudentCapture.transcript_status, TranscriptStatus).
native_enum=False on the model column, so this is a plain VARCHAR — no
Postgres enum type to create/manage here (same reasoning as capture_type;
see the comment above StudentCapture.capture_type in models/database.py).
"""

from alembic import op
import sqlalchemy as sa

revision = '20260913_capture_transcript_status'
down_revision = '20260902c_wayfinding_analytics'
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

    if _table_exists(conn, 'student_captures') and not _column_exists(conn, 'student_captures', 'transcript_status'):
        op.add_column(
            'student_captures',
            sa.Column('transcript_status', sa.String(length=20), nullable=True),
        )
        # Backfill existing rows: a non-null transcript means a previous run
        # completed (however dubious the Ollama-tier content might be, see
        # asr_service.py); a null transcript on an existing AUDIO row means
        # we genuinely don't know what happened historically, so leave it
        # NULL rather than guess "failed" or "pending" for old data.
        conn.execute(sa.text(
            "UPDATE student_captures SET transcript_status = 'completed' "
            "WHERE transcript IS NOT NULL AND transcript_status IS NULL"
        ))


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, 'student_captures') and _column_exists(conn, 'student_captures', 'transcript_status'):
        op.drop_column('student_captures', 'transcript_status')
