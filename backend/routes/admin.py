# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Admin Routes - Environment management, auth, and LLM testing
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, Body
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import os
import json
from datetime import datetime
from functools import lru_cache
import bcrypt
import httpx
from pathlib import Path
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from core.database import get_db
from core.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# ============================================================================
# AUDIT LOG HELPER
# ============================================================================

async def log_admin_action(
    db: AsyncSession,
    admin_id: Optional[str],
    action: str,
    resource: Optional[str] = None,
    details: Optional[dict] = None,
    success: bool = True,
    request: Optional[Request] = None,
) -> None:
    """
    Insert a row into admin_audit_logs. Non-blocking — errors are logged but never raised.

    Args:
        admin_id:  current_user.id (str) from the JWT; None for unauthenticated attempts
        action:    short verb+noun, e.g. "create_user", "delete_user", "update_env", "login", "logout"
        resource:  the affected resource identifier, e.g. user_id, env key name, class id
        details:   arbitrary JSON dict with before/after values or other context
        success:   False for failed attempts (wrong credentials, 404s, etc.)
        request:   FastAPI Request object for IP + user-agent extraction
    """
    try:
        ip_address = None
        user_agent = None
        if request:
            ip_address = (
                request.headers.get("x-forwarded-for", "").split(",")[0].strip()
                or (request.client.host if request.client else None)
            )
            user_agent = request.headers.get("user-agent")

        from models.database import AdminAuditLog
        entry = AdminAuditLog(
            admin_id=admin_id,
            action=action,
            resource=resource,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent,
            success=success,
        )
        db.add(entry)
        await db.commit()
    except Exception as exc:
        import logging as _log
        _log.getLogger(__name__).warning(f"[audit] Failed to log admin action '{action}': {exc}")


# ============================================================================
# MODELS
# ============================================================================

class AdminUser(BaseModel):
    id: str
    username: str
    role: str = "admin"
    created_at: datetime


class EnvVar(BaseModel):
    key: str
    value: str
    encrypted: bool = False
    description: str = ""
    category: str = "General"


class EnvCategory(BaseModel):
    category: str
    variables: list[EnvVar]


class LLMTestRequest(BaseModel):
    provider: str  # "ollama" or "claude"
    prompt: str = "Say 'Hello' briefly."


class LLMTestResponse(BaseModel):
    provider: str
    response: str
    latency_ms: float
    success: bool
    error: Optional[str] = None


# ============================================================================
# ENV CONFIGURATION (encrypted secrets)
# ============================================================================

# Encrypted fields that should be masked
ENCRYPTED_FIELDS = {
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_SECRET",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "CLAUDE_API_KEY",
    "ADMIN_PASSWORD_HASH",
    "SECRET_KEY",
    "AUDIT_HASH_SALT",
    "ASSEMBLYAI_API_KEY",
}

# ENV categories for UI grouping
ENV_CATEGORIES = {
    "Database": ["DATABASE_URL", "REDIS_URL"],
    "LLM": ["LLM_PROVIDER", "OLLAMA_BASE_URL", "OLLAMA_MODEL_TEXT", "OLLAMA_MODEL_VISION",
             "CLAUDE_API_KEY", "CLAUDE_MODEL", "CLAUDE_MAX_TOKENS"],
    "Auth": ["SECRET_KEY", "ALGORITHM", "ACCESS_TOKEN_EXPIRE_MINUTES", "AUDIT_HASH_SALT"],
    "Application": ["ENVIRONMENT", "LOG_LEVEL", "APP_NAME"],
    "Privacy": ["ACTIVE_JURISDICTION", "ENABLE_PRIVACY_CHECKS", "PRIVACY_CONFIG_DIR"],
    "Location": ["LOCATION_BACKEND", "ENABLE_LOCATION_CACHE", "LOCATION_CACHE_TTL_HOURS",
                 "GOOGLE_MAPS_API_KEY", "NOMINATIM_USER_AGENT"],
    "Audio/ASR": ["AUDIO_ENABLED", "AUDIO_MAX_DURATION_SECONDS", "ASR_ENABLED", "ASSEMBLYAI_API_KEY"],
    "Features": ["FIELD_NOTES_ENABLED", "PEER_PROJECTS_ENABLED",
                 "DEFAULT_PEER_PROJECT_APPROVAL_MODE"],
}


