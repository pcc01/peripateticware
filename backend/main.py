# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Peripateticware FastAPI Backend
✅ FIXED: Uses SecurityManager for JWT, proper database initialization
✅ Phase 6: Student activity endpoints registered at /api/v1/student
"""

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
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
import models.agent_run  # noqa: F401 — registers AgentRun ORM model

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
    from startup import (
        apply_enum_and_core_column_migrations,
        apply_location_table_migrations,
        apply_agent_runs_table,
        apply_parent_activity_submission_migrations,
        apply_core_schema_migrations,
        apply_billing_column_migrations,
        apply_student_phase7_migrations,
        apply_rag_documents_table,
        seed_sample_activities,
        seed_demo_users,
        seed_test_accounts,
        seed_homeschool_demo,
        seed_demo_classroom,
        seed_compliance_frameworks,
        seed_ai_task_config_orm,
        check_config_warnings,
        start_background_tasks,
    )

    # ── STARTUP ──────────────────────────────────────────────────────────────
    logger.info("Starting Peripateticware...")

    # Redis cache connection — was previously never called anywhere, so
    # redis_client stayed None forever and every cache/revocation check
    # silently no-op'd (fail-open by design, but that means it was never
    # actually enforcing anything). Non-fatal: cache/token-revocation
    # degrade gracefully without Redis, but should be connected when
    # available so they actually do something.
    try:
        from core.cache import initialize_cache
        await initialize_cache()
    except Exception as e:
        logger.warning(f"⊘ Redis cache unavailable at startup (non-fatal, fail-open): {e}")

    db_ready = await init_db()

    # Schema migrations (inline SQL patches — TODO: convert to Alembic migrations)
    await apply_enum_and_core_column_migrations(engine)
    await apply_location_table_migrations(engine)
    await apply_agent_runs_table(engine)
    await apply_parent_activity_submission_migrations(engine)
    await apply_core_schema_migrations(engine)
    await apply_billing_column_migrations(engine)
    await apply_student_phase7_migrations(engine)
    await apply_rag_documents_table(engine)

    # Seed data
    await seed_sample_activities(engine)

    if not db_ready:
        logger.error("Failed to initialize database")
        raise RuntimeError("Database initialization failed")

    logger.info(f"Database: {settings.DATABASE_URL.split('@')[-1]}")
    logger.info(f"LLM Provider: {settings.LLM_PROVIDER}")
    logger.info(f"CORS Origins: {settings.CORS_ORIGINS}")

    check_config_warnings(settings)
    logger.info("Application ready")

    # SECURITY: demo/test seed accounts use published, well-known passwords
    # (SecurePass123!, Test1234!, Demo@1234!) and include ADMIN-role accounts.
    # These must NEVER be created outside development - gate strictly on
    # ENVIRONMENT so a misconfigured prod box can't silently grow a backdoor
    # admin account on every restart.
    if settings.ENVIRONMENT.lower() == "development":
        await seed_demo_users(engine)
        await seed_test_accounts(engine)
        await seed_homeschool_demo(engine)
        await seed_demo_classroom(engine)
    else:
        logger.info("Skipping demo/test account seeding (ENVIRONMENT=%s)", settings.ENVIRONMENT)
    await seed_compliance_frameworks(engine)

    try:
        from routes.questions import ensure_questions_table
        await ensure_questions_table(engine)
    except Exception as e:
        logger.warning(f"Questions seed skipped: {e}")

    await seed_ai_task_config_orm(settings)
    await start_background_tasks(async_session, settings)

    yield

    # ── SHUTDOWN ─────────────────────────────────────────────────────────────
    logger.info("Shutting down Peripateticware...")
    await engine.dispose()
    logger.info("Database connections closed")


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

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Adds HTTP security headers to every response.

    CSP notes:
    - style-src  : 'unsafe-inline' required by Vite-injected styles + Google Fonts
    - script-src : 'unsafe-eval' only in development (Vite HMR); removed in prod
    - connect-src: ws://localhost:* / wss://localhost:* covers Vite HMR in dev only;
                   production tightens this to 'self' ws: wss: scoped to same origin
    - img-src    : data: / blob: needed for canvas exports; https: for external avatars
    - worker-src : blob: required for PDF.js / audio worklets

    HSTS is suppressed in development (HTTP-only) — browsers ignore it over HTTP
    anyway, but omitting it keeps dev tooling clean.
    """
    _API_PREFIX = "/api/"

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        is_dev = settings.ENVIRONMENT == "development"

        # script-src: allow eval only in dev (Vite needs it for source maps / HMR)
        script_src = (
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
            if is_dev
            else "script-src 'self' 'unsafe-inline'"
        )

        # connect-src: Vite HMR uses ws://localhost:* in dev
        connect_src = (
            "connect-src 'self' ws://localhost:* wss://localhost:*"
            if is_dev
            else "connect-src 'self' ws: wss:"
        )

        # upgrade-insecure-requests only makes sense over HTTPS (production)
        upgrade_insecure = "" if is_dev else " upgrade-insecure-requests;"

        csp_parts = [
            "default-src 'self'",
            script_src,
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' data: blob: https:",
            connect_src,
            "media-src 'self' blob:",
            "worker-src blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]
        response.headers["Content-Security-Policy"] = (
            "; ".join(csp_parts) + ";" + upgrade_insecure
        )

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "geolocation=(self), microphone=(self), camera=(self), payment=(), usb=()"
        )
        # HSTS: only meaningful over HTTPS — skip in development
        if not is_dev:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-site"
        # API responses must never be cached by proxies or browsers
        if request.url.path.startswith(self._API_PREFIX):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Pragma"] = "no-cache"
        return response


