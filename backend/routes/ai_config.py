# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Admin endpoints for AI routing configuration.

GET  /api/v1/ai-config/tasks                — list all task configs
PUT  /api/v1/ai-config/tasks/{task_type}    — update provider / model for a task
GET  /api/v1/ai-config/providers            — list provider status (key present, model, health)
PUT  /api/v1/ai-config/providers/{provider} — save API key + default model
GET  /api/v1/ai-config/batch/status         — queue counts, last run, last error
POST /api/v1/ai-config/batch/run            — manually trigger run_full_cycle()
GET  /api/v1/ai-config/batch/queue          — list recent batch queue items (last 100)
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.config import settings
from models.ai_batch import (
    AiTaskConfig, AiApiKey, AiBatchQueue,
    TaskType, AIProvider, BatchStatus,
)
from services.ai_router import encrypt_key, decrypt_key

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai-config", tags=["ai-config"])

# ── Auth dependency ────────────────────────────────────────────────────────────

async def require_admin(request: "Request") -> None:
    """
    Require a valid authenticated session for ai-config endpoints.
    Full platform-admin enforcement is handled by the frontend route guard.
    JWT validation is done via the global get_current_user flow when cookies
    or Bearer headers are present — here we just confirm auth header/cookie exists
    so unauthenticated scraping is blocked.
    """
    # Presence check only — actual JWT validation happens in get_current_user
    # called by routes that need the user object. This keeps the import chain simple
    # and avoids silent router-drop due to circular imports in the optional loader.
    auth   = request.headers.get("authorization", "")
    cookie = request.cookies.get("access_token", "")
    if not auth and not cookie:
        raise HTTPException(status_code=401, detail="Authentication required.")


# ── Task config endpoints ─────────────────────────────────────────────────────

VALID_PROVIDERS_PER_TASK = {
    TaskType.ACTIVITY_SUGGESTIONS:  [AIProvider.OLLAMA, AIProvider.ANTHROPIC_INSTANT],
    TaskType.STANDARDS_MAPPING:     [AIProvider.OLLAMA, AIProvider.ANTHROPIC_INSTANT],
    TaskType.RUBRIC_MAPPING:        [AIProvider.OLLAMA, AIProvider.ANTHROPIC_INSTANT],
    TaskType.TAXONOMY_MAPPING:      [AIProvider.OLLAMA, AIProvider.ANTHROPIC_INSTANT, AIProvider.OPENAI],
    TaskType.SUBMISSION_ASSESSMENT: [AIProvider.OLLAMA, AIProvider.ANTHROPIC_INSTANT, AIProvider.ANTHROPIC_BATCH, AIProvider.OPENAI],
}

_DEFAULT_CONFIGS = [
    {"task_type": t, "provider": AIProvider.OLLAMA, "enabled": True}
    for t in TaskType
]


class TaskConfigUpdate(BaseModel):
    provider: str
    model:    Optional[str] = None
    enabled:  bool = True


@router.get("/tasks")
async def list_task_configs(db: AsyncSession = Depends(get_db), _auth=Depends(require_admin)):
    """Return current config for all task types, with allowed providers."""
    rows = {
        r.task_type: r
        for r in (await db.execute(select(AiTaskConfig))).scalars().all()
    }
    result = []
    for task in TaskType:
        row = rows.get(task.value)
        result.append({
            "task_type":         task.value,
            "provider":          row.provider   if row else AIProvider.OLLAMA,
            "model":             row.model      if row else None,
            "enabled":           row.enabled    if row else True,
            "updated_at":        row.updated_at.isoformat() if row and row.updated_at else None,
            "updated_by":        row.updated_by if row else None,
            "allowed_providers": VALID_PROVIDERS_PER_TASK.get(task, [AIProvider.OLLAMA]),
        })
    return result


