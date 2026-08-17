# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Resize rag_documents.embedding to match the configured VECTOR_DIMENSION

Revision ID: 20260817_rag_documents_dim
Revises: 20260816c_rag_documents_node_link
Create Date: 2026-08-17

rag_documents.embedding has been a hardcoded vector(384) since it was first
created (matching all-MiniLM-L6-v2 / Ollama's qwen3-embedding truncated via
`dimensions`, and OpenAI's text-embedding-3-* truncated via the same param
— see 20260816_rag_documents.py). Voyage AI, added as a third embedding
provider in services/embedding_service.py, doesn't support arbitrary
Matryoshka truncation the way those two do — its `output_dimension` is a
fixed enum (256/512/1024/2048), 384 isn't one of them.

Rather than hardcode a new dimension here (which would force every
deployment onto the same value regardless of which provider it actually
runs), this reads core/config.py's settings.VECTOR_DIMENSION *at migrate
time* — each deployment's own .env controls its own target dimension. A
deployment that stays on Ollama/OpenAI at 384 (the default) hits the
no-op branch below and this migration does nothing. A deployment that
sets VECTOR_DIMENSION=512 (e.g. to run Voyage) gets the column actually
resized the first time `alembic upgrade head` runs there.

Existing embeddings are cleared (not cast) on an actual dimension change
— a vector at the wrong dimension is meaningless regardless of whether we
try to preserve its numbers, and this migration is expected to run
immediately before a fresh backfill repopulates the table against
whichever provider produced the new dimension.
"""

from alembic import op
import sqlalchemy as sa
import re

revision = '20260817_rag_documents_dim'
down_revision = '20260816c_rag_documents_node_link'
branch_labels = None
depends_on = None


def _current_dim(conn) -> int | None:
    row = conn.execute(sa.text(
        "SELECT format_type(atttypid, atttypmod) FROM pg_attribute "
        "WHERE attrelid = 'rag_documents'::regclass AND attname = 'embedding' AND NOT attisdropped"
    )).fetchone()
    if not row or not row[0]:
        return None
    m = re.search(r"vector\((\d+)\)", row[0])
    return int(m.group(1)) if m else None


def _index_exists(conn, index: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname=:i"
    ), {"i": index}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()

    from core.config import settings
    target_dim = settings.VECTOR_DIMENSION

    current = _current_dim(conn)
    if current == target_dim:
        return  # already correct — the common case (e.g. local dev at 384)

    if _index_exists(conn, 'rag_documents_embedding_hnsw'):
        op.drop_index('rag_documents_embedding_hnsw', table_name='rag_documents')

    # Clear first so the type change has nothing incompatible to cast.
    conn.execute(sa.text("UPDATE rag_documents SET embedding = NULL WHERE embedding IS NOT NULL"))
    conn.execute(sa.text(f"ALTER TABLE rag_documents ALTER COLUMN embedding TYPE vector({target_dim})"))

    conn.execute(sa.text(
        "CREATE INDEX rag_documents_embedding_hnsw ON rag_documents "
        "USING hnsw (embedding vector_cosine_ops)"
    ))


def downgrade() -> None:
    # The prior dimension isn't recorded anywhere (it's derived from live
    # settings at upgrade time, not a fixed value baked into this file) —
    # nothing meaningful to revert to. Change VECTOR_DIMENSION back and
    # rerun upgrade() to move the column again.
    pass