app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# ROUTE REGISTRATION
# Routes removed from this file at some point; restored here.
# Prefixes:
#   - Routers whose APIRouter already carries the full /api/v1/... prefix
#     are included with no extra prefix argument.
#   - Routers with a partial prefix like /classrooms need prefix="/api/v1".
#   - Routers with no prefix get the full prefix here.
# ============================================================================

# ── Core / Auth ───────────────────────────────────────────────────────────────
from routes.health import router as health_router
app.include_router(health_router)                          # prefix="/health" in router

from routes.auth import router as auth_router
app.include_router(auth_router, prefix="/api/v1/auth")

from routes.reset import router as reset_router
app.include_router(reset_router)                           # prefix="/api/v1/public/password" in router

# ── Sessions & Activities ─────────────────────────────────────────────────────
from routes.sessions import router as sessions_router
app.include_router(sessions_router, prefix="/api/v1/sessions")

from routes.activities import router as activities_router
app.include_router(activities_router)                      # prefix="/api/v1/activities" in router

from routes.curriculum import router as curriculum_router
app.include_router(curriculum_router, prefix="/api/v1/curriculum")

# ── Student ───────────────────────────────────────────────────────────────────
from routes.student import router as student_router
app.include_router(student_router)                         # prefix="/api/v1/student" in router

from routes.student_activities import router as student_activities_router
app.include_router(student_activities_router, prefix="/api/v1/student")

from routes.phase7_student_initiated import router as phase7_router
app.include_router(phase7_router, prefix="/api/v1")

from routes.proposals import router as proposals_router
app.include_router(proposals_router)                          # uses hardcoded /api/v1/teacher/proposals paths

# ── Teacher / Classrooms ──────────────────────────────────────────────────────
try:
    from routes.classrooms import router as classrooms_router
    app.include_router(classrooms_router, prefix="/api/v1")      # router prefix="/classrooms"
except Exception as e:
    print(f"Warning: could not register classrooms_router: {e}")

try:
    from routes.projects import router as projects_router
    app.include_router(projects_router)                           # router prefix="/api/v1/teacher/projects"
except Exception as e:
    print(f"Warning: could not register projects_router: {e}")

try:
    from routes.rubrics import router as rubrics_router
    app.include_router(rubrics_router, prefix="/api/v1")          # router prefix="/rubrics"
except Exception as e:
    print(f"Warning: could not register rubrics_router: {e}")

try:
    from routes.standards import router as standards_router
    app.include_router(standards_router)                          # router prefix="/api/v1/standards"
except Exception as e:
    print(f"Warning: could not register standards_router: {e}")

try:
    from routes.questions import router as questions_router
    app.include_router(questions_router)                          # router prefix="/api/v1/aristotelian-questions"
except Exception as e:
    print(f"Warning: could not register questions_router: {e}")

# ── Parent ────────────────────────────────────────────────────────────────────
try:
    from routes.parent import router as parent_router
    app.include_router(parent_router, prefix="/api/v1")           # router prefix="/parent"
except Exception as e:
    print(f"Warning: could not register parent_router: {e}")

try:
    from routes.linking import router as linking_router
    app.include_router(linking_router)                            # router prefix="/api/v1/parent/children"
except Exception as e:
    print(f"Warning: could not register linking_router: {e}")

try:
    from routes.notifications import router as notifications_router
    app.include_router(notifications_router)                      # router prefix="/api/v1/parent/notifications"
except Exception as e:
    print(f"Warning: could not register notifications_router: {e}")

try:
    from routes.email import router as email_router
    app.include_router(email_router)                              # router prefix="/api/v1/parent/email"
