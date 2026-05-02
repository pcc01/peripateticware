# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Database configuration and connection management"""

import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import QueuePool
import logging

logger = logging.getLogger(__name__)

# SQLAlchemy ORM Base class for all models
Base = declarative_base()

# Get database URL from environment
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://peripateticware_user:peripateticware_secure_password_dev@postgres:5432/peripateticware"
)

# Detect if using PgBouncer
USE_PGBOUNCER = "6432" in DATABASE_URL or os.getenv("USE_PGBOUNCER", "false").lower() == "true"

print(f"[Database] Connecting to: {DATABASE_URL.replace(':peripateticware_user:peripateticware', ':***')}")
print(f"[Database] Using PgBouncer: {USE_PGBOUNCER}")

# Create async engine (IMPORTANT: postgresql+asyncpg:// not postgresql://)
engine = create_async_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,
    max_overflow=40,
    pool_recycle=3600,
    pool_pre_ping=True,
    connect_args={
        "timeout": 10,  # asyncpg uses 'timeout' not 'connect_timeout'
        "command_timeout": 10,
        "server_settings": {
            "application_name": "peripateticware",
        },
    },
    echo=False,
    echo_pool=False,
)

# Async session factory
async_session = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

# Dependency for FastAPI
async def get_db() -> AsyncSession:
    """
    Async dependency for FastAPI routes to get database session
    
    Usage in route:
        @app.post("/items")
        async def create_item(
            item: ItemSchema,
            db: AsyncSession = Depends(get_db)
        ):
            db.add(item)
            await db.commit()
    """
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()

# Database health check
async def check_database_health() -> dict:
    """Check database and connection pool health"""
    try:
        async with async_session() as session:
            await session.execute("SELECT 1")
        
        return {
            "status": "healthy",
            "database": "ok",
        }
    except Exception as e:
        logger.error(f"❌ Database health check failed: {e}")
        return {
            "status": "unhealthy",
            "database": "failed",
            "error": str(e),
        }

# Cleanup function
async def cleanup_database():
    """Close all database connections"""
    await engine.dispose()
    logger.info("Database connections closed")

print("[Database] Connection pool configured successfully")
print(f"[Database] Pool: QueuePool(size=20, max_overflow=40)")
print(f"[Database] Recycle: 3600 seconds")
print(f"[Database] Pre-ping: Enabled (connection testing)")