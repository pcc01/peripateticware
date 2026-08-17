# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Shared insert/delete helpers for the rag_documents vector store.

Three call sites (routes/standards.py's background criteria indexer,
routes/inference.py's manual /ingest endpoint, and
agents/standards_ingestion_agent.py) each used to hand-roll their own
embed-then-INSERT SQL. Centralizing it here means there is exactly one place
that knows the rag_documents column list and the pgvector literal format —
and, notably, it's the one place that actually calls embed_text() and stores
the result, which agents/standards_ingestion_agent.py previously didn't do
(it computed an embedding and discarded it).
"""

import json as _json
import logging
from typing import Optional
from uuid import UUID

from sqlalchemy import text as _t
from sqlalchemy.ext.asyncio import AsyncSession

from services.embedding_service import embed_text

logger = logging.getLogger(__name__)


async def upsert_rag_chunk(
    db: AsyncSession,
    *,
    source_type: str,
    content: str,
    source_id: Optional[str] = None,
    source_name: Optional[str] = None,
    chunk_index: int = 0,
    metadata: Optional[dict] = None,
    owner_id: Optional[UUID] = None,
    node_type: Optional[str] = None,
    node_id: Optional[UUID] = None,
) -> bool:
    """
    Embed `content` and insert one row into rag_documents.

    `node_type`/`node_id` link this chunk to an exact graph node
    (standards_items.id, activities.id, etc.) so graph-expansion retrieval
    can walk from it — see models/database.py's RagDocument docstring /
    migration 20260816c_rag_documents_node_link. Omit for content with no
    real graph node yet; it's still findable by vector search alone.

    Returns True if the row was inserted (embedding succeeded), False if
    embedding failed (logged, non-fatal — caller decides whether that's
    worth surfacing). Does not commit; caller controls the transaction so
    callers indexing many chunks can commit once at the end.
    """
    if not content or not content.strip():
        return False

    emb_result = await embed_text(content)
    embedding = emb_result.get("embedding")
    if not embedding:
        logger.warning(
            "rag_store: embedding failed for source_type=%s source_id=%s: %s",
            source_type, source_id, emb_result.get("error"),
        )
        return False

    await db.execute(_t("""
        INSERT INTO rag_documents
            (source_type, source_id, source_name, chunk_index,
             content, metadata, embedding, owner_id, node_type, node_id)
        VALUES
            (:stype, :sid, :sname, :cidx,
             :content, CAST(:meta AS jsonb), CAST(:emb AS vector), :owner, :ntype, :nid)
    """), {
        "stype":   source_type,
        "sid":     source_id,
        "sname":   source_name,
        "cidx":    chunk_index,
        "content": content,
        "meta":    _json.dumps(metadata or {}),
        "emb":     "[" + ",".join(str(v) for v in embedding) + "]",
        "owner":   str(owner_id) if owner_id else None,
        "ntype":   node_type,
        "nid":     str(node_id) if node_id else None,
    })
    return True


async def indexed_node_ids(db: AsyncSession, *, node_type: str) -> set[str]:
    """Return the set of node_id strings already indexed for a node_type —
    used by batch backfill jobs (e.g. scripts/backfill_standards_embeddings.py)
    to resume without re-embedding rows that already succeeded."""
    rows = (await db.execute(_t(
        "SELECT DISTINCT node_id::text FROM rag_documents WHERE node_type = :ntype AND node_id IS NOT NULL"
    ), {"ntype": node_type})).fetchall()
    return {r[0] for r in rows}


async def delete_rag_chunks(db: AsyncSession, *, source_type: str, source_id: str) -> None:
    """Remove stale chunks for a source before re-indexing it."""
    await db.execute(_t(
        "DELETE FROM rag_documents WHERE source_id = :sid AND source_type = :stype"
    ), {"sid": source_id, "stype": source_type})
