# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
ComplianceReportAgent  (HIGH-STAKES)

Produces state-mandated homeschool documents from structured student data.
Defaults to Claude.  Enforces zero-fabrication: any required field absent
from student_record is flagged in required_fields_missing, never invented.
Always sets needs_human_review=True when anything is missing or the
generic/default template was used.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)

# Required fields that every compliance report must address.
_UNIVERSAL_REQUIRED_FIELDS = [
    "student_name",
    "reporting_period",
    "subjects_covered",
    "hours_of_instruction",
    "parent_guardian_name",
]


# ---------------------------------------------------------------------------
# I/O models
# ---------------------------------------------------------------------------

class ComplianceReportInput(BaseModel):
    jurisdiction: str                    # state abbreviation e.g. "WA", "CA"
    report_type: str                     # e.g. "annual_progress", "attendance"
    student_record: Dict[str, Any]       # structured record — no raw PII in agent_runs
    homeschool_requirements: Optional[Dict[str, Any]] = None


class ComplianceReportOutput(BaseModel):
    document_markdown: str
    required_fields_present: List[str]
    required_fields_missing: List[str]
    template_used: str
    needs_human_review: bool


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

class ComplianceReportAgent(BaseAgent):
    name = "compliance_report"
    default_provider = "claude"          # spec-mandated default
    _provider_env_var = "AGENT_COMPLIANCE_PROVIDER"

    InputModel = ComplianceReportInput
    OutputModel = ComplianceReportOutput

    # Extra prompt loaded per-state
    _state_template: Optional[str] = None
    _template_name: str = "default"

    def _load_prompts(self) -> None:
        """Override: load system_base.txt instead of system.txt."""
        prompt_path = self._prompt_dir() / "system_base.txt"
        if prompt_path.exists():
            self._system_prompt = prompt_path.read_text(encoding="utf-8").strip()
        else:
            logger.warning("ComplianceReportAgent: no system_base.txt at %s", prompt_path)
            self._system_prompt = ""

    def _load_state_template(self, jurisdiction: str) -> tuple[str, str]:
        """Return (template_text, template_name).  Falls back to default.txt."""
        states_dir = Path(__file__).parent / "prompts" / "compliance_report" / "states"
        state_file = states_dir / f"{jurisdiction.lower()}.txt"
        if state_file.exists():
            return state_file.read_text(encoding="utf-8").strip(), state_file.name
        default_file = states_dir / "default.txt"
        if default_file.exists():
            return default_file.read_text(encoding="utf-8").strip(), "default.txt"
        return "", "default.txt (missing)"

    def build_messages(self, payload: ComplianceReportInput) -> list[dict]:  # type: ignore[override]
        state_template, template_name = self._load_state_template(payload.jurisdiction)
        self._template_name = template_name

        # base system + state template
        system_parts = []
        if self._system_prompt:
            system_parts.append(self._system_prompt)
        if state_template:
            system_parts.append(f"STATE TEMPLATE ({template_name}):\n{state_template}")
        system_content = "\n\n".join(system_parts)

        # Identify which required fields are present vs. missing
        rec = payload.student_record
        present = [f for f in _UNIVERSAL_REQUIRED_FIELDS if rec.get(f)]
        missing = [f for f in _UNIVERSAL_REQUIRED_FIELDS if not rec.get(f)]

        user_content = (
            f"JURISDICTION: {payload.jurisdiction}\n"
            f"REPORT TYPE: {payload.report_type}\n\n"
            f"STUDENT RECORD (structured):\n{json.dumps(rec, indent=2)[:8000]}\n\n"
            f"REQUIRED FIELDS PRESENT: {present}\n"
            f"REQUIRED FIELDS MISSING: {missing}\n\n"
            "CRITICAL RULES:\n"
            "1. Do NOT invent or fabricate any value for a missing field.\n"
            "2. For missing fields, leave a clearly marked placeholder: [MISSING: field_name]\n"
            "3. The document must state that the parent/guardian is responsible for the report.\n"
            "4. Return JSON matching the output schema exactly.\n"
        )

        messages = []
        if system_content:
            messages.append({"role": "system", "content": system_content})
        messages.append({"role": "user", "content": user_content})
        return messages

    def _parse_output(self, raw: str) -> ComplianceReportOutput:
        from agents.base_agent import _strip_fences
        cleaned = _strip_fences(raw)
        data = json.loads(cleaned)
        result = ComplianceReportOutput.model_validate(data)
        return result

    def _apply_guardrails(
        self,
        output: ComplianceReportOutput,
        payload: ComplianceReportInput,
        template_name: str,
    ) -> ComplianceReportOutput:
        """
        Post-generation validation:
        - Ensure template_used is correct.
        - Force needs_human_review=True if any required field is missing
          or the default template was used.
        - Re-check required_fields_* against the actual student_record.
        """
        rec = payload.student_record
        present = [f for f in _UNIVERSAL_REQUIRED_FIELDS if rec.get(f)]
        missing = [f for f in _UNIVERSAL_REQUIRED_FIELDS if not rec.get(f)]

        output.required_fields_present = present
        output.required_fields_missing = missing
        output.template_used = template_name

        if missing or "default" in template_name:
            output.needs_human_review = True

        return output

    async def run(self, payload: ComplianceReportInput, *, user_id=None, db=None):  # type: ignore[override]
        result = await super().run(payload, user_id=user_id, db=db)
        if result.status == "success" and result.output is not None:
            result.output = self._apply_guardrails(
                result.output, payload, self._template_name
            )
        return result
