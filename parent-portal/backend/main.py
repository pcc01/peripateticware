# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Peripateticware Parent Portal - FastAPI Application
Phase 7 - Parent Portal API Server
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
import logging
import os
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import parent portal routes
try:
    from parent_routes import router as parent_router
except ImportError:
    logger.warning("parent_routes not found, creating empty router")
    from fastapi import APIRouter
    parent_router = APIRouter()

app = FastAPI(
    title="Peripateticware Parent Portal API",
    description="Parent dashboard, messaging, and progress tracking",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json"
)

# CORS Configuration
cors_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if cors_origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Trusted hosts
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=os.getenv("ALLOWED_HOSTS", "*").split(",")
)

# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint for Docker and monitoring"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "Peripateticware Parent Portal API",
        "version": "1.0.0"
    }

# Root endpoint
@app.get("/")
async def root():
    """API root endpoint with information"""
    return {
        "message": "Peripateticware Parent Portal API",
        "version": "1.0.0",
        "docs": "/api/docs",
        "health": "/health",
        "endpoints": {
            "parent_portal": "/api/v1/parent"
        }
    }

# Register parent portal routes
app.include_router(
    parent_router,
    prefix="/api/v1/parent",
    tags=["parent-portal"]
)

@app.on_event("startup")
async def startup_event():
    """Startup event"""
    logger.info("Parent Portal API starting...")
    logger.info("Environment: production" if os.getenv("ENVIRONMENT") == "production" else "development")
    logger.info("Parent Portal API ready at http://localhost:8000")

@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown event"""
    logger.info("Parent Portal API shutting down...")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("API_HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", "8000")),
        reload=os.getenv("ENVIRONMENT") != "production"
    )
