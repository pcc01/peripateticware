# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for RubricScoringAgent.
Key invariants: valid levels per criterion; totals sum correctly.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest

from agents.rubric_scoring_agent import (
    CriterionScore,
    RubricCriterion,
    RubricLevel,
    RubricScoringAgent,
    RubricScoringInput,
    RubricScoringOutput,
)


_RUBRIC = [
    RubricCriterion(
        criterion_id="c1",
        criterion="Observation quality",
        levels=[
            RubricLevel(level="Exemplary", descriptor="Rich, specific detail", points=4),
            RubricLevel(level="Proficient", descriptor="Clear observations", points=3),
            RubricLevel(level="Developing", descriptor="Some observations", points=2),
            RubricLevel(level="Beginning", descriptor="Limited observations", points=1),
        ],
    ),
    RubricCriterion(
        criterion_id="c2",
        criterion="Scientific vocabulary",
        levels=[
            RubricLevel(level="Exemplary", descriptor="Precise vocab", points=4),
            RubricLevel(level="Proficient", descriptor="Correct vocab", points=3),
            RubricLevel(level="Developing", descriptor="Some vocab", points=2),
        ],
    ),
]

_GOOD_OUTPUT = {
    "scores": [
        {
            "criterion_id": "c1",
            "level": "Proficient",
            "points": 3,
            "evidence_quote_or_paraphrase": "Student described three distinct organisms.",
            "justification": "Clear but not richly detailed.",
        },
        {
            "criterion_id": "c2",
            "level": "Developing",
            "points": 2,
            "evidence_quote_or_paraphrase": "Student used 'photosynthesis' once.",
            "justification": "Limited vocabulary usage.",
        },
    ],
    "total_points": 5,
    "max_points": 8,
    "summary": "Good start — expand vocabulary next time.",
}

_WRONG_TOTAL_OUTPUT = {
    "scores": [
        {"criterion_id": "c1", "level": "Proficient", "points": 3,
         "evidence_quote_or_paraphrase": "...", "justification": "..."},
        {"criterion_id": "c2", "level": "Developing", "points": 2,
         "evidence_quote_or_paraphrase": "...", "justification": "..."},
    ],
    "total_points": 99,   # wrong
    "max_points": 8,
    "summary": "Summary.",
}


@pytest.mark.asyncio
async def test_total_points_equals_sum_of_scores():
    """model_validator must correct a mismatched total."""
    output = RubricScoringOutput.model_validate(_WRONG_TOTAL_OUTPUT)
    assert output.total_points == 5  # corrected by validator


@pytest.mark.asyncio
async def test_valid_output_passes():
    output = RubricScoringOutput.model_validate(_GOOD_OUTPUT)
    assert output.total_points == 5
    assert len(output.scores) == 2


@pytest.mark.asyncio
async def test_level_validation_warns_invalid_level():
    """_validate_levels should log a warning for an unknown level but not raise."""
    agent = RubricScoringAgent()
    output = RubricScoringOutput.model_validate(_GOOD_OUTPUT)
    # Inject an invalid level
    output.scores[0].level = "NonExistentLevel"
    # Should not raise — just log
    result = agent._validate_levels(output, _RUBRIC)
    assert result is output


@pytest.mark.asyncio
async def test_run_mocked_success():
    agent = RubricScoringAgent()
    payload = RubricScoringInput(
        submission_text="I saw a frog. It had spots.", rubric=_RUBRIC
    )

    with patch("agents.provider.dispatch", new_callable=AsyncMock) as mock:
        mock.return_value = json.dumps(_GOOD_OUTPUT)
        result = await agent.run(payload)

    assert result.status == "success"
    assert result.output.total_points == 5


@pytest.mark.asyncio
async def test_run_mocked_bad_json_then_good():
    agent = RubricScoringAgent()
    payload = RubricScoringInput(
        submission_text="test", rubric=_RUBRIC
    )
    calls = 0

    async def _side(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            return "invalid{json"
        return json.dumps(_GOOD_OUTPUT)

    with patch("agents.provider.dispatch", side_effect=_side):
        with patch("core.config.settings.AGENT_MAX_RETRIES", 2):
            result = await agent.run(payload)

    assert result.status == "success"
    assert calls == 2


@pytest.mark.asyncio
async def test_schema_rejects_missing_required_fields():
    from pydantic import ValidationError
    with pytest.raises((ValidationError, Exception)):
        RubricScoringOutput.model_validate({"scores": [], "summary": "ok"})
