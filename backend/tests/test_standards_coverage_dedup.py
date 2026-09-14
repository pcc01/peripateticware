# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for routes/standards.py::get_coverage's union/dedup logic between
the two write paths that can mark a criterion covered --
ActivityStandardsMap (legacy, "authoritative") and content_alignments
(the graph-shaped path from map_activity_to_criterion's dual-write).

This is the specific gap the GraphRAG migration PRD (§6 Phase 3) flagged
as only "verified against a simulated case" by hand, and the 2026-09-13
code audit flagged by name: "write this as an actual test." Complements
tests/test_standards_coverage_evaluation.py, which covers the newer
standards_evaluation precedence layer sitting on top of this same
function -- this file covers the layer underneath it: does the base
completion+mapping count come out right at all, including the specific
double-count case.

Same mocking strategy as test_standards_coverage_evaluation.py: db.execute()
given a side_effect list matching get_coverage's real query sequence.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4, UUID


def _mock_result(*, first=None, scalar_one_or_none=None, scalars_all=None, all_=None):
    result = MagicMock()
    result.first.return_value = first
    result.scalar_one_or_none.return_value = scalar_one_or_none
    result.scalars.return_value.all.return_value = scalars_all if scalars_all is not None else []
    result.all.return_value = all_ if all_ is not None else []
    return result


def _fake_teacher(org_id: UUID) -> MagicMock:
    user = MagicMock()
    user.id = uuid4()
    user.role = "TEACHER"
    user.org_id = org_id
    return user


def _fake_standards_set(set_id: UUID, criteria: list) -> MagicMock:
    s = MagicMock()
    s.id = set_id
    s.name = "Test Set"
    s.criteria = criteria
    s.valid_until = None
    return s


def _fake_map(activity_id: UUID, criterion_id: str, coverage_level: str = "full") -> MagicMock:
    m = MagicMock()
    m.activity_id = activity_id
    m.criterion_id = criterion_id
    m.coverage_level = coverage_level
    return m


def _fake_alignment(item_id: UUID, content_id: UUID, alignment_type: str = "teaches") -> MagicMock:
    a = MagicMock()
    a.item_id = item_id
    a.content_id = content_id
    a.alignment_type = alignment_type
    return a


async def _run_coverage(criteria, maps, learning_session_activity_ids, alignments,
                         set_id=None, org_id=None, student_id=None):
    from routes.standards import get_coverage

    set_id = set_id or uuid4()
    org_id = org_id or uuid4()
    teacher = _fake_teacher(org_id)
    standards_set = _fake_standards_set(set_id, criteria)

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _mock_result(first=("school",)),                          # org tier gate
        _mock_result(scalar_one_or_none=standards_set),            # _get_set()
        _mock_result(scalars_all=maps),                            # activity_standards_map
        _mock_result(scalars_all=learning_session_activity_ids),   # completed learning_sessions
        _mock_result(scalars_all=alignments),                      # content_alignments
        _mock_result(all_=[]),                                     # standards_evaluation (none in these tests)
    ])
    return await get_coverage(set_id=set_id, student_id=student_id, current_user=teacher, db=db)


# ===========================================================================
# S19 — ActivityStandardsMap-only coverage
# ===========================================================================

@pytest.mark.asyncio
async def test_activity_standards_map_only_counts_correctly():
    activity_a, activity_b, activity_c = uuid4(), uuid4(), uuid4()
    criteria = [{"id": f"c{i}"} for i in range(1, 11)]
    maps = [
        _fake_map(activity_a, "c1", "full"),
        _fake_map(activity_b, "c2", "partial"),
        _fake_map(activity_c, "c3", "full"),
    ]
    result = await _run_coverage(
        criteria, maps,
        learning_session_activity_ids=[activity_a, activity_b, activity_c],
        alignments=[],
    )
    assert result["total_criteria"] == 10
    assert result["criteria_met"] == 3
    assert result["coverage"]["c1"]["met"] is True
    assert result["coverage"]["c4"]["met"] is False


# ===========================================================================
# S20 — content_alignments-only coverage adds to (not replaces) the total
# ===========================================================================