def encrypt_value(value: str) -> str:
    """Encrypt sensitive values with bcrypt"""
    if not value:
        return ""
    return bcrypt.hashpw(value.encode(), bcrypt.gensalt()).decode()


def decrypt_for_display(value: str, is_encrypted: bool) -> str:
    """Return masked value for display"""
    if is_encrypted and value:
        return "••••••••" + value[-4:] if len(value) > 4 else "••••••••"
    return value


def mask_sensitive_value(key: str, value: str) -> tuple[str, bool]:
    """Check if value should be encrypted and return masked version"""
    is_sensitive = key in ENCRYPTED_FIELDS
    if is_sensitive:
        masked = "••••••••" + value[-4:] if len(value) > 4 else "••••••••"
        return masked, True
    return value, False


# ============================================================================
# LEGACY ADMIN AUTH -- RETIRED 2026-08-19
# ============================================================================
# This used to be a second, parallel login system (its own /auth/login,
# DB-persisted AdminSession tokens, and a hardcoded DEMO_ADMIN fallback --
# username "admin", password "admin123" -- that activated whenever the
# admin_users table was empty). That fallback was a live, unauthenticated
# path to full production .env read/write (see /env below) reachable by
# anyone who knew the default credential; found and closed 2026-08-19.
#
# Every route below now uses the same JWT + role=ADMIN auth as the rest
# of /admin/*, matching how the frontend (AdminSystemPage.tsx, and
# AdminSettingsPage.tsx after this change) already calls them via the
# normal authenticated API client -- there's no reason for env/LLM-test/
# audit-log management to be a separate login from everything else under
# /admin. admin_users and admin_sessions tables are left in place
# (harmless, nothing reads them anymore) rather than dropped.
# ============================================================================


# ============================================================================
# ENV MANAGEMENT
# ============================================================================

@router.get("/env", response_model=list[EnvCategory])
async def get_env_variables(current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get all environment variables grouped by category"""
    _require_admin_role(current_user)

    env_vars: Dict[str, list] = {}

    # Load all env vars
    for key, value in os.environ.items():
        masked_value, is_encrypted = mask_sensitive_value(key, value)

        # Determine category
        category = "General"
        for cat, keys in ENV_CATEGORIES.items():
            if key in keys:
                category = cat
                break

        if category not in env_vars:
            env_vars[category] = []

        env_vars[category].append(EnvVar(
            key=key,
            value=masked_value,
            encrypted=is_encrypted,
            description=f"Environment variable: {key}",
            category=category,
        ))

    # Sort and return
    result = []
    for category in sorted(env_vars.keys()):
        result.append(EnvCategory(
            category=category,
            variables=sorted(env_vars[category], key=lambda x: x.key)
        ))

    return result


@router.post("/env/{key}")
async def update_env_variable(
    key: str,
    body: Dict[str, str] = Body(...),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """Update an environment variable (with confirmation)"""
    _require_admin_role(current_user)
    admin_id = str(current_user.id)

    new_value = body.get("value", "")

    # Check if sensitive
    is_sensitive = key in ENCRYPTED_FIELDS

    # Update in-memory os.environ
    os.environ[key] = new_value

    # Also persist to .env file if it exists
    env_path = Path(".env")
    if env_path.exists():
        lines = env_path.read_text().split("\n")
        updated_lines = []
        found = False

        for line in lines:
            if line.startswith(f"{key}="):
                updated_lines.append(f"{key}={new_value}")
                found = True
            else:
                updated_lines.append(line)

        if not found:
            updated_lines.append(f"{key}={new_value}")

        env_path.write_text("\n".join(updated_lines))
    else:
        # Create .env if it doesn't exist
        with open(".env", "a") as f:
            f.write(f"\n{key}={new_value}")

    await log_admin_action(db, admin_id, "update_env", resource=key, details={"key": key}, request=request)

    return {
        "message": f"Updated {key}",
        "key": key,
        "is_sensitive": is_sensitive,
        "updated_at": datetime.now().isoformat(),
    }


# ============================================================================
# LLM TESTING
# ============================================================================

@router.post("/llm/test", response_model=LLMTestResponse)
async def test_llm_provider(request: LLMTestRequest, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Test LLM provider (Ollama or Claude)"""
    _require_admin_role(current_user)

    start_time = datetime.now()

    try:
        if request.provider.lower() == "ollama":
            return await test_ollama(request.prompt, start_time)
        elif request.provider.lower() == "claude":
            return await test_claude(request.prompt, start_time)
        else:
            raise HTTPException(status_code=400, detail="Invalid provider. Use 'ollama' or 'claude'.")
    except HTTPException:
        raise
    except Exception as e:
        return LLMTestResponse(
            provider=request.provider,
            response="",
            latency_ms=0,
            success=False,
            error=str(e),
        )


async def test_ollama(prompt: str, start_time: datetime) -> LLMTestResponse:
    """Test Ollama LLM — uses host.docker.internal inside Docker"""
    ollama_host = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
    ollama_model = os.getenv("OLLAMA_MODEL_TEXT", "llama2")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{ollama_host}/api/generate",
                json={"model": ollama_model, "prompt": prompt, "stream": False},
                timeout=30.0,
            )
            response.raise_for_status()

            data = response.json()
            latency = (datetime.now() - start_time).total_seconds() * 1000

            return LLMTestResponse(
                provider="ollama",
                response=data.get("response", "")[:200],
                latency_ms=latency,
                success=True,
            )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Ollama connection failed: {str(e)}",
        )


