# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for the provider-agnostic AI routes fixed 2026-09-13:
routes/activities.py::classify_taxonomy and routes/rubrics.py::
generate_rubric_criteria. Both previously called ollama.Client(...) directly
and were silently non-functional on any deployment without a local Ollama
server (prod runs Claude only) — see AGENT_TAXONOMY_CLASSIFICATION_PROVIDER /
AGENT_RUBRIC_GENERATION_PROVIDER in core/config.py.

Three things this file guards against regressing:
  1. No route module reaches Ollama directly again (routes should only ever
     go through agents/provider.py's dispatch()).
  2. The taxonomy-classification output sanitizer whitelists shape/range
     rather than trusting the LLM's JSON.
  3. Both endpoints actually call dispatch() with the resolved per-feature
     provider, not a hardcoded one.
"""

from __future__ import annotations

import ast
import glob
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest


# ---------------------------------------------------------------------------
# 1. Regression guard: no route file imports ollama directly.
#    AST-based (not a plain grep) so a docstring/comment that merely mentions
#    "ollama.Client(" in prose — explaining what used to be there — doesn't
#    trip a false positive.
# ---------------------------------------------------------------------------

def _imports_ollama(path: str) -> bool:
    with open(path, "r", encoding="utf-8") as f:
        tree = ast.parse(f.read(), filename=path)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            if any(alias.name == "ollama" or alias.name.startswith("ollama.") for alias in node.names):
                return True
        elif isinstance(node, ast.ImportFrom):
            if node.module and (node.module == "ollama" or node.module.startswith("ollama.")):
                return True
    return False


def test_no_route_imports_ollama_directly():
    routes_dir = os.path.join(os.path.dirname(__file__), "..", "routes")
    offenders = [p for p in glob.glob(os.path.join(routes_dir, "*.py")) if _imports_ollama(p)]
    assert offenders == [], (
        "Route file(s) import ollama directly, bypassing agents/provider.py's "
        f"dispatch(): {offenders}. A route hardcoded to Ollama is silently "
        "non-functional on any deployment without a local Ollama server "
        "(e.g. prod, which runs Claude only)."
    )


# ---------------------------------------------------------------------------
# 2. _sanitize_taxonomy_result — whitelists shape and clamps range.
# ---------------------------------------------------------------------------

from routes.activities import _sanitize_taxonomy_result  # noqa: E402


def test_sanitize_drops_unrequested_framework():
    parsed = {
        "blooms": {"level": 4, "label": "Analyse", "rationale": "because"},
        "solo": {"level": 3, "label": "Multi-structural", "rationale": "hallucinated, not requested"},
    }
    out = _sanitize_taxonomy_result(parsed, ["blooms"])
    assert out == {"blooms": {"level": 4, "label": "Analyse", "rationale": "because"}}


def test_sanitize_drops_out_of_range_level():
    # dok only goes 1-4; 7 is out of range and should be dropped, not clamped in.
    parsed = {"dok": {"level": 7, "label": "Made up", "rationale": "..."}}
    out = _sanitize_taxonomy_result(parsed, ["dok"])
    assert out is None


def test_sanitize_drops_malformed_entry_missing_fields():
    parsed = {"blooms": {"level": 4}}  # missing label/rationale
    out = _sanitize_taxonomy_result(parsed, ["blooms"])
    assert out is None


def test_sanitize_drops_wrong_types():
    parsed = {"blooms": {"level": "four", "label": "Analyse", "rationale": "..."}}
    out = _sanitize_taxonomy_result(parsed, ["blooms"])
    assert out is None


def test_sanitize_truncates_oversized_label_and_rationale():
    parsed = {"blooms": {"level": 4, "label": "x" * 200, "rationale": "y" * 1000}}
    out = _sanitize_taxonomy_result(parsed, ["blooms"])
    assert len(out["blooms"]["label"]) == 60
    assert len(out["blooms"]["rationale"]) == 400


def test_sanitize_returns_none_when_nothing_survives():
    assert _sanitize_taxonomy_result({}, ["blooms"]) is None
    assert _sanitize_taxonomy_result("not a dict", ["blooms"]) is None


# ---------------------------------------------------------------------------
# 3. Endpoints resolve their own per-feature provider and call dispatch(),
#    never a hardcoded provider — the actual bug being fixed.
# ---------------------------------------------------------------------------

from routes.activities import classify_taxonomy, TaxonomyClassifyRequest  # noqa: E402
from routes.rubrics import generate_rubric_criteria, RubricGenerateRequest  # noqa: E402


def _fake_teacher():
    return SimpleNamespace(id=uuid4(), role="teacher")


@pytest.mark.asyncio
async def test_classify_taxonomy_uses_resolved_provider_not_ollama_literal():
    fake_response = '{"blooms": {"level": 4, "label": "Analyse", "rationale": "because"}}'
    with patch("agents.provider.dispatch", new=AsyncMock(return_value=fake_response)) as mock_dispatch, \
         patch("core.config.settings.AGENT_TAXONOMY_CLASSIFICATION_PROVIDER", "claude"), \
         patch("core.config.settings.LLM_PROVIDER", "ollama"):
        result = await classify_taxonomy(
            payload=TaxonomyClassifyRequest(text="Analyze the causes of the war.", classify_for=["blooms"]),
            current_user=_fake_teacher(),
            db=None,
            org_id=None,
        )
    assert result.error is None
    assert result.result == {"blooms": {"level": 4, "label": "Analyse", "rationale": "because"}}
    # The per-feature override ("claude") must win over the stale global
    # default ("ollama") — this is the exact resolution order the fix relies on.
    called_provider = mock_dispatch.call_args.args[0]
    assert called_provider == "claude"


@pytest.mark.asyncio
async def test_classify_taxonomy_input_text_is_capped():
    huge_text = "x" * 50_000
    captured = {}

    async def _capture_dispatch(provider, messages, **kwargs):
        captured["prompt"] = messages[0]["content"]
        return '{"blooms": {"level": 1, "label": "Remember", "rationale": "r"}}'

    with patch("agents.provider.dispatch", new=AsyncMock(side_effect=_capture_dispatch)):
        await classify_taxonomy(
            payload=TaxonomyClassifyRequest(text=huge_text, classify_for=["blooms"]),
            current_user=_fake_teacher(),
            db=None,
            org_id=None,
        )
    from routes.activities import _TAXONOMY_CLASSIFY_MAX_CHARS
    # The raw statement text embedded in the prompt must be capped, not the
    # full 50,000-char input verbatim.
    assert huge_text[:_TAXONOMY_CLASSIFY_MAX_CHARS] in captured["prompt"]
    assert huge_text not in captured["prompt"]


@pytest.mark.asyncio
async def test_classify_taxonomy_degrades_gracefully_on_provider_error():
    with patch("agents.provider.dispatch", new=AsyncMock(side_effect=RuntimeError("boom"))):
        result = await classify_taxonomy(
            payload=TaxonomyClassifyRequest(text="Analyze this.", classify_for=["blooms"]),
            current_user=_fake_teacher(),
            db=None,
            org_id=None,
        )
    assert result.result is None
    assert "unavailable" in result.error.lower()


@pytest.mark.asyncio
async def test_generate_rubric_criteria_uses_resolved_provider():
    fake_response = (
        '[{"name": "Uses evidence", "description": "d", '
        '"levels": {"4": "a", "3": "b", "2": "c", "1": "d"}}]'
    )
    with patch("agents.provider.dispatch", new=AsyncMock(return_value=fake_response)) as mock_dispatch, \
         patch("core.config.settings.AGENT_RUBRIC_GENERATION_PROVIDER", "claude"):
        result = await generate_rubric_criteria(
            payload=RubricGenerateRequest(
                activity_title="Creek Study",
                activity_description="Water quality field study.",
                learning_objectives=["Explain abiotic factors"],
                subject="Science",
                grade_level=6,
            ),
            current_user=_fake_teacher(),
            db=None,
            org_id=None,
        )
    assert result.error is None
    assert len(result.criteria) == 1
    assert result.criteria[0].name == "Uses evidence"
    called_provider = mock_dispatch.call_args.args[0]
    assert called_provider == "claude"


@pytest.mark.asyncio
async def test_generate_rubric_criteria_caps_oversized_inputs():
    captured = {}

    async def _capture_dispatch(provider, messages, **kwargs):
        captured["prompt"] = messages[-1]["content"]
        return "[]"

    with patch("agents.provider.dispatch", new=AsyncMock(side_effect=_capture_dispatch)):
        await generate_rubric_criteria(
            payload=RubricGenerateRequest(
                activity_title="T" * 5000,
                activity_description="D" * 5000,
                learning_objectives=["O" * 5000] * 30,
                subject="Science",
                grade_level=6,
            ),
            current_user=_fake_teacher(),
            db=None,
            org_id=None,
        )
    from routes.rubrics import _OBJECTIVE_MAX_CHARS
    prompt = captured["prompt"]
    assert "T" * 5000 not in prompt
    assert "D" * 5000 not in prompt
    # Each embedded objective is capped at _OBJECTIVE_MAX_CHARS chars — a
    # 5000-char objective couldn't have made it in whole.
    assert "O" * (_OBJECTIVE_MAX_CHARS + 1) not in prompt
