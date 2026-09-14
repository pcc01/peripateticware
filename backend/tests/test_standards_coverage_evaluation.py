# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
DB-backed(-mocked) integration tests for the evaluated-precedence branch
added to routes/standards.py::get_coverage and
routes/homeschool.py::coverage_summary on 2026-09-13.

Before that change, `met` for a criterion was purely
`times_addressed > 0` -- true for any activity a student *completed*,
regardless of whether the work actually demonstrated the standard. A
teacher's explicit per-submission verdict
(activity_submissions.standards_evaluation, written by
routes/activities.py::score_submission_rubric) now takes precedence when
one exists. This file was flagged as a real gap in
STANDARDS_RUBRICS_TEST_PLAN.md's R18 -- verified live in that session
against the real dev DB, but not previously captured as an automated
test reaching all the way through get_coverage's/coverage_summary's own
query sequence (test_submission_rubric_scoring.py only tests the write
side, i.e. score_submission_rubric itself).

Strategy mirrors tests/test_calendar.py and test_submission_rubric_scoring.py:
db.execute() given a side_effect list, one entry per query in call order.
get_coverage's own sequence, traced from the source:
  1. SELECT license_tier FROM organizations ...           -> .first()
  2. _get_set(): SELECT * FROM standards_sets ...          -> .scalar_one_or_none()
  3. SELECT * FROM activity_standards_map ...              -> .scalars().all()
  4. SELECT activity_id FROM learning_sessions ...          -> .scalars().all()
  5. SELECT * FROM content_alignments ... (skipped if no criterion has an id)
  6. SELECT activity_id, standards_evaluation FROM activity_submissions ... -> .all()
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4, UUID

pytest.importorskip("fastapi")


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


@pytest.mark.asyncio
async def test_explicit_not_met_overrides_completion_based_met():
    """The core case: a criterion mapped to an activity the student
    completed (which, under the old heuristic alone, would show met=True)
    but explicitly evaluated 'not_met' on that student's submission must
    show met=False, evaluated=True -- this was impossible to express before
    this feature existed."""
    from routes.standards import get_coverage

    org_id = uuid4()
    set_id = uuid4()
    activity_id = uuid4()
    student_id = uuid4()
    teacher = _fake_teacher(org_id)

    standards_set = _fake_standards_set(set_id, [
        {"id": "c-a", "name": "Criterion A", "description": "..."},
    ])
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _mock_result(first=("school",)),                                   # 1. org tier
        _mock_result(scalar_one_or_none=standards_set),                    # 2. _get_set()
        _mock_result(scalars_all=[_fake_map(activity_id, "c-a", "full")]), # 3. activity_standards_map (design-time: "full")
        _mock_result(scalars_all=[activity_id]),                           # 4. completed learning_sessions -> yes, completed
        _mock_result(scalars_all=[]),                                      # 5. content_alignments (none)
        _mock_result(all_=[(activity_id, {"c-a": "not_met"})]),           # 6. this student's explicit verdict
    ])

    result = await get_coverage(
        set_id=set_id, student_id=str(student_id), current_user=teacher, db=db,
    )

    c = result["coverage"]["c-a"]
    assert c["evaluated"] is True
    assert c["best_level"] == "not_met"
    assert c["met"] is False
    assert c["times_addressed"] == 1  # still counted as addressed (an activity was attempted), just not met
    assert result["criteria_met"] == 0
    assert result["total_criteria"] == 1


@pytest.mark.asyncio
async def test_no_explicit_evaluation_falls_back_to_completion_heuristic():
    """A criterion with no per-submission verdict at all keeps the original
    behavior: met purely from having a completed, mapped activity."""
    from routes.standards import get_coverage

    org_id = uuid4()
    set_id = uuid4()
    activity_id = uuid4()
    student_id = uuid4()
    teacher = _fake_teacher(org_id)

    standards_set = _fake_standards_set(set_id, [
        {"id": "c-b", "name": "Criterion B", "description": "..."},
    ])
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _mock_result(first=("school",)),
        _mock_result(scalar_one_or_none=standards_set),
        _mock_result(scalars_all=[_fake_map(activity_id, "c-b", "partial")]),
        _mock_result(scalars_all=[activity_id]),
        _mock_result(scalars_all=[]),
        _mock_result(all_=[]),  # no standards_evaluation rows for this student at all
    ])

    result = await get_coverage(
        set_id=set_id, student_id=str(student_id), current_user=teacher, db=db,
    )

    c = result["coverage"]["c-b"]
    assert c["evaluated"] is False
    assert c["best_level"] == "partial"
    assert c["met"] is True  # times_addressed > 0, the pre-existing heuristic, unchanged
    assert result["criteria_met"] == 1


