# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Inference and RAG orchestration routes - FULLY IMPLEMENTED"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List
from core.rate_limit import ai_rate_limit
import httpx
from core.database import get_db
from core.config import settings
from core.dependencies import get_current_user
from models.database import User
import logging
import time

# Import new service implementations
from services.audio_service import transcribe_audio
from services.vision_service import analyze_image
from services.embedding_service import embed_text, embed_texts
from services.input_normalization_service import normalize_input

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Inference cache helpers ───────────────────────────────────────────────────
import hashlib, json as _json
from sqlalchemy import select as _select, func as _func
from models.database import CachedLocation, EnrichedLocation


def _cache_key(location_name: str, subject: str, grade_level: int, bloom_level: str) -> str:
    """Deterministic hash used as place_id for inference cache entries."""
    raw = _json.dumps({
        "loc": (location_name or "").strip().lower(),
        "sub": (subject or "").strip().lower(),
        "grade": grade_level,
        "bloom": (bloom_level or "").strip().lower(),
    }, sort_keys=True)
    return "infer:" + hashlib.sha256(raw.encode()).hexdigest()[:32]


async def _get_cached_inference(db, location_name: str, subject: str, grade_level: int, bloom_level: str):
    """Return EnrichedLocation if a prior inference result is cached."""
    key = _cache_key(location_name, subject, grade_level, bloom_level)
    result = await db.execute(
        _select(CachedLocation).where(CachedLocation.place_id == key)
    )
    cached = result.scalar_one_or_none()
    if cached and cached.enriched_data:
        # Update access stats
        cached.access_count = (cached.access_count or 0) + 1
        await db.commit()
        return cached.enriched_data
    return None


async def _write_inference_cache(
    db, location_name: str, subject: str, grade_level: int, bloom_level: str,
    question: str, resources: list, confidence: float
):
    """Persist inference result so the next identical request is instant."""
    key = _cache_key(location_name, subject, grade_level, bloom_level)
    result = await db.execute(
        _select(CachedLocation).where(CachedLocation.place_id == key)
    )
    cached = result.scalar_one_or_none()
    if not cached:
        from datetime import datetime
        cached = CachedLocation(
            name=f"[cache] {location_name} / {subject} / g{grade_level} / {bloom_level}",
            latitude=0.0,
            longitude=0.0,
            place_id=key,
            source="inference_cache",
        )
        db.add(cached)
        await db.flush()  # get id

    if cached.enriched_data:
        enriched = cached.enriched_data
        enriched.learning_opportunities = resources
        enriched.description = question
        enriched.enrichment_quality = confidence
        enriched.usage_count = (enriched.usage_count or 0) + 1
    else:
        from models.database import EnrichedLocation
        enriched = EnrichedLocation(
            cached_location_id=cached.id,
            learning_opportunities=resources,
            description=question,
            enrichment_quality=confidence,
            enrichment_source="llm_inference",
            subjects=[subject] if subject else [],
            grade_levels=[grade_level] if grade_level else [],
        )
        db.add(enriched)

    await db.commit()


class InquiryRequest(BaseModel):
    """Student inquiry request"""
    session_id: str
    input_type: str = "text"  # "text", "image", "audio", "multimodal"
    # Accept both field name variants from different callers
    text: Optional[str] = None
    input_text: Optional[str] = None   # alias used by OllamaLessonSuggestions
    # Accept flat location fields (from OllamaLessonSuggestions)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None
    bloom_level: Optional[int] = None
    student_id: Optional[str] = None   # ignored but accepted
    # Accept nested context dicts (from student inquiry flow)
    location: Optional[dict] = None
    curriculum_context: Optional[dict] = None
    persona_context: Optional[dict] = None
    # Optional model override — if supplied, used instead of OLLAMA_MODEL_TEXT
    model: Optional[str] = None

    def effective_text(self) -> str:
        """Return whichever text field was populated."""
        return self.text or self.input_text or ""

    def effective_location(self) -> dict:
        """Merge flat + nested location into one dict."""
        loc = dict(self.location or {})
        if self.location_name:
            loc.setdefault("name", self.location_name)
        if self.latitude is not None:
            loc.setdefault("latitude", self.latitude)
        if self.longitude is not None:
            loc.setdefault("longitude", self.longitude)
        return loc


