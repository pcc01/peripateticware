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

Batching: all three queries below operate on the full set of expandable
seed ids at once (one query each, not one per seed) — the original
per-seed version issued up to 3 queries per seed sequentially (an N+1
pattern), which measured at 1-2.8s for a 5-seed request against real data.
Batched, the same request drops to double-digit milliseconds — see
PRD-graphrag-migration-2026-08-16.md §12 for the before/after numbers.
Per-seed result caps are preserved via ROW_NUMBER() OVER (PARTITION BY
seed_id ...) instead of a plain LIMIT, so batching doesn't let one
richly-connected seed starve the others of their share.
"""

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy import bindparam, text as _t
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

    Never raises — a graph-expansion failure degrades to "no expansion",
    it doesn't take down the whole retrieval request.
    """
    if not include_ancestors and not include_related:
        return []

    # (seed node_id) -> seed dict, for the batched queries below to look up
    # which seed each result row belongs to (score decay, expanded_from).
    seed_by_node_id: dict[str, dict] = {}
    for seed in seeds:
        if seed.get("node_type") != "standards_item" or not seed.get("node_id"):
            continue
        try:
            UUID(seed["node_id"])  # validate before it's used as a query param
        except (ValueError, TypeError):
            continue
        seed_by_node_id[seed["node_id"]] = seed

    if not seed_by_node_id:
        return []

    seed_node_ids = [UUID(nid) for nid in seed_by_node_id]
    expanded: list[dict] = []
    seen_node_ids: set[str] = set(seed_by_node_id.keys())

    try:
        if include_ancestors:
            for seed_id, depth, item in await _fetch_ancestors_batch(db, seed_node_ids, max_depth=_MAX_ANCESTOR_DEPTH):
                if str(item["id"]) in seen_node_ids:
                    continue
                seen_node_ids.add(str(item["id"]))
                seed = seed_by_node_id[seed_id]
                expanded.append(_format_item(
                    item, relation="ancestor",
                    relevance_score=(seed.get("relevance_score") or 0.0) * (_HOP_DECAY ** depth),
                    expanded_from=seed.get("id"),
                ))

        if include_related:
            for seed_id, relation, item in await _fetch_associations_batch(db, seed_node_ids, limit_per_seed=_MAX_ASSOCIATIONS_PER_SEED):
                if str(item["id"]) in seen_node_ids:
                    continue
                seen_node_ids.add(str(item["id"]))
                seed = seed_by_node_id[seed_id]
                expanded.append(_format_item(
                    item, relation=relation,
                    relevance_score=(seed.get("relevance_score") or 0.0) * _HOP_DECAY,
                    expanded_from=seed.get("id"),
                ))

            for seed_id, content in await _fetch_aligned_content_batch(db, seed_node_ids, limit_per_seed=_MAX_ALIGNED_CONTENT_PER_SEED):
                key = f"content:{content['content_type']}:{content['content_id']}"
                if key in seen_node_ids:
                    continue
                seen_node_ids.add(key)
                seed = seed_by_node_id[seed_id]
                expanded.append({
                    "id":              None,
                    "source_type":     content["content_type"],
                    "source_id":       content["content_id"],
                    "source_name":     None,
                    "content":         content.get("rationale") or f"Content aligned to this standard ({content['alignment_type']})",
                    "metadata":        {"alignment_type": content["alignment_type"], "confidence": content.get("confidence")},
                    "relevance_score": round((seed.get("relevance_score") or 0.0) * _HOP_DECAY, 4),
                    "relation":        "aligned_content",
                    "expanded_from":   seed.get("id"),
                    "node_type":       content["content_type"],
                    "node_id":         content["content_id"],
                })
    except Exception as e:
        logger.warning(f"Graph expansion query failed (degrading to no expansion): {e}")
        return []

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


async def _fetch_ancestors_batch(db: AsyncSession, seed_node_ids: list[UUID], *, max_depth: int) -> list[tuple[str, int, dict]]:
    """
    Recursive CTE walk up standards_items.parent_id for every seed at once,
    each result row tagged with which seed it originated from (`seed_id`,
    the anchor's own id — a recursive CTE can't otherwise tell two seeds'
    ancestor chains apart once they've walked more than one level up).
    """
    params = {"seed_ids": seed_node_ids}
    params["max_depth"] = max_depth
    stmt = _t("""
        WITH RECURSIVE ancestors AS (
            SELECT child.id AS seed_id, parent.id, parent.framework_id, parent.human_coding_scheme,
                   parent.full_statement, parent.item_type, 1 AS depth
            FROM standards_items child
            JOIN standards_items parent ON parent.id = child.parent_id
            WHERE child.id IN :seed_ids AND parent.is_retired = false

            UNION ALL

            SELECT a.seed_id, next_parent.id, next_parent.framework_id, next_parent.human_coding_scheme,
                   next_parent.full_statement, next_parent.item_type, a.depth + 1
            FROM ancestors a
            JOIN standards_items cur ON cur.id = a.id
            JOIN standards_items next_parent ON next_parent.id = cur.parent_id
            WHERE a.depth < :max_depth AND next_parent.is_retired = false
        )
        SELECT seed_id, id, framework_id, human_coding_scheme, full_statement, item_type, depth
        FROM ancestors
        ORDER BY seed_id, depth
    """).bindparams(bindparam("seed_ids", expanding=True))

    rows = (await db.execute(stmt, params)).fetchall()
    return [
        (str(row[0]), row[6], {
            "id": row[1], "framework_id": row[2], "human_coding_scheme": row[3],
            "full_statement": row[4], "item_type": row[5],
        })
        for row in rows
    ]


