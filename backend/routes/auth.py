# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Authentication routes - Login, signup, token management
âœ… FIXED: Uses SecurityManager from core.security, proper error handling
âœ… NEW: Supports login with both email AND uid
âœ… FIXED: Removed duplicate /api/v1/auth prefix (added in main.py)
âœ… FIXED: Correct create_access_token calls
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import Optional
import logging
import uuid
from datetime import timedelta
from services.signed_url import SignedURL
from services.email_service import send_verification_email, send_welcome_email

# Rate limiting — gracefully disabled if slowapi is unavailable
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _limiter = Limiter(key_func=get_remote_address)
    RATE_LIMIT_AVAILABLE = True
except ImportError:
    _limiter = None
    RATE_LIMIT_AVAILABLE = False

def _rate_limit(rate: str):
    """Return a slowapi limiter decorator, or a no-op if slowapi is unavailable."""
    if RATE_LIMIT_AVAILABLE:
        return _limiter.limit(rate)
    def noop(fn):
        return fn
    return noop

logger = logging.getLogger(__name__)

# ============================================================================
# IMPORTS - Core modules
# ============================================================================
try:
    from core.database import get_db
    from core.security import SecurityManager, create_access_token
    from models.user import User
    logger.info("âœ… Auth routes: All imports successful")
except ImportError as e:
    logger.error(f"âŒ Auth routes: Import failed: {e}")
    raise

# ============================================================================
# ROUTER SETUP
# ============================================================================
# NOTE: Prefix is NOT included here because main.py adds it:
#       app.include_router(auth_router, prefix="/api/v1/auth")
router = APIRouter(
    tags=["authentication"],
    responses={
        401: {"description": "Unauthorized"},
        400: {"description": "Bad request"},
        500: {"description": "Internal server error"}
    }
)

# ============================================================================
# SCHEMAS (Pydantic Models)
# ============================================================================

class LoginRequest(BaseModel):
    """Login request - supports email OR id"""
    email: Optional[EmailStr] = None
    id: Optional[str] = None
    password: str
    
    class Config:
        json_schema_extra = {
            "examples": [
                {
                    "summary": "Login with email",
                    "value": {
                        "email": "student@example.com",
                        "password": "SecurePassword123"
                    }
                },
                {
                    "summary": "Login with user id",
                    "value": {
                        "id": "550e8400-e29b-41d4-a716-446655440000",
                        "password": "SecurePassword123"
                    }
                }
            ]
        }


class SignupRequest(BaseModel):
    """Signup request with user details"""
    email: EmailStr
    password: str
    password_confirm: str
    first_name: str
    last_name: str
    # username is optional — auto-generated from email prefix if absent
    username: Optional[str] = None
    # role is optional — defaults to STUDENT; frontend may pass 'teacher', 'parent', etc.
    role: Optional[str] = "STUDENT"

    class Config:
        json_schema_extra = {
            "example": {
                "email": "newuser@example.com",
                "password": "SecurePassword123",
                "password_confirm": "SecurePassword123",
                "first_name": "John",
                "last_name": "Doe",
                "role": "STUDENT"
            }
        }


class TokenResponse(BaseModel):
    """Successful authentication response"""
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    role: str
    expires_in: int
    
    class Config:
        json_schema_extra = {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "user_id": "550e8400-e29b-41d4-a716-446655440000",
                "email": "student@example.com",
                "role": "STUDENT",
                "expires_in": 86400
            }
        }


class UserResponse(BaseModel):
    """User information response"""
    id: str
    email: str
    username: str
    first_name: str
    last_name: str
    full_name: str
    role: str
    is_active: bool
    
    class Config:
        from_attributes = True


class LogoutResponse(BaseModel):
    """Logout response"""
    message: str


# ============================================================================
# HEALTH CHECK
# ============================================================================

@router.get("/health")
async def auth_health():
    """Check if auth service is available"""
    return {
        "status": "ok",
        "service": "authentication",
        "version": "1.0"
    }

