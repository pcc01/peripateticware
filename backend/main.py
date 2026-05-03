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
        }
    )

# ============================================================================
# STARTUP AND SHUTDOWN EVENTS
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize application on startup"""
    logger.info("Peripateticware API Starting...")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"Database: {settings.DATABASE_URL}")
    logger.info(f"CORS Origins: {settings.CORS_ORIGINS}")
    logger.info("Phase 1 Routes: auth, sessions, curriculum, inference, observability, parent")
    logger.info("Phase 2 Routes: email, reset, linking, notifications")
    logger.info("Phase 3 Routes: activities, projects")
    logger.info("API Ready at: http://localhost:8000")
    logger.info("Documentation: http://localhost:8000/api/docs")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Peripateticware API Shutting Down...")

# ============================================================================
# LIFESPAN EVENTS (Alternative for FastAPI 0.93+)
# ============================================================================

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager"""
    # Startup
    logger.info("Peripateticware API Starting...")
    yield
    # Shutdown
    logger.info("Peripateticware API Shutting Down...")

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