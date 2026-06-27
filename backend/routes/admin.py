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
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import bcrypt
import httpx
from pathlib import Path
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, text
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
        admin_id:  UUID string from verify_admin_token_db(); None for unauthenticated attempts
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

class AdminLogin(BaseModel):
    username: str
    password: str


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
# IN-MEMORY ADMIN DATABASE (for demo - use PostgreSQL in production)
# ============================================================================

DEMO_ADMIN = {
    "id": "admin-001",
    "username": "admin",
    "password_hash": bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode(),
    "role": "admin",
    "created_at": datetime.now(),
}

def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify password against bcrypt hash"""
    return bcrypt.checkpw(plain_password.encode(), password_hash.encode())


def generate_session_token() -> str:
    """Generate a secure session token"""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 hash of token for safe storage in DB"""
    return hashlib.sha256(token.encode()).hexdigest()


async def verify_admin_token_db(token: str, db: AsyncSession) -> str:
    """Verify admin session token against DB — returns admin_id string."""
    from models.database import AdminSession, AdminUserModel
    if not token:
        raise HTTPException(status_code=401, detail="Admin token required")
    token_hash = hash_token(token)
    result = await db.execute(
        select(AdminSession).where(
            AdminSession.token_hash == token_hash,
            AdminSession.expires_at > datetime.now(timezone.utc).replace(tzinfo=None),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired admin session")
    return str(session.admin_id)


# ============================================================================
# AUTHENTICATION
# ============================================================================

@router.post("/auth/login", response_model=Dict[str, Any])
async def admin_login(
    credentials: AdminLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Login to admin panel — creates a DB-persisted session."""
    from models.database import AdminUserModel, AdminSession

    # Look up admin user in DB first; fall back to DEMO_ADMIN if table is empty
    result = await db.execute(
        select(AdminUserModel).where(AdminUserModel.username == credentials.username)
    )
    db_admin = result.scalar_one_or_none()

    if db_admin:
        if not verify_password(credentials.password, db_admin.password_hash):
            await log_admin_action(db, None, "login_failed", details={"username": credentials.username}, success=False, request=request)
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not db_admin.is_active:
            await log_admin_action(db, str(db_admin.id), "login_failed", details={"username": credentials.username, "reason": "inactive"}, success=False, request=request)
            raise HTTPException(status_code=401, detail="Account inactive")
        admin_id = str(db_admin.id)
        db_admin.last_login = datetime.now()
    else:
        # Fall back to in-code DEMO_ADMIN (first boot before migrations run)
        if credentials.username != DEMO_ADMIN["username"]:
            await log_admin_action(db, None, "login_failed", details={"username": credentials.username}, success=False, request=request)
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not verify_password(credentials.password, DEMO_ADMIN["password_hash"]):
            await log_admin_action(db, None, "login_failed", details={"username": credentials.username}, success=False, request=request)
            raise HTTPException(status_code=401, detail="Invalid credentials")
        admin_id = DEMO_ADMIN["id"]

    # Create DB-persisted session
    token = generate_session_token()
    token_hash = hash_token(token)
    expires_at = datetime.now() + timedelta(hours=8)

    session = AdminSession(
        id=uuid4(),
        admin_id=admin_id if db_admin is None else db_admin.id,
        token_hash=token_hash,
        expires_at=expires_at,
        created_at=datetime.now(),
    )
    db.add(session)
    try:
        await db.commit()
    except Exception:
        # Graceful fallback if admin_sessions table doesn't exist yet
        await db.rollback()

    await log_admin_action(db, admin_id, "login", success=True, request=request)

    return {
        "token": token,
        "user": {
            "id": admin_id,
            "username": credentials.username,
            "role": "admin",
        },
        "expires_at": expires_at.isoformat(),
    }


@router.post("/auth/logout")
async def admin_logout(
    token: str = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Logout from admin panel — deletes DB session."""
    admin_id = None
    if token:
        from models.database import AdminSession
        token_hash = hash_token(token)
        # Resolve admin_id before deleting the session
        try:
            admin_id = await verify_admin_token_db(token, db)
        except Exception:
            pass
        await db.execute(delete(AdminSession).where(AdminSession.token_hash == token_hash))
        try:
            await db.commit()
        except Exception:
            await db.rollback()
    await log_admin_action(db, admin_id, "logout", request=request)
    return {"message": "Logged out"}


async def verify_admin_token(token: str = None, db: AsyncSession = Depends(get_db)) -> str:
    """FastAPI dependency — verifies admin token against DB, returns admin_id."""
    return await verify_admin_token_db(token, db)


# ============================================================================
# ENV MANAGEMENT
# ============================================================================

@router.get("/env", response_model=list[EnvCategory])
async def get_env_variables(token: str = None, db: AsyncSession = Depends(get_db)):
    """Get all environment variables grouped by category"""
    await verify_admin_token_db(token, db)

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
    token: str = None,
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """Update an environment variable (with confirmation)"""
    admin_id = await verify_admin_token_db(token, db)

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
async def test_llm_provider(request: LLMTestRequest, token: str = None, db: AsyncSession = Depends(get_db)):
    """Test LLM provider (Ollama or Claude)"""
    await verify_admin_token_db(token, db)

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


@router.get("/dashboard")
async def admin_dashboard(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin overview dashboard — user counts, activity counts, system status."""
    from models.database import User, Activity, LearningSession
    _require_admin_role(current_user)

    # Consolidated into 2 queries instead of 7 sequential round-trips.
    from sqlalchemy import text as _text
    user_row = (await db.execute(_text("""
        SELECT
            COUNT(*)                                                        AS total_users,
            COUNT(*) FILTER (WHERE UPPER(role::text) = 'TEACHER')         AS teachers,
            COUNT(*) FILTER (WHERE UPPER(role::text) = 'STUDENT')         AS students,
            COUNT(*) FILTER (WHERE UPPER(role::text) = 'PARENT')          AS parents
        FROM users
    """))).mappings().one()

    act_row = (await db.execute(_text("""
        SELECT
            COUNT(*)                                                        AS total_activities,
            COUNT(*) FILTER (WHERE LOWER(status::text) = 'published')     AS published,
            (SELECT COUNT(*) FROM learning_sessions)                       AS sessions
        FROM activities
    """))).mappings().one()

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
    """List all users with pagination."""
    from models.database import User
    _require_admin_role(current_user)

    total = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    result = await db.execute(select(User).offset(skip).limit(limit).order_by(User.created_at.desc()))
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
    await db.delete(user)
    await db.commit()
    await log_admin_action(db, str(current_user.id), "delete_user", resource=user_id, request=request)


@router.get("/classes")
async def list_admin_classes(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all classrooms across all teachers."""
    _require_admin_role(current_user)
    from sqlalchemy import text as _t
    result = await db.execute(_t("""
        SELECT c.id, c.name, c.grade_level, c.subject,
               c.is_active, c.created_at,
               u.full_name AS teacher_name, u.email AS teacher_email,
               o.name AS org_name,
               COUNT(DISTINCT cs.student_id) AS student_count
        FROM classrooms c
        LEFT JOIN users u ON u.id = c.teacher_id
        LEFT JOIN organizations o ON o.id = c.org_id
        LEFT JOIN classroom_students cs ON cs.classroom_id = c.id
        GROUP BY c.id, u.full_name, u.email, o.name
        ORDER BY c.name
    """))
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
    """System-wide analytics snapshot."""
    from models.database import User, Activity, LearningSession
    from sqlalchemy import text as _text
    _require_admin_role(current_user)

    # Single consolidated query instead of 2 sequential round-trips.
    row = (await db.execute(_text("""
        SELECT
            (SELECT COUNT(*) FROM users WHERE is_active = true)                 AS active_users,
            (SELECT COUNT(*) FROM learning_sessions WHERE status = 'completed') AS completed_sessions
    """))).mappings().one()
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
    token: str = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: Optional[str] = Query(None),
    admin_id: Optional[str] = Query(None),
    success: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """
    List admin audit log entries. Requires admin auth token.
    Supports filtering by action, admin_id, and success flag.
    """
    await verify_admin_token_db(token, db)

    from models.database import AdminAuditLog
    from sqlalchemy import select as _sel, desc

    q = _sel(AdminAuditLog)
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
    token: str = None,
    db: AsyncSession = Depends(get_db),
):
    """Summary of recent admin actions grouped by action type."""
    await verify_admin_token_db(token, db)

    rows = (await db.execute(text("""
        SELECT action, COUNT(*) AS count,
               MAX(created_at) AS last_seen,
               SUM(CASE WHEN success = false THEN 1 ELSE 0 END) AS failures
        FROM admin_audit_logs
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY action
        ORDER BY count DESC
    """))).mappings().all()

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
