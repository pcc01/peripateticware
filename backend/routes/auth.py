"""Authentication routes"""

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

# ADD THIS NEW ENDPOINT:

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import logging

from core.database import get_db
from models import User
from utils.jwt import create_access_token, decode_token
from schemas.auth import TokenResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

# ============================================
# Token Refresh Endpoint (NEW - Phase 3 Sprint 1)
# ============================================

@router.post("/refresh", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def refresh_token(
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_token)  # Your existing auth dependency
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
# HELPER FUNCTIONS (should already exist)
# ============================================

# Make sure your auth.py has these functions:

def verify_token(
    token: str = Depends(oauth2_scheme),  # oauth2_scheme from fastapi.security
    db: Session = Depends(get_db)
) -> User:
    """
    Dependency to verify JWT token and get current user
    
    Usage in route:
        @router.get("/me")
        async def get_current_user(current_user: User = Depends(verify_token)):
            return current_user
    """
    try:
        # Step 1: Decode JWT token
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Step 2: Get user from database
    user = db.query(User).filter(User.id == user_id).first()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


# ============================================
# INTEGRATION NOTES
# ============================================

"""
Integration Instructions:

1. If verify_token() doesn't exist in your auth.py, copy it above

2. If oauth2_scheme doesn't exist, add to your auth.py:
   from fastapi.security import HTTPBearer, HTTPAuthCredentials
   oauth2_scheme = HTTPBearer()

3. Make sure your models.User has these fields:
   - id: UUID or similar
   - email: str
   - name: str
   - role: str
   - deleted_at: Optional[datetime]

4. Make sure jwt utilities exist in utils/jwt.py:
   - create_access_token(data: dict, expires_delta: timedelta) -> str
   - decode_token(token: str) -> dict

5. Make sure you have TokenResponse schema in schemas/auth.py:
   class TokenResponse(BaseModel):
       access_token: str
       token_type: str
       expires_in: int
       user: UserResponse

6. Test the endpoint:
   curl -X POST \
     -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:8010/api/v1/auth/refresh
   
   Should return:
   {
     "access_token": "new_token_here",
     "token_type": "bearer",
     "expires_in": 3600,
     "user": {
       "id": "...",
       "email": "...",
       "name": "...",
       "role": "..."
     }
   }

7. Error responses:
   401 - Token invalid/expired
   403 - User deleted
   500 - Server error

8. Integration in main.py:
   from routes.auth import router as auth_router
   app.include_router(auth_router, prefix="/api/v1")
"""

# ============================================
# IMPORTANT NOTES FOR MOBILE
# ============================================

"""
Mobile app behavior with token refresh:

1. On app startup:
   - Mobile calls GET /api/v1/auth/me to verify token
   - If 401, mobile calls POST /api/v1/auth/refresh
   - If refresh succeeds, mobile retries original request
   - If refresh fails, user sees login screen

2. During normal operation:
   - Mobile tracks token expiration time
   - When token about to expire (within 5 min), calls refresh
   - User stays logged in without interruption

3. On any 401 response:
   - Mobile calls refresh endpoint
   - Retries the original request
   - If refresh fails, user directed to login

4. Offline mode:
   - If offline, mobile queues the request
   - When online, mobile calls refresh first (if token expired)
   - Then retries queued requests

This ensures seamless user experience - token refresh is transparent!
"""