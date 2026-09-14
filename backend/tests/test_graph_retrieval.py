# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for services/graph_retrieval.py::expand_seeds() -- the GraphRAG
Stage 2 expansion step (S24/S27 in STANDARDS_RUBRICS_TEST_PLAN.md). Zero
automated coverage existed for this module before this file; its
correctness had only been verified live/manually per
PRD-graphrag-migration-2026-08-16.md §12 ("all 3 relation-mapping branches
individually confirmed against live precedes/isChildOf edges").

Scope, deliberately: this file tests expand_seeds()'s ORCHESTRATION logic
(which seeds are expandable, respecting include_ancestors/include_related,
dedup against already-seen nodes, relevance-score decay per hop,
never-raises-degrades-to-empty) by patching the three _fetch_*_batch()
helpers directly rather than mocking their raw recursive-CTE SQL --
that SQL's own correctness is a live-data concern (S25's latency
regression check and the PRD's own live verification are the right tools
for that, not a unit test reimplementing Postgres recursion in Python).
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from services.graph_retrieval import expand_seeds, _format_item


def _seed(node_id: str | None, node_type: str = "standards_item", relevance_score: float = 0.9, seed_id: str = "seed-1"):
    return {"id": seed_id, "node_type": node_type, "node_id": node_id, "relevance_score": relevance_score}


def _item(item_id=None, framework_id=None, human_coding_scheme="M.4.NF.A.1", full_statement="Statement text", item_type="Standard"):
    return {
        "id": item_id or uuid4(), "framework_id": framework_id or uuid4(),
        "human_coding_scheme": human_coding_scheme, "full_statement": full_statement, "item_type": item_type,
    }


# ===========================================================================
# Which seeds are even expandable
# ===========================================================================

@pytest.mark.asyncio
async def test_seeds_without_standards_item_node_type_are_skipped():
    seeds = [_seed(str(uuid4()), node_type="activity")]  # not a standards_item
    with patch("services.graph_retrieval._fetch_ancestors_batch", new=AsyncMock(return_value=[])) as mock_fn:
        result = await expand_seeds(db=AsyncMock(), seeds=seeds)
    assert result == []
    mock_fn.assert_not_called()  # never even reaches a DB query -- no expandable seed at all


@pytest.mark.asyncio
async def test_seeds_without_node_id_are_skipped():
    seeds = [{"id": "s1", "node_type": "standards_item", "node_id": None, "relevance_score": 0.9}]
    result = await expand_seeds(db=AsyncMock(), seeds=seeds)
    assert result == []


@pytest.mark.asyncio
async def test_seeds_with_malformed_node_id_are_skipped_not_fatal():
    seeds = [_seed("not-a-real-uuid")]
    result = await expand_seeds(db=AsyncMock(), seeds=seeds)
    assert result == []  # never raises on bad input, just excludes it


@pytest.mark.asyncio
async def test_no_expansion_requested_returns_empty_without_querying():
    seeds = [_seed(str(uuid4()))]
    db = AsyncMock()
    result = await expand_seeds(db=db, seeds=seeds, include_ancestors=False, include_related=False)
    assert result == []
    db.execute.assert_not_called()


# ===========================================================================
# Ancestor expansion — relation label + hop-decay scoring
# ===========================================================================

