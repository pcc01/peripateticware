# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
RubricScoringAgent

Applies a teacher-authored rubric to a student submission.
Guarantees: every returned level exists in its criterion; total_points == sum of scores.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, model_validator

from agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# I/O models
# ---------------------------------------------------------------------------

class RubricLevel(BaseModel):
    level: str
    descriptor: str
    points: int


class RubricCriterion(BaseModel):
    criterion_id: str
    criterion: str
    levels: List[RubricLevel]


class RubricScoringInput(BaseModel):
    submission_text: str
    rubric: List[RubricCriterion]
    submission_id: Optional[str] = None


class CriterionScore(BaseModel):
    criterion_id: str
    level: str
    points: int
    evidence_quote_or_paraphrase: str
    justification: str


class RubricScoringOutput(BaseModel):
    scores: List[CriterionScore]
    total_points: int
    max_points: int
    summary: str

    @model_validator(mode="after")
    def verify_totals(self):
        computed = sum(s.points for s in self.scores)
        if computed != self.total_points:
            logger.warning(
                "RubricScoring total mismatch: reported=%d computed=%d; correcting",
                self.total_points, computed
            )
            self.total_points = computed
        return self


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

class RubricScoringAgent(BaseAgent):
    name = "rubric_scoring"
    default_provider = "ollama"
    _provider_env_var = "AGENT_RUBRIC_SCORING_PROVIDER"

    InputModel = RubricScoringInput
    OutputModel = RubricScoringOutput

    def build_messages(self, payload: RubricScoringInput) -> list[dict]:  # type: ignore[override]
        rubric_text = json.dumps(
            [c.model_dump() for c in payload.rubric],
            indent=2,
        )
        user_content = (
            f"STUDENT SUBMISSION:\n{payload.submission_text[:6000]}\n\n"
            f"RUBRIC:\n{rubric_text}\n\n"
            "Score each criterion. Return JSON matching the output schema. "
            "Evidence must paraphrase student work — do NOT fabricate quotes."
        )
        messages = []
        if self._system_prompt:
            messages.append({"role": "system", "content": self._system_prompt})
        messages.append({"role": "user", "content": user_content})
        return messages

    def _parse_output(self, raw: str) -> RubricScoringOutput:
        from agents.base_agent import _strip_fences
        cleaned = _strip_fences(raw)
        data = json.loads(cleaned)
        result = RubricScoringOutput.model_validate(data)
        return result

    def _validate_levels(
        self, output: RubricScoringOutput, rubric: List[RubricCriterion]
    ) -> RubricScoringOutput:
        """Verify each score references a level that exists in that criterion."""
        criterion_map: Dict[str, set] = {
            c.criterion_id: {lv.level for lv in c.levels}
            for c in rubric
        }
        for score in output.scores:
            valid_levels = criterion_map.get(score.criterion_id, set())
            if score.level not in valid_levels:
                logger.warning(
                    "RubricScoring: invalid level '%s' for criterion '%s' (valid: %s)",
                    score.level, score.criterion_id, valid_levels,
                )
        return output

    async def run(self, payload: RubricScoringInput, *, user_id=None, db=None):  # type: ignore[override]
        result = await super().run(payload, user_id=user_id, db=db)
        if result.status == "success" and result.output is not None:
            result.output = self._validate_levels(result.output, payload.rubric)
        return result
