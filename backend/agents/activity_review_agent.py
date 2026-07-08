# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
ActivityReviewAgent

Generates a narrative review of a completed activity grounded in the
Aristotelian inquiry methodology (observe -> describe -> compare -> classify
-> infer -> generalise).  Loose output contract; uses BaseAgent for one
consistent audit path.
"""

from __future__ import annotations

import json
import logging
from typing import List, Literal, Optional

from pydantic import BaseModel

from agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# I/O models
# ---------------------------------------------------------------------------

class ActivityReviewInput(BaseModel):
    submission_text: str
    activity_context: Optional[str] = None
    competencies_addressed: Optional[List[str]] = None
    audience: Literal["student", "parent", "teacher"] = "teacher"


class ActivityReviewOutput(BaseModel):
    review_markdown: str
    suggested_next_steps: List[str]
    tone_audience: str


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

class ActivityReviewAgent(BaseAgent):
    name = "activity_review"
    default_provider = "ollama"
    _provider_env_var = "AGENT_ACTIVITY_REVIEW_PROVIDER"

    InputModel = ActivityReviewInput
    OutputModel = ActivityReviewOutput

    def build_messages(self, payload: ActivityReviewInput) -> list[dict]:  # type: ignore[override]
        competencies = ", ".join(payload.competencies_addressed or []) or "not specified"
        user_content = (
            f"AUDIENCE: {payload.audience}\n"
            f"ACTIVITY CONTEXT: {payload.activity_context or 'not provided'}\n"
            f"COMPETENCIES ADDRESSED: {competencies}\n\n"
            f"STUDENT SUBMISSION:\n{payload.submission_text[:6000]}\n\n"
            "Return JSON matching the output schema."
        )
        messages = []
        if self._system_prompt:
            messages.append({"role": "system", "content": self._system_prompt})
        messages.append({"role": "user", "content": user_content})
        return messages

    def _parse_output(self, raw: str) -> ActivityReviewOutput:
        from agents.base_agent import _strip_fences
        cleaned = _strip_fences(raw)
        data = json.loads(cleaned)
        return ActivityReviewOutput.model_validate(data)
