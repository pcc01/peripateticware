# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for services/standards_parser.py::extract_criteria() -- the LLM
extraction step of "a new state standards document gets parsed correctly."
Zero automated coverage existed for this module before this file (flagged
in the 2026-09-13 code audit against the source brief: routes.standards
and its collaborators showed 0% coverage from the whole existing suite).

extract_criteria() is documented to NEVER raise -- every failure mode
(empty input, unreachable provider, malformed LLM output, zero criteria
found) returns ([], "a specific user-facing reason") instead, so a dead
extraction provider and "the LLM genuinely found nothing" stay
distinguishable in the UI. Each test below exercises one of those paths
plus the successful one, with agents.provider.dispatch mocked (never a
real network call) but the JSON-parsing/sanitization/truncation logic
exercised for real.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from services.standards_parser import extract_criteria, make_criterion_id


# ===========================================================================
# extract_criteria() — success path
# ===========================================================================

@pytest.mark.asyncio
async def test_extracts_and_sanitizes_valid_criteria():
    raw_response = """```json
    [
      {"id": "wa-4-oaa1", "name": "Multiplicative comparison", "description": "Interpret a multiplication equation as a comparison.", "category": "Algebraic Reasoning", "required": true, "weight": 1.0},
      {"id": "wa-4-oaa2", "name": "Word problems", "description": "Solve multistep word problems.", "category": "Algebraic Reasoning", "required": true, "weight": 1.5}
    ]
    ```"""
    with patch("agents.provider.dispatch", new=AsyncMock(return_value=raw_response)):
        criteria, error = await extract_criteria("Some Washington state standards document text.", set_type="state_standards", name="WA Math")

    assert error is None
    assert len(criteria) == 2
    assert criteria[0]["id"] == "wa-4-oaa1"
    assert criteria[0]["name"] == "Multiplicative comparison"
    assert criteria[0]["category"] == "Algebraic Reasoning"
    assert criteria[0]["required"] is True
    assert criteria[1]["weight"] == 1.5


@pytest.mark.asyncio
async def test_fills_defaults_for_missing_optional_fields():
    raw_response = '[{"id": "x-1"}]'  # only id given -- everything else should default, not crash
    with patch("agents.provider.dispatch", new=AsyncMock(return_value=raw_response)):
        criteria, error = await extract_criteria("doc text", set_type="rubric")

    assert error is None
    c = criteria[0]
    assert c["id"] == "x-1"
    assert c["name"] == "Criterion 1"
    assert c["description"] == ""
    assert c["category"] == "General"
    assert c["required"] is True
    assert c["weight"] == 1.0


@pytest.mark.asyncio
async def test_truncates_oversized_name_and_description():
    raw_response = f'[{{"id": "x-1", "name": "{"n" * 500}", "description": "{"d" * 5000}"}}]'
    with patch("agents.provider.dispatch", new=AsyncMock(return_value=raw_response)):
        criteria, error = await extract_criteria("doc text")

    assert error is None
    assert len(criteria[0]["name"]) == 100
    assert len(criteria[0]["description"]) == 500


@pytest.mark.asyncio
async def test_generates_a_ordinal_id_when_criterion_has_no_id():
    raw_response = '[{"name": "No id given"}, {"name": "Also no id"}]'
    with patch("agents.provider.dispatch", new=AsyncMock(return_value=raw_response)):
        criteria, error = await extract_criteria("doc text", set_type="state_standards")

    assert error is None
    assert criteria[0]["id"] == "state_standards-criterion-1"
    assert criteria[1]["id"] == "state_standards-criterion-2"


# ===========================================================================
# extract_criteria() — never raises, always a specific error string
# ===========================================================================

@pytest.mark.asyncio
async def test_empty_text_returns_no_error_no_criteria():
    """Not a failure -- there's nothing to extract from. No error message
    (nothing went wrong), just nothing to show."""
    criteria, error = await extract_criteria("   ")
    assert criteria == []
    assert error is None


@pytest.mark.asyncio
async def test_provider_unreachable_is_graceful_not_raised():
    with patch("agents.provider.dispatch", new=AsyncMock(side_effect=RuntimeError("connection refused"))):
        criteria, error = await extract_criteria("doc text")

    assert criteria == []
    assert error is not None
    assert "unavailable" in error.lower()


@pytest.mark.asyncio
async def test_malformed_json_response_is_graceful():
    with patch("agents.provider.dispatch", new=AsyncMock(return_value="not json at all { [ broken")):
        criteria, error = await extract_criteria("doc text")

    assert criteria == []
    assert error is not None
    assert "valid structured data" in error.lower()


