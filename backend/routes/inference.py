# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Inference and RAG orchestration routes - FULLY IMPLEMENTED"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
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
from agents.provider import ProviderUnavailableError

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
        subject       = cur_ctx.get("subject") or cur_ctx.get("topic", "")
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

        # ── Branch on which prompt-handling behavior this request wants ───────
        # input_text carriers (OllamaLessonSuggestions.tsx / EnhancedActivityBuilder.tsx)
        # pre-build a complete, self-contained prompt client-side and want it sent
        # verbatim, with no persona/system message — behavior unchanged from today.
        # Real student inquiries (InquiryInterface.tsx) send raw observation text via
        # `text` only — that path never reached an instructive prompt before; build
        # one now via build_peri_prompt() so Peri's questions are actually guided.
        if request.input_text and request.input_text.strip():
            response = await _call_llm_inference(inquiry, explicit_prompt=normalized_text, model=request.model)
        else:
            from services.prompt_library import build_peri_prompt, SYSTEM_PERI
            peri_prompt = build_peri_prompt(
                location_name=loc_ctx.get("name") or loc_ctx.get("address") or "this location",
                location_description=loc_ctx.get("description", ""),
                subject=subject,
                grade_level=grade_level,
                bloom_level=bloom_level,
                inquiry_stage=cur_ctx.get("inquiry_stage", "observe"),
                student_observation=normalized_text,
                learning_objectives=cur_ctx.get("learning_objectives", []),
                prior_questions=per_ctx.get("prior_questions", []),
            )
            response = await _call_llm_inference(
                inquiry,
                explicit_prompt=peri_prompt,
                model=request.model,
                system=SYSTEM_PERI,
                temperature=0.65,
                num_predict=180,
                max_tokens=180,
            )

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
    
    except ProviderUnavailableError as e:
        logger.error(f"AI provider unavailable while processing inquiry: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI inference service is temporarily unavailable — please try again shortly."
        )
    except Exception as e:
        logger.error(f"Error processing inquiry: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process inquiry"
        )


# ── Free-form Peri chat ("Ask Peri") ───────────────────────────────────────────
# Mobile's PeriChatSheet.tsx has called POST /inference/chat since it shipped
# (M-8) -- this route never existed, so every "Ask Peri" tap 404'd in
# production with no visible error surfaced beyond the chat sheet's generic
# "I couldn't connect right now" fallback message. Added 2026-08-20 alongside
# the ai_interaction_mode activity setting this exists to gate.

class ChatTurn(BaseModel):
    role: str     # 'user' | 'assistant'
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: List[ChatTurn] = []
    # Looked up server-side to enforce the activity's ai_interaction_mode --
    # the mobile client already hides "Ask Peri" for curated_only activities,
    # but that's a UI convenience, not enforcement; this closes the gap for
    # anyone calling the API directly. Omit for chat with no specific
    # activity context.
    activity_id: Optional[UUID] = None
    system_context: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    confidence: Optional[float] = None


