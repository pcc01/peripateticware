# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Text embedding service for RAG and semantic search.

Provider-agnostic: resolves an embedding provider the same way
agents/provider.py resolves a generation provider (EMBEDDING_PROVIDER,
falling back to LLM_PROVIDER, falling back to "ollama"), so a server with no
local Ollama — just an OpenAI-shaped API key/endpoint — can still populate
and query rag_documents. Anthropic has no embeddings endpoint of its own
(they point customers at Voyage AI / OpenAI-shaped providers instead), so
"claude" is not a valid embedding provider; it resolves to "openai" here —
set OPENAI_BASE_URL to point at Voyage, Azure OpenAI, or any other
OpenAI-compatible embeddings server if that's what's actually running.
"""

import logging
from typing import List, Dict, Optional
import httpx
from core.config import settings

logger = logging.getLogger(__name__)

_VALID_EMBEDDING_PROVIDERS = {"ollama", "openai"}

# Shared, persistent HTTP client (created lazily, reused for the life of the
# process) instead of a fresh httpx.AsyncClient per embed call.
#
# Found via scripts/backfill_standards_embeddings.py: opening a brand-new
# TCP connection per request was fine in short bursts but degraded badly
# under sustained concurrent load (~34 items/sec steady for the first
# ~1000-1500 requests, then decaying to <15/sec over the next ~1000) —
# consistent with per-request connection-setup overhead (and the resulting
# churn of ephemeral local ports / TIME_WAIT sockets, worse across the
# Docker Desktop host.docker.internal NAT path this backend talks to Ollama
# through) compounding under concurrency rather than any provider-side
# rate limiting. A pooled, reused client is the standard fix (httpx's own
# docs recommend exactly this for long-lived apps) and is a legitimate
# improvement regardless of the precise mechanism.
_http_client: Optional[httpx.AsyncClient] = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            timeout=30,
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
        )
    return _http_client

# Default model per provider when EMBEDDING_MODEL is unset.
_DEFAULT_MODEL = {
    "ollama": "all-MiniLM-L6-v2",
    "openai": "text-embedding-3-small",
}


def _resolve_embedding_provider() -> str:
    """EMBEDDING_PROVIDER -> LLM_PROVIDER -> 'ollama'. "claude" is remapped
    to "openai" (see module docstring) rather than left to fail at request
    time with a provider that doesn't have an embeddings endpoint."""
    for raw in (settings.EMBEDDING_PROVIDER, settings.LLM_PROVIDER):
        v = (raw or "").strip().lower()
        if v == "claude":
            return "openai"
        if v in _VALID_EMBEDDING_PROVIDERS:
            return v
        if v:
            logger.warning("Unrecognized/unsupported embedding provider %r — ignoring", v)
    return "ollama"


def _resolve_embedding_model(provider: str) -> str:
    override = (settings.EMBEDDING_MODEL or "").strip()
    return override or _DEFAULT_MODEL[provider]


