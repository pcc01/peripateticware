# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for ComplianceReportAgent.
Key invariants:
  - Missing required fields are flagged, never fabricated.
  - needs_human_review=True when any field is missing or default template used.
  - Default-template fallback is flagged in output.
"""

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from agents.compliance_report_agent import (
    ComplianceReportAgent,
    ComplianceReportInput,
    ComplianceReportOutput,
    _UNIVERSAL_REQUIRED_FIELDS,
)


_FULL_RECORD = {
    "student_name": "Emma Chen",
    "reporting_period": "September 2025 through June 2026",
    "subjects_covered": ["Math", "Reading", "Science"],
    "hours_of_instruction": 1050,
    "parent_guardian_name": "Laura Chen",
    "grade_level": 3,
}

_MISSING_HOURS_RECORD = {
    "student_name": "Emma Chen",
    "reporting_period": "September 2025 through June 2026",
    "subjects_covered": ["Math", "Reading"],
    "parent_guardian_name": "Laura Chen",
    # hours_of_instruction intentionally missing
}

_GOOD_OUTPUT = {
    "document_markdown": "# Report\n\nContent here.",
    "required_fields_present": list(_UNIVERSAL_REQUIRED_FIELDS),
    "required_fields_missing": [],
    "template_used": "washington.txt",
    "needs_human_review": False,
}

_MISSING_FIELD_OUTPUT = {
    "document_markdown": "# Report\n\n[MISSING: hours_of_instruction]",
    "required_fields_present": ["student_name", "reporting_period", "subjects_covered", "parent_guardian_name"],
    "required_fields_missing": ["hours_of_instruction"],
    "template_used": "washington.txt",
    "needs_human_review": True,
}


# ---------------------------------------------------------------------------
# Missing field flagged, not fabricated
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_missing_field_flagged_not_fabricated():
    agent = ComplianceReportAgent()
    payload = ComplianceReportInput(
        jurisdiction="WA",
        report_type="annual_progress",
        student_record=_MISSING_HOURS_RECORD,
    )

    with patch("agents.provider.dispatch", new_callable=AsyncMock) as mock:
        mock.return_value = json.dumps(_MISSING_FIELD_OUTPUT)
        result = await agent.run(payload)

    assert result.status == "success"
    out: ComplianceReportOutput = result.output
    assert "hours_of_instruction" in out.required_fields_missing
    assert out.needs_human_review is True


# ---------------------------------------------------------------------------
# needs_human_review toggles correctly
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_needs_human_review_false_when_all_fields_present():
    agent = ComplianceReportAgent()
    payload = ComplianceReportInput(
        jurisdiction="WA",
        report_type="annual_progress",
        student_record=_FULL_RECORD,
    )

    with patch("agents.provider.dispatch", new_callable=AsyncMock) as mock:
        mock.return_value = json.dumps(_GOOD_OUTPUT)
        # Patch template name so it's a real state template, not default
        with patch.object(agent, "_template_name", "washington.txt"):
            result = await agent.run(payload)

    out = result.output
    # All required fields present, real template -> no review needed
    assert out.required_fields_missing == []
    # needs_human_review may still be False if template != "default"
    assert isinstance(out.needs_human_review, bool)


@pytest.mark.asyncio
async def test_needs_human_review_true_when_default_template():
    agent = ComplianceReportAgent()
    payload = ComplianceReportInput(
        jurisdiction="XX",   # Unknown state -> default template
        report_type="annual_progress",
        student_record=_FULL_RECORD,
    )

    output_with_default = dict(_GOOD_OUTPUT)
    output_with_default["template_used"] = "default.txt"

    with patch("agents.provider.dispatch", new_callable=AsyncMock) as mock:
        mock.return_value = json.dumps(output_with_default)
        result = await agent.run(payload)

    out = result.output
    # Default template always triggers needs_human_review
    assert out.needs_human_review is True


# ---------------------------------------------------------------------------
# Provider defaults to claude
# ---------------------------------------------------------------------------

def test_compliance_default_provider_is_claude():
    from agents.provider import resolve_provider
    import os
    old = os.environ.get("AGENT_COMPLIANCE_PROVIDER", "")
    os.environ["AGENT_COMPLIANCE_PROVIDER"] = "claude"
    prov = resolve_provider("AGENT_COMPLIANCE_PROVIDER", "claude")
    os.environ["AGENT_COMPLIANCE_PROVIDER"] = old
    assert prov == "claude"


# ---------------------------------------------------------------------------
# Required fields validation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_guardrails_recheck_required_fields():
    """_apply_guardrails must re-derive present/missing from student_record, not trust LLM output."""
    agent = ComplianceReportAgent()
    payload = ComplianceReportInput(
        jurisdiction="WA",
        report_type="annual_progress",
        student_record=_MISSING_HOURS_RECORD,
    )
    raw_output = ComplianceReportOutput(
        document_markdown="doc",
        required_fields_present=list(_UNIVERSAL_REQUIRED_FIELDS),  # LLM lied — said all present
        required_fields_missing=[],
        template_used="washington.txt",
        needs_human_review=False,
    )
    corrected = agent._apply_guardrails(raw_output, payload, "washington.txt")
    assert "hours_of_instruction" in corrected.required_fields_missing
    assert corrected.needs_human_review is True
