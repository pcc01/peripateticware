# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
X5 (STANDARDS_RUBRICS_TEST_PLAN.md): "confirm the numbers in the export
match what §2.4's coverage endpoints report, not a separately-computed
value." Investigating that exact question found a real bug, fixed in the
same pass as this test file:

routes/export.py::_build_data() had its OWN, third, independent
reimplementation of the coverage computation (its own comment said so:
"Build inline since we can't call FastAPI endpoints internally"). That
copy:
  - never unioned content_alignments, only ActivityStandardsMap -- a
    criterion reached solely via the graph-native write path was silently
    absent from the exported PDF/CSV, present in the live coverage API.
  - had no standards_evaluation precedence layer at all -- a criterion a
    teacher explicitly marked 'not_met' on a submission (see
    routes/activities.py::score_submission_rubric) still showed as met in
    the export, because the export's copy of the logic predates that
    feature and was never updated.

Fixed by extracting routes/standards.py::compute_standards_coverage() (the
shared implementation get_coverage() itself now also calls) and pointing
export.py at it instead of its own copy. This file proves parity going
forward: the same set of maps/alignments/evaluations produces the same
coverage numbers whether you call get_coverage() or export a CSV.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4, UUID


def _mock_result(*, first=None, scalar_one_or_none=None, scalars_all=None, all_=None, scalar=None):
    result = MagicMock()
    result.first.return_value = first
    result.scalar_one_or_none.return_value = scalar_one_or_none
    result.scalars.return_value.all.return_value = scalars_all if scalars_all is not None else []
    result.all.return_value = all_ if all_ is not None else []
    result.scalar.return_value = scalar
    return result


def _fake_user(role: str = "TEACHER") -> MagicMock:
    user = MagicMock()
    user.id = uuid4()
    user.role = role
    user.email = "teacher@example.com"
    user.full_name = "Test Teacher"
    user.state_code = "WA"
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


@pytest.mark.asyncio
async def test_export_includes_a_criterion_reached_only_via_content_alignments():
    """The regression this file exists to catch: before the fix, a
    criterion with NO ActivityStandardsMap row -- reached purely via
    content_alignments -- was invisible to the export's coverage_rows,
    even though GET /standards/{set_id}/coverage would show it met."""
    from routes.export import _build_data
    from services.standards_graph_fold import criterion_item_id

    set_id = uuid4()
    activity_id = uuid4()
    teacher = _fake_user("TEACHER")
    standards_set = _fake_standards_set(set_id, [{"id": "c-graph-only", "name": "Graph-only criterion"}])

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _mock_result(scalars_all=[]),                                         # activities
        _mock_result(scalars_all=[]),                                         # sessions
        _mock_result(scalar_one_or_none=standards_set),                       # StandardsSet lookup
        _mock_result(scalars_all=[]),                                         # ActivityStandardsMap: NONE at all
        _mock_result(scalars_all=[activity_id]),                              # completed learning_sessions
        _mock_result(scalars_all=[_fake_alignment(criterion_item_id(set_id, "c-graph-only"), activity_id)]),  # content_alignments
        # No standards_evaluation query here: mapped_activity_ids is empty
        # (zero ActivityStandardsMap rows in this test), so
        # compute_standards_coverage() skips that query entirely.
        _mock_result(scalar=0),                                               # competencies count
    ])

    data = await _build_data("standards_coverage", teacher, db, standards_set_id=str(set_id))

    assert data["standards_coverage"]["criteria_met"] == 1
    rows = data["coverage_rows"]
    assert len(rows) == 1
    assert rows[0]["criterion_id"] == "c-graph-only"
    assert rows[0]["met"] is True  # previously: absent from ActivityStandardsMap-only logic -> undercounted


@pytest.mark.asyncio
async def test_export_reflects_an_explicit_not_met_verdict():
    """The other half of the regression: a teacher's explicit 'not_met'
    evaluation (routes/activities.py::score_submission_rubric) must show
    up as not-met in the export too, not just in the live coverage API."""
    from routes.export import _build_data

    set_id = uuid4()
    activity_id = uuid4()
    teacher = _fake_user("TEACHER")
    standards_set = _fake_standards_set(set_id, [{"id": "c1", "name": "Criterion One"}])

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[
        _mock_result(scalars_all=[]),                                    # activities
        _mock_result(scalars_all=[]),                                    # sessions
        _mock_result(scalar_one_or_none=standards_set),                  # StandardsSet lookup
        _mock_result(scalars_all=[_fake_map(activity_id, "c1", "full")]),# ActivityStandardsMap: design-time says "full"
        _mock_result(scalars_all=[activity_id]),                         # completed learning_sessions
        _mock_result(scalars_all=[]),                                    # content_alignments
        _mock_result(all_=[(activity_id, {"c1": "not_met"})]),           # a teacher explicitly said 'not_met'
        _mock_result(scalar=0),                                          # competencies count
    ])

    data = await _build_data("standards_coverage", teacher, db, standards_set_id=str(set_id))

    assert data["standards_coverage"]["criteria_met"] == 0  # not 1 -- the explicit verdict wins
    row = data["coverage_rows"][0]
    assert row["met"] is False
    assert row["best_level"] == "not_met"


@pytest.mark.asyncio
async def test_no_second_coverage_implementation_exists_in_export_py():
    """Regression guard: routes/export.py must import and call
    compute_standards_coverage rather than recomputing coverage inline
    again. A future edit that reintroduces a local reimplementation
    (easy to do by copy-pasting get_coverage()'s body "just this once")
    is exactly how this bug happened the first time."""
    import inspect
    import routes.export as export_module

    source = inspect.getsource(export_module)
    assert "compute_standards_coverage" in source
    # The specific tell of the old duplicated logic: a local dict keyed by
    # criterion_id built from scratch in export.py itself.
    assert 'cov[cid] = {' not in source
