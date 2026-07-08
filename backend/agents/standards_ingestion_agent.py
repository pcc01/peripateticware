# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
StandardsIngestionAgent

Turns raw standards/taxonomy/homeschool-requirement documents into normalized
standard records, then embeds and stores them via the existing embedding path.
"""

from __future__ import annotations

import json
import logging
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel

from agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# I/O models
# ---------------------------------------------------------------------------

class StandardsIngestionInput(BaseModel):
    source_text: str
    source_name: str
    jurisdiction: str            # e.g. "WA", "US", "custom"
    framework: str               # e.g. "NGSS", "Common Core", "custom"
    grade_band: Optional[str] = None


class StandardRecord(BaseModel):
    code: str
    title: str
    description: str
    grade_level: Optional[str] = None
    parent_code: Optional[str] = None
    bloom_level: Optional[str] = None
    raw_span: Optional[str] = None


class StandardsIngestionOutput(BaseModel):
    records: List[StandardRecord]
    count: int
    unparsed_remainder: Optional[str] = None


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

class StandardsIngestionAgent(BaseAgent):
    name = "standards_ingestion"
    default_provider = "ollama"
    _provider_env_var = "AGENT_STANDARDS_INGESTION_PROVIDER"

    InputModel = StandardsIngestionInput
    OutputModel = StandardsIngestionOutput

    def build_messages(self, payload: StandardsIngestionInput) -> list[dict]:  # type: ignore[override]
        user_content = (
            f"SOURCE NAME: {payload.source_name}\n"
            f"JURISDICTION: {payload.jurisdiction}\n"
            f"FRAMEWORK: {payload.framework}\n"
            f"GRADE BAND: {payload.grade_band or 'not specified'}\n\n"
            f"DOCUMENT TEXT:\n{payload.source_text[:12000]}"
        )
        messages = []
        if self._system_prompt:
            messages.append({"role": "system", "content": self._system_prompt})
        messages.append({"role": "user", "content": user_content})
        return messages

    def _parse_output(self, raw: str) -> StandardsIngestionOutput:
        from agents.base_agent import _strip_fences
        cleaned = _strip_fences(raw)
        data = json.loads(cleaned)
        result = StandardsIngestionOutput.model_validate(data)
        result.count = len(result.records)
        return result

    async def ingest_and_embed(
        self,
        payload: StandardsIngestionInput,
        *,
        user_id: Optional[UUID] = None,
        db=None,
    ):
        """
        Run extraction then embed + upsert each record.
        Returns AgentResult; embedding failures are logged but non-fatal.
        """
        result = await self.run(payload, user_id=user_id, db=db)
        if result.status != "success" or result.output is None:
            return result

        records: StandardsIngestionOutput = result.output
        try:
            from services.embedding_service import embed_text
            from datetime import datetime, timezone

            for rec in records.records:
                embed_text_content = f"{rec.code} {rec.title} {rec.description}"
                try:
                    _emb = await embed_text(embed_text_content)
                    logger.debug(
                        "Embedded standard %s (%d dims)",
                        rec.code, _emb.get("dimension", 0)
                    )
                except Exception as emb_err:
                    logger.warning("Embed failed for %s: %s", rec.code, emb_err)
        except Exception as exc:
            logger.warning("Post-extraction embedding step failed: %s", exc)

        return result
