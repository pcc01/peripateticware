# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Add node_type/node_id to rag_documents (graph-aware retrieval)

Revision ID: 20260816c_rag_documents_node_link
Revises: 20260816b_content_alignments
Create Date: 2026-08-16

Per PRD-graphrag-migration-2026-08-16.md §4.3. rag_documents' existing
(source_type, source_id) pair is a loosely-typed, FK-less pointer back to
"whatever created this chunk" — fine for provenance, useless for "what exact
graph node does this chunk represent, so retrieval can expand from it via
standards_items.parent_id / standards_associations / content_alignments."

node_type/node_id is a second, narrower polymorphic pointer for that:
node_type in ('standards_item', 'jurisdiction', 'activity', 'curriculum_unit'),
node_id = the row's PK in that table. FK-less (same reasoning as
content_alignments.content_id and standards_associations.origin_item_id) —
these tables are populated by independent ingest/upload paths that shouldn't
be coupled by a hard constraint. Nullable: older/unlinked rows (anything
indexed before this migration, or content with no real graph node yet)
simply aren't reachable by graph expansion, only by Stage-1 vector search —
same degraded-not-broken behavior the plan describes for the transition
period.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260816c_rag_documents_node_link'
down_revision = '20260816b_content_alignments'
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": column}).fetchone())


def _index_exists(conn, index: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname=:i"
    ), {"i": index}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()

    if not _column_exists(conn, 'rag_documents', 'node_type'):
        op.add_column('rag_documents', sa.Column('node_type', sa.String(50), nullable=True))
    if not _column_exists(conn, 'rag_documents', 'node_id'):
        op.add_column('rag_documents', sa.Column('node_id', postgresql.UUID(as_uuid=True), nullable=True))

    if not _index_exists(conn, 'idx_rag_documents_node'):
        op.create_index('idx_rag_documents_node', 'rag_documents', ['node_type', 'node_id'])


def downgrade() -> None:
    conn = op.get_bind()
    if _index_exists(conn, 'idx_rag_documents_node'):
        op.drop_index('idx_rag_documents_node', table_name='rag_documents')
    if _column_exists(conn, 'rag_documents', 'node_id'):
        op.drop_column('rag_documents', 'node_id')
    if _column_exists(conn, 'rag_documents', 'node_type'):
        op.drop_column('rag_documents', 'node_type')
