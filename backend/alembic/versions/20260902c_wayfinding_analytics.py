# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Wayfinding analytics lane (Lane 2) + retention policy seeds

Revision ID: 20260902c_wayfinding_analytics
Revises: 20260902b_gpx_wayfinding
Create Date: 2026-09-02

Adds the identifier-free analytics tables from WAYFINDING_CONSENT_LADDER.md §3:

  authoring_analytics     — one row per activity publish ("what kinds of hunts
                            do teachers build"). Enums / buckets / counts only.
  hunt_outcome_analytics  — one row per (activity, roll-up run) written by the
                            de-link retention task once expired
                            session_waypoint_progress rows clear the k>=5
                            cohort floor. The activity's SHAPE is denormalised
                            on; its id is not.

Neither table has student_id / session_id / activity_id / teacher_id /
fine-grained org_id / precise timestamps / free text — by construction. They
are not personal data and are retained indefinitely.

Also seeds three global data_retention_policies rows so the sweeper
(tasks/retention_cleanup.py) has explicit windows to read. Mirrors
startup.apply_wayfinding_migrations() (the load-bearing deploy path) and
database/init.sql.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260902c_wayfinding_analytics'
down_revision = '20260902b_gpx_wayfinding'
branch_labels = None
depends_on = None


def _table_exists(conn, table: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = :t"
    ), {"t": table}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, 'authoring_analytics'):
        op.create_table(
            'authoring_analytics',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('activity_type', sa.String(length=50), nullable=True),
            sa.Column('discovery_mode', sa.String(length=50), nullable=True),
            sa.Column('wayfinding_mode', sa.String(length=20), nullable=True),
            sa.Column('wayfinding_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('capability_ceiling', sa.String(length=1), nullable=True),
            sa.Column('waypoint_count_bucket', sa.String(length=10), nullable=True),
            sa.Column('route_imported', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('grade_level', sa.Integer(), nullable=True),
            sa.Column('subject', sa.String(length=100), nullable=True),
            sa.Column('bloom_level', sa.Integer(), nullable=True),
            sa.Column('difficulty', sa.Integer(), nullable=True),
            sa.Column('region_country', sa.String(length=10), nullable=True),
            sa.Column('created_month', sa.Date(), nullable=True),
            sa.Column('snapshot_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('idx_authoring_analytics_type_month', 'authoring_analytics', ['activity_type', 'created_month'])

    if not _table_exists(conn, 'hunt_outcome_analytics'):
        op.create_table(
            'hunt_outcome_analytics',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('activity_type', sa.String(length=50), nullable=True),
            sa.Column('wayfinding_mode', sa.String(length=20), nullable=True),
            sa.Column('waypoints_total', sa.Integer(), nullable=True),
            sa.Column('cohort_size', sa.Integer(), nullable=False),
            sa.Column('sessions_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('median_reached', sa.Float(), nullable=True),
            sa.Column('mean_reached', sa.Float(), nullable=True),
            sa.Column('completion_rate', sa.Float(), nullable=True),
            sa.Column('in_sequence_rate', sa.Float(), nullable=True),
            sa.Column('p50_minutes_between_stops', sa.Float(), nullable=True),
            sa.Column('period_start', sa.Date(), nullable=True),
            sa.Column('period_end', sa.Date(), nullable=True),
            sa.Column('rolled_up_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('idx_hunt_outcome_type', 'hunt_outcome_analytics', ['activity_type', 'wayfinding_mode'])

    if not _table_exists(conn, 'session_tracks'):
        op.create_table(
            'session_tracks',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('session_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('student_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('activity_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('points', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column('started_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('last_point_at', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('uq_session_tracks_session', 'session_tracks', ['session_id'], unique=True)
        op.create_index('idx_session_tracks_student', 'session_tracks', ['student_id'])

    if _table_exists(conn, 'data_retention_policies'):
        for cat, days, method in (
            ("evidence_coordinates", 30, "coarsen"),
            ("waypoint_progress_events", 90, "delink"),
            ("live_session_positions", 7, "delete"),
            ("breadcrumb_track", 30, "delete"),
        ):
            conn.execute(sa.text("""
                INSERT INTO data_retention_policies
                    (id, activity_id, jurisdiction_id, data_category,
                     retention_days, purpose, deletion_method, effective_date)
                SELECT gen_random_uuid(), NULL, 'GLOBAL',
                       CAST(:cat AS text), CAST(:days AS int),
                       'wayfinding — WAYFINDING_CONSENT_LADDER.md §3',
                       CAST(:method AS text), NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM data_retention_policies
                    WHERE data_category = CAST(:cat AS text) AND activity_id IS NULL
                )
            """), {"cat": cat, "days": days, "method": method})


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, 'data_retention_policies'):
        conn.execute(sa.text(
            "DELETE FROM data_retention_policies WHERE jurisdiction_id = 'GLOBAL' "
            "AND data_category IN ('evidence_coordinates','waypoint_progress_events',"
            "'live_session_positions','breadcrumb_track')"
        ))
    if _table_exists(conn, 'session_tracks'):
        op.drop_table('session_tracks')
    if _table_exists(conn, 'hunt_outcome_analytics'):
        op.drop_table('hunt_outcome_analytics')
    if _table_exists(conn, 'authoring_analytics'):
        op.drop_table('authoring_analytics')
