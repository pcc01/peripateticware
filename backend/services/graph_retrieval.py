# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
GraphRAG expansion — Stage 2 of routes/inference.py's /rag-retrieve.

Stage 1 (vector search over rag_documents) finds seed nodes. This module
walks outward from those seeds through the standards graph
(standards_items.parent_id, standards_associations, content_alignments) to
pull in structurally-related context a pure similarity search can't reach:
a terse standard's ancestors, cross-jurisdiction equivalents, prerequisites,
and content already aligned to the same standard.

Per PRD-graphrag-migration-2026-08-16.md §3: expansion results are tagged
with a `relation` describing *why* they're included ("ancestor",
"cross_reference", "prerequisite", "aligned_content") rather than presented
as if they were additional vector matches — a parent standard included for
context is a different kind of relevance than a 0.83 cosine-similarity hit,
and callers (including the LLM prompt built from this) should be able to
tell the difference.

Only seeds with node_type='standards_item' (see rag_documents.node_id) are
expandable today — that's the one node type currently linked into the
graph. Seeds without a linked node_id (unbackfilled/legacy content) pass
through as vector-search-only results, same as before this module existed.
"""

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy import text as _t
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Relevance score assigned to an expanded item = seed's own score * this
# factor per hop away from the seed. Ancestors two levels up score lower
# than the direct parent, etc. — a simple, legible decay, not a claim of
# precise relevance; the `relation` field is what actually explains the
# result, this just keeps a mixed list sortable.
_HOP_DECAY = 0.85

# Caps so one richly-connected seed can't crowd out everything else.
_MAX_ANCESTOR_DEPTH = 5
_MAX_ASSOCIATIONS_PER_SEED = 5
_MAX_ALIGNED_CONTENT_PER_SEED = 5


async def expand_seeds(
    db: AsyncSession,
    seeds: list[dict],
    *,
    include_ancestors: bool = True,
    include_related: bool = True,
) -> list[dict]:
    """
    Given Stage-1 vector-search results (each a dict with at least
    "id", "node_type", "node_id", "relevance_score"), return a list of
    additional result dicts reached by walking the graph from each
    expandable seed. Shaped like the seed dicts (source_type, source_name,
    content, metadata, relevance_score) plus "relation" and "expanded_from".

    Never raises — a graph-expansion failure degrades to "no expansion for
    this seed", it doesn't take down the whole retrieval request.
    """
    if not include_ancestors and not include_related:
        return []

    expanded: list[dict] = []
    seen_node_ids: set[str] = {
        s["node_id"] for s in seeds if s.get("node_id")
    }

    for seed in seeds:
        if seed.get("node_type") != "standards_item" or not seed.get("node_id"):
            continue
        try:
            node_id = UUID(seed["node_id"])
        except (ValueError, TypeError):
            continue

        seed_score = seed.get("relevance_score") or 0.0

        if include_ancestors:
            ancestors = await _fetch_ancestors(db, node_id, max_depth=_MAX_ANCESTOR_DEPTH)
            for depth, item in ancestors:
                if str(item["id"]) in seen_node_ids:
                    continue
                seen_node_ids.add(str(item["id"]))
                expanded.append(_format_item(
                    item, relation="ancestor",
                    relevance_score=seed_score * (_HOP_DECAY ** depth),
                    expanded_from=seed.get("id"),
                ))

        if include_related:
            related = await _fetch_associations(db, node_id, limit=_MAX_ASSOCIATIONS_PER_SEED)
            for relation, item in related:
                if str(item["id"]) in seen_node_ids:
                    continue
                seen_node_ids.add(str(item["id"]))
                expanded.append(_format_item(
                    item, relation=relation,
                    relevance_score=seed_score * _HOP_DECAY,
                    expanded_from=seed.get("id"),
                ))

            aligned = await _fetch_aligned_content(db, node_id, limit=_MAX_ALIGNED_CONTENT_PER_SEED)
            for content in aligned:
                key = f"content:{content['content_type']}:{content['content_id']}"
                if key in seen_node_ids:
                    continue
                seen_node_ids.add(key)
                expanded.append({
                    "id":              None,
                    "source_type":     content["content_type"],
                    "source_id":       content["content_id"],
                    "source_name":     None,
                    "content":         content.get("rationale") or f"Content aligned to this standard ({content['alignment_type']})",
                    "metadata":        {"alignment_type": content["alignment_type"], "confidence": content.get("confidence")},
                    "relevance_score": seed_score * _HOP_DECAY,
                    "relation":        "aligned_content",
                    "expanded_from":   seed.get("id"),
                    "node_type":       content["content_type"],
                    "node_id":         content["content_id"],
                })

    return expanded


def _format_item(item: dict, *, relation: str, relevance_score: float, expanded_from: Optional[str]) -> dict:
    return {
        "id":              None,   # not a rag_documents row — a standards_items row surfaced directly
        "source_type":     "standards",
        "source_id":       str(item["framework_id"]) if item.get("framework_id") else None,
        "source_name":     item.get("human_coding_scheme"),
        "content":         item.get("full_statement"),
        "metadata":        {
            "human_coding_scheme": item.get("human_coding_scheme"),
            "item_type":           item.get("item_type"),
        },
        "relevance_score": round(relevance_score, 4),
        "relation":        relation,
        "expanded_from":   expanded_from,
        "node_type":       "standards_item",
        "node_id":         str(item["id"]),
    }


async def _fetch_ancestors(db: AsyncSession, node_id: UUID, *, max_depth: int) -> list[tuple[int, dict]]:
    """Recursive CTE walk up standards_items.parent_id, nearest ancestor first."""
    rows = (await db.execute(_t("""
        WITH RECURSIVE ancestors AS (
            SELECT id, framework_id, human_coding_scheme, full_statement, item_type, parent_id, 1 AS depth
            FROM standards_items
            WHERE id = (SELECT parent_id FROM standards_items WHERE id = :node_id)
            UNION ALL
            SELECT si.id, si.framework_id, si.human_coding_scheme, si.full_statement, si.item_type, si.parent_id, a.depth + 1
            FROM standards_items si
            JOIN ancestors a ON si.id = a.parent_id
            WHERE a.depth < :max_depth
        )
        SELECT id, framework_id, human_coding_scheme, full_statement, item_type, depth
        FROM ancestors
        ORDER BY depth
    """), {"node_id": str(node_id), "max_depth": max_depth})).fetchall()

    return [
        (row[5], {
            "id": row[0], "framework_id": row[1], "human_coding_scheme": row[2],
            "full_statement": row[3], "item_type": row[4],
        })
        for row in rows
    ]


async def _fetch_associations(db: AsyncSession, node_id: UUID, *, limit: int) -> list[tuple[str, dict]]:
    """
    Typed cross-edges from standards_associations, both directions.

    Direction/type -> relation:
      seed is origin,      isChildOf            -> ancestor (parent-like; usually redundant with
                                                    _fetch_ancestors' parent_id walk, deduped by caller)
      seed is origin,      exactMatchOf/isRelatedTo -> cross_reference (symmetric; direction doesn't matter)
      seed is destination, exactMatchOf/isRelatedTo -> cross_reference
      seed is destination, precedes             -> prerequisite (the other item precedes the seed)
      anything else                              -> cross_reference (catch-all for CASE association
                                                     types not enumerated above, e.g. framework-specific ones)
    isChildOf where seed is the *destination* (i.e. the other item is a child of the seed) is
    intentionally skipped — expanding into a seed's children risks pulling in an unbounded subtree,
    and "what's below this standard" isn't useful context for grounding a query about it.
    """
    rows = (await db.execute(_t("""
        SELECT sa.association_type, sa.origin_item_id, sa.destination_item_id,
               si.id, si.framework_id, si.human_coding_scheme, si.full_statement, si.item_type
        FROM standards_associations sa
        JOIN standards_items si
          ON si.id = (CASE WHEN sa.origin_item_id = :node_id THEN sa.destination_item_id ELSE sa.origin_item_id END)
        WHERE (sa.origin_item_id = :node_id OR sa.destination_item_id = :node_id)
          AND NOT (sa.destination_item_id = :node_id AND sa.association_type = 'isChildOf')
        LIMIT :limit
    """), {"node_id": str(node_id), "limit": limit})).fetchall()

    results: list[tuple[str, dict]] = []
    for row in rows:
        assoc_type, origin_id, dest_id = row[0], row[1], row[2]
        item = {
            "id": row[3], "framework_id": row[4], "human_coding_scheme": row[5],
            "full_statement": row[6], "item_type": row[7],
        }
        seed_is_origin = str(origin_id) == str(node_id)
        if assoc_type == "isChildOf" and seed_is_origin:
            relation = "ancestor"
        elif assoc_type == "precedes" and not seed_is_origin:
            relation = "prerequisite"
        else:
            relation = "cross_reference"
        results.append((relation, item))
    return results


async def _fetch_aligned_content(db: AsyncSession, node_id: UUID, *, limit: int) -> list[dict]:
    """Approved content_alignments rows for this standard — other content already
    known to teach/assess/require/extend it. Empty until content_alignments is
    actually populated (Phase 3+); the query itself is ready now."""
    rows = (await db.execute(_t("""
        SELECT content_id, content_type, alignment_type, confidence, rationale
        FROM content_alignments
        WHERE item_id = :node_id AND status = 'approved'
        LIMIT :limit
    """), {"node_id": str(node_id), "limit": limit})).fetchall()

    return [
        {
            "content_id": str(row[0]), "content_type": row[1],
            "alignment_type": row[2], "confidence": row[3], "rationale": row[4],
        }
        for row in rows
    ]
