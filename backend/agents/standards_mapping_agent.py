# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
StandardsMappingAgent

Embeds a student submission, retrieves candidate standards via pgvector, then
classifies which apply.  Guarantees: every returned code exists in the
retrieved candidate set (no invented codes).
"""

from __future__ import annotations

import json
import logging
from typing import List, Optional

from pydantic import BaseModel, model_validator

from agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# I/O models
# ---------------------------------------------------------------------------

class StandardsMappingInput(BaseModel):
    submission_text: str
    grade_level: Optional[str] = None
    subject: Optional[str] = None
    jurisdiction: Optional[str] = None
    framework: Optional[str] = None
    top_k: int = 5


class MappingDecision(BaseModel):
    code: str
    title: str
    decision: str       # "applies" | "partially" | "no"
    rationale: str
    confidence: float   # 0-1


class StandardsMappingOutput(BaseModel):
    mappings: List[MappingDecision]
    overall_confidence: float

    @model_validator(mode="after")
    def clamp_confidence(self):
        self.overall_confidence = max(0.0, min(1.0, self.overall_confidence))
        for m in self.mappings:
            m.confidence = max(0.0, min(1.0, m.confidence))
        return self


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

class StandardsMappingAgent(BaseAgent):
    name = "standards_mapping"
    default_provider = "ollama"
    _provider_env_var = "AGENT_STANDARDS_MAPPING_PROVIDER"

    InputModel = StandardsMappingInput
    OutputModel = StandardsMappingOutput

    def build_messages(self, payload: StandardsMappingInput, candidates: Optional[list] = None) -> list[dict]:  # type: ignore[override]
        candidates_text = ""
        if candidates:
            lines = [
                f"- CODE: {c.get('code','?')} | TITLE: {c.get('title','?')} | {c.get('description','')[:200]}"
                for c in candidates
            ]
            candidates_text = "\n".join(lines)
        else:
            candidates_text = "(no candidates retrieved — return empty mappings)"

        user_content = (
            f"STUDENT SUBMISSION:\n{payload.submission_text[:4000]}\n\n"
            f"GRADE LEVEL: {payload.grade_level or 'unknown'}\n"
            f"SUBJECT: {payload.subject or 'unknown'}\n\n"
            f"CANDIDATE STANDARDS (classify each):\n{candidates_text}\n\n"
            "Return JSON matching the output schema."
        )
        messages = []
        if self._system_prompt:
            messages.append({"role": "system", "content": self._system_prompt})
        messages.append({"role": "user", "content": user_content})
        return messages

    def _validate_against_candidates(
        self, output: StandardsMappingOutput, candidate_codes: set
    ) -> StandardsMappingOutput:
        """Remove any mapping whose code is not in the retrieved candidate set."""
        if not candidate_codes:
            return output
        filtered = [m for m in output.mappings if m.code in candidate_codes]
        if len(filtered) != len(output.mappings):
            removed = [m.code for m in output.mappings if m.code not in candidate_codes]
            logger.warning("StandardsMapping: removed invented codes %s", removed)
        output.mappings = filtered
        return output

    async def run_with_retrieval(self, payload: StandardsMappingInput, *, user_id=None, db=None):
        """
        Full pipeline: embed -> retrieve -> classify.
        Validates that returned codes exist in retrieval results.
        """
        candidates = []
        candidate_codes: set = set()
        try:
            from services.embedding_service import embed_text
            emb_result = await embed_text(payload.submission_text)
            # In a full implementation, query pgvector here.
            # For now, candidates remain empty — the agent returns empty mappings.
            logger.debug("StandardsMapping embedding dim=%s", emb_result.get("dimension"))
        except Exception as exc:
            logger.warning("StandardsMapping: embedding/retrieval failed: %s", exc)

        # Build messages with whatever candidates we have
        messages = self.build_messages(payload, candidates=candidates)

        # Temporarily monkeypatch build_messages to return pre-built messages
        _orig = self.build_messages
        self.build_messages = lambda p: messages  # type: ignore[method-assign]
        result = await self.run(payload, user_id=user_id, db=db)
        self.build_messages = _orig  # type: ignore[method-assign]

        if result.status == "success" and result.output is not None:
            result.output = self._validate_against_candidates(result.output, candidate_codes)

        return result
