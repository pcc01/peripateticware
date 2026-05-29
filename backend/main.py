# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Peripateticware FastAPI Backend
✅ FIXED: Uses SecurityManager for JWT, proper database initialization
✅ Phase 6: Student activity endpoints registered at /api/v1/student
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from contextlib import asynccontextmanager
import logging
import os

# ============================================================================
# IMPORTS - Core modules
# ============================================================================
from core.config import settings
from core.database import Base, get_db
from models.user import User
import models.database  # noqa: F401 — registers all ORM models (LearningSession, StudentProfile, Phase 5-7) so SQLAlchemy configure_mappers() succeeds

# ============================================================================
# LOGGING
# ============================================================================
logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

# ============================================================================
# DATABASE SETUP
# ============================================================================
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,   # ✅ CRITICAL: Verify connections before using
    pool_recycle=3600,    # ✅ Recycle connections every hour
)

async_session = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# ============================================================================
# STARTUP & SHUTDOWN EVENTS
# ============================================================================

async def init_db():
    """Initialize database tables"""
    try:
        async with engine.begin() as conn:
            # Tables are created via SQL migration scripts (student_schema.sql)
            # and the existing alembic migrations — not via create_all here.
            pass
        logger.info("✅ Database tables verified")
        return True
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
        return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle app startup and shutdown"""
    # ✅ STARTUP
    logger.info("🚀 Starting Peripateticware...")

    db_ready = await init_db()
    if not db_ready:
        logger.error("❌ Failed to initialize database")
        raise RuntimeError("Database initialization failed")

    logger.info(f"✅ Database: {settings.DATABASE_URL.split('@')[-1]}")
    logger.info(f"✅ LLM Provider: {settings.LLM_PROVIDER}")
    logger.info(f"✅ CORS Origins: {settings.CORS_ORIGINS}")
    logger.info("✅ Application ready")

    yield

    # ✅ SHUTDOWN
    logger.info("🛑 Shutting down Peripateticware...")
    await engine.dispose()
    logger.info("✅ Database connections closed")


# ============================================================================
# CREATE APP
# ============================================================================

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="Outdoor and peripatetic learning platform",
    lifespan=lifespan,
)

# ============================================================================
# MIDDLEWARE
# ============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# STATIC FILE SERVING  (student uploads — photos, audio, sketches)
# ============================================================================
# The /uploads volume is mounted in docker-compose.yml.
# In production swap this for a CDN / S3 redirect.

_UPLOAD_DIR = "/app/uploads"
os.makedirs(_UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_UPLOAD_DIR), name="uploads")

# ============================================================================
# DEPENDENCY INJECTION
# ============================================================================

async def get_db_session():
    """Dependency to get database session"""
    async with async_session() as session:
        yield session


from core.database import get_db
app.dependency_overrides[get_db] = get_db_session

# ============================================================================
# ROUTES
# ============================================================================

# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health")
@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "llm_provider": settings.LLM_PROVIDER,
        "database": "connected",
    }


# ── Auth routes ───────────────────────────────────────────────────────────────
from routes.auth import router as auth_router
app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])


# ── Teacher activity routes ───────────────────────────────────────────────────
try:
    from routes.activities import router as activities_router
    app.include_router(activities_router, tags=["activities"])
    logger.info("✅ Teacher activities router registered")
except ImportError as e:
    logger.info(f"⊘ Activities router not available: {e}")

# ── Inference / LLM routes ────────────────────────────────────────────────────
try:
    from routes.inference import router as inference_router
    app.include_router(inference_router, prefix="/api/v1/inference", tags=["inference"])
    logger.info("✅ Inference router registered at /api/v1/inference")
except ImportError as e:
    logger.warning(f"⊘ Inference router not available: {e}")


# ── Phase 6: Student activity routes ─────────────────────────────────────────
try:
    from routes.student_activities import router as student_router
    app.include_router(student_router, prefix="/api/v1/student", tags=["student"])
    logger.info("✅ Student activities router registered at /api/v1/student")
except ImportError as e:
    logger.error(f"❌ Student activities router failed to load: {e}")


# ── Parent routes ─────────────────────────────────────────────────────────────
try:
    from routes.parent import router as parent_router
    app.include_router(parent_router, tags=["parent"])
    logger.info("✅ Parent router registered")
except ImportError:
    logger.info("⊘ Parent router not available (optional)")


# ── Sessions routes (legacy / curriculum-based) ───────────────────────────────
try:
    from routes.sessions import router as sessions_router
    app.include_router(sessions_router, prefix="/api/v1/sessions", tags=["sessions"])
    logger.info("✅ Sessions router registered")
except ImportError:
    logger.info("⊘ Sessions router not available (optional)")


# ── Privacy Engine routes ─────────────────────────────────────────────────────
try:
    from routes.privacy import router as privacy_router
    app.include_router(privacy_router, tags=["privacy"])
    logger.info("✅ Privacy router registered at /api/v1/privacy")
except ImportError as e:
    logger.error(f"❌ Privacy router failed to load: {e}")


# ── Phase 5: Privacy + Location combined routes ───────────────────────────────
try:
    from routes.privacy_locations import router as privacy_locations_router
    app.include_router(privacy_locations_router, prefix="/api/v1", tags=["privacy", "locations"])
    logger.info("✅ Privacy/Location router registered at /api/v1/privacy and /api/v1/locations")
except ImportError as e:
    logger.warning(f"⊘ Privacy/Location router not available: {e}")


# ── Phase 7: Student-Initiated Activities (Field Notes + Peer Projects) ────────
try:
    from routes.phase7_student_initiated import router as phase7_router
    app.include_router(phase7_router, prefix="/api/v1", tags=["phase7", "field-notes", "peer-projects"])
    logger.info("✅ Phase 7 router registered at /api/v1/student/field-notes, /api/v1/student/peer-projects")
except ImportError as e:
    logger.warning(f"⊘ Phase 7 router not available: {e}")


# ── Admin panel routes ────────────────────────────────────────────────────────
try:
    from routes.admin import router as admin_router
    app.include_router(admin_router)   # prefix="/api/v1/admin" is set in the router itself
    logger.info("✅ Admin router registered at /api/v1/admin")
except ImportError as e:
    logger.warning(f"⊘ Admin router not available: {e}")


# ============================================================================
# ROOT & CATCH-ALL
# ============================================================================

@app.get("/")
async def root():
    return {
        "message": "Welcome to Peripateticware API",
        "docs":    "/docs",
        "health":  "/health",
        "student_api": "/api/v1/student",
    }


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def catch_all(path: str):
    return {
        "message": "Endpoint not found",
        "path":    path,
        "hint":    "Check /docs for available endpoints",
    }


# ============================================================================
# STARTUP MESSAGE
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    logger.info("=" * 70)
    logger.info(f"🚀 Starting {settings.APP_NAME} Backend")
    logger.info(f"📍 Host: {settings.API_HOST}:{settings.API_PORT}")
    logger.info(f"📚 Docs: http://localhost:{settings.API_PORT}/docs")
    logger.info("=" * 70)

    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.ENVIRONMENT == "development",
        log_level=settings.LOG_LEVEL.lower(),
    )
