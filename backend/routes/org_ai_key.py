# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Org-level BYOK AI configuration.

GET    /api/v1/org/ai-config           — full provider config + task routing
POST   /api/v1/org/ai-config/key       — set Anthropic or OpenAI key
DELETE /api/v1/org/ai-config/key/{provider} — remove a key
POST   /api/v1/org/ai-config/ollama    — set Ollama base URL
DELETE /api/v1/org/ai-config/ollama    — remove Ollama URL (revert to platform default)

Legacy aliases kept for backwards compatibility:
GET    /api/v1/org/ai-key  → same as GET /api/v1/org/ai-config
POST   /api/v1/org/ai-key  → sets Anthropic key (legacy)
DELETE /api/v1/org/ai-key  → removes Anthropic key (legacy)

Task routing is managed by the platform admin — org admins see it read-only.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.user import User
from services.ai_router import encrypt_key, decrypt_key
from services.license_validator import require_byok_enabled

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/org", tags=["org", "byok"])

TASK_TYPES = [
    "activity_suggestions",
    "standards_mapping",
    "rubric_mapping",
    "taxonomy_mapping",
    "submission_assessment",
]

VALID_PROVIDERS = {"anthropic_instant", "anthropic_batch", "openai", "ollama"}

# ── Auth helper ────────────────────────────────────────────────────────────────

async def _require_org_admin(current_user: User, db: AsyncSession) -> str:
    org_id = str(current_user.org_id) if current_user.org_id else None
    if not org_id:
        raise HTTPException(status_code=403, detail="No organisation found.")

    row = (await db.execute(
        text("""
            SELECT role FROM organization_members
            WHERE org_id = :oid AND user_id = :uid
        """),
        {"oid": org_id, "uid": str(current_user.id)},
    )).first()

    if not row or row[0] not in ("owner", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only org owners or admins can manage AI configuration.",
        )
    return org_id


# ── Request / Response models ──────────────────────────────────────────────────

class SetKeyRequest(BaseModel):
    provider: str        # "anthropic" | "openai"
    api_key: str

class SetOllamaRequest(BaseModel):
    ollama_url: str      # e.g. "http://192.168.1.50:11434"

# Legacy
class LegacySetKeyRequest(BaseModel):
    api_key: str


# ── GET /api/v1/org/ai-config ─────────────────────────────────────────────────

@router.get("/ai-config")
async def get_org_ai_config(
    _byok: None            = Depends(require_byok_enabled),
    current_user: User     = Depends(get_current_user),
    db: AsyncSession       = Depends(get_db),
):
    """Return full provider config and (read-only) task routing for this org."""
    org_id = await _require_org_admin(current_user, db)

    row = (await db.execute(
        text("""
            SELECT anthropic_api_key_enc,
                   openai_api_key_enc,
                   ollama_base_url,
                   ai_task_routing,
                   license_tier
            FROM organizations WHERE id = :oid
        """),
        {"oid": org_id},
    )).first()

    if not row:
        raise HTTPException(status_code=404, detail="Organisation not found.")

    anthropic_enc, openai_enc, ollama_url, routing_raw, tier = row

    def _preview(enc: Optional[str]) -> Optional[str]:
        if not enc:
            return None
        try:
            plain = decrypt_key(enc)
            return f"…{plain[-4:]}"
        except Exception:
            return "****"

    # Parse task routing — may be None/empty dict if not customised
    routing: dict = {}
    if routing_raw:
        if isinstance(routing_raw, str):
            try:
                routing = json.loads(routing_raw)
            except Exception:
                routing = {}
        elif isinstance(routing_raw, dict):
            routing = routing_raw

    return {
        "anthropic": {
            "has_key":     bool(anthropic_enc),
            "key_preview": _preview(anthropic_enc),
        },
        "openai": {
            "has_key":     bool(openai_enc),
            "key_preview": _preview(openai_enc),
        },
        "ollama": {
            "configured": bool(ollama_url),
            "url":        ollama_url or "",
        },
        "task_routing":   routing,   # empty = uses platform defaults
        "routing_locked": True,      # org admins cannot self-serve routing changes
        "license_tier":   tier,
    }


# ── POST /api/v1/org/ai-config/key ───────────────────────────────────────────

@router.post("/ai-config/key", status_code=204)
async def set_org_key(
    body: SetKeyRequest,
    _byok: None            = Depends(require_byok_enabled),
    current_user: User     = Depends(get_current_user),
    db: AsyncSession       = Depends(get_db),
):
    """Set an Anthropic or OpenAI API key for this org."""
    if body.provider not in ("anthropic", "openai"):
        raise HTTPException(status_code=400, detail="provider must be 'anthropic' or 'openai'.")
    if not body.api_key or len(body.api_key) < 20:
        raise HTTPException(status_code=400, detail="Invalid API key format.")

    org_id = await _require_org_admin(current_user, db)
    enc    = encrypt_key(body.api_key)
    col    = "anthropic_api_key_enc" if body.provider == "anthropic" else "openai_api_key_enc"

    await db.execute(
        text(f"UPDATE organizations SET {col} = :enc, updated_at = NOW() WHERE id = :oid"),
        {"enc": enc, "oid": org_id},
    )
    await db.commit()
    logger.info("[org_ai_config] Org %s set %s key (user %s)", org_id, body.provider, current_user.id)


