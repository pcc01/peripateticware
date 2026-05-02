# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Authentication routes"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from core.database import get_db
from core.security import SecurityManager
from schemas.auth import UserResponse, TokenResponse
from core.dependencies import get_current_user
from models.database import User, UserRole
from fastapi.security import OAuth2PasswordBearer
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# OAuth2 scheme for token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


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


@router.post("/register", response_model=dict)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user"""
    try:
        # Check if user exists
        stmt = select(User).where(User.email == request.email)
        result = await db.execute(stmt)
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Hash password
        hashed_password = SecurityManager.hash_password(request.password)
        
        # Create new user
        new_user = User(
            email=request.email,
            username=request.username,
            hashed_password=hashed_password,
            full_name=request.full_name,
            role=request.role,
            is_active=True
        )
        
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        
        logger.info(f"✅ User registered: {new_user.email}")
        
        return {
            "success": True,
            "user_id": str(new_user.id),
            "email": new_user.email,
            "username": new_user.username,
            "full_name": new_user.full_name,
            "role": new_user.role.value if hasattr(new_user.role, 'value') else new_user.role
        }
    
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Registration error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}"
        )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """Login user"""
    try:
        # Find user
        stmt = select(User).where(User.email == request.email)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user or not SecurityManager.verify_password(request.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
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
        
        logger.info(f"✅ User logged in: {user.email}")
        
        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=expires_in,
            user=UserResponse(
                id=str(user.id),
                email=user.email,
                first_name=user.full_name.split()[0] if user.full_name else "",
                last_name=user.full_name.split()[-1] if user.full_name and len(user.full_name.split()) > 1 else "",
                role=user.role.value if hasattr(user.role, 'value') else user.role,
                is_active=user.is_active,
                created_at=user.created_at.isoformat() if hasattr(user, 'created_at') and user.created_at else None
            )
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {str(e)}"
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
            "role": current_user.role.value if hasattr(current_user.role, 'value') else current_user.role,
            "is_active": current_user.is_active
        }
    except Exception as e:
        logger.error(f"❌ Get user error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch user info"
        )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Refresh access token"""
    try:
        logger.info(f"🔄 Token refresh for user {current_user.id}")
        
        # Verify user exists
        stmt = select(User).where(User.id == current_user.id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )
        
        # Create new token
        access_token = SecurityManager.create_access_token(
            data={"sub": str(user.id), "email": user.email}
        )
        expires_in = 86400
        
        logger.info(f"✅ Token refreshed for user {user.id}")
        
        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=expires_in,
            user=UserResponse(
                id=str(user.id),
                email=user.email,
                first_name=user.full_name.split()[0] if user.full_name else "",
                last_name=user.full_name.split()[-1] if user.full_name and len(user.full_name.split()) > 1 else "",
                role=user.role.value if hasattr(user.role, 'value') else user.role,
                is_active=user.is_active,
                created_at=user.created_at.isoformat() if hasattr(user, 'created_at') and user.created_at else None
            )
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Token refresh error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed"
        )