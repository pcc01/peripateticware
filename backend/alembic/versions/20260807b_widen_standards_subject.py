# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Widen standards_frameworks.subject (VARCHAR(50) -> VARCHAR(200))

Revision ID: 20260807b_widen_standards_subject
Revises: 20260807_case_standards
Create Date: 2026-08-07

Found via real ingest data: Texas TEKS uses compound subject names like
"Spanish Language Arts and English as a Second Language" (54 chars), which
overflowed the original VARCHAR(50).
"""

from alembic import op
import sqlalchemy as sa

revision = '20260807b_widen_standards_subject'
down_revision = '20260807_case_standards'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('standards_frameworks', 'subject',
                     existing_type=sa.String(50), type_=sa.String(200))


def downgrade() -> None:
    op.alter_column('standards_frameworks', 'subject',
                     existing_type=sa.String(200), type_=sa.String(50))