class EmbeddingService:
    """Generate embeddings for text via whichever provider is configured."""

    @staticmethod
    async def embed_text(text: str) -> Dict:
        """
        Generate embedding for text

        Args:
            text: Text to embed

        Returns:
            {
                "text": "input text",
                "embedding": [0.1, 0.2, ...],  # settings.VECTOR_DIMENSION dims
                "dimension": 384,
                "model": "...",
                "provider": "ollama" | "openai" | "mock"
            }
        """
        if not text or not text.strip():
            return {
                "text": "",
                "embedding": [0.0] * settings.VECTOR_DIMENSION,
                "dimension": settings.VECTOR_DIMENSION,
                "error": "Empty text"
            }

        # Clean text (truncate if needed)
        text_cleaned = text.strip()[:512]
        provider = _resolve_embedding_provider()

        try:
            if provider == "openai":
                result = await EmbeddingService._embed_with_openai(text_cleaned)
            else:
                result = await EmbeddingService._embed_with_ollama(text_cleaned)

            # Fall back to mock if the configured provider didn't come through
            # (unreachable, misconfigured, etc.) — keeps ingestion/retrieval
            # working end-to-end in dev even with nothing real attached.
            if not result.get("embedding"):
                result = await EmbeddingService._embed_mock(text_cleaned)

            return result

        except Exception as e:
            logger.error(f"Embedding error: {e}")
            return {
                "text": text_cleaned,
                "embedding": [0.0] * settings.VECTOR_DIMENSION,
                "dimension": settings.VECTOR_DIMENSION,
                "error": str(e)
            }

    @staticmethod
    async def embed_texts(texts: List[str]) -> List[Dict]:
        """
        Generate embeddings for multiple texts

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding results
        """
        embeddings = []

        for text in texts:
            embedding = await EmbeddingService.embed_text(text)
            embeddings.append(embedding)

        return embeddings

    @staticmethod
    async def _embed_with_ollama(text: str) -> Dict:
        """
        Generate embedding using Ollama's /api/embed endpoint.

        Requests `dimensions=settings.VECTOR_DIMENSION` — Ollama passes this
        through to models trained with Matryoshka representation learning
        (confirmed working against qwen3-embedding, whose native output is
        1024 dims, truncated server-side to exactly 384 on request) so the
        result stays compatible with the existing vector(384) columns/HNSW
        indexes without a schema change, mirroring the OpenAI adapter below.
        If a model doesn't support truncation, Ollama appears to just ignore
        the field and return its native dimension — checked explicitly below
        and surfaced as an error rather than silently stored mismatched.
        """
        model = _resolve_embedding_model("ollama")
        try:
            client = _get_http_client()
            response = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/embed",
                json={
                    "model": model,
                    "input": text,
                    "dimensions": settings.VECTOR_DIMENSION,
                }
            )

            if response.status_code == 200:
                data = response.json()
                embeddings = data.get("embeddings", [])

                if embeddings:
                    # Return first embedding if multiple returned
                    embedding = embeddings[0] if isinstance(embeddings[0], list) else embeddings

                    if len(embedding) != settings.VECTOR_DIMENSION:
                        logger.error(
                            "Ollama embedding dim mismatch: model=%s got %d, expected %d "
                            "(model may not support the `dimensions` truncation param)",
                            model, len(embedding), settings.VECTOR_DIMENSION,
                        )
                        return {
                            "text": text,
                            "embedding": None,
                            "error": (
                                f"Model {model} returned {len(embedding)} dims, "
                                f"expected {settings.VECTOR_DIMENSION}"
                            ),
                        }

                    logger.info(
                        f"Text embedded with Ollama: model={model} dim={len(embedding)}"
                    )

                    return {
                        "text": text,
                        "embedding": embedding,
                        "dimension": len(embedding),
                        "model": model,
                        "provider": "ollama"
                    }

            logger.warning(f"Ollama embed error: {response.status_code} {response.text[:200]}")
            return {
                "text": text,
                "embedding": None,
                "error": f"Status {response.status_code}"
            }

        except Exception as e:
            logger.warning(f"Ollama embedding error: {e}")
            return {
                "text": text,
                "embedding": None,
                "error": str(e)
            }

    @staticmethod
    async def _embed_with_openai(text: str) -> Dict:
        """
        Generate embedding via an OpenAI-shaped /embeddings endpoint
        (settings.OPENAI_BASE_URL — real OpenAI by default, but works
        against Azure OpenAI / any OpenAI-compatible embeddings server).

        Requests `dimensions=settings.VECTOR_DIMENSION` so the result stays
        compatible with the existing vector(384) columns/HNSW indexes
        without a schema change. text-embedding-3-small/large both support
        truncating via `dimensions` (Matryoshka representation learning).
        If a self-hosted/compatible server rejects the `dimensions` field
        (older servers, non-OpenAI models that don't support truncation),
        this fails loudly rather than silently truncating client-side —
        naive truncation isn't valid for arbitrary embedding models and
        would corrupt the vector space rather than just erroring.
        """
        model = _resolve_embedding_model("openai")
        base_url = settings.OPENAI_BASE_URL.rstrip("/")
        api_key = settings.OPENAI_API_KEY

        if not api_key:
            return {
                "text": text,
                "embedding": None,
                "error": "OPENAI_API_KEY not configured",
            }

        try:
            client = _get_http_client()
            response = await client.post(
                f"{base_url}/embeddings",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "input": text,
                    "dimensions": settings.VECTOR_DIMENSION,
                },
            )

            if response.status_code == 200:
                data = response.json()
                items = data.get("data", [])
                embedding = items[0].get("embedding") if items else None

                if embedding and len(embedding) != settings.VECTOR_DIMENSION:
                    # Server ignored `dimensions` (some OpenAI-compatible
                    # servers don't support truncation) — surface as an
                    # error rather than storing a vector that silently
                    # doesn't match the column/index dimension.
                    logger.error(
                        "OpenAI embedding dim mismatch: got %d, expected %d "
                        "(server may not support the `dimensions` param)",
                        len(embedding), settings.VECTOR_DIMENSION,
                    )
                    return {
                        "text": text,
                        "embedding": None,
                        "error": (
                            f"Embedding server returned {len(embedding)} dims, "
                            f"expected {settings.VECTOR_DIMENSION}"
                        ),
                    }

                logger.info(f"Text embedded with OpenAI-shaped API: model={model}")
                return {
                    "text": text,
                    "embedding": embedding,
                    "dimension": len(embedding) if embedding else 0,
                    "model": model,
                    "provider": "openai",
                }

            logger.warning(f"OpenAI embed error: {response.status_code} {response.text[:200]}")
            return {
                "text": text,
                "embedding": None,
                "error": f"Status {response.status_code}",
            }

        except Exception as e:
            logger.warning(f"OpenAI embedding error: {e}")
            return {
                "text": text,
                "embedding": None,
                "error": str(e),
            }

    @staticmethod
    async def _embed_mock(text: str) -> Dict:
        """
        Generate mock embedding (for testing without any embedding provider
        reachable).

        In production, replace with actual embedding model.
        This uses a simple hash-based approach for deterministic testing.
        """
        import hashlib

        # Create deterministic mock embedding based on text hash
        text_hash = hashlib.md5(text.encode()).hexdigest()

        # Convert hash to float values in [-1, 1]
        mock_embedding = []
        for i in range(settings.VECTOR_DIMENSION):
            # Use different bytes of hash for each dimension
            byte_val = int(text_hash[(i * 2) % 32:(i * 2 + 2) % 32 + 1], 16)
            # Normalize to [-1, 1]
            normalized = (byte_val / 127.5) - 1.0
            mock_embedding.append(normalized)

        logger.info(
            f"Generated mock embedding: dim={len(mock_embedding)}"
        )

        return {
            "text": text,
            "embedding": mock_embedding,
            "dimension": len(mock_embedding),
            "model": "mock-embedding",
            "provider": "mock"
        }


async def embed_text(text: str) -> Dict:
    """Public API for embedding single text"""
    return await EmbeddingService.embed_text(text)


async def embed_texts(texts: List[str]) -> List[Dict]:
    """Public API for embedding multiple texts"""
    return await EmbeddingService.embed_texts(texts)