@pytest.mark.asyncio
async def test_ancestor_expansion_tags_relation_and_decays_score_by_depth():
    node_id = str(uuid4())
    seeds = [_seed(node_id, relevance_score=1.0, seed_id="seed-1")]
    parent = _item()
    grandparent = _item()

    with patch("services.graph_retrieval._fetch_ancestors_batch", new=AsyncMock(return_value=[
        (node_id, 1, parent),      # depth 1 -- direct parent
        (node_id, 2, grandparent), # depth 2
    ])), patch("services.graph_retrieval._fetch_associations_batch", new=AsyncMock(return_value=[])), \
         patch("services.graph_retrieval._fetch_aligned_content_batch", new=AsyncMock(return_value=[])):
        result = await expand_seeds(db=AsyncMock(), seeds=seeds)

    assert len(result) == 2
    assert all(r["relation"] == "ancestor" for r in result)
    assert all(r["expanded_from"] == "seed-1" for r in result)
    # Depth 2 (grandparent) decays further than depth 1 (parent) -- 0.85^1 vs 0.85^2
    parent_result = next(r for r in result if r["node_id"] == str(parent["id"]))
    grandparent_result = next(r for r in result if r["node_id"] == str(grandparent["id"]))
    assert parent_result["relevance_score"] == round(1.0 * 0.85 ** 1, 4)
    assert grandparent_result["relevance_score"] == round(1.0 * 0.85 ** 2, 4)
    assert grandparent_result["relevance_score"] < parent_result["relevance_score"]


@pytest.mark.asyncio
async def test_include_ancestors_false_skips_ancestor_query_entirely():
    seeds = [_seed(str(uuid4()))]
    with patch("services.graph_retrieval._fetch_ancestors_batch", new=AsyncMock(return_value=[])) as ancestors_mock, \
         patch("services.graph_retrieval._fetch_associations_batch", new=AsyncMock(return_value=[])), \
         patch("services.graph_retrieval._fetch_aligned_content_batch", new=AsyncMock(return_value=[])):
        await expand_seeds(db=AsyncMock(), seeds=seeds, include_ancestors=False, include_related=True)
    ancestors_mock.assert_not_called()


@pytest.mark.asyncio
async def test_include_related_false_skips_association_and_alignment_queries():
    seeds = [_seed(str(uuid4()))]
    with patch("services.graph_retrieval._fetch_ancestors_batch", new=AsyncMock(return_value=[])), \
         patch("services.graph_retrieval._fetch_associations_batch", new=AsyncMock(return_value=[])) as assoc_mock, \
         patch("services.graph_retrieval._fetch_aligned_content_batch", new=AsyncMock(return_value=[])) as aligned_mock:
        await expand_seeds(db=AsyncMock(), seeds=seeds, include_ancestors=True, include_related=False)
    assoc_mock.assert_not_called()
    aligned_mock.assert_not_called()


# ===========================================================================
# Dedup — an expanded node already seen (as a seed, or via an earlier
# expansion step) doesn't appear twice.
# ===========================================================================

@pytest.mark.asyncio
async def test_expanded_node_already_a_seed_is_not_duplicated():
    seed_a_id = str(uuid4())
    seed_b_id = str(uuid4())
    seeds = [_seed(seed_a_id, seed_id="seed-a"), _seed(seed_b_id, seed_id="seed-b")]
    # seed_b is ALSO reachable as seed_a's ancestor -- must not appear as a
    # second, separate expanded result.
    shared_item = _item(item_id=seed_b_id)

    with patch("services.graph_retrieval._fetch_ancestors_batch", new=AsyncMock(return_value=[(seed_a_id, 1, shared_item)])), \
         patch("services.graph_retrieval._fetch_associations_batch", new=AsyncMock(return_value=[])), \
         patch("services.graph_retrieval._fetch_aligned_content_batch", new=AsyncMock(return_value=[])):
        result = await expand_seeds(db=AsyncMock(), seeds=seeds)

    assert result == []  # shared_item's id is already a seed -- correctly excluded


@pytest.mark.asyncio
async def test_same_node_reached_via_ancestor_and_association_counted_once():
    node_id = str(uuid4())
    seeds = [_seed(node_id)]
    shared_item = _item()

    with patch("services.graph_retrieval._fetch_ancestors_batch", new=AsyncMock(return_value=[(node_id, 1, shared_item)])), \
         patch("services.graph_retrieval._fetch_associations_batch", new=AsyncMock(return_value=[(node_id, "cross_reference", shared_item)])), \
         patch("services.graph_retrieval._fetch_aligned_content_batch", new=AsyncMock(return_value=[])):
        result = await expand_seeds(db=AsyncMock(), seeds=seeds)

    # Ancestors are processed first, so the ancestor relation wins; the
    # later association hit for the identical node_id is deduped away.
    assert len(result) == 1
    assert result[0]["relation"] == "ancestor"


