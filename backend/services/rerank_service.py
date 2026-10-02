# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Reranking — second-stage re-scoring of Stage-1 /rag-retrieve seeds against
the literal query text, before graph expansion walks outward from them
(see services/graph_retrieval.py, routes/inference.py::rag_retrieve).

Why this exists: Stage 1 fuses vector cosine similarity and Postgres
full-text search by rank (RRF), which is good at finding plausible
candidates cheaply but doesn't read the query and candidate together the
way a cross-encoder reranker does — it can't tell a close-but-not-quite
match from the actual best answer among a handful of similar-looking
standards. A reranker call is more expensive per item than the vector
search that found the candidates, which is exactly why it only runs on
Stage 1's small seed set (seed_k, currently up to 15), never on the whole
corpus.

Feature-flagged (RERANK_ENABLED, default off) so this ships dark and can
be A/B'd against current recall/precision before being turned on by
default — see PRD-standards-extensibility-reranking-2026-10-02.md §1.

Provider: Voyage only for now (the only embedding provider actually
configured in this deployment — see EMBEDDING_PROVIDER in core/config.py).
Not building Ollama/OpenAI rerank paths speculatively; add one if/when this
deployment's provider configuration actually changes.

Never raises: a reranking failure (network error, bad API key, provider
outage) degrades to "skip reranking, keep Stage 1's own order" — same
fail-open philosophy as services/graph_retrieval.py's expand_seeds().
"""

import logging
from typing import Optional

from core.config import settings
from services.embedding_service import _get_http_client

logger = logging.getLogger(__name__)

# "rerank-3-lite" (not "rerank-3"): start on the cheap tier and measure
# before paying for the larger model — unlike the embedding corpus-size
# cost (a one-time backfill), rerank cost scales with *query volume*, which
# is ongoing and much harder to bound in advance. Upgrade to "rerank-3" if
# a quality comparison shows lite isn't good enough, the same way
# EMBEDDING_MODEL overrides embedding_service.py's own default.
_DEFAULT_RERANK_MODEL = "rerank-3-lite"


def _resolve_rerank_model() -> str:
    override = (settings.RERANK_MODEL or "").strip()
    return override or _DEFAULT_RERANK_MODEL


async def rerank(query: str, documents: list[str], *, top_k: Optional[int] = None) -> Optional[list[dict]]:
    """
    Re-score `documents` against `query` via Voyage's /rerank endpoint.

    Returns a list of {"index": int, "relevance_score": float} sorted by
    relevance_score descending (indices refer back into the input
    `documents` list), truncated to `top_k` if given — or None if
    reranking is disabled, misconfigured, or the call failed, in which
    case the caller should fall back to its own pre-rerank ordering.
    """
    if not settings.RERANK_ENABLED:
        return None
    if not documents:
        return []

    provider = (settings.RERANK_PROVIDER or "voyage").strip().lower()
    if provider != "voyage":
        logger.warning("Unsupported RERANK_PROVIDER %r — skipping rerank", provider)
        return None

    api_key = settings.VOYAGE_API_KEY
    if not api_key:
        logger.warning("RERANK_ENABLED but VOYAGE_API_KEY not configured — skipping rerank")
        return None

    model = _resolve_rerank_model()
    body = {"model": model, "query": query, "documents": documents}
    if top_k:
        body["top_k"] = min(top_k, len(documents))

    try:
        client = _get_http_client()
        response = await client.post(
            f"{settings.VOYAGE_BASE_URL.rstrip('/')}/rerank",
            headers={
                "Authorization": f"Bearer {api_key}",
                "content-type": "application/json",
            },
            json=body,
        )
        if response.status_code != 200:
            logger.warning("Voyage rerank error: %s %s", response.status_code, response.text[:200])
            return None

        data = response.json()
        results = sorted(
            ({"index": item["index"], "relevance_score": item["relevance_score"]}
             for item in data.get("data", [])),
            key=lambda r: r["relevance_score"],
            reverse=True,
        )
        logger.info("Reranked %d documents with Voyage: model=%s top_k=%s", len(documents), model, top_k)
        return results
    except Exception as e:
        logger.warning("Rerank request failed, falling back to pre-rerank order: %s", e)
        return None
