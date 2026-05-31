# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Peripateticware FastAPI Backend
✅ FIXED: Uses SecurityManager for JWT, proper database initialization
✅ Phase 6: Student activity endpoints registered at /api/v1/student
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from contextlib import asynccontextmanager
import asyncio
import logging
import os

# Rate limiting
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
    RATE_LIMIT_ENABLED = True
except ImportError:
    limiter = None
    RATE_LIMIT_ENABLED = False

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

    # ── Safe column migrations (ADD COLUMN IF NOT EXISTS) ────────────────────
    try:
        async with engine.begin() as conn:
            # ── Create enum types if missing, then convert columns to VARCHAR ──
            # The DB volume may have columns typed against these enums but the
            # type definitions lost/never created — asyncpg casts fail at query
            # time. Creating the type unblocks the cast; ALTER converts to plain
            # VARCHAR so we're never dependent on the enum type again.
            await conn.execute(text("""
                DO $$ BEGIN
                    CREATE TYPE activity_status AS ENUM ('draft', 'published', 'archived');
                EXCEPTION WHEN duplicate_object THEN NULL;
                END $$
            """))
            await conn.execute(text("""
                DO $$ BEGIN
                    CREATE TYPE activity_type_enum AS ENUM (
                        'inquiry','field_observation','hands_on','project',
                        'discussion','experiment','discovery'
                    );
                EXCEPTION WHEN duplicate_object THEN NULL;
                END $$
            """))
            # Convert to plain VARCHAR — safe even if already VARCHAR
            await conn.execute(text(
                "ALTER TABLE activities ALTER COLUMN status TYPE VARCHAR(50) "
                "USING status::VARCHAR"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ALTER COLUMN activity_type TYPE VARCHAR(50) "
                "USING activity_type::VARCHAR"
            ))
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS age_group VARCHAR(20)"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS enriched_location_id UUID"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS location_address VARCHAR(512)"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS location_info TEXT"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS suggested_lessons JSONB"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS wiki_location_id VARCHAR(255)"
            ))
            # ── Phase 5 / location-enrichment columns ─────────────────────
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS location_source VARCHAR(50)"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS location_context_id UUID"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS privacy_jurisdiction_id VARCHAR(100)"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS privacy_compliant BOOLEAN DEFAULT FALSE"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS last_compliance_check TIMESTAMP"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS originator_student_id UUID"
            ))
            # ── Taxonomy / assessment columns ──────────────────────────────
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS assessment_type VARCHAR(50) DEFAULT 'formative'"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS marzano_level INTEGER"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS dok_level INTEGER"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS solo_level INTEGER"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS primary_framework VARCHAR(50) DEFAULT 'blooms'"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS rubric_id UUID"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS curriculum_unit_ids UUID[] DEFAULT '{}'"
            ))
            # ── Discovery-mode columns ─────────────────────────────────────
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_mode VARCHAR(50)"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_task_description TEXT"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_location_required BOOLEAN DEFAULT FALSE"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_documentation_requirements JSONB"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_success_criteria TEXT"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_difficulty_level INTEGER DEFAULT 2"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_time_limit_minutes INTEGER"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_location_gps_capture_enabled BOOLEAN DEFAULT TRUE"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_location_sharing_rules JSONB"
            ))
            # ── Publishing / stats columns ─────────────────────────────────
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_shareable BOOLEAN DEFAULT FALSE"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0"
            ))
            await conn.execute(text(
                "ALTER TABLE activities ADD COLUMN IF NOT EXISTS published_at TIMESTAMP"
            ))
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_parental_consent BOOLEAN NOT NULL DEFAULT FALSE"
            ))
            await conn.execute(text(
                "CREATE TABLE IF NOT EXISTS compliance_rules ("
                "rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                "regulation_id VARCHAR(100), version VARCHAR(20),"
                "jurisdiction VARCHAR(100) NOT NULL, effective_date TIMESTAMP,"
                "sunset_date TIMESTAMP, rule_definition JSONB, created_by VARCHAR(255),"
                "created_at TIMESTAMP DEFAULT NOW(), previous_version_id UUID,"
                "change_log TEXT, is_active BOOLEAN DEFAULT TRUE, audit_hash VARCHAR(256))"
            ))
            await conn.execute(text(
                "CREATE TABLE IF NOT EXISTS rule_audit_log ("
                "id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                "action_type VARCHAR(100), data_category VARCHAR(100),"
                "records_affected INTEGER DEFAULT 0, jurisdiction VARCHAR(100),"
                "student_id_hash VARCHAR(256), compliance_status VARCHAR(20) DEFAULT 'COMPLIANT',"
                "created_at TIMESTAMP DEFAULT NOW())"
            ))
            await conn.execute(text(
                "CREATE TABLE IF NOT EXISTS consent_records ("
                "id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
                "student_id_hash VARCHAR(256) NOT NULL, consent_type VARCHAR(50) NOT NULL,"
                "consent_version VARCHAR(10), jurisdiction VARCHAR(100),"
                "is_active BOOLEAN DEFAULT TRUE,"
                "granted_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())"
            ))
        # ── Standards & rubrics tables ────────────────────────────────
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS standards_sets (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    type VARCHAR(50) NOT NULL,
                    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    state_code VARCHAR(10),
                    is_global BOOLEAN DEFAULT FALSE,
                    source_file VARCHAR(512),
                    criteria JSONB DEFAULT '[]',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS homeschool_children (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    parent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    child_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    grade_level INTEGER DEFAULT 0,
                    age_band VARCHAR(10) DEFAULT 'k6',
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(parent_id, child_id)
                )
            """))
            await db.execute(text("""
                CREATE TABLE IF NOT EXISTS activity_standards_map (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
                    standards_set_id UUID NOT NULL REFERENCES standards_sets(id) ON DELETE CASCADE,
                    criterion_id VARCHAR(100) NOT NULL,
                    coverage_level VARCHAR(50) DEFAULT 'partial',
                    notes TEXT,
                    mapped_by UUID REFERENCES users(id) ON DELETE SET NULL,
                    ai_suggested BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT uq_activity_standards_criterion
                        UNIQUE (activity_id, standards_set_id, criterion_id)
                )
            """))
        logger.info("✅ Column migrations applied")
    except Exception as e:
        logger.warning(f"⊘ Column migration skipped: {e}")

    if not db_ready:
        logger.error("❌ Failed to initialize database")
        raise RuntimeError("Database initialization failed")

    logger.info(f"✅ Database: {settings.DATABASE_URL.split('@')[-1]}")
    logger.info(f"✅ LLM Provider: {settings.LLM_PROVIDER}")
    logger.info(f"✅ CORS Origins: {settings.CORS_ORIGINS}")

    # ── Pre-flight configuration warnings ─────────────────────────────────
    if not getattr(settings, "SMTP_HOST", ""):
        logger.warning(
            "⚠  EMAIL: SMTP_HOST is not set — all emails will be logged to console "
            "and NOT delivered. Set SMTP_HOST + SMTP_USER + SMTP_PASSWORD + EMAIL_DRY_RUN=false "
            "in .env to enable real email delivery (signup confirmation, password reset, etc)."
        )
    if getattr(settings, "SECRET_KEY", "") in ("", "dev-secret-key-change-in-production"):
        logger.warning(
            "⚠  SECURITY: SECRET_KEY is set to the development default. "
            "Generate a strong key before any non-local deployment: "
            "python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    if getattr(settings, "AUDIT_HASH_SALT", "") in ("", "dev-audit-salt-change-in-production"):
        logger.warning(
            "⚠  SECURITY: AUDIT_HASH_SALT is set to the development default. "
            "Student ID hashes in the audit log will be predictable. Rotate before production."
        )

    logger.info("✅ Application ready")

    # ── Aristotelian questions table + seed (Block 11) ─────────────────────────
    try:
        from routes.questions import ensure_questions_table
        await ensure_questions_table(engine)
    except Exception as e:
        logger.warning(f"⊘ Questions seed skipped: {e}")

    # ── Daily data retention cleanup (Block 14f) ─────────────────────────────
    try:
        from tasks.retention_cleanup import run_retention_cleanup_loop
        asyncio.create_task(run_retention_cleanup_loop(interval_hours=24))
        logger.info("✅ Retention cleanup task scheduled (every 24 h)")
    except Exception as e:
        logger.warning(f"⊘ Retention cleanup task not started: {e}")

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

# ── Rate limiter ──────────────────────────────────────────────────────────────
if RATE_LIMIT_ENABLED:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    logger.info("✅ Rate limiting enabled (slowapi)")

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
    app.include_router(parent_router, prefix="/api/v1", tags=["parent"])
    logger.info("✅ Parent router registered at /api/v1/parent")
except ImportError:
    logger.info("⊘ Parent router not available (optional)")


# ── Sessions routes (legacy / curriculum-based) ───────────────────────────────
try:
    from routes.sessions import router as sessions_router
    app.include_router(sessions_router, prefix="/api/v1/sessions", tags=["sessions"])
    logger.info("✅ Sessions router registered")
except ImportError:
    logger.info("⊘ Sessions router not available (optional)")


# ── Privacy Engine routes ────────────────────────────────────────────
try:
    from routes.privacy import router as privacy_router
    app.include_router(privacy_router, tags=["privacy"])
    logger.info("✅ Privacy router registered at /api/v1/privacy")
except ImportError as e:
    logger.error(f"❌ Privacy router failed to load: {e}")


# ── Phase 5: Privacy + Location combined routes ─────────────────────────────────────────
try:
    from routes.privacy_locations import router as privacy_locations_router
    app.include_router(privacy_locations_router, prefix="/api/v1", tags=["privacy", "locations"])
    logger.info("✅ Privacy/Location router registered at /api/v1/privacy and /api/v1/locations")
except ImportError as e:
    logger.warning(f"⊘ Privacy/Location router not available: {e}")


# ── Phase 7: Student-Initiated Activities ────────────────────────────────────────────
try:
    from routes.phase7_student_initiated import router as phase7_router
    app.include_router(phase7_router, prefix="/api/v1", tags=["phase7", "field-notes", "peer-projects"])
    logger.info("✅ Phase 7 router registered")
except ImportError as e:
    logger.warning(f"⊘ Phase 7 router not available: {e}")


# ── Student Proposals: Reverse Scavenger Hunt ─────────────────────────────────
try:
    from routes.proposals import router as proposals_router
    app.include_router(proposals_router, tags=["proposals"])
    logger.info("✅ Proposals router registered")
except ImportError as e:
    logger.warning(f"⊘ Proposals router not available: {e}")


# ── Additional optional routes ────────────────────────────────────────────────────────────────────────
for _module, _prefix, _tag, _label in [
    ("routes.questions",     "/api/v1",           "questions",     "Questions"),
    ("routes.curriculum",    "/api/v1/curriculum", "curriculum",    "Curriculum"),
    ("routes.linking",       "/api/v1",            "linking",       "Linking"),
    ("routes.notifications", "/api/v1",            "notifications", "Notifications"),
    ("routes.email",         "/api/v1",            "email",         "Email"),
    ("routes.reset",         "",                   "reset",         "Reset"),  # router has full prefix built-in
    ("routes.rubrics",       "/api/v1/rubrics",    "rubrics",       "Rubrics"),
    ("routes.observability", "/api/v1",            "observability", "Observability"),
]:
    try:
        import importlib
        _mod = importlib.import_module(_module)
        app.include_router(_mod.router, prefix=_prefix, tags=[_tag])
        logger.info(f"✅ {_label} router registered")
    except Exception as _e:
        logger.info(f"⊘ {_label} router not available: {_e}")


# ── Export routes ────────────────────────────────────────────────────────────
try:
    from routes.export import router as export_router
    app.include_router(export_router)
    logger.info("✅ Export router registered at /api/v1/export")
except ImportError as e:
    logger.warning(f"⊘ Export router not available: {e}")



# ── Standards & Rubrics routes ────────────────────────────────────────────────
try:
    from routes.standards import router as standards_router
    app.include_router(standards_router, tags=["standards"])
    logger.info("✅ Standards router registered at /api/v1/standards")
except ImportError as e:
    logger.warning(f"⊘ Standards router not available: {e}")

try:
    from routes.rubrics import router as rubrics_router_extra
    # rubrics already registered via bulk loop above; skip if already loaded
except ImportError as e:
    logger.warning(f"⊘ Rubrics router not available: {e}")


# ── Homeschool routes ─────────────────────────────────────────────────────────
try:
    from routes.homeschool import router as homeschool_router
    app.include_router(homeschool_router, tags=["homeschool"])
    logger.info("✅ Homeschool router registered at /api/v1/homeschool")
except ImportError as e:
    logger.warning(f"⊘ Homeschool router not available: {e}")


# ── Admin routes ──────────────────────────────────────────────────────────────
try:
    from routes.admin import router as admin_router
    app.include_router(admin_router, tags=["admin"])
    logger.info("✅ Admin router registered at /api/v1/admin")
except ImportError as e:
    logger.warning(f"⊘ Admin router not available: {e}")


# ── Teacher Projects routes ───────────────────────────────────────────────────
try:
    from routes.projects import router as projects_router
    app.include_router(projects_router, tags=["projects"])
    logger.info("✅ Projects router registered at /api/v1/teacher/projects")
except ImportError as e:
    logger.warning(f"⊘ Projects router not available: {e}")


# ── Student (generic) routes ──────────────────────────────────────────────────
try:
    from routes.student import router as student_generic_router
    app.include_router(student_generic_router, tags=["student"])
    logger.info("✅ Student generic router registered")
except ImportError as e:
    logger.warning(f"⊘ Student generic router not available: {e}")


# ── Health routes ─────────────────────────────────────────────────────────────
try:
    from routes.health import router as health_router
    app.include_router(health_router, tags=["health"])
    logger.info("✅ Health router registered at /health")
except ImportError as e:
    logger.warning(f"⊘ Health router not available: {e}")