async def _fetch_associations_batch(db: AsyncSession, seed_node_ids: list[UUID], *, limit_per_seed: int) -> list[tuple[str, str, dict]]:
    """
    Typed cross-edges from standards_associations, both directions, for
    every seed at once — capped per seed via ROW_NUMBER() rather than a
    plain LIMIT so batching doesn't let one richly-connected seed starve
    the others.

    Direction/type -> relation:
      seed is origin,      isChildOf               -> ancestor (parent-like; usually redundant with
                                                        _fetch_ancestors_batch's parent_id walk, deduped by caller)
      seed is origin,      exactMatchOf/isRelatedTo -> cross_reference (symmetric; direction doesn't matter)
      seed is destination, exactMatchOf/isRelatedTo -> cross_reference
      seed is destination, precedes                 -> prerequisite (the other item precedes the seed)
      anything else                                  -> cross_reference (catch-all for CASE association
                                                         types not enumerated above, e.g. framework-specific ones)
    isChildOf where seed is the *destination* (i.e. the other item is a child of the seed) is
    intentionally skipped — expanding into a seed's children risks pulling in an unbounded subtree,
    and "what's below this standard" isn't useful context for grounding a query about it.
    """
    params = {"seed_ids": seed_node_ids}
    params["limit_per_seed"] = limit_per_seed
    stmt = _t("""
        WITH assoc AS (
            SELECT
                CASE WHEN sa.origin_item_id IN :seed_ids THEN sa.origin_item_id ELSE sa.destination_item_id END AS seed_id,
                sa.association_type, sa.origin_item_id,
                si.id, si.framework_id, si.human_coding_scheme, si.full_statement, si.item_type,
                ROW_NUMBER() OVER (
                    PARTITION BY CASE WHEN sa.origin_item_id IN :seed_ids THEN sa.origin_item_id ELSE sa.destination_item_id END
                    ORDER BY sa.id
                ) AS rn
            FROM standards_associations sa
            JOIN standards_items si
              ON si.id = (CASE WHEN sa.origin_item_id IN :seed_ids THEN sa.destination_item_id ELSE sa.origin_item_id END)
              AND si.is_retired = false
            WHERE (sa.origin_item_id IN :seed_ids OR sa.destination_item_id IN :seed_ids)
              AND NOT (sa.destination_item_id IN :seed_ids AND sa.association_type = 'isChildOf')
        )
        SELECT seed_id, association_type, origin_item_id, id, framework_id, human_coding_scheme, full_statement, item_type
        FROM assoc
        WHERE rn <= :limit_per_seed
    """).bindparams(bindparam("seed_ids", expanding=True))

    rows = (await db.execute(stmt, params)).fetchall()
    results: list[tuple[str, str, dict]] = []
    for row in rows:
        seed_id, assoc_type, origin_id = str(row[0]), row[1], row[2]
        item = {
            "id": row[3], "framework_id": row[4], "human_coding_scheme": row[5],
            "full_statement": row[6], "item_type": row[7],
        }
        seed_is_origin = str(origin_id) == seed_id
        if assoc_type == "isChildOf" and seed_is_origin:
            relation = "ancestor"
        elif assoc_type == "precedes" and not seed_is_origin:
            relation = "prerequisite"
        else:
            relation = "cross_reference"
        results.append((seed_id, relation, item))
    return results


async def _fetch_aligned_content_batch(db: AsyncSession, seed_node_ids: list[UUID], *, limit_per_seed: int) -> list[tuple[str, dict]]:
    """Approved content_alignments rows for every seed at once — other
    content already known to teach/assess/require/extend it. Empty until
    content_alignments is populated at scale (Phase 3+); the query itself
    is ready now."""
    params = {"seed_ids": seed_node_ids}
    params["limit_per_seed"] = limit_per_seed
    stmt = _t("""
        WITH ac AS (
            SELECT item_id AS seed_id, content_id, content_type, alignment_type, confidence, rationale,
                   ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY created_at DESC) AS rn
            FROM content_alignments
            WHERE item_id IN :seed_ids AND status = 'approved'
        )
        SELECT seed_id, content_id, content_type, alignment_type, confidence, rationale
        FROM ac
        WHERE rn <= :limit_per_seed
    """).bindparams(bindparam("seed_ids", expanding=True))

    rows = (await db.execute(stmt, params)).fetchall()
    return [
        (str(row[0]), {
            "content_id": str(row[1]), "content_type": row[2],
            "alignment_type": row[3], "confidence": row[4], "rationale": row[5],
        })
        for row in rows
    ]