except Exception as e:
    print(f"Warning: could not register email_router: {e}")

# ── Admin ─────────────────────────────────────────────────────────────────────
try:
    from routes.admin import router as admin_router
    app.include_router(admin_router)                              # router prefix="/api/v1/admin"
except Exception as e:
    print(f"Warning: could not register admin_router: {e}")

try:
    from routes.platform_admin import router as platform_admin_router
    app.include_router(platform_admin_router)                     # router prefix="/api/v1/platform"
except Exception as e:
    print(f"Warning: could not register platform_admin_router: {e}")

# ── Homeschool ────────────────────────────────────────────────────────────────
try:
    from routes.homeschool import router as homeschool_router
    app.include_router(homeschool_router)                         # router prefix="/api/v1/homeschool"
except Exception as e:
    print(f"Warning: could not register homeschool_router: {e}")

# ── Privacy & Compliance ──────────────────────────────────────────────────────
try:
    from routes.privacy import router as privacy_router
    app.include_router(privacy_router)                            # router prefix="/api/v1/privacy"
except Exception as e:
    print(f"Warning: could not register privacy_router: {e}")

try:
    from routes.privacy_locations import router as privacy_locations_router
    app.include_router(privacy_locations_router, prefix="/api/v1")
except Exception as e:
    print(f"Warning: could not register privacy_locations_router: {e}")

try:
    from routes.privacy_catalog import router as privacy_catalog_router
    app.include_router(privacy_catalog_router)                      # prefix="/api/v1/privacy-catalog" in router
except Exception as e:
    logger.info(f"privacy_catalog router not available: {e}")

try:
    from routes.dsr import router as dsr_router
    app.include_router(dsr_router, prefix="/api/v1")                # prefix="/dsr" in router
except Exception as e:
    logger.info(f"dsr router not available: {e}")

# ── AI / Inference / Agents ───────────────────────────────────────────────────
try:
    from routes.inference import router as inference_router
    app.include_router(inference_router, prefix="/api/v1/inference")
except Exception as e:
    print(f"Warning: could not register inference_router: {e}")

try:
    from routes.agents import router as agents_router
    app.include_router(agents_router, prefix="/api/v1")           # router prefix="/agents"
except Exception as e:
    print(f"Warning: could not register agents_router: {e}")

try:
    from routes.ai_config import router as ai_config_router
    app.include_router(ai_config_router, prefix="/api/v1")        # router prefix="/ai-config"
except Exception as e:
    print(f"Warning: could not register ai_config_router: {e}")

try:
    from routes.org_ai_key import router as org_ai_key_router
    app.include_router(org_ai_key_router)                         # router prefix="/api/v1/org"
except Exception as e:
    print(f"Warning: could not register org_ai_key_router: {e}")

try:
    from routes.observability import router as observability_router
    app.include_router(observability_router, prefix="/api/v1")
except Exception as e:
    print(f"Warning: could not register observability_router: {e}")

# ── Billing & Webhooks ────────────────────────────────────────────────────────
try:
    from routes.billing import router as billing_router
    app.include_router(billing_router, prefix="/api/v1")          # router prefix="/billing"
except Exception as e:
    print(f"Warning: could not register billing_router: {e}")

try:
    from routes.paddle_webhook import router as paddle_webhook_router
    app.include_router(paddle_webhook_router)
except Exception as e:
    print(f"Warning: could not register paddle_webhook_router: {e}")

try:
    from routes.webhooks import router as webhooks_router
    app.include_router(webhooks_router)                           # router prefix="/webhooks"
except Exception as e:
    print(f"Warning: could not register webhooks_router: {e}")

# ── Export & Geo ──────────────────────────────────────────────────────────────
try:
    from routes.export import router as export_router
    app.include_router(export_router)                             # router prefix="/api/v1/export"
except Exception as e:
    print(f"Warning: could not register export_router: {e}")

try:
    from routes.geo import router as geo_router
    app.include_router(geo_router)                                # router prefix="/api/v1/geo"
except Exception as e:
    print(f"Warning: could not register geo_router: {e}")

# ── Onboarding ────────────────────────────────────────────────────────────────
try:
    from routes.onboarding import router as onboarding_router
    app.include_router(onboarding_router, prefix="/api/v1")       # router prefix="/onboarding"
except Exception as e:
    print(f"Warning: could not register onboarding_router: {e}")

# ── Breach Notification (GDPR Art. 33/34) ────────────────────────────────────
try:
    from routes.breach import router as breach_router
    app.include_router(breach_router, prefix="/api/v1")           # router prefix="/breach"
except Exception as e:
    print(f"Warning: could not register breach_router: {e}")
