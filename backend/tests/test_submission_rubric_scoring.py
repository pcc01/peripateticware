# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for POST /activities/teacher/submissions/{session_id}/score-rubric
(routes/activities.py::score_submission_rubric) and the standards-coverage
precedence it feeds — the fix for a gap found 2026-09-13: there was no
working frontend-or-backend path for a teacher to score a submission
against a rubric at all (frontend/src/services/api.ts::scoreAssignment()
posted to a route that never existed, and was never called from any
component either), and no way for a specific student's work to be recorded
as having met — or explicitly NOT met — a mapped state standard
(activity_standards_map has no student dimension; coverage previously
meant only "the student completed the activity," independent of quality).

Also exercises the real bug this feature-build found along the way:
models/assessment.py::AssessmentRubric.framework was declared as a native
Postgres enum with no matching DB type ever created, so every
POST /rubrics call had always 500'd — assessment_rubrics had zero rows in
the dev DB not because the feature was untested, but because rubric
creation itself was broken. See
test_assessment_rubric_framework_column_is_not_a_native_enum.

Strategy mirrors tests/test_calendar.py: an in-process FastAPI app with
only the relevant router(s), get_current_user/get_db overridden, requests
driven through httpx.AsyncClient + ASGITransport, db.execute() given a
side_effect list to control each successive query's result in call order.
"""

from __future__ import annotations

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4, UUID

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

pytest.importorskip("fastapi")
pytest.importorskip("httpx")


def _make_app() -> FastAPI:
    from fastapi import FastAPI as _FA
    test_app = _FA()
    from routes.activities import router as activities_router
    # activities_router already declares prefix="/api/v1/activities" itself
    # (unlike routes/calendar.py, which relies on main.py's include_router
    # call to add the prefix) -- including it with another prefix here would
    # double it up and 404 every request.
    test_app.include_router(activities_router)
    return test_app


def _fake_teacher(uid: UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = uid or uuid4()
    user.email = "teacher@example.com"
    user.role = "TEACHER"
    user.is_active = True
    return user


def _fake_std_map(criterion_id: str, standards_set_id: UUID, coverage_level: str = "partial"):
    """A MagicMock standing in for an ActivityStandardsMap ORM row."""
    m = MagicMock()
    m.criterion_id = criterion_id
    m.standards_set_id = standards_set_id
    m.coverage_level = coverage_level
    return m


def _fake_standards_set(set_id: UUID, name: str, criteria: list):
    s = MagicMock()
    s.id = set_id
    s.name = name
    s.criteria = criteria
    return s


def _mock_result(*, first=None, fetchall=None, scalar_one_or_none=None, scalars_all=None):
    result = MagicMock()
    result.first.return_value = first
    result.fetchall.return_value = fetchall if fetchall is not None else []
    result.scalar_one_or_none.return_value = scalar_one_or_none
    result.scalars.return_value.all.return_value = scalars_all if scalars_all is not None else []
    return result


async def _client_for(user: MagicMock, execute_side_effect: list):
    from core.database import get_db
    from core.dependencies import get_current_user

    app = _make_app()
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=execute_side_effect)
    db.commit = AsyncMock()
    db.add = MagicMock()  # db.add() is sync in real SQLAlchemy, unlike db.execute()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test"), db


def _fake_rubric(rubric_id: UUID):
    """A MagicMock standing in for an AssessmentRubric ORM row."""
    r = MagicMock()
    r.id = rubric_id
    r.criteria = [
        {"id": "c1", "name": "Data Collection", "levels": [
            {"score": 4, "label": "Exceeds"}, {"score": 3, "label": "Meets"},
            {"score": 2, "label": "Approaching"}, {"score": 1, "label": "Beginning"},
        ]},
        {"id": "c2", "name": "Analysis", "levels": [
            {"score": 4, "label": "Exceeds"}, {"score": 3, "label": "Meets"},
            {"score": 2, "label": "Approaching"}, {"score": 1, "label": "Beginning"},
        ]},
    ]
    return r


def _mapped_eco1_results(coverage_level: str = "partial"):
    """The two db.execute() results _mapped_standards_for_activity() needs
    to resolve one mapped criterion ("eco-1", category "Life Science") --
    an ActivityStandardsMap select then a StandardsSet select, in that order."""
    set_id = uuid4()
    return [
        _mock_result(scalars_all=[_fake_std_map("eco-1", set_id, coverage_level)]),
        _mock_result(scalars_all=[_fake_standards_set(
            set_id, "Test Science Standards",
            [{"id": "eco-1", "name": "Ecosystem interactions", "category": "Life Science"}],
        )]),
    ]


SESSION_ID = str(uuid4())


# ===========================================================================
# Guardrails
# ===========================================================================

@pytest.mark.asyncio
async def test_requires_at_least_one_of_scores_or_standards_evaluation():
    teacher = _fake_teacher()
    client, db = await _client_for(teacher, [])
    async with client:
        resp = await client.post(
            f"/api/v1/activities/teacher/submissions/{SESSION_ID}/score-rubric",
            json={},
        )
    assert resp.status_code == 422
    db.execute.assert_not_called()  # fails before any DB work


@pytest.mark.asyncio
async def test_404_when_session_not_owned_by_teacher():
    teacher = _fake_teacher()
    execute_side_effect = [_mock_result(first=None)]  # ownership join finds nothing
    client, db = await _client_for(teacher, execute_side_effect)
    async with client:
        resp = await client.post(
            f"/api/v1/activities/teacher/submissions/{SESSION_ID}/score-rubric",
            json={"scores": [{"criterion_id": "c1", "score": 3}]},
        )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_400_when_scoring_rubric_but_none_attached():
    teacher = _fake_teacher()
    student_id, activity_id = uuid4(), uuid4()
    sub_id = uuid4()
    execute_side_effect = [
        _mock_result(first=(student_id, activity_id, None)),  # ownership: rubric_id is NULL
        _mock_result(first=(sub_id,)),                        # _upsert_submission: existing row
    ]
    client, db = await _client_for(teacher, execute_side_effect)
    async with client:
        resp = await client.post(
            f"/api/v1/activities/teacher/submissions/{SESSION_ID}/score-rubric",
            json={"scores": [{"criterion_id": "c1", "score": 3}]},
        )
    assert resp.status_code == 400
    assert "no rubric attached" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_422_unknown_criterion_id():
    teacher = _fake_teacher()
    student_id, activity_id, rubric_id = uuid4(), uuid4(), uuid4()
    sub_id = uuid4()
    execute_side_effect = [
        _mock_result(first=(student_id, activity_id, rubric_id)),
        _mock_result(first=(sub_id,)),
        _mock_result(scalar_one_or_none=_fake_rubric(rubric_id)),
    ]
    client, db = await _client_for(teacher, execute_side_effect)
    async with client:
        resp = await client.post(
            f"/api/v1/activities/teacher/submissions/{SESSION_ID}/score-rubric",
            json={"scores": [{"criterion_id": "does-not-exist", "score": 3}]},
        )
    assert resp.status_code == 422
    assert "Unknown rubric criterion" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_422_score_not_a_valid_level():
    teacher = _fake_teacher()
    student_id, activity_id, rubric_id = uuid4(), uuid4(), uuid4()
    sub_id = uuid4()
    execute_side_effect = [
        _mock_result(first=(student_id, activity_id, rubric_id)),
        _mock_result(first=(sub_id,)),
        _mock_result(scalar_one_or_none=_fake_rubric(rubric_id)),
    ]
    client, db = await _client_for(teacher, execute_side_effect)
    async with client:
        resp = await client.post(
            f"/api/v1/activities/teacher/submissions/{SESSION_ID}/score-rubric",
            # 7 is not a level on any criterion (valid range is 1-4)
            json={"scores": [{"criterion_id": "c1", "score": 7}]},
        )
    assert resp.status_code == 422
    assert "not a valid level" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_422_standards_criterion_not_mapped_to_activity():
    teacher = _fake_teacher()
    student_id, activity_id = uuid4(), uuid4()
    sub_id = uuid4()
    execute_side_effect = [
        _mock_result(first=(student_id, activity_id, None)),
        _mock_result(first=(sub_id,)),
        _mock_result(scalars_all=[]),  # activity_standards_map: nothing mapped -> _mapped_standards_for_activity() returns [] after this one query
    ]
    client, db = await _client_for(teacher, execute_side_effect)
    async with client:
        resp = await client.post(
            f"/api/v1/activities/teacher/submissions/{SESSION_ID}/score-rubric",
            json={"standards_evaluation": [{"criterion_id": "eco-1", "coverage_level": "full"}]},
        )
    assert resp.status_code == 422
    assert "not mapped to this activity" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_422_invalid_coverage_level():
    teacher = _fake_teacher()
    student_id, activity_id = uuid4(), uuid4()
    sub_id = uuid4()
    execute_side_effect = [
        _mock_result(first=(student_id, activity_id, None)),
        _mock_result(first=(sub_id,)),
        *_mapped_eco1_results(),  # eco-1 IS mapped
    ]
    client, db = await _client_for(teacher, execute_side_effect)
    async with client:
        resp = await client.post(
            f"/api/v1/activities/teacher/submissions/{SESSION_ID}/score-rubric",
            json={"standards_evaluation": [{"criterion_id": "eco-1", "coverage_level": "sort-of"}]},
        )
    assert resp.status_code == 422
    assert "coverage_level must be one of" in resp.json()["detail"]


# ===========================================================================
# Happy paths
# ===========================================================================

@pytest.mark.asyncio
async def test_complete_rubric_scoring_flips_status_to_graded():
    """Scoring every criterion on the rubric in one call should mark the
    submission graded and compute grade as a percentage of total points."""
    teacher = _fake_teacher()
    student_id, activity_id, rubric_id = uuid4(), uuid4(), uuid4()
    sub_id = uuid4()
    execute_side_effect = [
        _mock_result(first=(student_id, activity_id, rubric_id)),          # ownership
        _mock_result(first=(sub_id,)),                                    # _upsert_submission
        _mock_result(scalar_one_or_none=_fake_rubric(rubric_id)),          # rubric lookup
        _mock_result(first=({"c1": 3, "c2": 4},)),                        # UPDATE ... RETURNING rubric_scores
        _mock_result(),                                                    # UPDATE ... graded (no return used)
    ]
    client, db = await _client_for(teacher, execute_side_effect)
    async with client:
        resp = await client.post(
            f"/api/v1/activities/teacher/submissions/{SESSION_ID}/score-rubric",
            json={"scores": [{"criterion_id": "c1", "score": 3}, {"criterion_id": "c2", "score": 4}]},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["rubric_complete"] is True
    assert body["total_points"] == 7
    assert body["max_points"] == 8
    assert body["grade"] == round(7 / 8 * 100)
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_partial_rubric_scoring_does_not_grade_yet():
    """Scoring only one of two criteria should persist progress without
    flipping submission_status to 'graded' — a teacher can score one
    criterion at a time and come back."""
    teacher = _fake_teacher()
    student_id, activity_id, rubric_id = uuid4(), uuid4(), uuid4()
    sub_id = uuid4()
    execute_side_effect = [
        _mock_result(first=(student_id, activity_id, rubric_id)),
        _mock_result(first=(sub_id,)),
        _mock_result(scalar_one_or_none=_fake_rubric(rubric_id)),
        _mock_result(first=({"c1": 3},)),  # only c1 present after merge
    ]
    client, db = await _client_for(teacher, execute_side_effect)
    async with client:
        resp = await client.post(
            f"/api/v1/activities/teacher/submissions/{SESSION_ID}/score-rubric",
            json={"scores": [{"criterion_id": "c1", "score": 3}]},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["rubric_complete"] is False
    assert "grade" not in body  # not set until complete
    # Only 4 execute() calls: no fifth "mark graded" UPDATE should have fired.
    assert db.execute.await_count == 4


@pytest.mark.asyncio
async def test_standards_evaluation_independent_of_rubric():
    """A submission on an activity with NO rubric attached can still be
    evaluated against its mapped standards."""
    teacher = _fake_teacher()
    student_id, activity_id = uuid4(), uuid4()
    sub_id = uuid4()
    execute_side_effect = [
        _mock_result(first=(student_id, activity_id, None)),  # no rubric_id
        _mock_result(first=(sub_id,)),
        *_mapped_eco1_results(),                               # mapped
        _mock_result(first=({"eco-1": "exceeds"},)),          # UPDATE ... RETURNING standards_evaluation
        _mock_result(scalar_one_or_none=None),                # _accrue_competency: no existing record -> creates one
    ]
    client, db = await _client_for(teacher, execute_side_effect)
    async with client:
        resp = await client.post(
            f"/api/v1/activities/teacher/submissions/{SESSION_ID}/score-rubric",
            json={"standards_evaluation": [{"criterion_id": "eco-1", "coverage_level": "exceeds"}]},
        )
    assert resp.status_code == 200
    assert resp.json()["standards_evaluation"] == {"eco-1": "exceeds"}
    # A new StudentCompetency was added to the session (accrual — see
    # test_accrue_competency_* below for the behavior in isolation).
    db.add.assert_called_once()
    added = db.add.call_args.args[0]
    assert added.competency_name == "Ecosystem interactions"
    assert added.category == "Life Science"
    assert added.evidence_count == 1


@pytest.mark.asyncio
async def test_not_met_is_a_legal_verdict():
    """Confirms 'not_met' — previously inexpressible anywhere in this system
    (a completed activity always silently counted as 'met') — round-trips,
    and still accrues as evidence of an attempt (IN_PROGRESS), not silence."""
    teacher = _fake_teacher()
    student_id, activity_id = uuid4(), uuid4()
    sub_id = uuid4()
    execute_side_effect = [
        _mock_result(first=(student_id, activity_id, None)),
        _mock_result(first=(sub_id,)),
        *_mapped_eco1_results(),
        _mock_result(first=({"eco-1": "not_met"},)),
        _mock_result(scalar_one_or_none=None),
    ]
    client, db = await _client_for(teacher, execute_side_effect)
    async with client:
        resp = await client.post(
            f"/api/v1/activities/teacher/submissions/{SESSION_ID}/score-rubric",
            json={"standards_evaluation": [{"criterion_id": "eco-1", "coverage_level": "not_met"}]},
        )
    assert resp.status_code == 200
    assert resp.json()["standards_evaluation"]["eco-1"] == "not_met"
    added = db.add.call_args.args[0]
    from models.database import CompetencyStatus
    assert added.status == CompetencyStatus.IN_PROGRESS
    assert added.first_achieved_at is None  # not_met never sets first_achieved_at


# ===========================================================================
# _rubric_criteria_maps — pure function
# ===========================================================================

def test_rubric_criteria_maps_derives_valid_scores_and_max():
    from routes.activities import _rubric_criteria_maps
    rubric = _fake_rubric(uuid4())
    out = _rubric_criteria_maps(rubric)
    assert out["c1"]["valid_scores"] == {1, 2, 3, 4}
    assert out["c1"]["max_score"] == 4
    assert out["c2"]["max_score"] == 4


def test_rubric_criteria_maps_handles_criterion_with_no_levels():
    from routes.activities import _rubric_criteria_maps
    rubric = MagicMock()
    rubric.criteria = [{"id": "empty", "levels": []}]
    out = _rubric_criteria_maps(rubric)
    assert out["empty"]["valid_scores"] == set()
    assert out["empty"]["max_score"] == 0


# ===========================================================================
# _accrue_competency — the source brief's step 5 ("Accruing"), previously
# unbuilt: StudentCompetency had readers in 2 routes and zero writers
# anywhere in the codebase.
# ===========================================================================

@pytest.mark.asyncio
async def test_accrue_competency_creates_new_record_on_first_evidence():
    from routes.activities import _accrue_competency
    from models.database import CompetencyStatus

    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(return_value=_mock_result(scalar_one_or_none=None))
    student_id = uuid4()

    await _accrue_competency(db, student_id=str(student_id), competency_name="Ecosystem interactions",
                              category="Life Science", coverage_level="full")

    db.add.assert_called_once()
    comp = db.add.call_args.args[0]
    assert comp.student_id == student_id
    assert comp.competency_name == "Ecosystem interactions"
    assert comp.category == "Life Science"
    assert comp.status == CompetencyStatus.ACHIEVED
    assert comp.evidence_count == 1
    assert comp.progress_percent == 100
    assert comp.first_achieved_at is not None  # 'full' reaches ACHIEVED immediately


@pytest.mark.asyncio
async def test_accrue_competency_status_never_regresses():
    """A student who once scored 'exceeds' (MASTERED) on a competency and
    later scores 'partial' on it again should keep MASTERED, not drop to
    IN_PROGRESS -- best-ever-achieved semantics, matching
    routes/standards.py::_best_level_from_levels."""
    from routes.activities import _accrue_competency
    from models.database import CompetencyStatus

    existing = MagicMock()
    existing.status = CompetencyStatus.MASTERED
    existing.evidence_count = 3
    existing.first_achieved_at = datetime(2026, 8, 1)
    existing.progress_percent = 100

    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(return_value=_mock_result(scalar_one_or_none=existing))

    await _accrue_competency(db, student_id=str(uuid4()), competency_name="Ecosystem interactions",
                              category="Life Science", coverage_level="partial")

    db.add.assert_not_called()  # updates the existing row, doesn't insert a new one
    assert existing.status == CompetencyStatus.MASTERED  # unchanged, not regressed to IN_PROGRESS
    assert existing.evidence_count == 4  # still counts as new evidence
    assert existing.first_achieved_at == datetime(2026, 8, 1)  # unchanged


@pytest.mark.asyncio
async def test_accrue_competency_advances_status_forward():
    """The reverse of the above: IN_PROGRESS -> ACHIEVED on new stronger evidence."""
    from routes.activities import _accrue_competency
    from models.database import CompetencyStatus

    existing = MagicMock()
    existing.status = CompetencyStatus.IN_PROGRESS
    existing.evidence_count = 1
    existing.first_achieved_at = None
    existing.progress_percent = 50

    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(return_value=_mock_result(scalar_one_or_none=existing))

    await _accrue_competency(db, student_id=str(uuid4()), competency_name="Ecosystem interactions",
                              category="Life Science", coverage_level="full")

    assert existing.status == CompetencyStatus.ACHIEVED
    assert existing.progress_percent == 100
    assert existing.evidence_count == 2
    assert existing.first_achieved_at is not None  # set now, the first time it reached ACHIEVED


@pytest.mark.asyncio
async def test_accrue_competency_not_met_creates_in_progress_not_silence():
    """A 'not_met' verdict is still real evidence -- the competency record
    should exist and be IN_PROGRESS, not be skipped entirely."""
    from routes.activities import _accrue_competency
    from models.database import CompetencyStatus

    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(return_value=_mock_result(scalar_one_or_none=None))

    await _accrue_competency(db, student_id=str(uuid4()), competency_name="Ecosystem interactions",
                              category="Life Science", coverage_level="not_met")

    db.add.assert_called_once()
    comp = db.add.call_args.args[0]
    assert comp.status == CompetencyStatus.IN_PROGRESS
    assert comp.evidence_count == 1
    assert comp.first_achieved_at is None


# ===========================================================================
# The framework/native_enum regression (models/assessment.py)
# ===========================================================================

def test_assessment_rubric_framework_column_is_not_a_native_enum():
    """Regression guard for the bug found 2026-09-13: AssessmentRubric.framework
    was declared as a native Postgres enum with no matching DB type ever
    created (`assessmentframework`), so every POST /rubrics INSERT 500'd —
    UndefinedObjectError: type "assessmentframework" does not exist. Fixed
    with native_enum=False, matching this codebase's established fix for the
    same class of bug elsewhere (StudentCapture.capture_type/transcript_status).
    A regression here would silently break rubric creation again."""
    from models.assessment import AssessmentRubric
    col_type = AssessmentRubric.__table__.c.framework.type
    assert getattr(col_type, "native_enum", None) is False