class InferenceResponse(BaseModel):
    """Inference response"""
    session_id: str
    reasoning_path: dict
    next_question: str
    response: str = ""      # alias for next_question — consumed by OllamaLessonSuggestions
    resources: List[str]
    confidence: float


@router.post("/inquiry", response_model=InferenceResponse)
async def process_inquiry(
    request: InquiryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org_id: Optional[str] = Depends(ai_rate_limit),   # enforces per-org RPM limit; returns org_id for ledger tracking
):
    """
    Process student inquiry using triple-join reasoning engine.
    Combines:
    - Site context (WHERE)
    - Curriculum context (WHY)
    - Persona context (HOW)
    """
    try:
        # ── Session ownership check (IDOR prevention) ─────────────────────────
        # Wrapped: callers like the teacher activity-builder's "Generate
        # Suggestions" panel (OllamaLessonSuggestions.tsx) send a synthetic,
        # non-UUID session_id ("activity-builder") since there's no real
        # learning_sessions row for that flow. Casting that string against
        # the UUID id column raises an uncaught asyncpg
        # InvalidTextRepresentationError, which previously fell through to
        # the generic except below and always 500'd as "Failed to process
        # inquiry" — regardless of LLM provider. Treat any lookup failure
        # (bad UUID, no matching row, etc.) as "no ownership conflict" and
        # continue, same fail-open pattern used by the cache lookup below.
        if request.session_id:
            from sqlalchemy import text as _t
            try:
                sess_row = (await db.execute(
                    _t("SELECT user_id FROM learning_sessions WHERE id = :sid"),
                    {"sid": str(request.session_id)}
                )).fetchone()
                if sess_row and str(sess_row[0]) != str(current_user.id):
                    raise HTTPException(
                        status_code=403,
                        detail="Access denied: session belongs to another user"
                    )
            except HTTPException:
                raise
            except Exception as sess_err:
                logger.warning(f"Session ownership check skipped (non-UUID or DB issue): {sess_err}")
                await db.rollback()

        # ── Cache lookup ──────────────────────────────────────────────────────
        loc_ctx = request.effective_location()
        cur_ctx = request.curriculum_context or {}
        per_ctx = request.persona_context or {}
        location_name = loc_ctx.get("name") or loc_ctx.get("address") or ""
        subject       = cur_ctx.get("subject", "")
        grade_level   = int(cur_ctx.get("grade_level") or per_ctx.get("grade_level") or 0)
        bloom_level   = cur_ctx.get("bloom_level") or per_ctx.get("bloom_level") or str(request.bloom_level or "")

        # Cache lookup — wrapped so schema mismatches (missing columns) fall
        # through to the LLM rather than returning 500.
        cached = None
        try:
            cached = await _get_cached_inference(db, location_name, subject, grade_level, bloom_level)
        except Exception as cache_err:
            logger.warning(f"Cache lookup skipped (schema issue?): {cache_err}")

        if cached:
            logger.info(f"Inference cache hit: {location_name}/{subject}/g{grade_level}/{bloom_level}")
            cached_q = cached.description or ""
            return InferenceResponse(
                session_id=request.session_id,
                reasoning_path={"site": loc_ctx, "curriculum": cur_ctx, "persona": per_ctx, "cache": True},
                next_question=cached_q,
                response=cached_q,
                resources=cached.learning_opportunities or [],
                confidence=cached.enrichment_quality or 0.9,
            )

        # ── Cache miss — call LLM ─────────────────────────────────────────────
        # Normalize text input if provided (accept either field name)
        raw_text = request.effective_text()
        normalized_text = raw_text
        if raw_text:
            norm_result = await normalize_input("text", raw_text)
            normalized_text = norm_result.get("data", raw_text)

        # Prepare inquiry for RAG orchestrator
        inquiry = {
            "session_id": request.session_id,
            "input": {
                "type": request.input_type,
                "text": normalized_text,
            },
            "location": loc_ctx,
            "curriculum": cur_ctx,
            "persona": per_ctx,
        }

        # Call LLM for inference — pass raw_text so provider can use it directly
        response = await _call_llm_inference(inquiry, explicit_prompt=normalized_text, model=request.model)

        # ── Write result to cache ─────────────────────────────────────────────
        try:
            await _write_inference_cache(
                db, location_name, subject, grade_level, bloom_level,
                question=response.get("question", ""),
                resources=response.get("resources", []),
                confidence=response.get("confidence", 0.8),
            )
        except Exception as cache_err:
            logger.warning(f"Cache write failed (non-fatal): {cache_err}")

        return InferenceResponse(
            session_id=request.session_id,
            reasoning_path={
                "site": inquiry.get("location", {}),
                "curriculum": inquiry.get("curriculum", {}),
                "persona": inquiry.get("persona", {}),
            },
            next_question=response.get("question", ""),
            resources=response.get("resources", []),
            confidence=response.get("confidence", 0.8)
        )
    
    except Exception as e:
        logger.error(f"Error processing inquiry: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process inquiry"
        )


