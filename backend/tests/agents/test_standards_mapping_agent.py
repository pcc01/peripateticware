# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for StandardsMappingAgent.
Key invariant: returned codes must be a strict subset of retrieved candidates.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest

from agents.standards_mapping_agent import (
    MappingDecision,
    StandardsMappingAgent,
    StandardsMappingInput,
    StandardsMappingOutput,
)


_CANDIDATES = [
    {"code": "NGSS-3-LS1-1", "title": "Organisms", "description": "Life cycles..."},
    {"code": "NGSS-4-ESS2-1", "title": "Earth Materials", "description": "Rock types..."},
]

_GOOD_OUTPUT = {
    "mappings": [
        {
            "code": "NGSS-3-LS1-1",
            "title": "Organisms",
            "decision": "applies",
            "rationale": "Student described frog life cycle.",
            "confidence": 0.9,
        },
        {
            "code": "NGSS-4-ESS2-1",
            "title": "Earth Materials",
            "decision": "no",
            "rationale": "Submission does not address rock types.",
            "confidence": 0.1,
        },
    ],
    "overall_confidence": 0.8,
}

_INVENTED_CODE_OUTPUT = {
    "mappings": [
        {
            "code": "INVENTED-999",
            "title": "Made up standard",
            "decision": "applies",
            "rationale": "...",
            "confidence": 0.5,
        },
    ],
    "overall_confidence": 0.5,
}


@pytest.mark.asyncio
async def test_returned_codes_subset_of_candidates():
    """Core invariant: no invented codes in output."""
    agent = StandardsMappingAgent()
    candidate_codes = {"NGSS-3-LS1-1", "NGSS-4-ESS2-1"}

    output = StandardsMappingOutput.model_validate(_GOOD_OUTPUT)
    cleaned = agent._validate_against_candidates(output, candidate_codes)

    returned_codes = {m.code for m in cleaned.mappings}
    assert returned_codes.issubset(candidate_codes)


@pytest.mark.asyncio
async def test_invented_codes_removed():
    """Codes not in candidate set are stripped, not passed through."""
    agent = StandardsMappingAgent()
    candidate_codes = {"NGSS-3-LS1-1"}

    output = StandardsMappingOutput.model_validate(_INVENTED_CODE_OUTPUT)
    cleaned = agent._validate_against_candidates(output, candidate_codes)

    assert all(m.code in candidate_codes for m in cleaned.mappings)
    assert not any(m.code == "INVENTED-999" for m in cleaned.mappings)


@pytest.mark.asyncio
async def test_empty_candidates_returns_empty_mappings():
    agent = StandardsMappingAgent()
    output = StandardsMappingOutput.model_validate(_GOOD_OUTPUT)
    cleaned = agent._validate_against_candidates(output, set())
    # With no candidates, all codes are filtered out
    assert cleaned.mappings == []


@pytest.mark.asyncio
async def test_confidence_clamped_to_valid_range():
    raw = {
        "mappings": [
            {"code": "X-1", "title": "T", "decision": "applies", "rationale": "r", "confidence": 1.5},
        ],
        "overall_confidence": -0.3,
    }
    output = StandardsMappingOutput.model_validate(raw)
    assert output.overall_confidence == 0.0
    assert output.mappings[0].confidence == 1.0


@pytest.mark.asyncio
async def test_schema_validation_rejects_bad_output():
    from pydantic import ValidationError
    with pytest.raises((ValidationError, Exception)):
        StandardsMappingOutput.model_validate({"mappings": "not a list", "overall_confidence": 0.5})
