# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Add regulation_type to compliance_rules

Revision ID: 20260530_compliance_rules_regulation_type
Revises: 20260530_seed_state_standards_sets
Create Date: 2026-05-30

Adds:
  compliance_rules.regulation_type  VARCHAR(20)  DEFAULT 'privacy'
    Values: 'privacy' | 'ai' | 'data_protection'

    privacy          — data privacy laws (GDPR, COPPA, CCPA, PIPEDA, LGPD, PDPA, etc.)
    ai               — AI-specific regulations (EU AI Act, US EO 14110, CN Generative AI, etc.)
    data_protection  — broader data protection frameworks that span both categories

  compliance_rules.ai_student_permitted   BOOLEAN  — may AI be used in student context?
  compliance_rules.ai_teacher_permitted   BOOLEAN  — may AI be used in teacher context?

  ai_student_permitted and ai_teacher_permitted are denormalised convenience columns
  derived from rule_definition JSONB for fast enforcement queries without JSON parsing.
  They default to TRUE (permissive) so existing privacy rules are unaffected.
  The AI regulation crawler sets them explicitly on insert.

Back-fills all existing rows to regulation_type='privacy'.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260530_compliance_rules_regulation_type'
down_revision = '20260530_seed_state_standards_sets'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    def _col_exists(table: str, col: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name=:c"
        ), {"t": table, "c": col}).fetchone())

    def _index_exists(name: str) -> bool:
        return bool(conn.execute(sa.text(
            "SELECT 1 FROM pg_indexes WHERE indexname=:i"
        ), {"i": name}).fetchone())

    if not _col_exists('compliance_rules', 'regulation_type'):
        op.add_column('compliance_rules',
            sa.Column('regulation_type', sa.String(20), nullable=False, server_default='privacy'))

    if not _col_exists('compliance_rules', 'ai_student_permitted'):
        op.add_column('compliance_rules',
            sa.Column('ai_student_permitted', sa.Boolean(), nullable=False, server_default=sa.text('TRUE')))

    if not _col_exists('compliance_rules', 'ai_teacher_permitted'):
        op.add_column('compliance_rules',
            sa.Column('ai_teacher_permitted', sa.Boolean(), nullable=False, server_default=sa.text('TRUE')))

    if not _index_exists('idx_compliance_rules_type'):
        op.create_index('idx_compliance_rules_type',
            'compliance_rules', ['regulation_type'])

    if not _index_exists('idx_compliance_rules_jurisdiction_type'):
        op.create_index('idx_compliance_rules_jurisdiction_type',
            'compliance_rules', ['jurisdiction', 'regulation_type'])

    # Back-fill: all existing rows are privacy rules
    op.execute(sa.text(
        "UPDATE compliance_rules SET regulation_type = 'privacy' WHERE regulation_type IS NULL"
    ))


def downgrade() -> None:
    op.drop_index('idx_compliance_rules_jurisdiction_type', table_name='compliance_rules')
    op.drop_index('idx_compliance_rules_type', table_name='compliance_rules')
    op.drop_column('compliance_rules', 'ai_teacher_permitted')
    op.drop_column('compliance_rules', 'ai_student_permitted')
    op.drop_column('compliance_rules', 'regulation_type')
