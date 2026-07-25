# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Add student_proposals table and is_student_proposed columns to activities

Revision ID: 20260530_student_proposals
Revises: 20260527_privacy_engine_tables
Create Date: 2026-05-30

Tables/columns:
  student_proposals          — student-authored reverse scavenger hunt proposals
  activities.is_student_proposed     — flag for student-originated activities
  activities.proposed_by_student_id  — FK back to the proposing student
"""

from alembic import op
import sqlalchemy as sa

revision = '20260530_student_proposals'
down_revision = '20260527_privacy_engine_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    def _table_exists(table: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM information_schema.tables WHERE table_name=:t"
        ), {"t": table}).fetchone())

    def _col_exists(table: str, col: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name=:c"
        ), {"t": table, "c": col}).fetchone())

    def _constraint_exists(name: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM information_schema.table_constraints WHERE constraint_name=:n"
        ), {"n": name}).fetchone())

    def _index_exists(name: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM pg_indexes WHERE indexname=:i"
        ), {"i": name}).fetchone())

    # -- Extend activities table ------------------------------------------
    if not _col_exists('activities', 'is_student_proposed'):
        op.add_column('activities',
            sa.Column('is_student_proposed', sa.Boolean(), nullable=False,
                      server_default=sa.text('FALSE')))
    if not _col_exists('activities', 'proposed_by_student_id'):
        op.add_column('activities',
            sa.Column('proposed_by_student_id', sa.UUID(as_uuid=True), nullable=True))
    if not _constraint_exists('fk_activities_proposed_by_student'):
        op.create_foreign_key(
            'fk_activities_proposed_by_student',
            'activities', 'users',
            ['proposed_by_student_id'], ['id'],
            ondelete='SET NULL',
        )

    # -- Create student_proposals ----------------------------------------
    if not _table_exists('student_proposals'):
        op.create_table(
            'student_proposals',
            sa.Column('id', sa.UUID(as_uuid=True), primary_key=True,
                      server_default=sa.text('uuid_generate_v4()')),
            sa.Column('student_id', sa.UUID(as_uuid=True), nullable=False),
            sa.Column('title', sa.String(255), nullable=False),
            sa.Column('challenge_description', sa.Text(), nullable=False),
            sa.Column('location_hint', sa.String(500), server_default=''),
            sa.Column('subject', sa.String(100), server_default='General'),
            sa.Column('note_to_teacher', sa.Text(), server_default=''),
            sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
            sa.Column('teacher_feedback', sa.Text(), server_default=''),
            sa.Column('approved_activity_id', sa.UUID(as_uuid=True), nullable=True),
            sa.Column('created_at', sa.TIMESTAMP(), nullable=False,
                      server_default=sa.text('NOW()')),
            sa.Column('updated_at', sa.TIMESTAMP(), nullable=False,
                      server_default=sa.text('NOW()')),
            sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['approved_activity_id'], ['activities.id'],
                                    ondelete='SET NULL'),
            sa.CheckConstraint(
                "status IN ('draft','pending','approved','rejected')",
                name='ck_proposals_status',
            ),
        )
    if not _index_exists('idx_proposals_student'):
        op.create_index('idx_proposals_student', 'student_proposals', ['student_id'])
    if not _index_exists('idx_proposals_status'):
        op.create_index('idx_proposals_status',  'student_proposals', ['status'])


def downgrade() -> None:
    op.drop_index('idx_proposals_status',  table_name='student_proposals')
    op.drop_index('idx_proposals_student', table_name='student_proposals')
    op.drop_table('student_proposals')
    op.drop_constraint('fk_activities_proposed_by_student', 'activities',
                       type_='foreignkey')
    op.drop_column('activities', 'proposed_by_student_id')
    op.drop_column('activities', 'is_student_proposed')
