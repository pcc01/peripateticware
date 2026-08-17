# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Bring rag_documents under Alembic management

Revision ID: 20260816_rag_documents
Revises: 20260807b_widen_standards_subject
Create Date: 2026-08-16

rag_documents (the live pgvector store behind /rag-retrieve and every
services/rag_store.py insert) has, since it was introduced, only ever been
created by a runtime `CREATE TABLE IF NOT EXISTS` in
startup.py::apply_rag_documents_table() — never migration-tracked, unlike
every other table this migration's chain manages (including the CASE
standards graph tables from 20260807_case_standards, which this table will
need FK-able columns pointing at in a later migration once GraphRAG
expansion lands). That's the same dual-bootstrap-path pattern already
called out elsewhere in this codebase as a source of drift bugs (see the
native_enum=False comments in models/database.py).

This migration makes the schema idempotent-identical to what
apply_rag_documents_table() already creates, so running it against a
database that bootstrapped via startup.py is a no-op (all guarded with
IF NOT EXISTS / existence checks), and running it against a fresh database
needs no startup.py involvement at all. startup.py's function is left in
place as a defensive fallback for any environment that runs the app
without ever running `alembic upgrade` — it stays a harmless no-op once
this migration has run.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector

revision = '20260816_rag_documents'
down_revision = '20260807b_widen_standards_subject'
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

    conn.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))

    if not _table_exists(conn, 'rag_documents'):
        op.create_table(
            'rag_documents',
            sa.Column('id',          postgresql.UUID(as_uuid=True),
                      primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('source_type', sa.String(50),  nullable=False),
            sa.Column('source_id',   sa.String(255), nullable=True),
            sa.Column('source_name', sa.String(512), nullable=True),
            sa.Column('chunk_index', sa.Integer(),   nullable=False, server_default=sa.text('0')),
            sa.Column('content',     sa.Text(),       nullable=False),
            sa.Column('metadata',    postgresql.JSONB(), server_default=sa.text("'{}'::jsonb")),
            # 384 = sentence-transformers/all-MiniLM-L6-v2 dimension — see
            # core/config.py's VECTOR_DIMENSION and services/embedding_service.py,
            # which requests this exact dimension from whichever embedding
            # provider is configured. Same type/pattern as the initial
            # migration's curriculum_units.content_embedding and
            # multimodal_inputs.embedding columns (84daf034be09).
            sa.Column('embedding',   Vector(dim=384), nullable=True),
            sa.Column('owner_id',    postgresql.UUID(as_uuid=True),
                      sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('created_at',  sa.DateTime(), server_default=sa.text('now()')),
            sa.Column('updated_at',  sa.DateTime(), server_default=sa.text('now()')),
        )

    if not _index_exists(conn, 'rag_documents_embedding_hnsw'):
        conn.execute(sa.text(
            "CREATE INDEX rag_documents_embedding_hnsw ON rag_documents "
            "USING hnsw (embedding vector_cosine_ops)"
        ))
    if not _index_exists(conn, 'rag_documents_source_type_idx'):
        op.create_index('rag_documents_source_type_idx', 'rag_documents', ['source_type'])
    if not _index_exists(conn, 'rag_documents_source_id_idx'):
        op.create_index('rag_documents_source_id_idx', 'rag_documents', ['source_id'])
    if not _index_exists(conn, 'rag_documents_owner_idx'):
        op.create_index('rag_documents_owner_idx', 'rag_documents', ['owner_id'])


def downgrade() -> None:
    conn = op.get_bind()
    for idx, table in [
        ('rag_documents_owner_idx', 'rag_documents'),
        ('rag_documents_source_id_idx', 'rag_documents'),
        ('rag_documents_source_type_idx', 'rag_documents'),
        ('rag_documents_embedding_hnsw', 'rag_documents'),
    ]:
        if _index_exists(conn, idx):
            op.drop_index(idx, table_name=table)
    if _table_exists(conn, 'rag_documents'):
        op.drop_table('rag_documents')
