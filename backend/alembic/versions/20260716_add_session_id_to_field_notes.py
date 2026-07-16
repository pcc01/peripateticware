# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add session_id column to student_field_notes for the professor fieldwork map

Revision ID: 20260716_add_session_id_to_field_notes
Revises: a3f9c2e81b4d
Create Date: 2026-07-16

Adds:
  student_field_notes.session_id  — nullable UUID, no FK (field notes taken
                                     outside a live session, the common case,
                                     leave this NULL; we don't want a dangling
                                     session_id blocking deletion of old
                                     learning_sessions rows). Indexed — it's
                                     joined against learning_sessions in
                                     GET /activities/{id}/fieldwork-locations
                                     (routes/activities.py).

Mirrors the column already added to database/init.sql for fresh installs —
this migration brings existing databases in line.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260716_add_session_id_to_field_notes'
down_revision = 'a3f9c2e81b4d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    col_exists = bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'student_field_notes' AND column_name = 'session_id'"
    )).fetchone())

    if not col_exists:
        op.add_column(
            'student_field_notes',
            sa.Column('session_id', postgresql.UUID(as_uuid=True), nullable=True),
        )

    idx_exists = bool(conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'student_field_notes' AND indexname = 'idx_field_notes_session'"
    )).fetchone())

    if not idx_exists:
        op.create_index('idx_field_notes_session', 'student_field_notes', ['session_id'])


def downgrade() -> None:
    op.drop_index('idx_field_notes_session', table_name='student_field_notes')
    op.drop_column('student_field_notes', 'session_id')
