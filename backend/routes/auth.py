"""Authentication routes"""
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from core.database import get_db
from core.security import SecurityManager
from core.dependencies import get_current_user
from models.database import User, UserRole
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class LoginRequest(BaseModel):
    """Login request model"""
    email: str
    password: str


class RegisterRequest(BaseModel):
    """Registration request model"""
    email: EmailStr
    username: str
    password: str
    full_name: str
    role: UserRole = UserRole.STUDENT


class TokenResponse(BaseModel):
    """Token response model"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int


@router.post("/register", response_model=dict)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user"""
    try:
        # Check if user exists
        query = select(User).where(User.email == request.email)
        result = await db.execute(query)
        existing_user = result.scalar()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Hash password
        hashed_password = SecurityManager.hash_password(request.password)
        
        # Create new user
        user = User(
            email=request.email,
            username=request.username,
            hashed_password=hashed_password,
            full_name=request.full_name,
            role=request.role
        )
        
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
        logger.info(f"User registered: {user.email}")
        
        return {
            "user_id": str(user.id),
            "email": user.email,
            "username": user.username,
            "role": user.role.value
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """Login user"""
    try:
        # Find user
        query = select(User).where(User.email == request.email)
        result = await db.execute(query)
        user = result.scalar()
        
        if not user or not SecurityManager.verify_password(request.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive"
            )
        
        # Generate JWT token
        access_token = SecurityManager.create_access_token(
            data={"sub": str(user.id), "email": user.email}
        )
        expires_in = 86400  # 24 hours
        
        logger.info(f"User logged in: {user.email}")
        
        return TokenResponse(
            access_token=access_token,
            expires_in=expires_in
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed"
        )


@router.get("/me")
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Get current user information"""
    try:
        return {
            "user_id": str(current_user.id),
            "email": current_user.email,
            "username": current_user.username,
            "full_name": current_user.full_name,
            "role": current_user.role.value
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch user"
        )
# File: backend/routes/auth.py
# UPDATED - Phase 3 Sprint 1 Task 1.5
# ADD THIS ENDPOINT to your existing auth.py (keep existing endpoints)

# Existing endpoints should already be here:
# - POST /auth/login
# - POST /auth/register
# - GET /auth/me
# - POST /auth/logout

# ============================================
# Token Refresh Endpoint (NEW - Phase 3 Sprint 1)
# ============================================

@router.post("/refresh", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def refresh_token(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # Your existing auth dependency
):
    """
    Refresh access token when it expires
    
    🚩 MOBILE REQUIREMENT: Mobile calls this when token expires or on 401 errors
    
    This endpoint keeps users logged in without requiring re-authentication
    Mobile will call this automatically before token expires
    
    Request:
    - Header: Authorization: Bearer {current_token}
    
    Response:
    {
      "access_token": "new_token_here",
      "token_type": "bearer",
      "expires_in": 3600,
      "user": {
        "id": "...",
        "email": "...",
        "name": "..."
      }
    }
    
    Raises:
    - 401: Token invalid or expired (user must login again)
    - 403: User deactivated (user must login again)
    - 500: Server error
    """
    try:
        logger.info(f"Token refresh requested for user {current_user.id}")
        
        # Step 1: Verify user still exists in database
        user = db.query(User).filter(User.id == current_user.id).first()
        
        if not user:
            logger.warning(f"Token refresh: user {current_user.id} not found")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Step 2: Verify user account is not deleted
        if user.deleted_at is not None:
            logger.warning(f"Token refresh: user {current_user.id} account deleted")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account has been deleted",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Step 3: Create new access token (1 hour expiration)
        access_token_expires = timedelta(hours=1)
        new_access_token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=access_token_expires
        )
        
        logger.info(f"Token refreshed successfully for user {user.id}")
        
        # Step 4: Return new token
        return {
            "access_token": new_access_token,
            "token_type": "bearer",
            "expires_in": 3600,  # 1 hour in seconds
            "user": {
                "id": str(user.id),
                "email": user.email,
                "name": user.name,
                "role": user.role,
            }
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions (auth errors)
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed"
        )


# ============================================
# Token Refresh Endpoint (Phase 3 Sprint 1)
# ============================================

@router.post("/refresh", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def refresh_token(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Refresh access token when it expires
    
    Mobile calls this when token expires or on 401 errors.
    Keeps users logged in without re-authentication.
    
    Request:
    - Header: Authorization: Bearer {current_token}
    
    Response:
    {
      "access_token": "new_token_here",
      "token_type": "bearer",
      "expires_in": 86400
    }
    
    Raises:
    - 401: Token invalid or expired
    - 403: User deactivated
    - 500: Server error
    """
    try:
        logger.info(f"Token refresh requested for user {current_user.id}")
        
        # Verify user still exists
        query = select(User).where(User.id == current_user.id)
        result = await db.execute(query)
        user = result.scalar()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Verify user account not deleted
        if user.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account has been deleted",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Create new access token
        new_access_token = SecurityManager.create_access_token(
            data={"sub": str(user.id), "email": user.email}
        )
        
        logger.info(f"Token refreshed successfully for user {user.id}")
        
        return TokenResponse(
            access_token=new_access_token,
            expires_in=86400
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed"
        )