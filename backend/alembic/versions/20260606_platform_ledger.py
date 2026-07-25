# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add platform AI ledger, budgets, audit log + users.is_platform_admin

Revision ID: 20260606_platform_ledger
Revises: 20260601_add_homeschool_role_check
Create Date: 2026-06-06

Adds:
  users.is_platform_admin     BOOLEAN NOT NULL DEFAULT FALSE
  platform_ai_ledger          — per-request token spend tracking
  platform_ai_budgets         — per-org monthly budget caps
  platform_audit_log          — immutable audit trail for platform admin actions
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260606_platform_ledger'
down_revision = '20260601_add_homeschool_role_check'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    def _col_exists(table: str, col: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name=:t AND column_name=:c"
        ), {"t": table, "c": col}).fetchone())

    def _table_exists(table: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM information_schema.tables WHERE table_name=:t"
        ), {"t": table}).fetchone())

    def _index_exists(index: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM pg_indexes WHERE indexname=:i"
        ), {"i": index}).fetchone())

    # ── users: is_platform_admin flag ────────────────────────────────────────
    # Guard: apply_remaining_schema_fix.py may have already added this column.
    if not _col_exists('users', 'is_platform_admin'):
        op.add_column('users',
            sa.Column('is_platform_admin', sa.Boolean(),
                      nullable=False, server_default=sa.text('FALSE')))

    # ── platform_ai_ledger ────────────────────────────────────────────────────
    # Guard: skip if already created by apply_remaining_schema_fix.py
    if not _table_exists('platform_ai_ledger'):
        op.create_table(
            'platform_ai_ledger',
            sa.Column('id', postgresql.UUID(as_uuid=True),
                      primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('org_id',     postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('user_id',    postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column('model',      sa.String(120), nullable=False),
            sa.Column('provider',   sa.String(40),  nullable=False),
            sa.Column('prompt_tokens',     sa.Integer(), nullable=False, server_default='0'),
            sa.Column('completion_tokens', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('total_tokens',      sa.Integer(), nullable=False, server_default='0'),
            sa.Column('cost_usd',   sa.Numeric(12, 8), nullable=True),
            sa.Column('request_id', sa.String(80),  nullable=True),
            sa.Column('feature',    sa.String(80),  nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True),
                      nullable=False, server_default=sa.text('NOW()')),
        )
    if not _index_exists('idx_ledger_org_created'):
        op.create_index('idx_ledger_org_created',  'platform_ai_ledger', ['org_id', 'created_at'])
    if not _index_exists('idx_ledger_user_created'):
        op.create_index('idx_ledger_user_created', 'platform_ai_ledger', ['user_id', 'created_at'])

    # ── platform_ai_budgets ───────────────────────────────────────────────────
    if not _table_exists('platform_ai_budgets'):
        op.create_table(
            'platform_ai_budgets',
            sa.Column('id', postgresql.UUID(as_uuid=True),
                      primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('org_id', postgresql.UUID(as_uuid=True),
                      nullable=False, unique=True),
            sa.Column('monthly_token_limit',   sa.BigInteger(), nullable=True),
            sa.Column('monthly_cost_limit_usd', sa.Numeric(10, 2), nullable=True),
            sa.Column('alert_threshold_pct',   sa.Integer(), nullable=False, server_default='80'),
            sa.Column('hard_stop',  sa.Boolean(), nullable=False, server_default='FALSE'),
            sa.Column('updated_at', sa.DateTime(timezone=True),
                      nullable=False, server_default=sa.text('NOW()')),
        )

    # ── platform_audit_log ────────────────────────────────────────────────────
    if not _table_exists('platform_audit_log'):
        op.create_table(
            'platform_audit_log',
            sa.Column('id', postgresql.UUID(as_uuid=True),
                      primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('actor_id',    postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('action',      sa.String(80),  nullable=False),
            sa.Column('target_type', sa.String(40),  nullable=True),
            sa.Column('target_id',   sa.String(80),  nullable=True),
            sa.Column('detail',      postgresql.JSONB(), nullable=True),
            sa.Column('ip_address',  sa.String(45),  nullable=True),
            sa.Column('created_at',  sa.DateTime(timezone=True),
                      nullable=False, server_default=sa.text('NOW()')),
        )
    if not _index_exists('idx_audit_actor_created'):
        op.create_index('idx_audit_actor_created', 'platform_audit_log', ['actor_id', 'created_at'])
    if not _index_exists('idx_audit_target'):
        op.create_index('idx_audit_target',        'platform_audit_log', ['target_type', 'target_id'])


def downgrade() -> None:
    op.drop_table('platform_audit_log')
    op.drop_table('platform_ai_budgets')
    op.drop_index('idx_ledger_user_created', table_name='platform_ai_ledger')
    op.drop_index('idx_ledger_org_created',  table_name='platform_ai_ledger')
    op.drop_table('platform_ai_ledger')
    op.drop_column('users', 'is_platform_admin')