async def test_claude(prompt: str, start_time: datetime) -> LLMTestResponse:
    """Test Claude API"""
    api_key = os.getenv("CLAUDE_API_KEY") or os.getenv("ANTHROPIC_API_KEY")

    if not api_key:
        raise HTTPException(status_code=400, detail="CLAUDE_API_KEY not set")

    claude_model = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": claude_model,
                    "max_tokens": 100,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=30.0,
            )
            response.raise_for_status()

            data = response.json()
            latency = (datetime.now() - start_time).total_seconds() * 1000

            return LLMTestResponse(
                provider="claude",
                response=data["content"][0]["text"][:200],
                latency_ms=latency,
                success=True,
            )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Claude API failed: {str(e)}",
        )


# ============================================================================
# HEALTH CHECK
# ============================================================================

@router.get("/health")
async def admin_health():
    """Check admin panel health"""
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "llm_provider": os.getenv("LLM_PROVIDER", "ollama"),
        "environment": os.getenv("ENVIRONMENT", "development"),
    }


# ============================================================================
# JWT-AUTHENTICATED ADMIN ENDPOINTS (called by the main admin frontend)
# These use the standard Bearer token, not the admin panel token.
# They require the authenticated user to have role=ADMIN.
# ============================================================================

def _require_admin_role(current_user) -> None:
    if current_user.role.upper() != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin role required")


async def _admin_org_ids(current_user, db: AsyncSession) -> Optional[List[Any]]:
    """
    Returns the org_ids `current_user` should be scoped to for /admin/*
    data views, or None to mean "no filter, see everything" (only when
    is_platform_admin -- matches "only the platform admin has access to
    overall prod/SaaS data" everywhere else in this app).

    organization_members is the canonical membership source (not
    users.org_id/primary_org_id -- see the 2026-08-19 org-scoping
    migration's docstring for why those are inconsistently populated
    across accounts and not trustworthy here). An admin with zero
    memberships gets an empty list back, which every caller below must
    treat as "show nothing" -- fail closed, not fail open.
    """
    if getattr(current_user, "is_platform_admin", False):
        return None
    result = await db.execute(
        text("SELECT org_id FROM organization_members WHERE user_id = :uid"),
        {"uid": str(current_user.id)},
    )
    return [row[0] for row in result.all()]


