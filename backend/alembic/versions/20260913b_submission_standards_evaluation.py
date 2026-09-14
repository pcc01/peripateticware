# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add standards_evaluation to activity_submissions

Revision ID: 20260913b_submission_standards_evaluation
Revises: 20260913_capture_transcript_status
Create Date: 2026-09-13

Built alongside the rubric-scoring endpoint (routes/activities.py::
score_submission_rubric). Before this, "standards coverage" for a student
could only mean "the design-time mapping exists and the student completed
the activity at all" (activity_standards_map / content_alignments have no
student dimension, and routes/standards.py::get_coverage's `met` flag is
literally `times_addressed > 0` against completed learning_sessions --
independent of whether the work was any good). There was no way for a
teacher's actual judgment of one student's submission to feed into
"did this standard get met," which is what a real state filing means.

activity_submissions.standards_evaluation (JSONB, {criterion_id:
coverage_level}, coverage_level in 'not_met'|'partial'|'full'|'exceeds')
lets a teacher record, per mapped standards criterion, what THIS submission
actually demonstrated. routes/standards.py::get_coverage and
routes/homeschool.py::coverage_summary now prefer this per-submission
verdict when one exists, falling back to the old completed-activity
heuristic when it doesn't -- so nothing that currently reads coverage
breaks, and 'not_met' is now expressible at all (it wasn't before: every
completed activity silently counted as "met").
"""

from alembic import op
import sqlalchemy as sa

revision = '20260913b_submission_standards_evaluation'
down_revision = '20260913_capture_transcript_status'
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

    if _table_exists(conn, 'activity_submissions') and not _column_exists(
        conn, 'activity_submissions', 'standards_evaluation'
    ):
        op.add_column(
            'activity_submissions',
            sa.Column('standards_evaluation', sa.dialects.postgresql.JSONB(), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, 'activity_submissions') and _column_exists(
        conn, 'activity_submissions', 'standards_evaluation'
    ):
        op.drop_column('activity_submissions', 'standards_evaluation')
