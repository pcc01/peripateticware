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
        Run extraction then embed + upsert each record into rag_documents so
        it's actually retrievable — this used to compute an embedding per
        record and discard the result (never wrote to rag_documents), which
        made every ingestion through this agent invisible to /rag-retrieve.

        Returns AgentResult; embedding/persistence failures are logged but
        non-fatal (the extraction result is still returned either way).
        """
        result = await self.run(payload, user_id=user_id, db=db)
        if result.status != "success" or result.output is None:
            return result

        if db is None:
            logger.warning(
                "ingest_and_embed: no db session provided — extracted %d "
                "records will not be persisted to rag_documents",
                len(result.output.records),
            )
            return result

        records: StandardsIngestionOutput = result.output
        try:
            from services.rag_store import upsert_rag_chunk

            source_id = payload.source_name
            indexed = 0
            for idx, rec in enumerate(records.records):
                chunk_text = f"{rec.code} {rec.title} {rec.description}".strip()
                ok = await upsert_rag_chunk(
                    db,
                    source_type="standards",
                    source_id=source_id,
                    source_name=payload.source_name,
                    chunk_index=idx,
                    content=chunk_text,
                    metadata={
                        "code":         rec.code,
                        "grade_level":  rec.grade_level,
                        "parent_code":  rec.parent_code,
                        "bloom_level":  rec.bloom_level,
                        "jurisdiction": payload.jurisdiction,
                        "framework":    payload.framework,
                    },
                    owner_id=user_id,
                )
                if ok:
                    indexed += 1
                else:
                    logger.warning("Embed/index failed for standard %s", rec.code)

            await db.commit()
            logger.info(
                "StandardsIngestionAgent: indexed %d/%d records from '%s' into rag_documents",
                indexed, len(records.records), payload.source_name,
            )
        except Exception as exc:
            logger.warning("Post-extraction embedding step failed: %s", exc)

        return result
