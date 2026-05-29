# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Admin Routes - Environment management, auth, and LLM testing
"""
from fastapi import APIRouter, Depends, HTTPException, status, Body
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
import json
from datetime import datetime, timedelta
from functools import lru_cache
import bcrypt
import httpx
from pathlib import Path

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

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

ADMIN_SESSIONS: Dict[str, Dict] = {}  # token -> {user_id, expires_at}


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify password against bcrypt hash"""
    return bcrypt.checkpw(plain_password.encode(), password_hash.encode())


def generate_session_token() -> str:
    """Generate a simple session token"""
    import secrets
    return secrets.token_urlsafe(32)


# ============================================================================
# AUTHENTICATION
# ============================================================================

@router.post("/auth/login", response_model=Dict[str, Any])
async def admin_login(credentials: AdminLogin):
    """Login to admin panel"""
    if credentials.username != DEMO_ADMIN["username"]:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(credentials.password, DEMO_ADMIN["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Create session
    token = generate_session_token()
    ADMIN_SESSIONS[token] = {
        "user_id": DEMO_ADMIN["id"],
        "expires_at": datetime.now() + timedelta(hours=8),
    }

    return {
        "token": token,
        "user": {
            "id": DEMO_ADMIN["id"],
            "username": DEMO_ADMIN["username"],
            "role": DEMO_ADMIN["role"],
        },
        "expires_at": ADMIN_SESSIONS[token]["expires_at"].isoformat(),
    }


@router.post("/auth/logout")
async def admin_logout(token: str = None):
    """Logout from admin panel"""
    if token in ADMIN_SESSIONS:
        del ADMIN_SESSIONS[token]
    return {"message": "Logged out"}


def verify_admin_token(token: str) -> str:
    """Verify admin session token - returns user_id"""
    if not token or token not in ADMIN_SESSIONS:
        raise HTTPException(status_code=401, detail="Unauthorized")

    session = ADMIN_SESSIONS[token]
    if datetime.now() > session["expires_at"]:
        del ADMIN_SESSIONS[token]
        raise HTTPException(status_code=401, detail="Session expired")

    return session["user_id"]


# ============================================================================
# ENV MANAGEMENT
# ============================================================================

@router.get("/env", response_model=list[EnvCategory])
async def get_env_variables(token: str = None):
    """Get all environment variables grouped by category"""
    verify_admin_token(token)

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
    token: str = None
):
    """Update an environment variable (with confirmation)"""
    verify_admin_token(token)

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
async def test_llm_provider(request: LLMTestRequest, token: str = None):
    """Test LLM provider (Ollama or Claude)"""
    verify_admin_token(token)

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