@router.get("/dashboard")
async def admin_dashboard(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin overview dashboard — user counts, activity counts, system status.
    Scoped to the caller's org(s) unless is_platform_admin (see _admin_org_ids)."""
    from models.database import User, Activity, LearningSession
    _require_admin_role(current_user)
    org_ids = await _admin_org_ids(current_user, db)

    # Consolidated into 2 queries instead of 7 sequential round-trips.
    # member_filter: empty string (no filter, platform admin) or a WHERE
    # clause restricting to users who are members of one of org_ids --
    # org_ids being an empty list correctly matches zero rows via = ANY().
    from sqlalchemy import text as _text
    member_filter = "" if org_ids is None else \
        "WHERE id IN (SELECT user_id FROM organization_members WHERE org_id = ANY(:org_ids))"
    user_row = (await db.execute(_text(f"""
        SELECT
            COUNT(*)                                                        AS total_users,
            COUNT(*) FILTER (WHERE UPPER(role::text) = 'TEACHER')         AS teachers,
            COUNT(*) FILTER (WHERE UPPER(role::text) = 'STUDENT')         AS students,
            COUNT(*) FILTER (WHERE UPPER(role::text) = 'PARENT')          AS parents
        FROM users
        {member_filter}
    """), {} if org_ids is None else {"org_ids": org_ids})).mappings().one()

    teacher_filter = "" if org_ids is None else \
        "WHERE teacher_id IN (SELECT user_id FROM organization_members WHERE org_id = ANY(:org_ids))"
    session_filter = "" if org_ids is None else \
        "WHERE user_id IN (SELECT user_id FROM organization_members WHERE org_id = ANY(:org_ids))"
    act_row = (await db.execute(_text(f"""
        SELECT
            COUNT(*)                                                        AS total_activities,
            COUNT(*) FILTER (WHERE LOWER(status::text) = 'published')     AS published,
            (SELECT COUNT(*) FROM learning_sessions {session_filter})        AS sessions
        FROM activities
        {teacher_filter}
    """), {} if org_ids is None else {"org_ids": org_ids})).mappings().one()

    total_users      = int(user_row["total_users"] or 0)
    teachers         = int(user_row["teachers"]    or 0)
    students         = int(user_row["students"]    or 0)
    parents          = int(user_row["parents"]     or 0)
    total_activities = int(act_row["total_activities"] or 0)
    published        = int(act_row["published"]        or 0)
    sessions         = int(act_row["sessions"]         or 0)

    return {
        # Field names match AdminDashboardData frontend type
        "users_count": total_users,
        "activities_count": total_activities,
        "sessions_count": sessions,
        "analytics": {
            "total_users": total_users,
            "total_teachers": teachers,
            "total_students": students,
            "total_parents": parents,
            "total_activities": total_activities,
            "total_sessions": sessions,
            "average_session_attendance": 0,
            "system_uptime": 100,
            "database_size": "N/A",
        },
        "recent_users": [],
        # Legacy fields kept for any other consumers
        "by_role": {"teacher": teachers, "student": students, "parent": parents},
        "published_activities": published,
        "system_status": "healthy",
        "llm_provider": os.environ.get("LLM_PROVIDER", "ollama"),
        "environment": os.environ.get("ENVIRONMENT", "development"),
    }


@router.get("/users")
async def list_admin_users(
    skip: int = 0,
    limit: int = 20,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all users with pagination. Scoped to the caller's org(s)
    unless is_platform_admin (see _admin_org_ids)."""
    from models.database import User
    from sqlalchemy import exists as _exists
    _require_admin_role(current_user)
    org_ids = await _admin_org_ids(current_user, db)

    query = select(User)
    count_query = select(func.count()).select_from(User)
    if org_ids is not None:
        member_of_scope = text(
            "EXISTS (SELECT 1 FROM organization_members om WHERE om.user_id = users.id AND om.org_id = ANY(:org_ids))"
        ).bindparams(org_ids=org_ids)
        query = query.where(member_of_scope)
        count_query = count_query.where(member_of_scope)

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(query.offset(skip).limit(limit).order_by(User.created_at.desc()))
    users = result.scalars().all()

    return {
        "items": [
            {
                "id": str(u.id),
                "email": u.email,
                "username": u.username,
                "full_name": u.full_name,
                "role": u.role,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("/users")
async def create_admin_user(
    body: Dict[str, Any] = Body(...),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """Create a user (admin action)."""
    from models.database import User
    from core.security import SecurityManager
    _require_admin_role(current_user)

    user = User(
        id=uuid4(),
        email=body["email"].lower(),
        username=body.get("username", body["email"].split("@")[0]),
        hashed_password=SecurityManager.hash_password(body.get("password", "TempPass123!")),
        full_name=body.get("full_name", ""),
        role=body.get("role", "STUDENT").upper(),
        is_active=True,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await log_admin_action(
        db, str(current_user.id), "create_user", resource=str(user.id),
        details={"email": user.email, "role": user.role}, request=request,
    )
    return {"id": str(user.id), "email": user.email, "role": user.role}


@router.put("/users/{user_id}")
async def update_admin_user(
    user_id: str,
    body: Dict[str, Any] = Body(...),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """Update a user (admin action)."""
    from models.database import User
    _require_admin_role(current_user)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Seed/demo accounts (admin, test_admin, teacher@example.com, etc.) are
    # protected from mutation through the admin panel -- see the
    # 2026-08-19 org-scoping migration's PROTECTED_USERNAMES. Blocking the
    # action outright, rather than relying only on the startup-time seed
    # upsert to eventually reconcile a change, means the next tester never
    # sees a broken/altered fixture even between deploys.
    if getattr(user, "is_protected", False):
        raise HTTPException(
            status_code=403,
            detail="This is a protected demo/test account and cannot be modified.",
        )
    update_data = {f: body[f] for f in ("full_name", "role", "is_active") if f in body}
    for field, value in update_data.items():
        setattr(user, field, value)
    user.updated_at = datetime.now()
    await db.commit()
    await log_admin_action(
        db, str(current_user.id), "update_user", resource=user_id,
        details={"fields_changed": list(update_data.keys())}, request=request,
    )
    return {"id": str(user.id), "email": user.email, "role": user.role, "is_active": user.is_active}


@router.delete("/users/{user_id}", status_code=204)
async def delete_admin_user(
    user_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """Delete a user (admin action)."""
    from models.database import User
    _require_admin_role(current_user)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if getattr(user, "is_protected", False):
        raise HTTPException(
            status_code=403,
            detail="This is a protected demo/test account and cannot be removed.",
        )
    await db.delete(user)
    await db.commit()
    await log_admin_action(db, str(current_user.id), "delete_user", resource=user_id, request=request)


@router.get("/classes")
async def list_admin_classes(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all classrooms. Scoped to the caller's org(s) unless
    is_platform_admin (see _admin_org_ids) -- classrooms.org_id is a
    direct column here, so no organization_members join needed."""
    _require_admin_role(current_user)
    org_ids = await _admin_org_ids(current_user, db)
    from sqlalchemy import text as _t
    org_filter = "" if org_ids is None else "WHERE c.org_id = ANY(:org_ids)"
    result = await db.execute(_t(f"""
        SELECT c.id, c.name, c.grade_level, c.subject,
               c.is_active, c.created_at,
               u.full_name AS teacher_name, u.email AS teacher_email,
               o.name AS org_name,
               COUNT(DISTINCT cs.student_id) AS student_count
        FROM classrooms c
        LEFT JOIN users u ON u.id = c.teacher_id
        LEFT JOIN organizations o ON o.id = c.org_id
        LEFT JOIN classroom_students cs ON cs.classroom_id = c.id
        {org_filter}
        GROUP BY c.id, u.full_name, u.email, o.name
        ORDER BY c.name
    """), {} if org_ids is None else {"org_ids": org_ids})
    rows = result.mappings().all()
    return [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "grade_level": r["grade_level"],
            "subject": r["subject"],
            "is_active": r["is_active"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "teacher_name": r["teacher_name"],
            "teacher_email": r["teacher_email"],
            "org_name": r["org_name"],
            "student_count": r["student_count"] or 0,
        }
        for r in rows
    ]


@router.get("/analytics")
async def admin_analytics(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Analytics snapshot. Scoped to the caller's org(s) unless
    is_platform_admin (see _admin_org_ids)."""
    from models.database import User, Activity, LearningSession
    from sqlalchemy import text as _text
    _require_admin_role(current_user)
    org_ids = await _admin_org_ids(current_user, db)

    member_scope = "" if org_ids is None else \
        "AND id IN (SELECT user_id FROM organization_members WHERE org_id = ANY(:org_ids))"
    session_scope = "" if org_ids is None else \
        "AND user_id IN (SELECT user_id FROM organization_members WHERE org_id = ANY(:org_ids))"
    # Single consolidated query instead of 2 sequential round-trips.
    row = (await db.execute(_text(f"""
        SELECT
            (SELECT COUNT(*) FROM users WHERE is_active = true {member_scope})                 AS active_users,
            (SELECT COUNT(*) FROM learning_sessions WHERE status = 'completed' {session_scope}) AS completed_sessions
    """), {} if org_ids is None else {"org_ids": org_ids})).mappings().one()
    active_users       = int(row["active_users"]       or 0)
    completed_sessions = int(row["completed_sessions"] or 0)

    return {
        "active_users": active_users,
        "completed_sessions": completed_sessions,
        "storage_used_mb": 0,
        "api_requests_today": 0,
    }


# ============================================================================
# AUDIT LOG ENDPOINTS
# ============================================================================

@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: Optional[str] = Query(None),
    admin_id: Optional[str] = Query(None),
    success: Optional[bool] = Query(None),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """
    List admin audit log entries. Requires role=ADMIN, scoped to the
    caller's org(s) unless is_platform_admin (see _admin_org_ids).
    Supports filtering by action, admin_id, and success flag.
    """
    _require_admin_role(current_user)
    org_ids = await _admin_org_ids(current_user, db)

    from models.database import AdminAuditLog
    from sqlalchemy import select as _sel, desc

    q = _sel(AdminAuditLog)
    if org_ids is not None:
        q = q.where(text(
            "admin_id IN (SELECT user_id FROM organization_members WHERE org_id = ANY(:org_ids))"
        ).bindparams(org_ids=org_ids))
    if action:
        q = q.where(AdminAuditLog.action == action)
    if admin_id:
        q = q.where(AdminAuditLog.admin_id == admin_id)
    if success is not None:
        q = q.where(AdminAuditLog.success == success)
    q = q.order_by(desc(AdminAuditLog.created_at)).limit(limit).offset(offset)

    rows = (await db.execute(q)).scalars().all()

    return {
        "total": len(rows),
        "offset": offset,
        "limit": limit,
        "entries": [
            {
                "id":         str(r.id),
                "admin_id":   str(r.admin_id) if r.admin_id else None,
                "action":     r.action,
                "resource":   r.resource,
                "details":    r.details,
                "ip_address": r.ip_address,
                "user_agent": r.user_agent,
                "success":    r.success,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ],
    }


@router.get("/audit-logs/summary")
async def audit_log_summary(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Summary of recent admin actions grouped by action type. Scoped to
    the caller's org(s) unless is_platform_admin (see _admin_org_ids)."""
    _require_admin_role(current_user)
    org_ids = await _admin_org_ids(current_user, db)

    query = """
        SELECT action, COUNT(*) AS count,
               MAX(created_at) AS last_seen,
               SUM(CASE WHEN success = false THEN 1 ELSE 0 END) AS failures
        FROM admin_audit_logs
        WHERE created_at > NOW() - INTERVAL '30 days'
    """
    params: Dict[str, Any] = {}
    if org_ids is not None:
        query += " AND admin_id IN (SELECT user_id FROM organization_members WHERE org_id = ANY(:org_ids))"
        params["org_ids"] = org_ids
    query += " GROUP BY action ORDER BY count DESC"

    rows = (await db.execute(text(query), params)).mappings().all()

    return {
        "period": "last_30_days",
        "actions": [
            {
                "action":    r["action"],
                "count":     r["count"],
                "failures":  r["failures"],
                "last_seen": r["last_seen"].isoformat() if r["last_seen"] else None,
            }
            for r in rows
        ],
    }
