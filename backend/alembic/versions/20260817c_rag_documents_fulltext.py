# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""GIN full-text index on rag_documents.content, for hybrid retrieval

Revision ID: 20260817c_rag_documents_fulltext
Revises: 20260817b_retrieval_perf_indexes
Create Date: 2026-08-17

Pure vector search has a real failure mode: if a literal phrase match isn't
among the embedding model's nearest neighbors, it's just gone -- and which
phrases that happens to depends on the embedding provider (found comparing
local/Ollama vs prod/Voyage on "figurative language in poetry analysis":
Voyage's neighbors were all about "poetic technique", missing every item
that actually says "figurative language"). This index backs a second,
lexical candidate channel in rag-retrieve's seed query, fused with the
vector-search channel via Reciprocal Rank Fusion (routes/inference.py).

'simple' config, not 'english': the corpus is genuinely multilingual (state
standards ship Spanish translations alongside English, e.g. "Curso de
Estudios Estándar de North Carolina Matemáticas") -- English stemming rules
applied to Spanish text would mis-stem it. 'simple' just lowercases +
tokenizes, no language-specific stemming, which is the safer default across
a corpus that isn't reliably one language.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260817c_rag_documents_fulltext'
down_revision = '20260817b_retrieval_perf_indexes'
branch_labels = None
depends_on = None


def _index_exists(conn, index: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname=:i"
    ), {"i": index}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()
    if not _index_exists(conn, 'idx_rag_documents_content_fts'):
        op.execute(
            "CREATE INDEX idx_rag_documents_content_fts ON rag_documents "
            "USING gin (to_tsvector('simple', content))"
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _index_exists(conn, 'idx_rag_documents_content_fts'):
        op.drop_index('idx_rag_documents_content_fts', table_name='rag_documents')