# ============================================================================
# LOGIN ENDPOINT
# ============================================================================

@router.post("/login", response_model=TokenResponse, status_code=200)
@_rate_limit("5/minute")
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Login with email or id and password
    
    Returns JWT access token on success
    
    Accepts either:
    - {"email": "student@example.com", "password": "SecurePassword123"}
    - {"id": "550e8400-e29b-41d4-a716-446655440000", "password": "SecurePassword123"}
    """
    
    # Validate input
    if not body.email and not body.id:
        logger.warning("ðŸ” Login attempt with no email or id")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide either email or id"
        )
    
    if not body.password:
        logger.warning("ðŸ” Login attempt with no password")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password required"
        )
    
    identifier = body.email or body.id
    logger.info(f"ðŸ” Login attempt: {identifier}")
    
    try:
        user = None
        
        # Try email first (if provided)
        if body.email:
            result = await db.execute(
                select(User).where(User.email == body.email.lower())
            )
            user = result.scalar_one_or_none()
        
        # Try id if email didn't work (if provided)
        if not user and body.id:
            result = await db.execute(
                select(User).where(User.id == body.id)
            )
            user = result.scalar_one_or_none()
        
        # User not found
        if not user:
            logger.warning(f"âŒ Login failed: User not found: {identifier}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email/id or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Verify password
        logger.debug(f"Checking password for user: {user.email}")
        if not SecurityManager.verify_password(body.password, user.hashed_password):
            logger.warning(f"âŒ Login failed: Wrong password for {user.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email/id or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Check if user is active
        if not user.is_active:
            logger.warning(f"âŒ Login failed: User inactive {user.email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive",
            )
        
        # Create JWT token - FIXED: use data= parameter
        token = create_access_token(
            data={"sub": str(user.id)}
        )
        
        logger.info(f"âœ… Login successful: {user.email} ({user.role})")
        
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user_id=str(user.id),
            email=user.email,
            role=user.role,
            expires_in=86400  # 24 hours in seconds
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"âŒ Login error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed due to server error"
        )

# ============================================================================
# SIGNUP ENDPOINT
# ============================================================================

@router.post("/signup", response_model=TokenResponse, status_code=201)
@_rate_limit("10/minute")
async def signup(
    request: Request,
    body: SignupRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Register new user and return JWT token
    
    Passwords must match and meet minimum length requirements
    """
    logger.info(f"ðŸ“ Signup attempt: {body.email}")
    
    try:
        # Validate passwords match
        if body.password != body.password_confirm:
            logger.warning(f"âŒ Signup failed: Passwords don't match for {body.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passwords do not match",
            )
        
        # Validate password length
        if len(body.password) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 6 characters",
            )
        
        # Check if email already exists
        result = await db.execute(
            select(User).where(User.email == body.email.lower())
        )
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            logger.warning(f"âŒ Signup failed: Email already registered {body.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        
        # Create new user with uuid
        new_user = User(
            id=uuid.uuid4(),
            email=body.email.lower(),
            username=body.username or body.email.lower().split("@")[0],
            hashed_password=SecurityManager.hash_password(body.password),
            first_name=body.first_name,
            last_name=body.last_name,
            full_name=f"{body.first_name} {body.last_name}",
            role=(body.role or "STUDENT").upper(),
            is_active=False  # activated after email verification
        )

        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        # Send verification email
        try:
            ver_token = SignedURL.generate(
                purpose="email_verification",
                payload={"user_id": str(new_user.id), "email": new_user.email},
            )
            await send_verification_email(new_user.email, ver_token)
        except Exception as _e:
            logger.warning("Verification email failed (non-blocking): %s", _e)

        token = create_access_token(data={"sub": str(new_user.id)})
        
        logger.info(f"âœ… Signup successful: {body.email}")
        
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user_id=str(new_user.id),
            email=new_user.email,
            role=new_user.role,
            expires_in=86400  # 24 hours in seconds
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"âŒ Signup error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Signup failed due to server error"
        )