# ===========================================================================
# Association relation mapping — orchestration only (the SQL's own
# direction/type logic lives in _fetch_associations_batch and is a
# live-data concern per the module's own docstring; this confirms
# expand_seeds() passes each relation straight through unmodified).
# ===========================================================================

@pytest.mark.asyncio
async def test_association_relations_pass_through_unmodified():
    node_id = str(uuid4())
    seeds = [_seed(node_id)]
    prereq_item, cross_item = _item(), _item()

    with patch("services.graph_retrieval._fetch_ancestors_batch", new=AsyncMock(return_value=[])), \
         patch("services.graph_retrieval._fetch_associations_batch", new=AsyncMock(return_value=[
             (node_id, "prerequisite", prereq_item),
             (node_id, "cross_reference", cross_item),
         ])), \
         patch("services.graph_retrieval._fetch_aligned_content_batch", new=AsyncMock(return_value=[])):
        result = await expand_seeds(db=AsyncMock(), seeds=seeds)

    relations = {r["node_id"]: r["relation"] for r in result}
    assert relations[str(prereq_item["id"])] == "prerequisite"
    assert relations[str(cross_item["id"])] == "cross_reference"


# ===========================================================================
# Aligned content
# ===========================================================================

@pytest.mark.asyncio
async def test_aligned_content_included_with_its_own_relation_and_shape():
    node_id = str(uuid4())
    seeds = [_seed(node_id, relevance_score=1.0)]
    content = {"content_id": str(uuid4()), "content_type": "activity", "alignment_type": "teaches",
               "confidence": 0.9, "rationale": "Directly teaches this standard"}

    with patch("services.graph_retrieval._fetch_ancestors_batch", new=AsyncMock(return_value=[])), \
         patch("services.graph_retrieval._fetch_associations_batch", new=AsyncMock(return_value=[])), \
         patch("services.graph_retrieval._fetch_aligned_content_batch", new=AsyncMock(return_value=[(node_id, content)])):
        result = await expand_seeds(db=AsyncMock(), seeds=seeds)

    assert len(result) == 1
    r = result[0]
    assert r["relation"] == "aligned_content"
    assert r["source_type"] == "activity"
    assert r["node_id"] == content["content_id"]
    assert r["content"] == "Directly teaches this standard"
    assert r["relevance_score"] == round(1.0 * 0.85, 4)


# ===========================================================================
# Never raises — a query failure degrades to "no expansion"
# ===========================================================================

@pytest.mark.asyncio
async def test_query_failure_degrades_to_empty_not_raised():
    seeds = [_seed(str(uuid4()))]
    with patch("services.graph_retrieval._fetch_ancestors_batch", new=AsyncMock(side_effect=RuntimeError("DB exploded"))):
        result = await expand_seeds(db=AsyncMock(), seeds=seeds)
    assert result == []  # not an exception propagating up into /rag-retrieve


# ===========================================================================
# _format_item — pure function
# ===========================================================================

def test_format_item_shape():
    item = _item(human_coding_scheme="M.4.NF.A.1", full_statement="Extend understanding of fraction equivalence.")
    out = _format_item(item, relation="ancestor", relevance_score=0.7225, expanded_from="seed-1")
    assert out["relation"] == "ancestor"
    assert out["expanded_from"] == "seed-1"
    assert out["node_type"] == "standards_item"
    assert out["node_id"] == str(item["id"])
    assert out["content"] == "Extend understanding of fraction equivalence."
    assert out["metadata"]["human_coding_scheme"] == "M.4.NF.A.1"