@pytest.mark.asyncio
async def test_non_array_json_response_is_graceful():
    """The LLM returning a JSON object instead of an array (a common
    structured-output failure mode) must not crash -- it should be treated
    the same as 'didn't return the expected format', not silently accepted
    as zero criteria or blow up trying to iterate it."""
    with patch("agents.provider.dispatch", new=AsyncMock(return_value='{"not": "a list"}')):
        criteria, error = await extract_criteria("doc text")

    assert criteria == []
    assert error is not None
    assert "list" in error.lower()


@pytest.mark.asyncio
async def test_zero_criteria_found_has_a_distinct_message_from_a_dead_provider():
    """The whole point of extract_criteria() returning a real error string
    (not just an empty list) is so 'the LLM ran fine but found nothing' and
    'the LLM was unreachable' read differently in the UI. Confirm they
    actually differ."""
    with patch("agents.provider.dispatch", new=AsyncMock(return_value="[]")):
        criteria, empty_error = await extract_criteria("a blank page")
    with patch("agents.provider.dispatch", new=AsyncMock(side_effect=RuntimeError("boom"))):
        _, dead_provider_error = await extract_criteria("a blank page")

    assert criteria == []
    assert empty_error is not None
    assert empty_error != dead_provider_error
    assert "unavailable" not in empty_error.lower()


@pytest.mark.asyncio
async def test_non_dict_items_in_the_array_are_skipped_not_fatal():
    """A response like ["just a string", {"id": "ok-1"}] shouldn't crash on
    the string entry -- skip what isn't a criterion object, keep what is."""
    with patch("agents.provider.dispatch", new=AsyncMock(return_value='["a bare string", {"id": "ok-1", "name": "Fine"}]')):
        criteria, error = await extract_criteria("doc text")

    assert error is None
    assert len(criteria) == 1
    assert criteria[0]["id"] == "ok-1"


# ===========================================================================
# Provider resolution and input handling
# ===========================================================================

@pytest.mark.asyncio
async def test_routes_through_the_provider_abstraction_not_a_hardcoded_client():
    """extract_criteria() must resolve its provider via
    AGENT_STANDARDS_EXTRACTION_PROVIDER -> LLM_PROVIDER -> 'ollama', the same
    dispatch() path every other AI feature in this codebase uses -- not a
    direct client call that would be dead on a deployment without that
    specific provider reachable (exactly the class of bug fixed 2026-09-13
    in routes/activities.py::classify_taxonomy and
    routes/rubrics.py::generate_rubric_criteria)."""
    with patch("agents.provider.dispatch", new=AsyncMock(return_value="[]")) as mock_dispatch, \
         patch("core.config.settings.AGENT_STANDARDS_EXTRACTION_PROVIDER", "claude"):
        await extract_criteria("doc text")

    assert mock_dispatch.await_count == 1
    called_provider = mock_dispatch.call_args.args[0]
    assert called_provider == "claude"


@pytest.mark.asyncio
async def test_oversized_document_text_is_truncated_before_reaching_the_prompt():
    huge_text = "X" * 50_000
    captured = {}

    async def _capture(provider, messages, **kwargs):
        captured["prompt"] = messages[0]["content"]
        return "[]"

    with patch("agents.provider.dispatch", new=AsyncMock(side_effect=_capture)):
        await extract_criteria(huge_text, max_chars=12000)

    assert "X" * 12000 in captured["prompt"]
    assert huge_text not in captured["prompt"]


@pytest.mark.asyncio
async def test_low_temperature_used_for_deterministic_extraction():
    """Structured extraction should use a low, near-deterministic
    temperature -- a regression to a high/default temperature would make
    extracted criteria non-reproducible for the same document."""
    with patch("agents.provider.dispatch", new=AsyncMock(return_value="[]")) as mock_dispatch:
        await extract_criteria("doc text")

    assert mock_dispatch.call_args.kwargs.get("temperature", None) == 0.1


# ===========================================================================
# make_criterion_id — pure function
# ===========================================================================

def test_make_criterion_id_slugifies_and_indexes():
    assert make_criterion_id("Multiplicative Comparison!", 0) == "multiplicative-comparison-1"


def test_make_criterion_id_respects_prefix():
    assert make_criterion_id("Word Problems", 2, prefix="wa-math") == "wa-math-word-problems-3"
