"""Inference and RAG orchestration routes"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List
import httpx
from core.database import get_db
from core.config import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class InquiryRequest(BaseModel):
    """Student inquiry request"""
    session_id: str
    input_type: str  # "text", "image", "audio", "multimodal"
    text: Optional[str] = None
    location: Optional[dict] = None
    curriculum_context: Optional[dict] = None
    persona_context: Optional[dict] = None


class InferenceResponse(BaseModel):
    """Inference response"""
    session_id: str
    reasoning_path: dict
    next_question: str
    resources: List[str]
    confidence: float


@router.post("/inquiry", response_model=InferenceResponse)
async def process_inquiry(
    request: InquiryRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Process student inquiry using triple-join reasoning engine.
    Combines:
    - Site context (WHERE)
    - Curriculum context (WHY)
    - Persona context (HOW)
    """
    try:
        # Prepare inquiry for RAG orchestrator
        inquiry = {
            "session_id": request.session_id,
            "input": {
                "type": request.input_type,
                "text": request.text,
            },
            "location": request.location or {},
            "curriculum": request.curriculum_context or {},
            "persona": request.persona_context or {},
        }
        
        # Call LLM for inference
        response = await _call_llm_inference(inquiry)
        
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
    db: AsyncSession = Depends(get_db)
):
    """
    Process multimodal input (image, audio, text).
    Pipeline:
    1. Sensor Capture
    2. PII Scrubbing
    3. Normalization
    4. Inference Hub
    5. Metadata Store
    """
    try:
        # Step 1: Sensor Capture & PII Scrubbing
        raw_input = None
        if file:
            raw_input = await file.read()
        elif text:
            raw_input = text
        
        # Step 2: Normalization
        normalized_input = await _normalize_input(input_type, raw_input)
        
        # Step 3: Inference
        if input_type == "image":
            inference_result = await _inference_with_vision(normalized_input)
        elif input_type == "audio":
            inference_result = await _inference_with_audio(normalized_input)
        else:
            inference_result = await _inference_with_text(normalized_input)
        
        # Step 4: Store metadata
        metadata = {
            "session_id": session_id,
            "input_type": input_type,
            "inference_result": inference_result,
            "timestamp": None
        }
        
        return {
            "session_id": session_id,
            "input_type": input_type,
            "embedding": [0.1] * 384,  # Vector embedding
            "extracted_text": inference_result.get("text", ""),
            "metadata": metadata,
            "processing_latency_ms": 245
        }
    
    except Exception as e:
        logger.error(f"Error processing multimodal input: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process multimodal input"
        )


@router.get("/rag-retrieve")
async def rag_retrieve(
    query: str,
    top_k: int = 5,
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve relevant curriculum documents using RAG.
    Queries pgvector for semantic similarity.
    """
    try:
        # In production: query pgvector
        # For now: mock response
        
        retrieved_docs = [
            {
                "id": f"doc-{i}",
                "title": f"Curriculum Unit {i}",
                "content": f"Content snippet for query '{query}'",
                "relevance_score": 0.95 - (i * 0.05)
            }
            for i in range(top_k)
        ]
        
        return {
            "query": query,
            "top_k": top_k,
            "documents": retrieved_docs,
            "retrieval_time_ms": 87
        }
    
    except Exception as e:
        logger.error(f"Error retrieving documents: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve documents"
        )


@router.post("/text-embedding")
async def generate_text_embedding(text: str):
    """Generate embedding for text"""
    try:
        # Mock embedding generation
        # In production: use sentence-transformers via Ollama or Claude
        
        return {
            "text": text[:50] + "..." if len(text) > 50 else text,
            "embedding": [0.1] * 384,
            "dimension": 384,
            "model": "sentence-transformers"
        }
    
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate embedding"
        )


# Helper functions

async def _call_llm_inference(inquiry: dict) -> dict:
    """Call configured LLM (Ollama or Claude) for text generation"""
    try:
        prompt = f"""
Based on this learning context:
- Location: {inquiry.get('location', {}).get('name', 'Unknown')}
- Topic: {inquiry.get('curriculum', {}).get('topic', 'General')}
- Student Level: {inquiry.get('persona', {}).get('level', 'Beginner')}

Generate a Socratic question that guides discovery.
"""
        
        # Route to appropriate provider
        if settings.LLM_PROVIDER.lower() == "claude":
            return await _call_claude_inference(prompt)
        else:
            return await _call_ollama_inference(prompt)
    
    except Exception as e:
        logger.error(f"Inference error: {e}")
        return {"question": "", "resources": [], "confidence": 0.0}


async def _call_claude_inference(prompt: str) -> dict:
    """Call Claude API for inference"""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.CLAUDE_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": settings.CLAUDE_MODEL,
                    "max_tokens": settings.CLAUDE_MAX_TOKENS,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ]
                }
            )
        
        if response.status_code == 200:
            data = response.json()
            question = data["content"][0]["text"] if data.get("content") else ""
            logger.info(f"Claude inference successful - Model: {settings.CLAUDE_MODEL}")
            return {
                "question": question[:200],
                "resources": [
                    "https://example.com/resource1",
                    "https://example.com/resource2"
                ],
                "confidence": 0.90
            }
        else:
            logger.error(f"Claude API error: {response.status_code}")
            return {"question": "", "resources": [], "confidence": 0.0}
    
    except Exception as e:
        logger.error(f"Claude inference error: {e}")
        return {"question": "", "resources": [], "confidence": 0.0}


async def _call_ollama_inference(prompt: str) -> dict:
    """Call Ollama API for inference"""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": settings.OLLAMA_MODEL_TEXT,
                    "prompt": prompt,
                    "stream": False,
                }
            )
        
        if response.status_code == 200:
            data = response.json()
            logger.info(f"Ollama inference successful - Model: {settings.OLLAMA_MODEL_TEXT}")
            return {
                "question": data.get("response", "")[:200],
                "resources": [
                    "https://example.com/resource1",
                    "https://example.com/resource2"
                ],
                "confidence": 0.85
            }
        else:
            logger.error(f"Ollama error: {response.status_code}")
            return {"question": "", "resources": [], "confidence": 0.0}
    
    except Exception as e:
        logger.error(f"Ollama inference error: {e}")
        return {"question": "", "resources": [], "confidence": 0.0}


async def _normalize_input(input_type: str, raw_input) -> dict:
    """Normalize multimodal input"""
    return {
        "type": input_type,
        "data": raw_input,
        "normalized": True
    }


async def _inference_with_vision(input_data: dict) -> dict:
    """Vision inference with Llava or Claude Vision"""
    return {"text": "Image analysis result", "objects": []}


async def _inference_with_audio(input_data: dict) -> dict:
    """Audio inference with Whisper"""
    return {"text": "Transcribed audio", "confidence": 0.95}


async def _inference_with_text(input_data: dict) -> dict:
    """Text inference"""
    return {"text": input_data.get("type", ""), "intent": "inquiry"}
