# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""learning_outcomes: teacher-owned reusable outcome library

Revision ID: 20261004_learning_outcomes
Revises: 20260930b_superseded_by_fk
Create Date: 2026-10-04

Backs the guided Create Activity wizard's Outcomes step. Activities keep their
outcomes as text in activities.learning_objectives; a library row is copied
into an activity, never referenced, so there is no join table.
"""

from alembic import op

revision = '20261004_learning_outcomes'
down_revision = '20260930b_superseded_by_fk'
branch_labels = None
depends_on = None

_UPGRADE_DDL = """
CREATE TABLE IF NOT EXISTS learning_outcomes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text           TEXT NOT NULL,
    subject        VARCHAR(100),
    grade_min      INTEGER,
    grade_max      INTEGER,
    taxonomy_level VARCHAR(50),
    evidence_type  VARCHAR(50),
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_learning_outcomes_teacher_id ON learning_outcomes(teacher_id);
"""


def upgrade() -> None:
    op.execute(_UPGRADE_DDL)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS learning_outcomes")
