# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Database connection and session management
âœ… FIXED: Proper async setup, connection pooling, health checks
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

# ============================================================================
# IMPORTS - Settings
# ============================================================================
try:
    from core.config import settings
    logger.info("âœ… Database: Settings loaded")
except ImportError as e:
    logger.error(f"âŒ Database: Failed to import settings: {e}")
    raise

# ============================================================================
# DECLARATIVE BASE FOR MODELS
# ============================================================================

Base = declarative_base()

# ============================================================================
# DATABASE ENGINE
# ============================================================================

engine = None
async_session_factory = None

def get_engine():  # -> AsyncEngine (import avoided to keep startup simple)
    """Get or create database engine"""
    global engine
    
    if engine is None:
        engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            future=True,
            # âœ… Connection pooling
            pool_size=20,
            max_overflow=0,
            pool_pre_ping=True,  # Verify connections before using
            pool_recycle=3600,   # Recycle connections every hour
            # âœ… Echo only in debug mode
            echo_pool=settings.ENVIRONMENT == "development",
        )
        logger.info(f"âœ… Database engine created: {settings.DATABASE_URL.split('@')[-1]}")
    
    return engine

def get_session_factory():
    """Get or create async session factory"""
    global async_session_factory
    
    if async_session_factory is None:
        async_session_factory = async_sessionmaker(
            get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
        logger.info("âœ… Session factory created")
    
    return async_session_factory

# ============================================================================
# DEPENDENCY INJECTION
# ============================================================================

async def get_db() -> AsyncSession:
    """
    Dependency to get database session
    
    Usage:
        @app.get("/users")
        async def get_users(db: AsyncSession = Depends(get_db)):
            result = await db.execute(select(User))
            return result.scalars().all()
    """
    async_session = get_session_factory()
    
    async with async_session() as session:
        try:
            # Test connection
            await session.execute(text("SELECT 1"))
            yield session
        except Exception as e:
            logger.error(f"âŒ Database session error: {e}")
            await session.rollback()
            raise
        finally:
            await session.close()

# ============================================================================
# DATABASE INITIALIZATION
# ============================================================================

async def init_db() -> bool:
    """
    Initialize database tables

    Creates all tables defined in models that inherit from Base
    """
    try:
        engine = get_engine()
        
        async with engine.begin() as conn:
            # Create all tables from Base metadata
            await conn.run_sync(Base.metadata.create_all)
        
        logger.info("âœ… Database tables created/verified")
        return True
        
    except Exception as e:
        logger.error(f"âŒ Database initialization failed: {e}")
        return False

async def check_db_connection() -> bool:
    """
    Check if database is accessible

    Returns:
        True if connected, False otherwise
    """
    try:
        engine = get_engine()
        
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            if result.scalar() == 1:
                logger.info("âœ… Database connection verified")
                return True
        
        return False
        
    except Exception as e:
        logger.error(f"âŒ Database connection failed: {e}")
        return False

async def dispose_db() -> None:
    """
    Clean up database connections

    Call during application shutdown
    """
    global engine
    
    if engine:
        await engine.dispose()
        engine = None
        logger.info("âœ… Database connections disposed")

# ============================================================================
# INITIALIZATION
# ============================================================================

logger.info("âœ… Database module initialized")
logger.info(f"   URL: {settings.DATABASE_URL.split('@')[-1]}")
logger.info(f"   Pool size: 20, Max overflow: 0")
logger.info(f"   Pool recycle: 3600s (1 hour)")