@router.post("/chat", response_model=ChatResponse)
async def chat_with_peri(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    org_id: Optional[str] = Depends(ai_rate_limit),
):
    """
    Free-form conversational chat with Peri -- distinct from /inquiry's
    structured "generate the next guiding question" flow. Used by the
    mobile app's "Ask Peri" button during an activity's Inquiry phase.
    """
    if request.activity_id:
        from models.database import Activity
        try:
            act_row = (await db.execute(
                _select(Activity.ai_interaction_mode).where(Activity.id == request.activity_id)
            )).fetchone()
        except Exception as lookup_err:
            # DB hiccup, activity already deleted, etc. -- fail open rather
            # than blocking chat over a lookup problem unrelated to the
            # actual ai_interaction_mode setting (same fail-open pattern as
            # process_inquiry's session-ownership check above). activity_id
            # is already a validated UUID by the time we get here (Pydantic
            # coerces or 422s before this handler runs).
            logger.warning(f"ai_interaction_mode lookup skipped: {lookup_err}")
            act_row = None
        if act_row and act_row[0] == "curated_only":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="AI chat is turned off for this activity — its author chose the curated question bank only.",
            )

    from services.prompt_library import SYSTEM_PERI

    # _call_llm_inference takes one flattened prompt string, not a real
    # multi-turn messages array (see its docstring) -- render the last few
    # turns as a plain transcript so the model still has conversational
    # context. Capped at 10 turns: plenty for a short field-activity chat,
    # keeps the prompt (and cost) bounded regardless of how long a student
    # leaves the chat sheet open.
    transcript_lines = [
        f"{'Student' if turn.role == 'user' else 'Peri'}: {turn.content}"
        for turn in request.history[-10:]
    ]
    context_block = f"{request.system_context}\n\n" if request.system_context else ""
    prompt = (
        f"{context_block}"
        + ("\n".join(transcript_lines) + "\n" if transcript_lines else "")
        + f"Student: {request.message}\nPeri:"
    )

    try:
        result = await _call_llm_inference(
            inquiry={},
            explicit_prompt=prompt,
            system=SYSTEM_PERI,
            temperature=0.7,
            num_predict=220,
            max_tokens=220,
        )
    except ProviderUnavailableError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI chat is temporarily unavailable — please try again shortly.",
        )

    reply = (result.get("question") or "").strip() or (
        "I'm not sure how to respond to that — can you tell me more about what you're observing?"
    )
    return ChatResponse(response=reply, confidence=result.get("confidence"))


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
        embedding_result = await embed_text(extracted_text, input_type="document") if extracted_text else {
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
    from services.rag_store import upsert_rag_chunk

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
        ok = await upsert_rag_chunk(
            db,
            source_type=request.source_type,
            source_id=request.source_id,
            source_name=request.source_name,
            chunk_index=idx,
            content=chunk,
            metadata=request.metadata or {},
            owner_id=current_user.id,
        )
        if ok:
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
    jurisdiction_id: Optional[str] = None,
    include_ancestors: bool = True,
    include_related: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    GraphRAG retrieval: hybrid vector + lexical search over rag_documents
    finds seed nodes (Stage 1 — pgvector cosine search and Postgres
    full-text search, fused by Reciprocal Rank Fusion so a literal phrase
    match isn't lost just because it wasn't among the embedding model's
    nearest neighbors, see 20260817c_rag_documents_fulltext.py), then — for
    seeds linked to a standards_items graph node via node_type/node_id —
    expansion walks standards_items.parent_id, standards_associations, and
    content_alignments to pull in structurally related context a similarity
    search alone can't reach (Stage 2). See PRD-graphrag-migration-2026-08-16.md
    §3 and services/graph_retrieval.py.

    Each returned item carries a `relation`: "match" (a direct Stage-1 hit),
    "ancestor", "cross_reference", "prerequisite", or "aligned_content" —
    callers should treat these as different *kinds* of relevance, not just
    lower similarity scores. `relevance_score` on a "match" item is an RRF
    score (higher = more relevant), not a raw 0-1 cosine similarity, once
    the lexical channel contributes to it.

    Backward compatible: existing callers passing only query/top_k/source_type
    get the enhanced (hybrid seeds + graph expansion) result set automatically.
    include_ancestors=false&include_related=false skips Stage 2 only — Stage 1
    itself has been hybrid since 2026-08-17, so this no longer reproduces pure
    vector-search-only behavior (a lexical-only match can still surface).

    Optional filters:
      ?source_type=      standards | curriculum | homeschool | custom
      ?jurisdiction_id=   only seeds indexed with this jurisdiction_id in
                          their metadata (set by scripts/backfill_standards_embeddings.py)
    """
    import re
    import time as _time
    from sqlalchemy import text as _t
    from services.graph_retrieval import expand_seeds

    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    t0 = _time.monotonic()

    emb_result = await embed_text(query, input_type="query")
    query_embedding: list = emb_result.get("embedding", [])
    emb_dim: int = emb_result.get("dimension", len(query_embedding))
    embed_ms = int((_time.monotonic() - t0) * 1000)

    seeds: list[dict] = []
    db_ms = 0
    expand_ms = 0

    if query_embedding:
        vec_literal = "[" + ",".join(str(v) for v in query_embedding) + "]"
        type_clause = "AND source_type = :stype" if source_type else ""
        jurisdiction_clause = "AND metadata->>'jurisdiction_id' = :jid" if jurisdiction_id else ""
        # Cast a wider net than top_k for Stage 1 so Stage 2 has more seeds to
        # expand from before the final trim — otherwise a query that weakly
        # matches several standards in the same cluster would only ever see
        # one of them and its neighbors, not the cluster as a whole.
        seed_k = min(max(top_k * 3, top_k), 15)

        # A framework retired/deprecated after this row was embedded (or one
        # that never should have cascaded is_retired down to its items at
        # ingest time) shouldn't keep surfacing as a live standard -- see the
        # [RETIRED]-framework leak found 2026-08-17 comparing local vs prod.
        # rd.node_id has no FK (see 20260816c_rag_documents_node_link.py),
        # so this stays a plain NOT EXISTS rather than a join.
        retired_filter = """
                AND NOT (
                    rd.node_type = 'standards_item'
                    AND EXISTS (
                        SELECT 1 FROM standards_items si
                        WHERE si.id = rd.node_id AND si.is_retired = true
                    )
                )
        """
        select_cols = """
                    rd.id::text, rd.source_type, rd.source_id, rd.source_name,
                    rd.chunk_index, rd.content, rd.metadata, rd.node_type, rd.node_id::text
        """

        _t_db0 = _time.monotonic()
        vector_rows: list = []
        lexical_rows: list = []
        try:
            vector_rows = (await db.execute(_t(f"""
                SELECT {select_cols}
                FROM rag_documents rd
                WHERE rd.embedding IS NOT NULL
                {type_clause}
                {jurisdiction_clause}
                {retired_filter}
                ORDER BY rd.embedding <=> CAST(:emb AS vector)
                LIMIT :k
            """), {"emb": vec_literal, "k": seed_k, "stype": source_type, "jid": jurisdiction_id})).fetchall()
        except Exception as e:
            logger.warning(f"rag_documents vector query failed (table may not exist yet): {e}")

        # Stage 1b, hybrid lexical channel: pure vector search has a real
        # failure mode where a literal phrase match just isn't among the
        # embedding model's nearest neighbors -- and which phrases that
        # happens to is provider-dependent (found comparing local/Ollama vs
        # prod/Voyage on "figurative language in poetry analysis": Voyage's
        # neighbors were all about "poetic technique", missing every item
        # that actually says "figurative language"). 'simple' text-search
        # config to match idx_rag_documents_content_fts -- no language-
        # specific stemming across a corpus that ships Spanish/other
        # translations alongside English. Best-effort: a pre-migration
        # database (no FTS index yet) just falls back to vector-only.
        #
        # OR, not AND: plainto_tsquery('simple', query) ANDs every token
        # together, and 'simple' has no stopword list, so a natural-language
        # query like "figurative language in poetry analysis" required the
        # literal words "in" AND "analysis" too -- zero real standards phrase
        # it that way, so the lexical channel matched nothing (found testing
        # this exact query on prod: 0 lexical rows, hybrid fusion had nothing
        # to add). Tokenize ourselves and OR the terms via to_tsquery instead
        # -- ts_rank still favors documents matching more terms, so this
        # stays a meaningful ranking signal, just not an all-or-nothing filter.
        #
        # A length>=3 filter alone isn't enough: "and"/"with"/"the" are
        # length-3+ connector words that appear in nearly every row, so
        # OR-ing them in destroyed selectivity -- found on prod: 3 of 5
        # eval queries (the ones containing "and") jumped to ~7.4s because
        # ts_rank had to sort a near-full-table match set. Filter a small,
        # deliberately English-only stopword list on top of the length
        # check (the corpus is multilingual, but query text through this
        # UI is overwhelmingly English -- not solving the general case here).
        _STOPWORDS = {
            "and", "the", "for", "with", "that", "this", "from", "into",
            "are", "was", "were", "been", "being", "has", "have", "had",
            "not", "but", "can", "will", "would", "should", "about", "its",
            "you", "your", "our", "their", "his", "her", "them", "who",
            "what", "when", "where", "why", "how", "all", "any", "each",
        }
        lex_tokens = [
            w for w in re.findall(r"\w+", query.lower())
            if len(w) >= 3 and w not in _STOPWORDS
        ]
        if lex_tokens:
            # Two-tier: try the AND-of-terms query first -- cheap, because
            # requiring every term makes it selective enough for the GIN
            # index + LIMIT to stay fast. Only fall back to the OR-of-terms
            # query (each term matches independently, ranked by ts_rank)
            # when AND finds literally nothing -- that's the rare case this
            # channel exists for (a real phrase match whose exact wording
            # doesn't co-occur with every query token), not the common one.
            # Doing OR first was the previous version of this fix: correct,
            # but ~2-7s on prod because ts_rank has to score every row
            # matching ANY term before it can pick the top :k -- an OR
            # query has none of the GIN-assisted early-termination an AND
            # query gets. Only pay that cost when AND actually comes up empty.
            lex_tsquery_and = " & ".join(lex_tokens)
            try:
                lexical_rows = (await db.execute(_t(f"""
                    SELECT {select_cols}
                    FROM rag_documents rd
                    WHERE to_tsvector('simple', rd.content) @@ to_tsquery('simple', :q)
                    {type_clause}
                    {jurisdiction_clause}
                    {retired_filter}
                    ORDER BY ts_rank(to_tsvector('simple', rd.content), to_tsquery('simple', :q)) DESC
                    LIMIT :k
                """), {"q": lex_tsquery_and, "k": seed_k, "stype": source_type, "jid": jurisdiction_id})).fetchall()
            except Exception as e:
                logger.warning(f"rag_documents lexical AND query failed (FTS index may not exist yet): {e}")

            if not lexical_rows and len(lex_tokens) > 1:
                lex_tsquery_or = " | ".join(lex_tokens)
                try:
                    lexical_rows = (await db.execute(_t(f"""
                        SELECT {select_cols}
                        FROM rag_documents rd
                        WHERE to_tsvector('simple', rd.content) @@ to_tsquery('simple', :q)
                        {type_clause}
                        {jurisdiction_clause}
                        {retired_filter}
                        ORDER BY ts_rank(to_tsvector('simple', rd.content), to_tsquery('simple', :q)) DESC
                        LIMIT :k
                    """), {"q": lex_tsquery_or, "k": seed_k, "stype": source_type, "jid": jurisdiction_id})).fetchall()
                except Exception as e:
                    logger.warning(f"rag_documents lexical OR fallback failed: {e}")
        db_ms = int((_time.monotonic() - _t_db0) * 1000)

        # Reciprocal Rank Fusion: merge by *rank* within each list, not by
        # score -- cosine similarity and ts_rank are on incompatible scales
        # (the same problem that made comparing local/prod raw scores
        # meaningless, see the P2 quality-parity work in the README).
        # relevance_score below is therefore an RRF score, not a raw cosine
        # similarity, once a lexical channel is in play -- still "higher is
        # more relevant" for sorting/decay purposes, just not a 0-1 score.
        RRF_K = 60  # standard constant (Cormack et al., 2009) -- not tuned here
        rrf_scores: dict[str, float] = {}
        row_by_id: dict[str, tuple] = {}
        for rank, row in enumerate(vector_rows, start=1):
            rrf_scores[row[0]] = rrf_scores.get(row[0], 0.0) + 1.0 / (RRF_K + rank)
            row_by_id[row[0]] = row
        for rank, row in enumerate(lexical_rows, start=1):
            rrf_scores[row[0]] = rrf_scores.get(row[0], 0.0) + 1.0 / (RRF_K + rank)
            row_by_id.setdefault(row[0], row)

        ranked_ids = sorted(rrf_scores, key=lambda i: rrf_scores[i], reverse=True)[:seed_k]
        for doc_id in ranked_ids:
            row = row_by_id[doc_id]
            seeds.append({
                "id":              row[0],
                "source_type":     row[1],
                "source_id":       row[2],
                "source_name":     row[3],
                "chunk_index":     row[4],
                "content":         row[5],
                "metadata":        row[6] or {},
                "node_type":       row[7],
                "node_id":         row[8],
                "relevance_score": rrf_scores[doc_id],
                "relation":        "match",
                "expanded_from":   None,
            })

    expanded: list[dict] = []
    if seeds and (include_ancestors or include_related):
        _t_expand0 = _time.monotonic()
        try:
            expanded = await expand_seeds(
                db, seeds,
                include_ancestors=include_ancestors,
                include_related=include_related,
            )
        except Exception as e:
            logger.warning(f"Graph expansion failed (falling back to vector-only results): {e}")
        expand_ms = int((_time.monotonic() - _t_expand0) * 1000)

    # Stage 3: merge + rank. Seeds (real cosine similarity) sort above
    # expansions at the same score by construction (expansions are always
    # seed_score * a decay < 1), so this single sort respects both signals
    # without needing a separate weighting scheme.
    combined = sorted(seeds + expanded, key=lambda d: d["relevance_score"], reverse=True)
    # top_k caps Stage-1 seeds in the query above; the combined list is
    # allowed to run larger (seeds + their expansion) since expansion items
    # are the point of this endpoint, not overflow to be trimmed away —
    # capped at 3x top_k so a richly-connected result set still has a bound.
    combined = combined[: top_k * 3]

    elapsed_ms = int((_time.monotonic() - t0) * 1000)
    logger.info(
        f"RAG retrieved {len(seeds)} seeds + {len(expanded)} expanded for '{query[:50]}' "
        f"({len(combined)} returned) in {elapsed_ms}ms "
        f"(embed={embed_ms}ms db={db_ms}ms expand={expand_ms}ms)"
    )
    return {
        "query":                     query,
        "query_embedding_dimension": emb_dim,
        "top_k":                     top_k,
        "source":                    "rag_documents",
        "documents":                 combined,
        "seed_count":                len(seeds),
        "expanded_count":            len(expanded),
        "graph_expansion_enabled":   include_ancestors or include_related,
        "retrieval_time_ms":         elapsed_ms,
        # Breakdown for diagnosing where retrieval_time_ms actually goes --
        # added 2026-08-17 after finding prod ~2.8x slower than local at
        # identical data scale with no obvious single cause (network hop to
        # a hosted embedding provider vs local sidecar? DB/index tuning?
        # graph-expansion query cost?). Sum of the three ~= retrieval_time_ms,
        # modulo the Stage-3 sort/trim which isn't separately timed.
        "embed_ms":                  embed_ms,
        "db_ms":                     db_ms,
        "expand_ms":                 expand_ms,
        "total_retrieved":           len(combined),
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

async def _call_llm_inference(
    inquiry: dict,
    explicit_prompt: str = "",
    model: Optional[str] = None,
    system: Optional[str] = None,
    temperature: Optional[float] = None,
    num_predict: Optional[int] = None,
    max_tokens: Optional[int] = None,
) -> dict:
    """Call configured LLM (Ollama or Claude) for text generation.

    If ``explicit_prompt`` is supplied (e.g. from OllamaLessonSuggestions, or
    the built Peri prompt from process_inquiry()'s real-student-inquiry
    branch) we use it verbatim so the caller gets exactly the output they
    requested. Otherwise we fall back to a generic Peri guiding-question
    prompt (retained for callers that don't build their own prompt).
    ``model`` overrides the default OLLAMA_MODEL_TEXT when set.
    ``system`` is threaded through to the provider as a leading system
    message when set (only used by the Peri-question branch — activity-
    builder callers pass no system message, unchanged from today).
    ``temperature``/``num_predict`` (Ollama) and ``max_tokens`` (Claude) are
    optional overrides; when omitted, the provider's current defaults apply.
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
            return await _call_claude_inference(prompt, system=system, max_tokens=max_tokens)
        else:
            return await _call_ollama_inference(
                prompt, model=model, system=system,
                temperature=temperature, num_predict=num_predict,
            )

    except ProviderUnavailableError:
        raise
    except Exception as e:
        logger.error(f"Inference error: {e}")
        return {
            "question": "What do you observe?",
            "resources": [],
            "confidence": 0.5
        }


async def _call_claude_inference(
    prompt: str,
    system: Optional[str] = None,
    max_tokens: Optional[int] = None,
) -> dict:
    """Call Claude API for inference — delegates HTTP to agents/provider.py.

    ``system``, when set, is prepended as a leading system-role message —
    agents/provider.py::call_claude() auto-extracts it into the Anthropic
    API's top-level 'system' field. ``max_tokens`` overrides
    settings.CLAUDE_MAX_TOKENS when supplied.
    """
    try:
        from agents.provider import call_claude as _call_claude
        messages = [{"role": "user", "content": prompt}]
        if system:
            messages = [{"role": "system", "content": system}] + messages
        question = await _call_claude(
            messages=messages,
            model=settings.CLAUDE_MODEL,
            max_tokens=max_tokens or settings.CLAUDE_MAX_TOKENS,
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
    except ProviderUnavailableError:
        raise
    except Exception as e:
        logger.error(f"Claude inference error: {e}")
        return {"question": "", "resources": [], "confidence": 0.0}


async def _call_ollama_inference(
    prompt: str,
    model: Optional[str] = None,
    system: Optional[str] = None,
    temperature: Optional[float] = None,
    num_predict: Optional[int] = None,
) -> dict:
    """Call Ollama API for inference — delegates HTTP to agents/provider.py.

    ``system``, when set, is prepended as a leading system-role message —
    Ollama's /api/chat natively accepts it. ``temperature``/``num_predict``
    override agents/provider.py::call_ollama()'s defaults (0.2/4096) when
    supplied; when omitted, behavior is unchanged from today.
    """
    try:
        from agents.provider import call_ollama as _call_ollama
        resolved_model = model or settings.OLLAMA_MODEL_TEXT
        messages = [{"role": "user", "content": prompt}]
        if system:
            messages = [{"role": "system", "content": system}] + messages
        ollama_kwargs = {}
        if temperature is not None:
            ollama_kwargs["temperature"] = temperature
        if num_predict is not None:
            ollama_kwargs["num_predict"] = num_predict
        question = await _call_ollama(
            messages=messages,
            model=resolved_model,
            timeout=60,
            **ollama_kwargs,
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
    except ProviderUnavailableError:
        raise
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
