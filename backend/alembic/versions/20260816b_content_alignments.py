# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add content_alignments (content <-> standards_items graph edge)

Revision ID: 20260816b_content_alignments
Revises: 20260816_rag_documents
Create Date: 2026-08-16

Finishes PRD-standards-alignment-engine-2026-07-31_1.md §7.3, which
20260807_case_standards.py explicitly deferred ("content_alignments,
diploma_pathways, and the RAG/embedding pipeline are a separate future
migration"). Per PRD-graphrag-migration-2026-08-16.md §4.1: this is the
missing edge connecting Activity/CurriculumUnit content nodes to the
standards_items graph (jurisdictions/standards_frameworks/standards_items/
standards_associations from 20260807_case_standards.py) — GraphRAG
expansion (plan §3) walks this table alongside standards_associations and
standards_items.parent_id.

content_id/content_type is polymorphic rather than a hard FK, matching
ActivityStandardsMap's existing pattern — Activity and CurriculumUnit are
both alignable content types today, and a hard FK to activities.id alone
would miss CurriculumUnit (see the original PRD §13 item 4).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260816b_content_alignments'
down_revision = '20260816_rag_documents'
branch_labels = None
depends_on = None


def _table_exists(conn, table: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name=:t"
    ), {"t": table}).fetchone())


def _index_exists(conn, index: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname=:i"
    ), {"i": index}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, 'content_alignments'):
        op.create_table(
            'content_alignments',
            sa.Column('id',           postgresql.UUID(as_uuid=True),
                      primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('content_id',   postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('content_type', sa.String(50), nullable=False),   # 'activity' | 'curriculum_unit'
            sa.Column('item_id',      postgresql.UUID(as_uuid=True),
                      sa.ForeignKey('standards_items.id', ondelete='CASCADE'), nullable=False),
            sa.Column('alignment_type', sa.String(50), nullable=False, server_default='teaches'),
            sa.Column('method',       sa.String(20), nullable=False),
            sa.Column('confidence',   sa.Float(), nullable=True),
            sa.Column('status',       sa.String(20), nullable=False, server_default='suggested'),
            sa.Column('reviewed_by',  postgresql.UUID(as_uuid=True),
                      sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('reviewed_at',  sa.DateTime(), nullable=True),
            sa.Column('rationale',    sa.Text(), nullable=True),
            sa.Column('created_at',   sa.DateTime(), nullable=False, server_default=sa.text('now()')),
            sa.CheckConstraint(
                "alignment_type IN ('teaches','assesses','requires','extends')",
                name='ck_content_alignments_type',
            ),
            sa.CheckConstraint(
                "method IN ('ai_suggested','manual')",
                name='ck_content_alignments_method',
            ),
            sa.CheckConstraint(
                "status IN ('suggested','approved','rejected')",
                name='ck_content_alignments_status',
            ),
            sa.UniqueConstraint('content_id', 'item_id', 'alignment_type', name='uq_content_alignment'),
        )

    if not _index_exists(conn, 'idx_content_alignments_content'):
        op.create_index('idx_content_alignments_content', 'content_alignments', ['content_id', 'content_type'])
    if not _index_exists(conn, 'idx_content_alignments_item_approved'):
        conn.execute(sa.text(
            "CREATE INDEX idx_content_alignments_item_approved ON content_alignments (item_id) "
            "WHERE status = 'approved'"
        ))


def downgrade() -> None:
    conn = op.get_bind()
    for idx, table in [
        ('idx_content_alignments_item_approved', 'content_alignments'),
        ('idx_content_alignments_content', 'content_alignments'),
    ]:
        if _index_exists(conn, idx):
            op.drop_index(idx, table_name=table)
    if _table_exists(conn, 'content_alignments'):
        op.drop_table('content_alignments')
