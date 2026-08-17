# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Text embedding service for RAG and semantic search.

Provider-agnostic: resolves an embedding provider the same way
agents/provider.py resolves a generation provider (EMBEDDING_PROVIDER,
falling back to LLM_PROVIDER, falling back to "ollama"), so a server with no
local Ollama — just a Voyage AI or OpenAI-shaped API key — can still
populate and query rag_documents. Anthropic has no embeddings endpoint of
its own; "claude" is not a valid embedding provider and resolves to
"openai" here rather than failing outright. Voyage AI is Anthropic's own
recommended embeddings partner and gets first-class support (not just an
OPENAI_BASE_URL redirect) because its API isn't quite OpenAI-shaped —
`output_dimension` instead of `dimensions`, and a genuinely useful
`input_type=query|document` asymmetric-embedding feature neither Ollama nor
OpenAI's API exposes (see embed_text()/embed_texts()'s `input_type` param).
"""

import logging
from typing import List, Dict, Optional
import httpx
from core.config import settings

logger = logging.getLogger(__name__)

_VALID_EMBEDDING_PROVIDERS = {"ollama", "openai", "voyage"}

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

# Default model per provider when EMBEDDING_MODEL is unset. "voyage-4" (not
# the cheaper "-lite" tier) — at this corpus's token volume the price
# difference between Voyage's tiers is cents, not dollars, so there's no
# real reason to trade quality for cost here; EMBEDDING_MODEL still
# overrides this per deployment.
_DEFAULT_MODEL = {
    "ollama": "all-MiniLM-L6-v2",
    "openai": "text-embedding-3-small",
    "voyage": "voyage-4",
}

# Voyage's output_dimension is a fixed enum (256/512/1024/2048), unlike
# Ollama/OpenAI's arbitrary `dimensions` truncation — 384 (this app's
# historical default, matching all-MiniLM-L6-v2) isn't one of them. Checked
# against settings.VECTOR_DIMENSION before every Voyage request so a
# misconfiguration fails with a clear message instead of a bare 400 from
# Voyage's API.
_VOYAGE_ALLOWED_DIMENSIONS = {256, 512, 1024, 2048}

# Max texts per batched /api/embed (or /embeddings) call.
#
# Found via a live throughput comparison (scripts/backfill_standards_embeddings.py):
# sending one text per request, even 20-24 concurrently, cost ~185ms/item
# against Ollama + qwen3-embedding:0.6b. A single request with N texts in
# its `input` array is dramatically more efficient per item — 25ms/item at
# batch=25, 14ms/item at batch=100 (~13x better than one-at-a-time) — the
# GPU does one batched forward pass instead of N separate ones, and
# per-request overhead is paid once instead of N times.
#
# 100 is a deliberately conservative ceiling, not the true limit: batch=200
# still worked (14.5ms/item, no better than 100), but batch=400 made
# Ollama's internal tokenizer subprocess connection fail outright ("dial
# tcp 127.0.0.1:<port>: connectex: ... actively refused") — a real
# instability somewhere between 200 and 400. Staying at 100 keeps a solid
# margin below that without giving up meaningful throughput.
_MAX_BATCH_SIZE = 100


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
    async def embed_text(text: str, *, input_type: Optional[str] = None) -> Dict:
        """
        Generate embedding for text

        Args:
            text: Text to embed
            input_type: "query" | "document" | None. Only Voyage uses this
                (asymmetric embeddings tuned for which role the text plays
                in retrieval) — ignored by Ollama/OpenAI, harmless to pass
                regardless of the active provider.

        Returns:
            {
                "text": "input text",
                "embedding": [0.1, 0.2, ...],  # settings.VECTOR_DIMENSION dims
                "dimension": 384,
                "model": "...",
                "provider": "ollama" | "openai" | "voyage" | "mock"
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
            if provider == "voyage":
                result = await EmbeddingService._embed_with_voyage(text_cleaned, input_type=input_type)
            elif provider == "openai":
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
    async def embed_texts(texts: List[str], *, input_type: Optional[str] = None) -> List[Dict]:
        """
        Generate embeddings for multiple texts via batched provider calls
        (see _MAX_BATCH_SIZE) rather than one request per text — see that
        constant's comment for the measured throughput difference.

        Args:
            texts: List of texts to embed
            input_type: "query" | "document" | None — see embed_text().
                Applies to the whole batch; call separately for a mix.

        Returns:
            List of embedding results, same order and length as `texts`.
        """
        results: List[Optional[Dict]] = [None] * len(texts)

        # Empty strings never hit the network — same placeholder shape as
        # embed_text()'s empty-text case.
        indexed_nonempty = [(i, t.strip()[:512]) for i, t in enumerate(texts) if t and t.strip()]
        for i, t in enumerate(texts):
            if not (t and t.strip()):
                results[i] = {
                    "text": "",
                    "embedding": [0.0] * settings.VECTOR_DIMENSION,
                    "dimension": settings.VECTOR_DIMENSION,
                    "error": "Empty text",
                }

        provider = _resolve_embedding_provider()

        for start in range(0, len(indexed_nonempty), _MAX_BATCH_SIZE):
            chunk = indexed_nonempty[start:start + _MAX_BATCH_SIZE]
            chunk_indices = [i for i, _ in chunk]
            chunk_texts = [t for _, t in chunk]

            try:
                if provider == "voyage":
                    chunk_results = await EmbeddingService._embed_batch_with_voyage(chunk_texts, input_type=input_type)
                elif provider == "openai":
                    chunk_results = await EmbeddingService._embed_batch_with_openai(chunk_texts)
                else:
                    chunk_results = await EmbeddingService._embed_batch_with_ollama(chunk_texts)
            except Exception as e:
                logger.error(f"Batch embedding error: {e}")
                chunk_results = [None] * len(chunk_texts)

            for pos, (idx, text) in enumerate(chunk):
                r = chunk_results[pos] if pos < len(chunk_results) else None
                if not r or not r.get("embedding"):
                    # Same per-item resilience as embed_text(): fall back to
                    # mock rather than letting one bad batch drop items.
                    r = await EmbeddingService._embed_mock(text)
                results[idx] = r

        return results  # type: ignore[return-value]

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
    async def _embed_with_voyage(text: str, *, input_type: Optional[str] = None) -> Dict:
        """
        Generate embedding via Voyage AI's /embeddings endpoint.

        Uses `output_dimension` (Voyage's name for the same Matryoshka
        truncation concept OpenAI/Ollama call `dimensions`) — only one of
        256/512/1024/2048 is valid, checked up front against
        _VOYAGE_ALLOWED_DIMENSIONS so a VECTOR_DIMENSION=384 misconfiguration
        (this app's historical default) fails with an actionable message
        instead of an opaque 400 from Voyage's API.

        `input_type=query|document` tells Voyage which role this text plays
        in retrieval and prepends a role-specific prompt before embedding —
        genuinely improves retrieval quality for query-vs-document search
        (unlike Ollama/OpenAI, which embed both identically); harmless to
        leave as None (symmetric, no prompt prepended).
        """
        model = _resolve_embedding_model("voyage")
        api_key = settings.VOYAGE_API_KEY

        if not api_key:
            return {
                "text": text,
                "embedding": None,
                "error": "VOYAGE_API_KEY not configured",
            }
        if settings.VECTOR_DIMENSION not in _VOYAGE_ALLOWED_DIMENSIONS:
            return {
                "text": text,
                "embedding": None,
                "error": (
                    f"VECTOR_DIMENSION={settings.VECTOR_DIMENSION} is not a valid Voyage "
                    f"output_dimension (must be one of {sorted(_VOYAGE_ALLOWED_DIMENSIONS)})"
                ),
            }

        try:
            client = _get_http_client()
            body = {
                "model": model,
                "input": text,
                "output_dimension": settings.VECTOR_DIMENSION,
            }
            if input_type:
                body["input_type"] = input_type
            response = await client.post(
                f"{settings.VOYAGE_BASE_URL.rstrip('/')}/embeddings",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "content-type": "application/json",
                },
                json=body,
            )

            if response.status_code == 200:
                data = response.json()
                items = data.get("data", [])
                embedding = items[0].get("embedding") if items else None

                if embedding and len(embedding) != settings.VECTOR_DIMENSION:
                    logger.error(
                        "Voyage embedding dim mismatch: got %d, expected %d",
                        len(embedding), settings.VECTOR_DIMENSION,
                    )
                    return {
                        "text": text,
                        "embedding": None,
                        "error": (
                            f"Voyage returned {len(embedding)} dims, "
                            f"expected {settings.VECTOR_DIMENSION}"
                        ),
                    }

                logger.info(f"Text embedded with Voyage: model={model} input_type={input_type}")
                return {
                    "text": text,
                    "embedding": embedding,
                    "dimension": len(embedding) if embedding else 0,
                    "model": model,
                    "provider": "voyage",
                }

            logger.warning(f"Voyage embed error: {response.status_code} {response.text[:200]}")
            return {
                "text": text,
                "embedding": None,
                "error": f"Status {response.status_code}",
            }

        except Exception as e:
            logger.warning(f"Voyage embedding error: {e}")
            return {
                "text": text,
                "embedding": None,
                "error": str(e),
            }

    @staticmethod
    async def _embed_batch_with_ollama(texts: List[str]) -> List[Optional[Dict]]:
        """
        Embed multiple texts in a single Ollama /api/embed request (`input`
        as a list rather than a string) — see _MAX_BATCH_SIZE's comment for
        why this matters. Returns one result dict per input text, same
        order, `None` for any text whose embedding didn't come back at the
        right dimension (caller falls back to mock for those individually).
        """
        model = _resolve_embedding_model("ollama")
        try:
            client = _get_http_client()
            response = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/embed",
                json={
                    "model": model,
                    "input": texts,
                    "dimensions": settings.VECTOR_DIMENSION,
                },
                timeout=90,   # a full 100-text batch can take longer than the client's default 30s
            )

            if response.status_code != 200:
                logger.warning(f"Ollama batch embed error: {response.status_code} {response.text[:200]}")
                return [None] * len(texts)

            data = response.json()
            embeddings = data.get("embeddings", [])
            if len(embeddings) != len(texts):
                logger.error(
                    "Ollama batch embed count mismatch: sent %d texts, got %d embeddings back",
                    len(texts), len(embeddings),
                )
                return [None] * len(texts)

            results: List[Optional[Dict]] = []
            for text, embedding in zip(texts, embeddings):
                if len(embedding) != settings.VECTOR_DIMENSION:
                    logger.error(
                        "Ollama batch embedding dim mismatch: model=%s got %d, expected %d",
                        model, len(embedding), settings.VECTOR_DIMENSION,
                    )
                    results.append(None)
                    continue
                results.append({
                    "text": text, "embedding": embedding, "dimension": len(embedding),
                    "model": model, "provider": "ollama",
                })
            logger.info(f"Batch-embedded {len(texts)} texts with Ollama: model={model}")
            return results

        except Exception as e:
            logger.warning(f"Ollama batch embedding error: {e}")
            return [None] * len(texts)

    @staticmethod
    async def _embed_batch_with_openai(texts: List[str]) -> List[Optional[Dict]]:
        """
        Embed multiple texts in a single OpenAI-shaped /embeddings request.
        OpenAI's response includes an `index` per item — sorted on explicitly
        rather than trusted to come back in submission order, per their own
        API contract (usually is, but "usually" isn't a guarantee worth
        silently relying on for a batch response we then zip against input
        order).
        """
        model = _resolve_embedding_model("openai")
        base_url = settings.OPENAI_BASE_URL.rstrip("/")
        api_key = settings.OPENAI_API_KEY

        if not api_key:
            return [None] * len(texts)

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
                    "input": texts,
                    "dimensions": settings.VECTOR_DIMENSION,
                },
                timeout=90,
            )

            if response.status_code != 200:
                logger.warning(f"OpenAI batch embed error: {response.status_code} {response.text[:200]}")
                return [None] * len(texts)

            data = response.json()
            items = sorted(data.get("data", []), key=lambda d: d.get("index", 0))
            if len(items) != len(texts):
                logger.error(
                    "OpenAI batch embed count mismatch: sent %d texts, got %d embeddings back",
                    len(texts), len(items),
                )
                return [None] * len(texts)

            results: List[Optional[Dict]] = []
            for text, item in zip(texts, items):
                embedding = item.get("embedding")
                if not embedding or len(embedding) != settings.VECTOR_DIMENSION:
                    logger.error(
                        "OpenAI batch embedding dim mismatch: got %s, expected %d",
                        len(embedding) if embedding else None, settings.VECTOR_DIMENSION,
                    )
                    results.append(None)
                    continue
                results.append({
                    "text": text, "embedding": embedding, "dimension": len(embedding),
                    "model": model, "provider": "openai",
                })
            logger.info(f"Batch-embedded {len(texts)} texts with OpenAI-shaped API: model={model}")
            return results

        except Exception as e:
            logger.warning(f"OpenAI batch embedding error: {e}")
            return [None] * len(texts)

    @staticmethod
    async def _embed_batch_with_voyage(texts: List[str], *, input_type: Optional[str] = None) -> List[Optional[Dict]]:
        """
        Embed multiple texts in a single Voyage AI /embeddings request
        (up to 1,000 texts/request per Voyage's docs — we still cap at
        _MAX_BATCH_SIZE=100 for parity with the other providers' tested
        ceiling rather than assuming a higher one untested here). Same
        index-sorted response handling as the OpenAI batch path.
        """
        model = _resolve_embedding_model("voyage")
        api_key = settings.VOYAGE_API_KEY

        if not api_key:
            return [None] * len(texts)
        if settings.VECTOR_DIMENSION not in _VOYAGE_ALLOWED_DIMENSIONS:
            logger.error(
                "VECTOR_DIMENSION=%d is not a valid Voyage output_dimension (must be one of %s)",
                settings.VECTOR_DIMENSION, sorted(_VOYAGE_ALLOWED_DIMENSIONS),
            )
            return [None] * len(texts)

        try:
            client = _get_http_client()
            body = {
                "model": model,
                "input": texts,
                "output_dimension": settings.VECTOR_DIMENSION,
            }
            if input_type:
                body["input_type"] = input_type
            response = await client.post(
                f"{settings.VOYAGE_BASE_URL.rstrip('/')}/embeddings",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "content-type": "application/json",
                },
                json=body,
                timeout=90,
            )

            if response.status_code != 200:
                logger.warning(f"Voyage batch embed error: {response.status_code} {response.text[:200]}")
                return [None] * len(texts)

            data = response.json()
            items = sorted(data.get("data", []), key=lambda d: d.get("index", 0))
            if len(items) != len(texts):
                logger.error(
                    "Voyage batch embed count mismatch: sent %d texts, got %d embeddings back",
                    len(texts), len(items),
                )
                return [None] * len(texts)

            results: List[Optional[Dict]] = []
            for text, item in zip(texts, items):
                embedding = item.get("embedding")
                if not embedding or len(embedding) != settings.VECTOR_DIMENSION:
                    logger.error(
                        "Voyage batch embedding dim mismatch: got %s, expected %d",
                        len(embedding) if embedding else None, settings.VECTOR_DIMENSION,
                    )
                    results.append(None)
                    continue
                results.append({
                    "text": text, "embedding": embedding, "dimension": len(embedding),
                    "model": model, "provider": "voyage",
                })
            logger.info(f"Batch-embedded {len(texts)} texts with Voyage: model={model} input_type={input_type}")
            return results

        except Exception as e:
            logger.warning(f"Voyage batch embedding error: {e}")
            return [None] * len(texts)

    @staticmethod
    async def _embed_mock(text: str) -> Dict:
        """
        Generate mock embedding (for testing without any embedding provider
        reachable).

        In production, replace with actual embedding model.
        This uses a simple hash-based approach for deterministic testing.
        """
        import hashlib

        # Create deterministic mock embedding based on text hash. Repeat the
        # 32-hex-char digest out to 2 chars per dimension so a plain
        # contiguous slice always has enough material — the previous
        # `(i*2) % 32 : (i*2+2) % 32 + 1` wraparound math produced an empty
        # slice (int('', 16) -> ValueError) at i=15 for any
        # VECTOR_DIMENSION >= 16, i.e. always, silently breaking the exact
        # fallback this function exists to provide whenever a real provider
        # is unreachable or misconfigured.
        text_hash = hashlib.md5(text.encode()).hexdigest()
        needed = settings.VECTOR_DIMENSION * 2
        extended_hash = (text_hash * (needed // len(text_hash) + 1))[:needed]

        # Convert hash to float values in [-1, 1]
        mock_embedding = []
        for i in range(settings.VECTOR_DIMENSION):
            # Use different bytes of hash for each dimension
            byte_val = int(extended_hash[i * 2:i * 2 + 2], 16)
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


async def embed_text(text: str, *, input_type: Optional[str] = None) -> Dict:
    """Public API for embedding single text. `input_type="query"|"document"`
    only affects the Voyage provider — see EmbeddingService.embed_text()."""
    return await EmbeddingService.embed_text(text, input_type=input_type)


async def embed_texts(texts: List[str], *, input_type: Optional[str] = None) -> List[Dict]:
    """Public API for embedding multiple texts. `input_type` — see embed_text()."""
    return await EmbeddingService.embed_texts(texts, input_type=input_type)