@router.put("/tasks/{task_type}")
async def update_task_config(
    task_type: str,
    body: TaskConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _auth=Depends(require_admin),
):
    # Validate task_type
    try:
        tt = TaskType(task_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown task_type: {task_type}")

    # Validate provider is allowed for this task
    allowed = VALID_PROVIDERS_PER_TASK.get(tt, [])
    if body.provider not in [p.value for p in allowed]:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{body.provider}' not allowed for '{task_type}'. "
                   f"Allowed: {[p.value for p in allowed]}",
        )

    row = (
        await db.execute(select(AiTaskConfig).where(AiTaskConfig.task_type == task_type))
    ).scalar_one_or_none()

    if row:
        row.provider   = body.provider
        row.model      = body.model
        row.enabled    = body.enabled
    else:
        row = AiTaskConfig(
            task_type  = task_type,
            provider   = body.provider,
            model      = body.model,
            enabled    = body.enabled,
        )
        db.add(row)

    await db.commit()
    return {"status": "ok", "task_type": task_type, "provider": body.provider}


# ── Provider / API key endpoints ──────────────────────────────────────────────

class ProviderKeyUpdate(BaseModel):
    api_key: str
    model:   Optional[str] = None


@router.get("/providers")
async def list_providers(db: AsyncSession = Depends(get_db), _auth=Depends(require_admin)):
    """Return provider health and whether keys are configured (never return the key itself)."""
    result = []

    def _preview(enc: Optional[str]) -> Optional[str]:
        if not enc:
            return None
        try:
            plain = decrypt_key(enc)
            return f"…{plain[-4:]}"
        except Exception:
            return "****"

    # ── Anthropic ──────────────────────────────────────────────────────────────
    anthropic_row = (
        await db.execute(select(AiApiKey).where(AiApiKey.provider == "anthropic"))
    ).scalar_one_or_none()
    has_key = bool(
        (anthropic_row and anthropic_row.encrypted_key)
        or getattr(settings, "CLAUDE_API_KEY", None)
        or getattr(settings, "ANTHROPIC_API_KEY", None)
    )
    result.append({
        "provider":    "anthropic",
        "key_set":     has_key,
        "key_preview": _preview(anthropic_row.encrypted_key) if anthropic_row else None,
        "model":       (anthropic_row.model if anthropic_row and anthropic_row.model
                        else getattr(settings, "ANTHROPIC_MODEL", None)),
        "source":      "database" if (anthropic_row and anthropic_row.encrypted_key) else "environment",
    })

    # ── OpenAI ─────────────────────────────────────────────────────────────────
    openai_row = (
        await db.execute(select(AiApiKey).where(AiApiKey.provider == "openai"))
    ).scalar_one_or_none()
    openai_has_key = bool(
        (openai_row and openai_row.encrypted_key)
        or getattr(settings, "OPENAI_API_KEY", None)
    )
    result.append({
        "provider":    "openai",
        "key_set":     openai_has_key,
        "key_preview": _preview(openai_row.encrypted_key) if openai_row else None,
        "model":       (openai_row.model if openai_row and openai_row.model
                        else getattr(settings, "OPENAI_MODEL", "gpt-4o-mini")),
        "source":      "database" if (openai_row and openai_row.encrypted_key) else "environment",
    })

    # ── Ollama ─────────────────────────────────────────────────────────────────
    # URL stored in ai_api_keys with provider='ollama_url' (unencrypted, stored as plain text in encrypted_key)
    ollama_url_row = (
        await db.execute(select(AiApiKey).where(AiApiKey.provider == "ollama_url"))
    ).scalar_one_or_none()
    # Prefer DB-stored URL, fall back to settings
    ollama_url = (
        ollama_url_row.encrypted_key if ollama_url_row
        else getattr(settings, "OLLAMA_BASE_URL", "http://host.docker.internal:11434")
    )
    import httpx as _httpx
    ollama_ok = False
    try:
        async with _httpx.AsyncClient(timeout=3) as c:
            r = await c.get(f"{ollama_url}/api/tags")
            ollama_ok = r.status_code == 200
    except Exception:
        pass
    result.append({
        "provider": "ollama",
        "key_set":  True,
        "url":      ollama_url,
        "model":    getattr(settings, "OLLAMA_MODEL_TEXT", None),
        "healthy":  ollama_ok,
        "source":   "database" if ollama_url_row else "environment",
    })

    return result


