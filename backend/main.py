"""
Peripateticware: Contextual AI Tutor Backend
FastAPI main application entry point
"""

import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from core.config import settings
from core.database import engine, Base, get_db
from core.cache import initialize_cache
from models.database import User, LearningSession, CurriculumUnit
from routes import auth, sessions, curriculum, inference, observability
from services.rag_orchestrator import RAGOrchestrator
from services.sync_engine import SyncEngine

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global service instances
rag_orchestrator: Optional[RAGOrchestrator] = None
sync_engine: Optional[SyncEngine] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager for startup and shutdown"""
    # Startup
    logger.info("Starting Peripateticware backend...")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"LLM Provider: {settings.LLM_PROVIDER}")
    
    try:
        # Initialize database
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}", exc_info=True)
        raise
    
    try:
        # Initialize cache
        await initialize_cache()
        logger.info("Cache initialized successfully")
    except Exception as e:
        logger.error(f"Cache initialization failed: {e}", exc_info=True)
    
    try:
        # Initialize RAG Orchestrator
        global rag_orchestrator
        rag_orchestrator = RAGOrchestrator()
        await rag_orchestrator.initialize()
        logger.info("RAG Orchestrator initialized successfully")
    except Exception as e:
        logger.error(f"RAG Orchestrator initialization failed: {e}", exc_info=True)
    
    try:
        # Initialize Sync Engine
        global sync_engine
        sync_engine = SyncEngine()
        await sync_engine.start()
        logger.info("Sync Engine started successfully")
    except Exception as e:
        logger.error(f"Sync Engine startup failed: {e}", exc_info=True)
    
    logger.info("Peripateticware backend startup complete")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Peripateticware backend...")
    try:
        if sync_engine:
            await sync_engine.stop()
        logger.info("Sync Engine stopped")
    except Exception as e:
        logger.error(f"Sync Engine shutdown error: {e}")
    
    try:
        await engine.dispose()
        logger.info("Database connections closed")
    except Exception as e:
        logger.error(f"Database shutdown error: {e}")
    
    logger.info("Shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="Peripateticware API",
    description="Contextual AI Tutor Backend",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log incoming requests for debugging"""
    logger.debug(f"Request: {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        logger.debug(f"Response: {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"Request error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"}
        )


# Health check endpoint
@app.get("/health")
async def health_check():
    """System health check endpoint"""
    return {
        "status": "healthy",
        "service": "peripateticware-api",
        "version": "0.1.0",
        "environment": settings.ENVIRONMENT
    }


# Root endpoint
@app.get("/")
async def root():
    """API root endpoint"""
    return {
        "name": "Peripateticware",
        "description": "Contextual AI Tutor Backend",
        "documentation": "/docs",
        "status": "active",
        "version": "0.1.0"
    }


# WebSocket for real-time learning sessions
@app.websocket("/ws/session/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time session updates"""
    await websocket.accept()
    logger.info(f"WebSocket connection opened for session: {session_id}")
    try:
        while True:
            data = await websocket.receive_json()
            # Process incoming data from Flutter client
            response = await rag_orchestrator.process_inquiry(
                session_id=session_id,
                inquiry=data
            )
            await websocket.send_json(response)
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
        await websocket.close(code=1000)
    finally:
        logger.info(f"WebSocket connection closed for session: {session_id}")


# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["authentication"])
app.include_router(sessions.router, prefix="/api/v1/sessions", tags=["sessions"])
app.include_router(curriculum.router, prefix="/api/v1/curriculum", tags=["curriculum"])
app.include_router(inference.router, prefix="/api/v1/inference", tags=["inference"])
app.include_router(observability.router, prefix="/api/v1/observability", tags=["observability"])


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": type(exc).__name__}
    )


if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8010,
        log_level=settings.LOG_LEVEL.lower()
    )
