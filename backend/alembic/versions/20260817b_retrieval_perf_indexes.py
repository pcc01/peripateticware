# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""Two missing indexes found EXPLAIN-ANALYZing rag-retrieve on prod 2026-08-17

Revision ID: 20260817b_retrieval_perf_indexes
Revises: 20260817_rag_documents_dim
Create Date: 2026-08-17

Prod's rag-retrieve latency jumped ~400-500ms after the retired-item filters
landed (20260817's ingest fix, routes/inference.py, graph_retrieval.py) --
EXPLAIN (ANALYZE, BUFFERS) on prod pinned two separate causes:

1. The seed query's `NOT EXISTS (... WHERE si.id = rd.node_id AND
   si.is_retired = true)` -- Postgres chose to satisfy this via a hashed
   SubPlan that does a full parallel Seq Scan of all ~561k standards_items
   rows (no index on is_retired) to materialize the ~16.6k retired-id set,
   every single call: ~460-490ms of it. A partial index on just the
   retired rows (a small minority) makes that materialization an
   index-only scan instead.

2. graph_retrieval.py's _fetch_associations_batch has always filtered
   `WHERE (origin_item_id IN :seeds OR destination_item_id IN :seeds)` --
   origin_item_id has an index, destination_item_id never did, so the OR
   forced a full Seq Scan of standards_associations (669,858 rows) on
   every call. Pre-existing gap, not something the retirement filters
   introduced -- it just hadn't been profiled before now.

Both are additive B-tree indexes; nothing here changes query results.
"""

from alembic import op
import sqlalchemy as sa

revision = '20260817b_retrieval_perf_indexes'
down_revision = '20260817_rag_documents_dim'
branch_labels = None
depends_on = None


def _index_exists(conn, index: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname=:i"
    ), {"i": index}).fetchone())


def upgrade() -> None:
    conn = op.get_bind()

    if not _index_exists(conn, 'idx_standards_associations_destination_item_id'):
        op.create_index(
            'idx_standards_associations_destination_item_id',
            'standards_associations', ['destination_item_id'],
        )

    # Partial: is_retired=true is a small minority of standards_items (~3%
    # as of 2026-08-17) -- indexing just those rows keeps this tiny and
    # keeps it out of the way of every is_retired=false query path.
    if not _index_exists(conn, 'idx_standards_items_retired'):
        op.execute(
            "CREATE INDEX idx_standards_items_retired ON standards_items (id) "
            "WHERE is_retired = true"
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _index_exists(conn, 'idx_standards_items_retired'):
        op.drop_index('idx_standards_items_retired', table_name='standards_items')
    if _index_exists(conn, 'idx_standards_associations_destination_item_id'):
        op.drop_index('idx_standards_associations_destination_item_id', table_name='standards_associations')