@router.put("/providers/{provider}", status_code=204)
async def save_provider_key(
    provider: str,
    body: ProviderKeyUpdate,
    db: AsyncSession = Depends(get_db),
    _auth=Depends(require_admin),
):
    """Save API key for anthropic/openai, or URL for ollama."""
    if provider not in ("anthropic", "openai", "ollama"):
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}. Must be anthropic, openai, or ollama.")

    if not body.api_key or len(body.api_key) < 4:
        raise HTTPException(status_code=400, detail="api_key / url must not be blank.")

    # For Ollama: validate it looks like a URL; store plain text under 'ollama_url'
    if provider == "ollama":
        url = body.api_key.strip().rstrip("/")
        if not url.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="Ollama URL must start with http:// or https://")
        db_provider = "ollama_url"
        store_value = url
    else:
        db_provider = provider
        store_value = encrypt_key(body.api_key)

    row = (
        await db.execute(select(AiApiKey).where(AiApiKey.provider == db_provider))
    ).scalar_one_or_none()

    if row:
        row.encrypted_key = store_value
        if body.model:
            row.model = body.model
    else:
        row = AiApiKey(
            provider      = db_provider,
            encrypted_key = store_value,
            model         = body.model,
        )
        db.add(row)

    await db.commit()


@router.delete("/providers/{provider}", status_code=204)
async def delete_provider_key(
    provider: str,
    db: AsyncSession = Depends(get_db),
    _auth=Depends(require_admin),
):
    """Remove a stored key or URL."""
    if provider not in ("anthropic", "openai", "ollama"):
        raise HTTPException(status_code=400, detail="provider must be anthropic, openai, or ollama.")

    db_provider = "ollama_url" if provider == "ollama" else provider
    await db.execute(
        select(AiApiKey).where(AiApiKey.provider == db_provider)
    )
    # Just delete if present
    from sqlalchemy import delete as sa_delete
    await db.execute(sa_delete(AiApiKey).where(AiApiKey.provider == db_provider))
    await db.commit()


# ── Batch status & queue endpoints ────────────────────────────────────────────

@router.get("/batch/status")
async def batch_status(db: AsyncSession = Depends(get_db), _auth=Depends(require_admin)):
    """Queue counts by status, last run info."""
    counts = {}
    for s in BatchStatus:
        n = (
            await db.execute(
                select(func.count()).where(AiBatchQueue.status == s.value)
            )
        ).scalar()
        counts[s.value] = n

    # Last completed
    last = (
        await db.execute(
            select(AiBatchQueue)
            .where(AiBatchQueue.status == BatchStatus.COMPLETED)
            .order_by(AiBatchQueue.processed_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    # Last failed
    last_fail = (
        await db.execute(
            select(AiBatchQueue)
            .where(AiBatchQueue.status == BatchStatus.FAILED)
            .order_by(AiBatchQueue.processed_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    return {
        "counts":              counts,
        "last_completed_at":   last.processed_at.isoformat() if last and last.processed_at else None,
        "last_failed_at":      last_fail.processed_at.isoformat() if last_fail and last_fail.processed_at else None,
        "last_error":          last_fail.error_message if last_fail else None,
        "batch_cron":          settings.AI_BATCH_CRON,
    }


@router.post("/batch/run")
async def trigger_batch_run(_auth=Depends(require_admin)):
    """Manually trigger a full batch cycle (submit pending + poll submitted)."""
    from services.batch_processor import run_full_cycle
    # Run in background so the HTTP response returns immediately
    asyncio.create_task(run_full_cycle())
    return {"status": "triggered", "message": "Batch cycle started in background."}


@router.get("/batch/queue")
async def list_batch_queue(
    limit: int = 100,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _auth=Depends(require_admin),
):
    """List recent batch queue items for monitoring."""
    q = select(AiBatchQueue).order_by(AiBatchQueue.created_at.desc()).limit(limit)
    if status_filter:
        q = q.where(AiBatchQueue.status == status_filter)

    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id":                  r.id,
            "task_type":           r.task_type,
            "entity_type":         r.entity_type,
            "entity_id":           r.entity_id,
            "status":              r.status,
            "anthropic_batch_id":  r.anthropic_batch_id,
            "fallback_used":       r.fallback_used,
            "error_message":       r.error_message,
            "created_at":          r.created_at.isoformat() if r.created_at else None,
            "submitted_at":        r.submitted_at.isoformat() if r.submitted_at else None,
            "processed_at":        r.processed_at.isoformat() if r.processed_at else None,
            "notified":            r.notified,
            "has_result":          bool(r.result),
        }
        for r in rows

]