@pytest.mark.asyncio
async def test_evaluation_from_an_uncompleted_activity_still_counts():
    """A teacher's explicit verdict should count even if, for whatever
    reason, the learning_sessions row isn't marked 'completed' (e.g. status
    drifted, or grading happened out of band) -- the evaluation itself is
    the stronger signal, independent of the completion-based fallback path."""
    from routes.standards import get_coverage

    org_id = uuid4()
    set_id = uuid4()
    activity_id = uuid4()
    student_id = uuid4()
    teacher = _fake_teacher(org_id)

    standards_set = _fake_standards_set(set_id, [
        {"id": "c-c", "name": "Criterion C", "description": "..."},
    ])
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _mock_result(first=("school",)),
        _mock_result(scalar_one_or_none=standards_set),
        _mock_result(scalars_all=[_fake_map(activity_id, "c-c", "full")]),
        _mock_result(scalars_all=[]),  # NOT in the completed set
        _mock_result(scalars_all=[]),
        _mock_result(all_=[(activity_id, {"c-c": "exceeds"})]),
    ])

    result = await get_coverage(
        set_id=set_id, student_id=str(student_id), current_user=teacher, db=db,
    )

    c = result["coverage"]["c-c"]
    assert c["evaluated"] is True
    assert c["best_level"] == "exceeds"
    assert c["met"] is True
    assert c["times_addressed"] == 0  # the completion-based count is genuinely 0 -- evaluated overrides it anyway


# ===========================================================================
# routes/homeschool.py::_criterion_status -- the same precedence rule,
# extracted to a pure function specifically so it's testable without mocking
# coverage_summary()'s full query sequence (a mix of raw text()/.mappings()
# reads and two ORM select()s -- see the GraphRAG migration PRD's own §11
# note that this endpoint is "a separate, independent implementation" from
# get_coverage, which is exactly why it needs its own precedence tests
# rather than assuming get_coverage's tests above cover it too).
# ===========================================================================

def test_criterion_status_explicit_not_met_overrides_full_mapping():
    from routes.homeschool import _criterion_status

    activities = [{"activity_id": "a1", "coverage_level": "full"}]
    status, evaluated = _criterion_status(activities, ["not_met"])
    assert status == "not_met"
    assert evaluated is True


def test_criterion_status_falls_back_when_no_evaluation():
    from routes.homeschool import _criterion_status

    activities = [{"activity_id": "a1", "coverage_level": "full"}]
    status, evaluated = _criterion_status(activities, [])
    assert status == "met"
    assert evaluated is False


def test_criterion_status_no_activities_no_evaluation_is_not_met():
    from routes.homeschool import _criterion_status

    status, evaluated = _criterion_status([], [])
    assert status == "not_met"
    assert evaluated is False


def test_criterion_status_takes_best_of_multiple_evaluations():
    """Multiple children/submissions evaluated against the same criterion --
    the best-ever-achieved verdict wins, matching get_coverage's
    _best_level_from_levels() semantics."""
    from routes.homeschool import _criterion_status

    status, evaluated = _criterion_status([], ["not_met", "partial", "full"])
    assert status == "met"
    assert evaluated is True


def test_criterion_status_partial_evaluation_beats_full_design_mapping():
    """An explicit 'partial' verdict from actual graded work still outranks
    a 'full' design-time mapping -- the point of this feature is that the
    mapping was never evidence of quality to begin with."""
    from routes.homeschool import _criterion_status

    activities = [{"activity_id": "a1", "coverage_level": "full"}]
    status, evaluated = _criterion_status(activities, ["partial"])
    assert status == "partial"
    assert evaluated is True
