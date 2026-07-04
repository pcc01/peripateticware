# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Platform super-admin routes.

All routes require is_platform_admin = TRUE on the authenticated user.
These routes are NOT namespaced under an org — they operate across the
entire platform.

Routes:
  GET    /api/v1/platform/orgs               — list all orgs (paginated)
  GET    /api/v1/platform/orgs/{org_id}      — org detail + usage summary
  POST   /api/v1/platform/orgs/{org_id}/suspend   — suspend org
  POST   /api/v1/platform/orgs/{org_id}/reinstate — reinstate org
  POST   /api/v1/platform/impersonate/{org_id}    — issue impersonation token
  GET    /api/v1/platform/usage              — platform-wide token usage summary
  PUT    /api/v1/platform/ai-keys            — set/update platform-level AI keys
  GET    /api/v1/platform/audit-log          — paginated audit log
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user, require_platform_admin
from models.user import User
from services.ai_router import encrypt_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/platform", tags=["platform-admin"])


# ── Audit log helper ──────────────────────────────────────────────────────────

async def _audit(
    db: AsyncSession,
    actor_id: str,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    detail: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> None:
    """Write an immutable audit log entry. Never raises."""
    try:
        import json as _json
        await db.execute(text("""
            INSERT INTO platform_audit_log
                (id, actor_id, action, target_type, target_id, detail, ip_address, created_at)
            VALUES
                (:id, :actor, :action, :tt, :tid, CAST(:detail AS JSONB), :ip, :now)
        """), {
            "id":     str(uuid.uuid4()),
            "actor":  actor_id,
            "action": action,
            "tt":     target_type,
            "tid":    target_id,
            "detail": _json.dumps(detail) if detail else None,
            "ip":     ip_address,
            "now":    datetime.now(timezone.utc),
        })
    except Exception as exc:
        logger.warning(f"[platform_admin] audit write failed: {exc}")


# ── Response models ───────────────────────────────────────────────────────────

class OrgSummary(BaseModel):
    id: str
    slug: str
    name: str
    type: str
    license_tier: str
    license_status: str
    contact_email: Optional[str]
    country_code: Optional[str]
    created_at: str
    user_count: int
    is_suspended: bool


class OrgDetail(OrgSummary):
    max_teachers: int
    max_students: int
    monthly_tokens_used: int
    monthly_cost_usd: float
    privacy_jurisdiction_ids: list


class UsageSummary(BaseModel):
    period: str
    total_tokens: int
    total_cost_usd: float
    active_orgs: int
    top_orgs: list


class AuditEntry(BaseModel):
    id: str
    actor_id: str
    action: str
    target_type: Optional[str]
    target_id: Optional[str]
    detail: Optional[dict]
    ip_address: Optional[str]
    created_at: str


# ── GET /platform/orgs ────────────────────────────────────────────────────────

@router.get("/orgs")
async def list_orgs(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    search: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    _admin: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all organisations, paginated. Optionally filter by name/email or tier."""
    offset = (page - 1) * per_page

    where_parts = ["1=1"]
    params: dict = {"limit": per_page, "offset": offset}

    if search:
        where_parts.append("(o.name ILIKE :search OR o.contact_email ILIKE :search OR o.slug ILIKE :search)")
        params["search"] = f"%{search}%"
    if tier:
        where_parts.append("o.license_tier = :tier")
        params["tier"] = tier

    where_clause = " AND ".join(where_parts)

    rows = (await db.execute(text(f"""
        SELECT
            o.id, o.slug, o.name, o.type,
            COALESCE(o.license_tier, 'free') AS license_tier,
            COALESCE(o.license_status, 'trial') AS license_status,
            o.contact_email, o.country_code, o.created_at,
            COALESCE(o.license_status = 'suspended', FALSE) AS is_suspended,
            (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) AS user_count
        FROM organizations o
        WHERE {where_clause}
        ORDER BY o.created_at DESC
        LIMIT :limit OFFSET :offset
    """), params)).fetchall()

    total_row = (await db.execute(text(f"""
        SELECT COUNT(*) FROM organizations o WHERE {where_clause}
    """), {k: v for k, v in params.items() if k not in ("limit", "offset")})).first()

    orgs = [
        {
            "id":             str(r[0]),
            "slug":           r[1],
            "name":           r[2],
            "type":           r[3],
            "license_tier":   r[4],
            "license_status": r[5],
            "contact_email":  r[6],
            "country_code":   r[7],
            "created_at":     r[8].isoformat() if r[8] else None,
            "is_suspended":   bool(r[9]),
            "user_count":     int(r[10]),
        }
        for r in rows
    ]

    return {
        "orgs":     orgs,
        "total":    int(total_row[0]) if total_row else 0,
        "page":     page,
        "per_page": per_page,
    }


# ── GET /platform/orgs/{org_id} ───────────────────────────────────────────────

@router.get("/orgs/{org_id}")
async def get_org_detail(
    org_id: str,
    _admin: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return full org detail including this month's usage."""
    row = (await db.execute(text("""
        SELECT
            o.id, o.slug, o.name, o.type,
            COALESCE(o.license_tier, 'free'),
            COALESCE(o.license_status, 'trial'),
            o.contact_email, o.country_code, o.created_at,
            COALESCE(o.max_teachers, 3), COALESCE(o.max_students, 30),
            COALESCE(o.privacy_jurisdiction_ids, '[]'::jsonb),
            COALESCE(o.license_status = 'suspended', FALSE)
        FROM organizations o
        WHERE o.id = :oid
    """), {"oid": org_id})).first()

    if not row:
        raise HTTPException(status_code=404, detail="Organisation not found.")

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    usage = (await db.execute(text("""
        SELECT COALESCE(SUM(total_tokens), 0), COALESCE(SUM(cost_usd), 0)
        FROM platform_ai_ledger
        WHERE org_id = :oid AND created_at >= :ms
    """), {"oid": org_id, "ms": month_start})).first()

    user_count = (await db.execute(
        text("SELECT COUNT(*) FROM users WHERE org_id = :oid"), {"oid": org_id}
    )).scalar() or 0

    return {
        "id":             str(row[0]),
        "slug":           row[1],
        "name":           row[2],
        "type":           row[3],
        "license_tier":   row[4],
        "license_status": row[5],
        "contact_email":  row[6],
        "country_code":   row[7],
        "created_at":     row[8].isoformat() if row[8] else None,
        "max_teachers":   int(row[9]),
        "max_students":   int(row[10]),
        "privacy_jurisdiction_ids": row[11] if row[11] else [],
        "is_suspended":   bool(row[12]),
        "user_count":     int(user_count),
        "monthly_tokens_used": int(usage[0]) if usage else 0,
        "monthly_cost_usd":    float(usage[1]) if usage else 0.0,
    }


# ── POST /platform/orgs/{org_id}/suspend ─────────────────────────────────────

@router.post("/orgs/{org_id}/suspend", status_code=204)
async def suspend_org(
    org_id: str,
    request: Request,
    admin: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Set an org's license_status to 'suspended'."""
    await db.execute(
        text("UPDATE organizations SET license_status = 'suspended', updated_at = NOW() WHERE id = :oid"),
        {"oid": org_id},
    )
    await db.commit()
    await _audit(db, str(admin.id), "org_suspended", "org", org_id,
                 ip_address=request.client.host if request.client else None)
    await db.commit()
    logger.info(f"[platform_admin] Org {org_id} suspended by {admin.id}")


# ── POST /platform/orgs/{org_id}/reinstate ────────────────────────────────────

@router.post("/orgs/{org_id}/reinstate", status_code=204)
async def reinstate_org(
    org_id: str,
    request: Request,
    admin: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reinstate a suspended org (revert to 'active')."""
    await db.execute(
        text("UPDATE organizations SET license_status = 'active', updated_at = NOW() WHERE id = :oid"),
        {"oid": org_id},
    )
    await db.commit()
    await _audit(db, str(admin.id), "org_reinstated", "org", org_id,
                 ip_address=request.client.host if request.client else None)
    await db.commit()
    logger.info(f"[platform_admin] Org {org_id} reinstated by {admin.id}")


# ── Maintenance mode ──────────────────────────────────────────────────────────
# Flag lives in Redis ("maintenance_mode"); enforced by MaintenanceModeMiddleware
# in main.py, which exempts /api/v1/platform/* so this toggle always works.
# TTL 7 days: if the operator forgets, maintenance auto-expires instead of
# leaving the site dark forever.

class MaintenanceBody(BaseModel):
    enabled: bool


@router.get("/maintenance")
async def get_maintenance_status(
    _admin: User = Depends(require_platform_admin),
):
    """Current maintenance-mode state."""
    from core.cache import get_cache
    enabled = bool(await get_cache("maintenance_mode"))
    return {"enabled": enabled}


@router.put("/maintenance", status_code=200)
async def set_maintenance_mode(
    body: MaintenanceBody,
    request: Request,
    admin: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Turn maintenance mode on/off. Takes effect within ~5s (middleware cache)."""
    from core.cache import set_cache, delete_cache
    if body.enabled:
        ok = await set_cache("maintenance_mode", True, ttl=7 * 24 * 3600)
    else:
        ok = await delete_cache("maintenance_mode")
    if not ok:
        raise HTTPException(status_code=503, detail="Could not update maintenance flag (Redis unavailable).")
    await _audit(db, str(admin.id),
                 "maintenance_enabled" if body.enabled else "maintenance_disabled",
                 ip_address=request.client.host if request.client else None)
    await db.commit()
    logger.warning(f"[platform_admin] Maintenance mode {'ENABLED' if body.enabled else 'disabled'} by {admin.id}")
    return {"enabled": body.enabled}


# ── POST /platform/impersonate/{org_id} ───────────────────────────────────────

@router.post("/impersonate/{org_id}")
async def impersonate_org(
    org_id: str,
    request: Request,
    admin: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Issue a short-lived impersonation token scoped to the org's owner.
    The token includes impersonation metadata so audit logs can track it.
    """
    from core.security import create_access_token
    from datetime import timedelta

    # Find org owner
    owner = (await db.execute(text("""
        SELECT u.id, u.email, u.role
        FROM   organization_members om
        JOIN   users u ON u.id = om.user_id
        WHERE  om.org_id = :oid AND om.role = 'owner'
        LIMIT  1
    """), {"oid": org_id})).first()

    if not owner:
        raise HTTPException(status_code=404, detail="No owner found for this organisation.")

    token = create_access_token(
        data={
            "sub":          str(owner[0]),
            "impersonated_by": str(admin.id),
            "impersonating_org": org_id,
        },
        expires_delta=timedelta(hours=1),
    )

    await _audit(db, str(admin.id), "impersonation_token_issued", "org", org_id,
                 detail={"target_user": str(owner[0])},
                 ip_address=request.client.host if request.client else None)
    await db.commit()

    logger.warning(f"[platform_admin] IMPERSONATION: admin={admin.id} → org={org_id} user={owner[0]}")
    return {"access_token": token, "token_type": "bearer", "expires_in": 3600}


# ── GET /platform/usage ───────────────────────────────────────────────────────

@router.get("/usage")
async def platform_usage(
    period: str = Query("month", regex="^(day|week|month)$"),
    _admin: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Platform-wide token usage for the selected period."""
    now = datetime.now(timezone.utc)
    if period == "day":
        since = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        since = now.replace(hour=0, minute=0, second=0, microsecond=0)
        since = since.replace(day=since.day - since.weekday())
    else:
        since = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    totals = (await db.execute(text("""
        SELECT COALESCE(SUM(total_tokens), 0), COALESCE(SUM(cost_usd), 0),
               COUNT(DISTINCT org_id)
        FROM platform_ai_ledger WHERE created_at >= :since
    """), {"since": since})).first()

    top_orgs = (await db.execute(text("""
        SELECT l.org_id, o.name, SUM(l.total_tokens) AS toks, COALESCE(SUM(l.cost_usd), 0) AS cost
        FROM   platform_ai_ledger l
        LEFT   JOIN organizations o ON o.id = l.org_id
        WHERE  l.created_at >= :since
        GROUP  BY l.org_id, o.name
        ORDER  BY toks DESC
        LIMIT  10
    """), {"since": since})).fetchall()

    return {
        "period":         period,
        "since":          since.isoformat(),
        "total_tokens":   int(totals[0]) if totals else 0,
        "total_cost_usd": float(totals[1]) if totals else 0.0,
        "active_orgs":    int(totals[2]) if totals else 0,
        "top_orgs": [
            {"org_id": str(r[0]), "name": r[1], "tokens": int(r[2]), "cost_usd": float(r[3])}
            for r in top_orgs
        ],
    }


# ── PUT /platform/ai-keys ─────────────────────────────────────────────────────

class PlatformAIKeyRequest(BaseModel):
    provider: str = "anthropic"
    api_key: str


@router.put("/ai-keys", status_code=204)
async def set_platform_ai_key(
    body: PlatformAIKeyRequest,
    request: Request,
    admin: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Set/update the platform-level API key for a provider (stored in ai_api_keys table)."""
    if not body.api_key or len(body.api_key) < 10:
        raise HTTPException(status_code=400, detail="Invalid API key.")

    enc = encrypt_key(body.api_key)
    await db.execute(text("""
        INSERT INTO ai_api_keys (provider, encrypted_key, updated_at)
        VALUES (:provider, :enc, NOW())
        ON CONFLICT (provider) DO UPDATE
        SET encrypted_key = EXCLUDED.encrypted_key, updated_at = NOW()
    """), {"provider": body.provider, "enc": enc})
    await db.commit()

    await _audit(db, str(admin.id), "platform_ai_key_updated", "ai_key", body.provider,
                 ip_address=request.client.host if request.client else None)
    await db.commit()
    logger.info(f"[platform_admin] Platform AI key updated: provider={body.provider} by {admin.id}")


# ── GET /platform/audit-log ───────────────────────────────────────────────────

@router.get("/audit-log")
async def get_audit_log(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    action: Optional[str] = Query(None),
    _admin: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated platform audit log entries."""
    offset = (page - 1) * per_page
    params: dict = {"limit": per_page, "offset": offset}
    where = "1=1"
    if action:
        where += " AND action = :action"
        params["action"] = action

    rows = (await db.execute(text(f"""
        SELECT id, actor_id, action, target_type, target_id, detail, ip_address, created_at
        FROM   platform_audit_log
        WHERE  {where}
        ORDER  BY created_at DESC
        LIMIT  :limit OFFSET :offset
    """), params)).fetchall()

    total = (await db.execute(text(f"""
        SELECT COUNT(*) FROM platform_audit_log WHERE {where}
    """), {k: v for k, v in params.items() if k not in ("limit", "offset")})).scalar()

    return {
        "entries": [
            {
                "id":          str(r[0]),
                "actor_id":    str(r[1]),
                "action":      r[2],
                "target_type": r[3],
                "target_id":   r[4],
                "detail":      r[5],
                "ip_address":  r[6],
                "created_at":  r[7].isoformat() if r[7] else None,
            }
            for r in rows
        ],
        "total":    int(total) if total else 0,
        "page":     page,
        "per_page": per_page,
    }
