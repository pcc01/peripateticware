# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Authentication and authorization dependencies"""

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from core.security import SecurityManager, TOKEN_EXPIRED
from models.database import User, UserRole
import logging

logger = logging.getLogger(__name__)

security = HTTPBearer()


async def get_user_from_token_str(token: str, db: AsyncSession) -> User:
    """Shared helper — validate a raw JWT string and return the User.

    Distinguishes token expiry (TOKEN_EXPIRED sentinel) from a bad/tampered
    token so the frontend receives a clear reason=expired signal.
    """
    payload = SecurityManager.verify_token(token)
    if payload is TOKEN_EXPIRED:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = SecurityManager.extract_user_id_from_token(token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")
    return user


async def get_current_user_flexible(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Auth dependency that accepts token from Authorization header OR ?token= query param.
    Use this for endpoints loaded directly by the browser (<img>, <video>, <audio> tags)
    where setting an Authorization header is not possible.
    """
    # 1. Authorization: Bearer <token>
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        return await get_user_from_token_str(token, db)
    # 2. ?token=<jwt>
    token = request.query_params.get("token")
    if token:
        return await get_user_from_token_str(token, db)
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get authenticated current user"""
    try:
        token = credentials.credentials
        payload = SecurityManager.verify_token(token)
        if payload is TOKEN_EXPIRED:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user_id = SecurityManager.extract_user_id_from_token(token)
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Fetch user from database
        query = select(User).where(User.id == user_id)
        result = await db.execute(query)
        user = result.scalar()
        
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive"
            )
        
        return user
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_teacher(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get authenticated teacher user"""
    if current_user.role not in [UserRole.TEACHER, UserRole.ADMIN, UserRole.HOMESCHOOL]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher access required"
        )
    return current_user


async def get_current_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get authenticated admin user"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


async def optional_user(
    credentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get current user if authenticated, None otherwise"""
    try:
        token = credentials.credentials if credentials else None
        if not token:
            return None
        
        user_id = SecurityManager.extract_user_id_from_token(token)
        if user_id is None:
            return None
        
        query = select(User).where(User.id == user_id)
        result = await db.execute(query)
        user = result.scalar()
        
        return user
    except Exception as e:
        logger.debug(f"Optional user auth failed: {e}")
        return None
    

# Alias for compatibility
verify_token = SecurityManager.verify_token

async def get_current_platform_admin(
    request: "Request",
    credentials=Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Dependency: requires the caller to be a Peripateticware platform operator
    (users.is_platform_admin = True).  Distinct from role=ADMIN (org admin).
    Use this on all /platform/* routes.
    """
    from core.config import settings as _s
    # Second-factor: static X-Platform-Secret header (skip check if secret not configured)
    if _s.PLATFORM_API_SECRET:
        given = request.headers.get("X-Platform-Secret", "")
        import hmac as _hmac
        if not _hmac.compare_digest(given, _s.PLATFORM_API_SECRET):
            raise HTTPException(status_code=403, detail="Invalid platform secret.")

    user = await get_current_user(credentials=credentials, db=db)
    if not getattr(user, "is_platform_admin", False):
        raise HTTPException(
            status_code=403,
            detail="Platform admin access required.",
        )
    return user


# Alias — some routes import this name
require_platform_admin = get_current_platform_admin


# ── Resource ownership helpers ────────────────────────────────────────────────

def require_owns_resource(
    resource_owner_id,
    current_user: User,
    *,
    allow_admin: bool = True,
    resource_name: str = "resource",
) -> None:
    """
    Raise HTTP 403 if current_user doesn't own the resource.
    Pass allow_admin=False to enforce ownership even for admins.
    Usage:
        require_owns_resource(activity.teacher_id, current_user)
    """
    if allow_admin and current_user.role == UserRole.ADMIN:
        return
    if str(resource_owner_id) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: you don't own this {resource_name}",
        )


def require_same_org(
    resource_org_id,
    current_user: User,
    *,
    allow_admin: bool = True,
) -> None:
    """
    Raise HTTP 403 if resource belongs to a different org than the current user.
    No-op if either org_id is None (personal resources, ungrouped users).
    Usage:
        require_same_org(classroom.org_id, current_user)
    """
    if allow_admin and current_user.role == UserRole.ADMIN:
        return
    if resource_org_id is None or current_user.org_id is None:
        return
    if str(resource_org_id) != str(current_user.org_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: resource belongs to a different organization",
        )
