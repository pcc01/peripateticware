# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Peripateticware - AI-Powered Contextual Learning Platform
Main FastAPI Application Entry Point
Updated: April 27, 2026 - Phase 2 Complete
"""

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
import logging
from datetime import datetime
from routes.health import router as health_router


# Import all route modules
from routes import (
    auth,
    sessions,
    curriculum,
    inference,
    observability,
    parent,
    email,              # NEW - Phase 2
    reset,              # NEW - Phase 2
    linking,            # NEW - Phase 2
    notifications,      # NEW - Phase 2
    activities,         # NEW - Phase 3 Teacher Features
    projects,           # NEW - Phase 3 Teacher Features
)

from core.config import settings
from core.database import engine, Base

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Database tables are created via database/init.sql in PostgreSQL container
# We use AsyncEngine which doesn't support synchronous create_all()
# Tables will be created when the database initializes

# Initialize FastAPI app
app = FastAPI(
    title="Peripateticware API",
    description="AI-powered contextual learning platform with parent portal",
    version="1.0.0",
    docs_url="/api/docs",           # Swagger UI - working
    redoc_url=None,                  # ReDoc disabled (blank page issue)
    openapi_url="/api/openapi.json"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure trusted hosts
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.ALLOWED_HOSTS
)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "Peripateticware API",
        "version": "1.0.0"
    }

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Peripateticware API",
        "version": "1.0.0",
        "docs": "/api/docs",
        "health": "/health",
        "endpoints": {
            "auth": "/api/v1/auth",
            "parent_portal": "/api/v1/parent",
            "curriculum": "/api/v1/curriculum",
            "inference": "/api/v1/inference",
            "sessions": "/api/v1/sessions"
        }
    }

# ============================================================================
# ROUTE REGISTRATION - PHASE 1 ROUTES
# ============================================================================

# Authentication routes
app.include_router(
    auth.router,
    prefix="/api/v1/auth",
    tags=["authentication"]
)
app.include_router(
    health_router, prefix="/api/v1/health"
    )
# Session management routes
app.include_router(
    sessions.router,
    prefix="/api/v1/sessions",
    tags=["sessions"]
)

# Curriculum routes
app.include_router(
    curriculum.router,
    prefix="/api/v1/curriculum",
    tags=["curriculum"]
)

# AI Inference routes
app.include_router(
    inference.router,
    prefix="/api/v1/inference",
    tags=["inference"]
)

# Observability routes
app.include_router(
    observability.router,
    prefix="/api/v1/observability",
    tags=["observability"]
)

# Parent portal routes (Phase 1)
app.include_router(
    parent.router,
    prefix="/api/v1/parent",
    tags=["parent-portal"]
)

# ============================================================================
# ROUTE REGISTRATION - PHASE 2 ROUTES (NEW)
# ============================================================================

# Email service routes
app.include_router(
    email.router,
    prefix="/api/v1/parent/email",
    tags=["email-service"]
)

# Password reset routes
app.include_router(
    reset.router,
    prefix="/api/v1",
    tags=["password-reset"]
)

# Child linking routes
app.include_router(
    linking.router,
    prefix="/api/v1/parent/children",
    tags=["child-linking"]
)

# Notification routes
app.include_router(
    notifications.router,
    prefix="/api/v1/parent/notifications",
    tags=["notifications"]
)

# ============================================================================
# ROUTE REGISTRATION - PHASE 3 ROUTES (Teacher Features)
# ============================================================================

# Activity management routes
app.include_router(
    activities.router,
    tags=["teacher-activities"]
)

# Project management routes
app.include_router(
    projects.router,
    tags=["teacher-projects"]
)

# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler for unhandled errors"""
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "message": str(exc) if settings.ENVIRONMENT == "development" else "An error occurred"

🔧 Fix 2: Simplify auth.py
The database connection is broken. Replace your backend/routes/auth.py with this simpler version:
python# Copyright (c) 2026 Paul Christopher Cerda
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

🚀 Restart
powershelldocker-compose down
docker-compose up
Then test:
powershell$body = @{
    email = "teacher@example.com"
    username = "teachertest"
    password = "SecurePassword123"
    full_name = "Jane Smith"
    role = "teacher"
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://localhost:8000/api/v1/auth/register" `
  -Method Post `
  -Body $body `
  -ContentType "application/json"

$response.Content
Let me know! 🚀Haiku 4.5Extended
        }
    )

# ============================================================================
# STARTUP AND SHUTDOWN EVENTS
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize application on startup"""
    logger.info("🚀 Peripateticware API Starting...")
    logger.info(f"📍 Environment: {settings.ENVIRONMENT}")
    logger.info(f"🔗 Database: {settings.DATABASE_URL}")
    logger.info(f"🌍 CORS Origins: {settings.CORS_ORIGINS}")
    logger.info("✅ Phase 1 Routes: ✓ (auth, sessions, curriculum, inference, observability, parent)")
    logger.info("✅ Phase 2 Routes: ✓ (email, reset, linking, notifications)")
    logger.info("🎯 API Ready at: http://localhost:8000")
    logger.info("📚 Documentation: http://localhost:8000/api/docs")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("🛑 Peripateticware API Shutting Down...")

# ============================================================================
# LIFESPAN EVENTS (Alternative for FastAPI 0.93+)
# ============================================================================

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager"""
    # Startup
    logger.info("🚀 Peripateticware API Starting...")
    yield
    # Shutdown
    logger.info("🛑 Peripateticware API Shutting Down...")

# Uncomment to use lifespan instead of on_event:
# app = FastAPI(lifespan=lifespan, ...)

# ============================================================================
# DEBUGGING AND DEVELOPMENT
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    # Run development server
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG,
        log_level="info"
    )