# ── DELETE /api/v1/org/ai-config/key/{provider} ──────────────────────────────

@router.delete("/ai-config/key/{provider}", status_code=204)
async def delete_org_key(
    provider: str,
    _byok: None            = Depends(require_byok_enabled),
    current_user: User     = Depends(get_current_user),
    db: AsyncSession       = Depends(get_db),
):
    if provider not in ("anthropic", "openai"):
        raise HTTPException(status_code=400, detail="provider must be 'anthropic' or 'openai'.")

    org_id = await _require_org_admin(current_user, db)
    col    = "anthropic_api_key_enc" if provider == "anthropic" else "openai_api_key_enc"

    await db.execute(
        text(f"UPDATE organizations SET {col} = NULL, updated_at = NOW() WHERE id = :oid"),
        {"oid": org_id},
    )
    await db.commit()
    logger.info("[org_ai_config] Org %s removed %s key (user %s)", org_id, provider, current_user.id)


# ── POST /api/v1/org/ai-config/ollama ────────────────────────────────────────

@router.post("/ai-config/ollama", status_code=204)
async def set_org_ollama(
    body: SetOllamaRequest,
    _byok: None            = Depends(require_byok_enabled),
    current_user: User     = Depends(get_current_user),
    db: AsyncSession       = Depends(get_db),
):
    """Point this org's AI calls at a custom Ollama instance."""
    url = body.ollama_url.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="ollama_url must start with http:// or https://")

    org_id = await _require_org_admin(current_user, db)
    await db.execute(
        text("UPDATE organizations SET ollama_base_url = :url, updated_at = NOW() WHERE id = :oid"),
        {"url": url, "oid": org_id},
    )
    await db.commit()
    logger.info("[org_ai_config] Org %s set Ollama URL: %s (user %s)", org_id, url, current_user.id)


# ── DELETE /api/v1/org/ai-config/ollama ──────────────────────────────────────

@router.delete("/ai-config/ollama", status_code=204)
async def delete_org_ollama(
    _byok: None            = Depends(require_byok_enabled),
    current_user: User     = Depends(get_current_user),
    db: AsyncSession       = Depends(get_db),
):
    org_id = await _require_org_admin(current_user, db)
    await db.execute(
        text("UPDATE organizations SET ollama_base_url = NULL, updated_at = NOW() WHERE id = :oid"),
        {"oid": org_id},
    )
    await db.commit()
    logger.info("[org_ai_config] Org %s removed Ollama URL (user %s)", org_id, current_user.id)


# ── Legacy aliases (/api/v1/org/ai-key) ──────────────────────────────────────

@router.get("/ai-key")
async def legacy_get(
    _byok: None            = Depends(require_byok_enabled),
    current_user: User     = Depends(get_current_user),
    db: AsyncSession       = Depends(get_db),
):
    """Legacy endpoint — returns minimal status for backwards compatibility."""
    org_id = await _require_org_admin(current_user, db)
    row = (await db.execute(
        text("SELECT anthropic_api_key_enc, license_tier FROM organizations WHERE id = :oid"),
        {"oid": org_id},
    )).first()
    if not row:
        raise HTTPException(status_code=404, detail="Organisation not found.")
    enc_key, tier = row
    has_key = bool(enc_key)
    key_preview = None
    if has_key and enc_key:
        try:
            plain = decrypt_key(enc_key)
            key_preview = f"sk-...{plain[-4:]}"
        except Exception:
            key_preview = "****"
    return {"has_key": has_key, "key_preview": key_preview, "byok_enabled": True}


@router.post("/ai-key", status_code=204)
async def legacy_set(
    body: LegacySetKeyRequest,
    _byok: None            = Depends(require_byok_enabled),
    current_user: User     = Depends(get_current_user),
    db: AsyncSession       = Depends(get_db),
):
    org_id = await _require_org_admin(current_user, db)
    if not body.api_key or len(body.api_key) < 20:
        raise HTTPException(status_code=400, detail="Invalid API key format.")
    enc = encrypt_key(body.api_key)
    await db.execute(
        text("UPDATE organizations SET anthropic_api_key_enc = :enc, updated_at = NOW() WHERE id = :oid"),
        {"enc": enc, "oid": org_id},
    )
    await db.commit()


@router.delete("/ai-key", status_code=204)
async def legacy_delete(
    _byok: None            = Depends(require_byok_enabled),
    current_user: User     = Depends(get_current_user),
    db: AsyncSession       = Depends(get_db),
):
    org_id = await _require_org_admin(current_user, db)
    await db.execute(
        text("UPDATE organizations SET anthropic_api_key_enc = NULL, updated_at = NOW() WHERE id = :oid"),
        {"oid": org_id},
    )
    await db.commit()