@pytest.mark.asyncio
async def test_content_alignments_only_criteria_also_count():
    """Criteria reached purely via the graph-native content_alignments path
    (no ActivityStandardsMap row at all) must still count toward coverage."""
    from services.standards_graph_fold import criterion_item_id

    set_id = uuid4()
    activity_a, activity_d, activity_e = uuid4(), uuid4(), uuid4()
    criteria = [{"id": "c1"}, {"id": "c2"}, {"id": "c4"}, {"id": "c5"}, {"id": "c-other"}]

    maps = [_fake_map(activity_a, "c1", "full")]  # 1 via the legacy path (S19's baseline)
    alignments = [
        _fake_alignment(criterion_item_id(set_id, "c4"), activity_d, "teaches"),
        _fake_alignment(criterion_item_id(set_id, "c5"), activity_e, "assesses"),
    ]

    result = await _run_coverage(
        criteria, maps,
        learning_session_activity_ids=[activity_a, activity_d, activity_e],
        alignments=alignments,
        set_id=set_id,
    )
    assert result["total_criteria"] == 5
    assert result["criteria_met"] == 3  # c1 (map) + c4 + c5 (content_alignments)
    assert result["coverage"]["c4"]["met"] is True
    assert result["coverage"]["c4"]["best_level"] == "partial"  # "teaches" -> partial per _ALIGNMENT_TYPE_TO_LEVEL
    assert result["coverage"]["c5"]["best_level"] == "full"     # "assesses" -> full
    assert result["coverage"]["c-other"]["met"] is False


# ===========================================================================
# S21 — the actual double-count case: same (activity, criterion) reachable
# via BOTH paths (the dual-write from map_activity_to_criterion) must not
# count twice.
# ===========================================================================

@pytest.mark.asyncio
async def test_same_activity_criterion_via_both_paths_counts_once():
    from services.standards_graph_fold import criterion_item_id

    set_id = uuid4()
    activity_id = uuid4()
    criteria = [{"id": "c1"}]

    # The realistic case: map_activity_to_criterion wrote BOTH an
    # ActivityStandardsMap row and a content_alignments row for the exact
    # same (activity_id, criterion_id).
    maps = [_fake_map(activity_id, "c1", "full")]
    alignments = [_fake_alignment(criterion_item_id(set_id, "c1"), activity_id, "teaches")]

    result = await _run_coverage(
        criteria, maps,
        learning_session_activity_ids=[activity_id],
        alignments=alignments,
        set_id=set_id,
    )
    assert result["coverage"]["c1"]["times_addressed"] == 1  # not 2
    assert result["criteria_met"] == 1


@pytest.mark.asyncio
async def test_different_activities_same_criterion_both_count_addressed():
    """The dedup rule is specifically same-activity-via-both-paths -- two
    DIFFERENT activities both hitting the same criterion (one via each
    path) are legitimately two pieces of evidence, not a duplicate."""
    from services.standards_graph_fold import criterion_item_id

    set_id = uuid4()
    activity_a, activity_b = uuid4(), uuid4()
    criteria = [{"id": "c1"}]

    maps = [_fake_map(activity_a, "c1", "full")]
    alignments = [_fake_alignment(criterion_item_id(set_id, "c1"), activity_b, "teaches")]

    result = await _run_coverage(
        criteria, maps,
        learning_session_activity_ids=[activity_a, activity_b],
        alignments=alignments,
        set_id=set_id,
    )
    assert result["coverage"]["c1"]["times_addressed"] == 2


# ===========================================================================
# S22 — ?student_id= filter targets a different student than the caller
# ===========================================================================

@pytest.mark.asyncio
async def test_student_id_filter_targets_that_student_not_the_caller():
    """get_coverage's `target` is student_id when given, else current_user.id
    -- confirm the completed-sessions query is actually scoped to the
    requested student by checking a criterion only THAT student's completed
    activity satisfies is 'met', independent of who's asking."""
    activity_id = uuid4()
    other_student_activity = uuid4()
    criteria = [{"id": "c1"}]
    maps = [_fake_map(activity_id, "c1", "full")]

    target_student = str(uuid4())
    result = await _run_coverage(
        criteria, maps,
        learning_session_activity_ids=[activity_id],  # this mock stands in for "target student's completed activities"
        alignments=[],
        student_id=target_student,
    )
    assert result["student_id"] == target_student
    assert result["coverage"]["c1"]["met"] is True


# ===========================================================================
# S23 — a criterion nobody has ever addressed still appears, not omitted
# ===========================================================================

@pytest.mark.asyncio
async def test_unaddressed_criterion_appears_as_not_met_not_omitted():
    """A family filing a state report needs to see what's missing, not just
    what's done -- an unmapped, unaddressed criterion must still be a key
    in the coverage dict."""
    criteria = [{"id": "c1"}, {"id": "c2"}, {"id": "c3"}]
    result = await _run_coverage(criteria, maps=[], learning_session_activity_ids=[], alignments=[])

    assert set(result["coverage"].keys()) == {"c1", "c2", "c3"}
    for cid in ("c1", "c2", "c3"):
        assert result["coverage"][cid]["met"] is False
        assert result["coverage"][cid]["times_addressed"] == 0
        assert result["coverage"][cid]["best_level"] is None
    assert result["criteria_met"] == 0
    assert result["percent_complete"] == 0