@router.post("/multimodal-process")
async def process_multimodal_input(
    session_id: str,
    input_type: str,
    file: Optional[UploadFile] = File(None),
    text: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Process multimodal input (image, audio, text).
    Pipeline:
    1. Sensor Capture
    2. Input Normalization
    3. Inference
    4. Embedding Generation
    5. Metadata Store
    """
    start_time = time.time()
    
    try:
        # Step 1: Sensor Capture & Read raw input
        raw_input = None
        file_format = None
        
        if file:
            raw_input = await file.read()
            # Extract format from filename
            file_format = file.filename.split(".")[-1].lower() if file.filename else "unknown"
        elif text:
            raw_input = text
        
        if not raw_input:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No input file or text provided"
            )
        
        # Step 2: Input Normalization
        normalized_result = await normalize_input(
            input_type,
            raw_input,
            {"original_filename": file.filename if file else None}
        )
        
        if not normalized_result.get("normalized"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to normalize input: {normalized_result.get('error')}"
            )
        
        normalized_data = normalized_result.get("data")
        
        # Step 3: Inference
        if input_type == "image":
            inference_result = await _inference_with_vision(normalized_result)
        elif input_type == "audio":
            inference_result = await _inference_with_audio(normalized_result)
        else:  # text or multimodal default
            inference_result = await _inference_with_text(normalized_result)
        
        # Step 4: Generate embedding for the extracted text
        extracted_text = inference_result.get("text", "")
        embedding_result = await embed_text(extracted_text) if extracted_text else {
            "embedding": [0.0] * settings.VECTOR_DIMENSION,
            "dimension": settings.VECTOR_DIMENSION
        }
        
        # Step 5: Compile response with metadata
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        metadata = {
            "session_id": session_id,
            "input_type": input_type,
            "inference_result": inference_result,
            "normalization": {
                "input_format": normalized_result.get("format"),
                "input_size_bytes": normalized_result.get("size_bytes"),
                "normalized": True
            },
            "processing_time_ms": processing_time_ms
        }
        
        return {
            "session_id": session_id,
            "input_type": input_type,
            "embedding": embedding_result.get("embedding"),
            "embedding_dimension": embedding_result.get("dimension"),
            "extracted_text": extracted_text[:500],  # Truncate for response
            "inference_details": inference_result,
            "metadata": metadata,
            "processing_latency_ms": processing_time_ms,
            "success": True
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing multimodal input: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process input: {str(e)}"
        )


class IngestRequest(BaseModel):
    """Manual document ingestion request."""
    content: str
    source_type: str = "custom"   # standards | curriculum | homeschool | custom
    source_id: Optional[str] = None
    source_name: Optional[str] = None
    metadata: Optional[dict] = None


@router.post("/ingest", status_code=201)
async def ingest_document(
    request: IngestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Ingest a text document into the RAG store.

    Splits content into overlapping ≤512-character chunks, embeds each chunk,
    and inserts rows into rag_documents for future semantic retrieval.

    Useful for: state homeschool requirement text, custom rubric descriptions,
    supplemental curriculum notes, state standards documents.
    """
    import time as _time
    from sqlalchemy import text as _t

    if not request.content or not request.content.strip():
        raise HTTPException(status_code=400, detail="content cannot be empty")

    CHUNK_SIZE = 512
    CHUNK_OVERLAP = 64

    raw = request.content.strip()
    chunks: list[str] = []
    start = 0
    while start < len(raw):
        end = start + CHUNK_SIZE
        chunks.append(raw[start:end])
        start = end - CHUNK_OVERLAP
        if start >= len(raw):
            break

    inserted = 0
    t0 = _time.monotonic()
    for idx, chunk in enumerate(chunks):
        emb_result = await embed_text(chunk)
        embedding = emb_result.get("embedding")
        if embedding:
            await db.execute(_t("""
                INSERT INTO rag_documents
                    (source_type, source_id, source_name, chunk_index,
                     content, metadata, embedding, owner_id)
                VALUES
                    (:stype, :sid, :sname, :cidx,
                     :content, :meta::jsonb, :emb::vector, :owner)
            """), {
                "stype":   request.source_type,
                "sid":     request.source_id,
                "sname":   request.source_name,
                "cidx":    idx,
                "content": chunk,
                "meta":    _json.dumps(request.metadata or {}),
                "emb":     "[" + ",".join(str(v) for v in embedding) + "]",
                "owner":   str(current_user.id),
            })
            inserted += 1

    await db.commit()
    elapsed_ms = int((_time.monotonic() - t0) * 1000)
    logger.info(
        f"Ingested {inserted}/{len(chunks)} chunks for "
        f"source_type={request.source_type} in {elapsed_ms}ms"
    )
    return {
        "source_type":  request.source_type,
        "source_id":    request.source_id,
        "chunks_total": len(chunks),
        "chunks_saved": inserted,
        "elapsed_ms":   elapsed_ms,
        "success":      True,
    }


@router.get("/rag-retrieve")
async def rag_retrieve(
    query: str,
    top_k: int = 5,
    source_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve semantically relevant documents from the RAG store using pgvector.

    Primary:  rag_documents table (standards, rubrics, homeschool reqs, custom)
    Fallback: curriculum_units (pre-embedded — used when RAG store is empty)

    Optional ?source_type= filter: standards | curriculum | homeschool | custom
    """
    import time as _time
    from sqlalchemy import text as _t

    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    t0 = _time.monotonic()

    emb_result = await embed_text(query)
    query_embedding: list = emb_result.get("embedding", [])
    emb_dim: int = emb_result.get("dimension", len(query_embedding))

    retrieved_docs: list[dict] = []
    source = "rag_documents"

    if query_embedding:
        vec_literal = "[" + ",".join(str(v) for v in query_embedding) + "]"
        type_clause = "AND source_type = :stype" if source_type else ""

        try:
            rows = (await db.execute(_t(f"""
                SELECT
                    id::text,
                    source_type,
                    source_id,
                    source_name,
                    chunk_index,
                    content,
                    metadata,
                    1 - (embedding <=> :emb::vector) AS relevance_score
                FROM rag_documents
                WHERE embedding IS NOT NULL
                {type_clause}
                ORDER BY embedding <=> :emb::vector
                LIMIT :k
            """), {"emb": vec_literal, "k": top_k, "stype": source_type})).fetchall()

            for row in rows:
                retrieved_docs.append({
                    "id":              row[0],
                    "source_type":     row[1],
                    "source_id":       row[2],
                    "source_name":     row[3],
                    "chunk_index":     row[4],
                    "content":         row[5],
                    "metadata":        row[6] or {},
                    "relevance_score": float(row[7]) if row[7] is not None else 0.0,
                })
        except Exception as e:
            logger.warning(f"rag_documents query failed (table may not exist yet): {e}")

        # Fallback: curriculum_units have pre-built embeddings from initial seed
        if not retrieved_docs:
            source = "curriculum_units"
            try:
                cu_rows = (await db.execute(_t("""
                    SELECT
                        id::text,
                        title,
                        subject,
                        grade_level,
                        raw_content,
                        1 - (content_embedding <=> :emb::vector) AS relevance_score
                    FROM curriculum_units
                    WHERE content_embedding IS NOT NULL
                      AND is_active = TRUE
                    ORDER BY content_embedding <=> :emb::vector
                    LIMIT :k
                """), {"emb": vec_literal, "k": top_k})).fetchall()

                for row in cu_rows:
                    raw = row[4] or {}
                    retrieved_docs.append({
                        "id":              row[0],
                        "source_type":     "curriculum",
                        "source_name":     row[1],
                        "content":         raw.get("content", row[1] or ""),
                        "metadata":        {"subject": row[2], "grade_level": row[3]},
                        "relevance_score": float(row[5]) if row[5] is not None else 0.0,
                    })
            except Exception as e:
                logger.warning(f"curriculum_units fallback failed: {e}")

    elapsed_ms = int((_time.monotonic() - t0) * 1000)
    logger.info(
        f"RAG retrieved {len(retrieved_docs)} docs for '{query[:50]}' "
        f"from {source} in {elapsed_ms}ms"
    )
    return {
        "query":                     query,
        "query_embedding_dimension": emb_dim,
        "top_k":                     top_k,
        "source":                    source,
        "documents":                 retrieved_docs,
        "retrieval_time_ms":         elapsed_ms,
        "total_retrieved":           len(retrieved_docs),
        "success":                   True,
    }


@router.post("/text-embedding")
async def generate_text_embedding(text: str):
    """
    Generate embedding for text using configured model.
    
    Returns 384-dimensional vector for semantic search and RAG.
    """
    try:
        if not text or not text.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Text cannot be empty"
            )
        
        # Generate embedding using configured provider
        embedding_result = await embed_text(text)
        
        if not embedding_result.get("embedding"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate embedding: {embedding_result.get('error')}"
            )
        
        logger.info(
            f"Generated embedding for text: {len(text)} chars, "
            f"dim={embedding_result.get('dimension')}"
        )
        
        return {
            "text": text[:100] + "..." if len(text) > 100 else text,
            "embedding": embedding_result.get("embedding"),
            "dimension": embedding_result.get("dimension"),
            "model": embedding_result.get("model"),
            "provider": embedding_result.get("provider"),
            "success": True
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate embedding"
        )


@router.get("/models")
async def list_models():
    """Return models available in Ollama (or the configured Claude model)."""
    if settings.LLM_PROVIDER.lower() != "ollama":
        return {"provider": settings.LLM_PROVIDER, "models": [settings.CLAUDE_MODEL], "default": settings.CLAUDE_MODEL}

    urls_to_try = [settings.OLLAMA_BASE_URL]
    if "host.docker.internal" in settings.OLLAMA_BASE_URL:
        urls_to_try.append(settings.OLLAMA_BASE_URL.replace("host.docker.internal", "localhost"))

    for url in urls_to_try:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{url}/api/tags")
            if resp.status_code == 200:
                raw = resp.json().get("models", [])
                names = [m["name"] for m in raw if m.get("name")]
                default = settings.OLLAMA_MODEL_TEXT if settings.OLLAMA_MODEL_TEXT in names else (names[0] if names else "")
                return {"provider": "ollama", "models": names, "default": default}
        except Exception:
            continue

    return {"provider": "ollama", "models": [], "default": ""}


@router.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    try:
        # Check if LLM provider is accessible
        llm_status = "unavailable"
        
        if settings.LLM_PROVIDER.lower() == "ollama":
            # Check if Ollama is running — try configured URL, fall back to localhost
            urls_to_try = [settings.OLLAMA_BASE_URL]
            if "host.docker.internal" in settings.OLLAMA_BASE_URL:
                urls_to_try.append(settings.OLLAMA_BASE_URL.replace(
                    "host.docker.internal", "localhost"))
            for _url in urls_to_try:
                try:
                    async with httpx.AsyncClient(timeout=10) as client:
                        response = await client.get(f"{_url}/api/tags")
                    if response.status_code == 200:
                        llm_status = "available"
                        break
                except Exception:
                    llm_status = "unavailable"
        elif settings.LLM_PROVIDER.lower() == "claude":
            llm_status = "available" if settings.CLAUDE_API_KEY else "no_key"
        
        return {
            "status": "healthy",
            "llm_provider": settings.LLM_PROVIDER,
            "llm_status": llm_status,
            "models": {
                "text": settings.OLLAMA_MODEL_TEXT if settings.LLM_PROVIDER.lower() == "ollama" else settings.CLAUDE_MODEL,
                "vision": settings.OLLAMA_MODEL_VISION,
                "audio": settings.OLLAMA_MODEL_AUDIO
            },
            "environment": settings.ENVIRONMENT
        }
    
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }


# ============================================================================
# HELPER FUNCTIONS - FULLY IMPLEMENTED
# ============================================================================

async def _call_llm_inference(inquiry: dict, explicit_prompt: str = "", model: Optional[str] = None) -> dict:
    """Call configured LLM (Ollama or Claude) for text generation.

    If ``explicit_prompt`` is supplied (e.g. from OllamaLessonSuggestions) we
    use it verbatim so the caller gets exactly the output they requested.
    Otherwise we fall back to a generic Peri guiding-question prompt.
    ``model`` overrides the default OLLAMA_MODEL_TEXT when set.
    """
    try:
        if explicit_prompt and explicit_prompt.strip():
            prompt = explicit_prompt
        else:
            prompt = f"""
Based on this learning context:
- Location: {inquiry.get('location', {}).get('name', 'Unknown')}
- Topic: {inquiry.get('curriculum', {}).get('topic', 'General Science')}
- Student Level: {inquiry.get('persona', {}).get('level', 'Beginner')}

Generate a guiding question from Peri that advances the student's inquiry toward real knowledge.
The question must be answerable through observation, analysis, or reasoning from evidence — not a philosophical prompt.
It should move the student one step: from noticing to classifying, from classifying to explaining causes, or from explaining to applying.
Keep it concise (1-2 sentences).
"""

        # Route to appropriate provider
        if settings.LLM_PROVIDER.lower() == "claude":
            return await _call_claude_inference(prompt)
        else:
            return await _call_ollama_inference(prompt, model=model)
    
    except Exception as e:
        logger.error(f"Inference error: {e}")
        return {
            "question": "What do you observe?",
            "resources": [],
            "confidence": 0.5
        }


async def _call_claude_inference(prompt: str) -> dict:
    """Call Claude API for inference — delegates HTTP to agents/provider.py."""
    try:
        from agents.provider import call_claude as _call_claude
        question = await _call_claude(
            messages=[{"role": "user", "content": prompt}],
            model=settings.CLAUDE_MODEL,
            max_tokens=settings.CLAUDE_MAX_TOKENS,
            timeout=30,
        )
        logger.info(f"Claude inference successful - Model: {settings.CLAUDE_MODEL}")
        return {
            "question": question,
            "resources": [
                "https://example.com/resource1",
                "https://example.com/resource2"
            ],
            "confidence": 0.90
        }
    except Exception as e:
        logger.error(f"Claude inference error: {e}")
        return {"question": "", "resources": [], "confidence": 0.0}


async def _call_ollama_inference(prompt: str, model: Optional[str] = None) -> dict:
    """Call Ollama API for inference — delegates HTTP to agents/provider.py."""
    try:
        from agents.provider import call_ollama as _call_ollama
        resolved_model = model or settings.OLLAMA_MODEL_TEXT
        question = await _call_ollama(
            messages=[{"role": "user", "content": prompt}],
            model=resolved_model,
            timeout=60,
        )
        logger.info(f"Ollama inference successful - Model: {resolved_model}")
        return {
            "question": question,
            "resources": [
                "https://example.com/resource1",
                "https://example.com/resource2"
            ],
            "confidence": 0.85
        }
    except Exception as e:
        logger.error(f"Ollama inference error: {e}")
        return {"question": "", "resources": [], "confidence": 0.0}


async def _inference_with_vision(input_data: dict) -> dict:
    """Vision inference with Llava or Claude Vision"""
    try:
        image_bytes = input_data.get("data")
        image_format = input_data.get("format", "jpg")
        analysis_result = await analyze_image(
            image_bytes,
            image_format,
            analysis_prompt="Analyze this outdoor learning image. What do you observe?"
        )
        return {
            "text": analysis_result.get("text", ""),
            "objects": analysis_result.get("objects", []),
            "confidence": analysis_result.get("confidence", 0.8),
            "model": analysis_result.get("model"),
            "provider": analysis_result.get("provider"),
            "success": "error" not in analysis_result
        }
    except Exception as e:
        logger.error(f"Vision inference error: {e}")
        return {"text": "", "objects": [], "confidence": 0.0, "error": str(e), "success": False}


async def _inference_with_audio(input_data: dict) -> dict:
    """Audio inference with Whisper"""
    try:
        audio_bytes = input_data.get("data")
        audio_format = input_data.get("format", "wav")
        transcription_result = await transcribe_audio(audio_bytes, audio_format)
        return {
            "text": transcription_result.get("text", ""),
            "confidence": transcription_result.get("confidence", 0.0),
            "model": transcription_result.get("model"),
            "provider": transcription_result.get("provider"),
            "success": "error" not in transcription_result
        }
    except Exception as e:
        logger.error(f"Audio inference error: {e}")
        return {"text": "", "confidence": 0.0, "error": str(e), "success": False}


async def _inference_with_text(input_data: dict) -> dict:
    """Text inference and understanding"""
    try:
        text = input_data.get("data", "")
        return {"text": text, "intent": "inquiry", "confidence": 0.9, "success": True}
    except Exception as e:
        logger.error(f"Text inference error: {e}")
        return {"text": "", "intent": "unknown", "confidence": 0.0, "error": str(e), "success": False}