# ============================================================================
# LOGOUT ENDPOINT
# ============================================================================

@router.post("/logout", response_model=LogoutResponse)
async def logout():
    """
    Logout endpoint (token invalidation handled by frontend)
    
    Frontend should delete JWT token from localStorage
    """
    logger.info("ðŸ‘‹ User logged out")
    return LogoutResponse(message="Logged out successfully")

# ============================================================================
# TOKEN REFRESH ENDPOINT (Optional)
# ============================================================================

@router.post("/refresh", response_model=TokenResponse)
@_rate_limit("20/minute")
async def refresh_token(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Refresh JWT token (optional - useful for long sessions)
    
    Header: Authorization: Bearer <token>
    """
    try:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or invalid authorization header"
            )
        
        token = authorization.replace("Bearer ", "")
        
        # Verify current token and extract user_id
        payload = SecurityManager.verify_token(token)
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token"
            )
        
        user_id = payload.get("sub")
        
        # Get user from database
        result = await db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        # Create new token - FIXED: use data= parameter
        new_token = create_access_token(
            data={"sub": str(user.id)}
        )
        
        logger.info(f"âœ… Token refreshed for user {user.email}")
        
        return TokenResponse(
            access_token=new_token,
            token_type="bearer",
            user_id=str(user.id),
            email=user.email,
            role=user.role,
            expires_in=86400
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Token refresh failed")


# =============================================================================
# EMAIL VERIFICATION
# =============================================================================

@router.get("/verify-email")
async def verify_email(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Activate account from the link emailed after signup.
    Frontend: GET /verify-email?token=<signed_token>
    On success redirect to /login?verified=1
    """
    from services.signed_url import SignedURL, SignedURLError, SignedURLExpired
    from fastapi.responses import RedirectResponse
    from core.config import settings as _settings

    try:
        data = SignedURL.validate(token, purpose="email_verification")
    except SignedURLExpired:
        return RedirectResponse(f"{_settings.FRONTEND_URL}/login?error=link_expired")
    except SignedURLError:
        return RedirectResponse(f"{_settings.FRONTEND_URL}/login?error=invalid_link")

    import uuid as _uuid
    try:
        user_id = _uuid.UUID(data["user_id"])
    except (KeyError, ValueError):
        return RedirectResponse(f"{_settings.FRONTEND_URL}/login?error=invalid_link")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return RedirectResponse(f"{_settings.FRONTEND_URL}/login?error=invalid_link")

    if user.is_active:
        # Already verified — just send them to login
        return RedirectResponse(f"{_settings.FRONTEND_URL}/login?verified=1")

    user.is_active = True
    await db.commit()
    logger.info("Email verified for user %s", user_id)

    # Send welcome email (non-blocking)
    try:
        await send_welcome_email(user.email, user.full_name or user.email, user.role)
    except Exception as _e:
        logger.warning("Welcome email failed: %s", _e)

    return RedirectResponse(f"{_settings.FRONTEND_URL}/login?verified=1")


@router.post("/resend-verification")
async def resend_verification(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Resend verification email. Accepts {"email": "..."}.
    Always returns success to prevent enumeration.
    Rate limiting handled by slowapi on the router.
    """
    email = body.get("email", "").lower().strip()
    if email:
        result = await db.execute(select(User).where(User.email == email, User.is_active == False))
        user = result.scalar_one_or_none()
        if user:
            try:
                ver_token = SignedURL.generate(
                    purpose="email_verification",
                    payload={"user_id": str(user.id), "email": user.email},
                )
                await send_verification_email(user.email, ver_token)
            except Exception as _e:
                logger.warning("Resend verification failed: %s", _e)

    return {"success": True, "message": "If your account exists and is unverified, a new link has been sent."}
