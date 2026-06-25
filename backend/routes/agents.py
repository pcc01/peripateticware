# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Agent Layer HTTP routes — thin layer over the agent implementations.

Registered in main.py at prefix="/api/v1".

Endpoints:
  POST /agents/standards/ingest  — teacher/admin only
  POST /agents/standards/map     — teacher/admin
  POST /agents/rubric/score      — teacher/admin
  POST /agents/activity/review   — teacher/admin
  POST /agents/compliance/report — parent/teacher/admin
  GET  /agents/health            — open (mirrors inference /health pattern)
"""

import logging
from typing import Any, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.config import settings
from core.dependencies import get_current_teacher, get_current_user
from models.user import User, UserRole

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agents", tags=["agents"])


# ---------------------------------------------------------------------------
# Role helpers
# ---------------------------------------------------------------------------

def _require_teacher_or_admin(current_user: User) -> User:
    """Raises 403 if user is not TEACHER, ADMIN, or HOMESCHOOL."""
    allowed = {UserRole.TEACHER, UserRole.ADMIN, UserRole.HOMESCHOOL}
    if current_user.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher or admin access required",
        )
    return current_user


def _require_not_student(current_user: User) -> User:
    """Raises 403 if user is STUDENT."""
    if current_user.role == UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Students may not access this agent endpoint",
        )
    return current_user


# ---------------------------------------------------------------------------
# Standards ingestion
# ---------------------------------------------------------------------------

@router.post("/standards/ingest")
async def ingest_standards(
    body: dict,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Ingest a standards/taxonomy document into normalized records + embeddings."""
    from agents.standards_ingestion_agent import StandardsIngestionAgent, StandardsIngestionInput
    _require_teacher_or_admin(current_user)

    try:
        payload = StandardsIngestionInput(**body)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    agent = StandardsIngestionAgent()
    result = await agent.ingest_and_embed(payload, user_id=current_user.id, db=db)

    if result.status == "error":
        raise HTTPException(status_code=500, detail=result.error or "Ingestion failed")

    out = result.output
    return {
        "run_id": str(result.run_id),
        "provider": result.provider,
        "model": result.model,
        "latency_ms": result.latency_ms,
        "count": out.count,
        "records": [r.model_dump() for r in out.records],
        "unparsed_remainder": out.unparsed_remainder,
    }


# ---------------------------------------------------------------------------
# Standards mapping
# ---------------------------------------------------------------------------

