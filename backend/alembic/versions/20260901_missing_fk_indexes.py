# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add indexes on FK-shaped columns used in WHERE/JOIN with no index

Revision ID: 20260901_missing_fk_indexes
Revises: 20260822_blog_image_metadata
Create Date: 2026-09-01

A 2026-09 performance audit found several foreign-key-shaped columns that
are joined/filtered on constantly but were never indexed:

  - learning_sessions.user_id / .activity_id — the biggest one. Joined in
    every teacher-dashboard and homeschool-dashboard query
    (routes/activities.py's teacher_dashboard/teacher_students/pending-
    submissions counts, routes/homeschool.py's homeschool_dashboard).
  - student_profiles.user_id
  - users.org_id / .primary_org_id — the primary multi-tenant filter column,
    used throughout org-scoped queries (ai_router._budget_check,
    platform_ai_ledger.org_id, etc.)
  - capture_annotations.teacher_id, notebook_feedback.teacher_id,
    location_search_history.teacher_id, compliance_checks.checked_by_user_id,
    student_field_notes.reviewed_by_teacher_id,
    student_peer_projects.approved_by_teacher_id — lower-traffic, but still
    FK-shaped and unindexed.

The `classrooms`/`classroom_students` tables are NOT included here — they're
created outside the ORM/Alembic entirely via raw SQL in startup.py, and get
their own idempotent CREATE INDEX IF NOT EXISTS patch there instead (see
startup.py's other idempotent schema patches for the existing convention).

Matching ORM columns in models/database.py and models/user.py now also
carry index=True, so a fresh database created via create_all() gets these
too — this migration is only needed to backfill an already-existing one.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260901_missing_fk_indexes'
down_revision = '20260822_blog_image_metadata'
branch_labels = None
depends_on = None

# (index_name, table, column)
_INDEXES = [
    ('ix_learning_sessions_user_id',                  'learning_sessions',       'user_id'),
    ('ix_learning_sessions_activity_id',               'learning_sessions',       'activity_id'),
    ('ix_student_profiles_user_id',                    'student_profiles',       'user_id'),
    ('ix_users_org_id',                                'users',                  'org_id'),
    ('ix_users_primary_org_id',                        'users',                  'primary_org_id'),
    ('ix_capture_annotations_teacher_id',               'capture_annotations',    'teacher_id'),
    ('ix_notebook_feedback_teacher_id',                 'notebook_feedback',      'teacher_id'),
    ('ix_location_search_history_teacher_id',           'location_search_history', 'teacher_id'),
    ('ix_compliance_checks_checked_by_user_id',         'compliance_checks',      'checked_by_user_id'),
    ('ix_student_field_notes_reviewed_by_teacher_id',   'student_field_notes',    'reviewed_by_teacher_id'),
    ('ix_student_peer_projects_approved_by_teacher_id', 'student_peer_projects',  'approved_by_teacher_id'),
]


def _index_exists(conn, index_name: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname = :name"
    ), {"name": index_name}).fetchone())


def _table_exists(conn, table: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = :t"
    ), {"t": table}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()
    for index_name, table, column in _INDEXES:
        # Guard on table existence too: some of these tables come from
        # feature-specific migrations/startup.py patches that may not have
        # run yet in every environment this migration could hit.
        if _table_exists(conn, table) and not _index_exists(conn, index_name):
            op.create_index(index_name, table, [column])


def downgrade() -> None:
    conn = op.get_bind()
    for index_name, _table, _column in _INDEXES:
        if _index_exists(conn, index_name):
            op.drop_index(index_name)
