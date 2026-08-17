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
        """Remove any mapping whose code is not in the retrieved candidate set.

        NOTE: this used to short-circuit with `if not candidate_codes: return
        output`, i.e. skip filtering entirely when there were zero candidates.
        That's backwards: an empty candidate set means the LLM had nothing to
        ground its answer in, so every code it returned is by definition
        invented and should be stripped -- not passed through unfiltered.
        run_with_retrieval()'s retrieval step now does a real pgvector query
        (see above — it used to be permanently stubbed to zero candidates,
        which made this filter a permanent no-op in every real call path),
        but a `db`-less caller or a genuinely empty rag_documents store still
        hits the zero-candidates case, so this still matters. The plain
        list-comprehension filter below already handles candidate_codes ==
        set() correctly on its own (nothing is "in" an empty set), so the
        special case is unnecessary.
        """
        filtered = [m for m in output.mappings if m.code in candidate_codes]
        if len(filtered) != len(output.mappings):
            removed = [m.code for m in output.mappings if m.code not in candidate_codes]
            logger.warning("StandardsMapping: removed invented codes %s", removed)
        output.mappings = filtered
        return output

    async def run_with_retrieval(self, payload: StandardsMappingInput, *, user_id=None, db=None):
        """
        Full pipeline: embed -> retrieve (vector search + graph expansion) -> classify.
        Validates that returned codes exist in retrieval results.

        Retrieval requires a live `db` session (a real pgvector query against
        rag_documents, same store/shape as routes/inference.py's
        /rag-retrieve and services/graph_retrieval.py's expansion). Without
        one, falls back to zero candidates — same degrade-to-empty behavior
        as before this was wired up, rather than erroring.
        """
        candidates: list[dict] = []
        candidate_codes: set = set()

        if db is None:
            logger.debug("StandardsMapping: no db session provided, skipping retrieval (empty candidate set)")
        else:
            try:
                from services.embedding_service import embed_text
                from services.graph_retrieval import expand_seeds
                from sqlalchemy import text as _t

                emb_result = await embed_text(payload.submission_text, input_type="query")
                query_embedding = emb_result.get("embedding")

                if query_embedding:
                    vec_literal = "[" + ",".join(str(v) for v in query_embedding) + "]"
                    rows = (await db.execute(_t("""
                        SELECT content, source_name, metadata, node_type, node_id::text,
                               1 - (embedding <=> CAST(:emb AS vector)) AS score
                        FROM rag_documents
                        WHERE embedding IS NOT NULL AND source_type = 'standards'
                        ORDER BY embedding <=> CAST(:emb AS vector)
                        LIMIT :k
                    """), {"emb": vec_literal, "k": payload.top_k})).fetchall()

                    seeds: list[dict] = []
                    for row in rows:
                        meta = row[2] or {}
                        code = meta.get("human_coding_scheme") or meta.get("criterion_id") or row[1] or ""
                        if not code or code in candidate_codes:
                            continue
                        candidates.append({"code": code, "title": row[1] or code, "description": row[0] or ""})
                        candidate_codes.add(code)
                        seeds.append({
                            "id": None, "node_type": row[3], "node_id": row[4],
                            "relevance_score": float(row[5]) if row[5] is not None else 0.0,
                        })

                    # Graph expansion — a mapping decision benefits from the
                    # same ancestor/cross-reference context /rag-retrieve
                    # surfaces, not just the top-k nearest chunks. Skips
                    # cleanly (empty expansion) for seeds with no linked
                    # graph node — see services/graph_retrieval.py.
                    if seeds:
                        expanded = await expand_seeds(db, seeds, include_ancestors=True, include_related=True)
                        for item in expanded:
                            code = item.get("source_name") or ""
                            if not code or code in candidate_codes:
                                continue
                            candidates.append({"code": code, "title": code, "description": item.get("content") or ""})
                            candidate_codes.add(code)

                logger.debug(
                    "StandardsMapping: retrieved %d candidates (embedding dim=%s)",
                    len(candidates), emb_result.get("dimension"),
                )
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