@router.post("/standards/map")
async def map_standards(
    body: dict,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Map a student submission to the ingested standards corpus."""
    from agents.standards_mapping_agent import StandardsMappingAgent, StandardsMappingInput
    _require_teacher_or_admin(current_user)

    try:
        payload = StandardsMappingInput(**body)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    agent = StandardsMappingAgent()
    result = await agent.run_with_retrieval(payload, user_id=current_user.id, db=db)

    if result.status == "error":
        raise HTTPException(status_code=500, detail=result.error or "Mapping failed")

    out = result.output
    return {
        "run_id": str(result.run_id),
        "provider": result.provider,
        "model": result.model,
        "latency_ms": result.latency_ms,
        "mappings": [m.model_dump() for m in out.mappings],
        "overall_confidence": out.overall_confidence,
    }


# ---------------------------------------------------------------------------
# Rubric scoring
# ---------------------------------------------------------------------------

@router.post("/rubric/score")
async def score_rubric(
    body: dict,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Apply a teacher rubric to a student submission."""
    from agents.rubric_scoring_agent import RubricScoringAgent, RubricScoringInput
    _require_teacher_or_admin(current_user)

    try:
        payload = RubricScoringInput(**body)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    agent = RubricScoringAgent()
    result = await agent.run(payload, user_id=current_user.id, db=db)

    if result.status == "error":
        raise HTTPException(status_code=500, detail=result.error or "Scoring failed")

    out = result.output
    return {
        "run_id": str(result.run_id),
        "provider": result.provider,
        "model": result.model,
        "latency_ms": result.latency_ms,
        "scores": [s.model_dump() for s in out.scores],
        "total_points": out.total_points,
        "max_points": out.max_points,
        "summary": out.summary,
    }


# ---------------------------------------------------------------------------
# Activity review
# ---------------------------------------------------------------------------

@router.post("/activity/review")
async def review_activity(
    body: dict,
    current_user: User = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Generate a narrative review of a completed activity."""
    from agents.activity_review_agent import ActivityReviewAgent, ActivityReviewInput
    _require_teacher_or_admin(current_user)

    try:
        payload = ActivityReviewInput(**body)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    agent = ActivityReviewAgent()
    result = await agent.run(payload, user_id=current_user.id, db=db)

    if result.status == "error":
        raise HTTPException(status_code=500, detail=result.error or "Review generation failed")

    out = result.output
    return {
        "run_id": str(result.run_id),
        "provider": result.provider,
        "model": result.model,
        "latency_ms": result.latency_ms,
        "review_markdown": out.review_markdown,
        "suggested_next_steps": out.suggested_next_steps,
        "tone_audience": out.tone_audience,
    }


# ---------------------------------------------------------------------------
# Compliance report
# ---------------------------------------------------------------------------

@router.post("/compliance/report")
async def generate_compliance_report(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Generate a state-mandated homeschool compliance report."""
    from agents.compliance_report_agent import ComplianceReportAgent, ComplianceReportInput
    _require_not_student(current_user)

    try:
        payload = ComplianceReportInput(**body)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    agent = ComplianceReportAgent()
    result = await agent.run(payload, user_id=current_user.id, db=db)

    if result.status == "error":
        raise HTTPException(status_code=500, detail=result.error or "Report generation failed")

    out = result.output
    return {
        "run_id": str(result.run_id),
        "provider": result.provider,
        "model": result.model,
        "latency_ms": result.latency_ms,
        "document_markdown": out.document_markdown,
        "required_fields_present": out.required_fields_present,
        "required_fields_missing": out.required_fields_missing,
        "template_used": out.template_used,
        "needs_human_review": out.needs_human_review,
    }


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@router.get("/health")
async def agents_health() -> Any:
    """
    Reports per-agent: resolved provider, resolved model, reachable?
    Mirrors the /inference/health pattern.
    """
    from agents.provider import resolve_provider, resolve_model

    agents_config = [
        ("standards_ingestion",  "AGENT_STANDARDS_INGESTION_PROVIDER",  "ollama"),
        ("standards_mapping",    "AGENT_STANDARDS_MAPPING_PROVIDER",     "ollama"),
        ("rubric_scoring",       "AGENT_RUBRIC_SCORING_PROVIDER",        "ollama"),
        ("activity_review",      "AGENT_ACTIVITY_REVIEW_PROVIDER",       "ollama"),
        ("compliance_report",    "AGENT_COMPLIANCE_PROVIDER",            "claude"),
    ]

    report = {}
    for agent_name, env_var, default in agents_config:
        prov = resolve_provider(env_var, default)
        model = resolve_model(prov) or (
            settings.CLAUDE_MODEL if prov == "claude" else settings.OLLAMA_MODEL_TEXT
        )
        reachable: Optional[bool] = None
        try:
            if prov == "claude":
                reachable = bool(settings.CLAUDE_API_KEY or settings.ANTHROPIC_API_KEY)
            else:
                urls = [settings.OLLAMA_BASE_URL]
                if "host.docker.internal" in settings.OLLAMA_BASE_URL:
                    urls.append(settings.OLLAMA_BASE_URL.replace("host.docker.internal", "localhost"))
                for url in urls:
                    try:
                        async with httpx.AsyncClient(timeout=5) as client:
                            resp = await client.get(f"{url}/api/tags")
                        if resp.status_code == 200:
                            reachable = True
                            break
                    except Exception:
                        reachable = False
        except Exception:
            reachable = None

        report[agent_name] = {
            "provider": prov,
            "model": model,
            "reachable": reachable,
        }

    return {"agents": report, "audit_enabled": settings.AGENT_AUDIT_ENABLED}
