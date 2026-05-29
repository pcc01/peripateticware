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

from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import Optional
import logging
import uuid
from datetime import timedelta

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
    
    class Config:
        json_schema_extra = {
            "example": {
                "email": "newuser@example.com",
                "password": "SecurePassword123",
                "password_confirm": "SecurePassword123",
                "first_name": "John",
                "last_name": "Doe"
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
async def login(
    request: LoginRequest,
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
    if not request.email and not request.id:
        logger.warning("ðŸ” Login attempt with no email or id")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide either email or id"
        )
    
    if not request.password:
        logger.warning("ðŸ” Login attempt with no password")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password required"
        )
    
    identifier = request.email or request.id
    logger.info(f"ðŸ” Login attempt: {identifier}")
    
    try:
        user = None
        
        # Try email first (if provided)
        if request.email:
            result = await db.execute(
                select(User).where(User.email == request.email.lower())
            )
            user = result.scalar_one_or_none()
        
        # Try id if email didn't work (if provided)
        if not user and request.id:
            result = await db.execute(
                select(User).where(User.id == request.id)
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
        if not SecurityManager.verify_password(request.password, user.hashed_password):
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
async def signup(
    request: SignupRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Register new user and return JWT token
    
    Passwords must match and meet minimum length requirements
    """
    logger.info(f"ðŸ“ Signup attempt: {request.email}")
    
    try:
        # Validate passwords match
        if request.password != request.password_confirm:
            logger.warning(f"âŒ Signup failed: Passwords don't match for {request.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passwords do not match",
            )
        
        # Validate password length
        if len(request.password) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 6 characters",
            )
        
        # Check if email already exists
        result = await db.execute(
            select(User).where(User.email == request.email.lower())
        )
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            logger.warning(f"âŒ Signup failed: Email already registered {request.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        
        # Create new user with uuid
        new_user = User(
            id=uuid.uuid4(),
            email=request.email.lower(),
            username=request.email.lower().split("@")[0],
            hashed_password=SecurityManager.hash_password(request.password),
            first_name=request.first_name,
            last_name=request.last_name,
            full_name=f"{request.first_name} {request.last_name}",
            role="STUDENT",
            is_active=True
        )
        
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        
        # Create JWT token - FIXED: use data= parameter
        token = create_access_token(
            data={"sub": str(new_user.id)}
        )
        
        logger.info(f"âœ… Signup successful: {request.email}")
        
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
async def refresh_token(
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
        logger.error(f"âŒ Token refresh error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed"
        )

# ============================================================================
# INITIALIZATION
# ============================================================================

logger.info("âœ… Auth routes initialized")
logger.info(f"   Endpoints: /login, /signup, /logout, /refresh, /health")
logger.info(f"   Login supports: email + password OR id + password")

