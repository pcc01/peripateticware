# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""GPX wayfinding for multi-step scavenger hunts

Revision ID: 20260902b_gpx_wayfinding
Revises: 20260902_mfa_totp
Create Date: 2026-09-02

Adds:
  activities.discovery_wayfinding_enabled  — master toggle for rung B
                                             (on-device arrival detection)
  activities.wayfinding_mode               — 'ordered' | 'free_choice' | 'guided_path'
  activities.wayfinding_capability_ceiling — 'A'..'E', the teacher-set input
                                             to the min() consent gate
  activities.route_geometry                — GeoJSON LineString for the <rte>/<trk>

  activity_waypoints          — teacher content: one stop per row (name, clue,
                                coordinate, arrival radius). CASCADE from
                                activities.
  session_waypoint_progress   — rung-B artefact: waypoint id + denormalized
                                index + timestamps. NO coordinate stored. No
                                FK on session_id/waypoint_id, matching
                                session_events and student_field_notes.session_id
                                (a dangling ref must never block deleting an old
                                learning_session or a teacher re-editing a hunt).

Mirrors models/database.py (ActivityWaypoint, SessionWaypointProgress) and
database/init.sql. Deploy runs startup.apply_wayfinding_migrations() as the
load-bearing path; this migration backfills an already-existing database.
See WAYFINDING_CONSENT_LADDER.md.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260902b_gpx_wayfinding'
down_revision = '20260902_mfa_totp'
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

    if _table_exists(conn, 'activities'):
        _cols = [
            ('discovery_wayfinding_enabled', sa.Column('discovery_wayfinding_enabled', sa.Boolean(), nullable=False, server_default=sa.false())),
            ('wayfinding_mode',              sa.Column('wayfinding_mode', sa.String(length=20), nullable=True)),
            ('wayfinding_capability_ceiling', sa.Column('wayfinding_capability_ceiling', sa.String(length=1), nullable=True)),
            ('route_geometry',              sa.Column('route_geometry', postgresql.JSONB(astext_type=sa.Text()), nullable=True)),
        ]
        for name, col in _cols:
            if not _column_exists(conn, 'activities', name):
                op.add_column('activities', col)

    if not _table_exists(conn, 'activity_waypoints'):
        op.create_table(
            'activity_waypoints',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('activity_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('activities.id', ondelete='CASCADE'), nullable=False),
            sa.Column('sequence_index', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('clue_text', sa.Text(), nullable=True),
            sa.Column('latitude', sa.Float(), nullable=False),
            sa.Column('longitude', sa.Float(), nullable=False),
            sa.Column('arrival_radius_meters', sa.Integer(), nullable=False, server_default='25'),
            sa.Column('symbol', sa.String(length=50), nullable=True),
            sa.Column('required', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('capture_requirements', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('hint_unlock_rule', sa.String(length=30), nullable=True, server_default='immediate'),
            sa.Column('hint_unlock_minutes', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('idx_activity_waypoints_activity_seq', 'activity_waypoints', ['activity_id', 'sequence_index'])

    if not _table_exists(conn, 'session_waypoint_progress'):
        op.create_table(
            'session_waypoint_progress',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('session_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('student_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('activity_id', postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('waypoint_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('waypoint_index', sa.Integer(), nullable=True),
            sa.Column('arrived_at', sa.DateTime(), nullable=True),
            sa.Column('arrival_was_in_sequence', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('captured', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('skipped', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('uq_swp_session_waypoint', 'session_waypoint_progress', ['session_id', 'waypoint_id'], unique=True)
        op.create_index('idx_swp_session', 'session_waypoint_progress', ['session_id'])
        op.create_index('idx_swp_student', 'session_waypoint_progress', ['student_id'])


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, 'session_waypoint_progress'):
        op.drop_table('session_waypoint_progress')
    if _table_exists(conn, 'activity_waypoints'):
        op.drop_table('activity_waypoints')
    if _table_exists(conn, 'activities'):
        for name in ('route_geometry', 'wayfinding_capability_ceiling', 'wayfinding_mode', 'discovery_wayfinding_enabled'):
            if _column_exists(conn, 'activities', name):
                op.drop_column('activities', name)
