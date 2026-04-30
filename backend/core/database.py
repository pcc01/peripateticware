# File: backend/core/database.py
# Updated for Phase 3 with PgBouncer connection pooling

import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from sqlalchemy.pool import QueuePool, NullPool
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

# SQLAlchemy declarative base for models
Base = declarative_base()

# Get database URL from environment
# Should point to PgBouncer (port 6432) not PostgreSQL directly (port 5432)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:6432/peripateticware"
)

# Detect if we're using PgBouncer (port 6432) or direct PostgreSQL (port 5432)
USE_PGBOUNCER = "6432" in DATABASE_URL or os.getenv("USE_PGBOUNCER", "true").lower() == "true"

print(f"[Database] Connecting to: {DATABASE_URL.replace('postgres:postgres', 'postgres:***')}")
print(f"[Database] Using PgBouncer: {USE_PGBOUNCER}")

# SQLAlchemy Engine Configuration
# When using PgBouncer in transaction mode, we use QueuePool for app-level pooling
# PgBouncer handles database-level pooling (1000 max connections)
# App-level pooling (20-40 connections) manages transaction lifecycle

if USE_PGBOUNCER:
    # With PgBouncer, use modest app-level pooling
    # PgBouncer's connection pooling is primary
    engine = create_engine(
        DATABASE_URL,
        poolclass=QueuePool,
        pool_size=20,              # Keep 20 connections open
        max_overflow=40,           # Allow 40 more during spikes
        pool_recycle=3600,         # Recycle connections every hour
        pool_pre_ping=True,        # Test connections before using (SELECT 1)
        connect_args={
            "connect_timeout": 10,
            "keepalives": 1,
            "keepalives_idle": 30,
        },
        echo=False,                # Set to True to log SQL queries
        echo_pool=False,           # Set to True to log pool events
    )
else:
    # Without PgBouncer (direct connection), use larger app-level pooling
    engine = create_engine(
        DATABASE_URL,
        poolclass=QueuePool,
        pool_size=50,
        max_overflow=100,
        pool_recycle=3600,
        pool_pre_ping=True,
        echo=False,
        echo_pool=False,
    )

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,
)

# Connection pool event listeners for monitoring
@event.listens_for(engine, "connect")
def receive_connect(dbapi_conn, connection_record):
    """Called when a new database connection is created"""
    logger.debug("Database connection created")

@event.listens_for(engine, "checkout")
def receive_checkout(dbapi_conn, connection_record, connection_proxy):
    """Called when a connection is checked out from the pool"""
    pass

@event.listens_for(engine, "checkin")
def receive_checkin(dbapi_conn, connection_record):
    """Called when a connection is returned to the pool"""
    pass

@event.listens_for(engine, "close")
def receive_close(dbapi_conn, connection_record):
    """Called when a connection is closed"""
    logger.debug("Database connection closed")

@event.listens_for(engine, "detach")
def receive_detach(dbapi_conn, connection_record):
    """Called when a connection is detached from pool"""
    logger.debug("Database connection detached")

# Dependency for FastAPI
def get_db() -> Session:
    """
    Dependency for FastAPI routes to get database session
    
    Usage in route:
        @app.get("/items")
        async def get_items(db: Session = Depends(get_db)):
            items = db.query(Item).all()
            return items
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Context manager for scripts
@contextmanager
def get_db_context():
    """
    Context manager for database access in scripts
    
    Usage:
        with get_db_context() as db:
            users = db.query(User).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Database health check function
async def check_database_health() -> dict:
    """
    Check database and connection pool health
    Returns status information
    """
    try:
        with get_db_context() as db:
            result = db.execute("SELECT 1")
            db_ok = result.scalar() == 1
        
        # Get pool status
        pool = engine.pool
        pool_info = {
            "pool_size": pool.size() if hasattr(pool, "size") else "N/A",
            "checked_out": pool.checkedout() if hasattr(pool, "checkedout") else "N/A",
            "overflow": pool.overflow() if hasattr(pool, "overflow") else "N/A",
            "total": (pool.size() + pool.overflow()) if hasattr(pool, "size") else "N/A",
        }
        
        return {
            "status": "healthy" if db_ok else "unhealthy",
            "database": "ok" if db_ok else "failed",
            "pool": pool_info,
            "url": DATABASE_URL.replace("postgres:postgres", "postgres:***"),
            "pgbouncer": USE_PGBOUNCER,
        }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "status": "unhealthy",
            "database": "failed",
            "error": str(e),
        }

# Cleanup function for application shutdown
def cleanup_database():
    """
    Close all database connections and dispose engine
    Call this during application shutdown
    """
    engine.dispose()
    logger.info("Database connections closed")

# Monitoring query for PgBouncer stats
PGBOUNCER_STATS_QUERY = """
SELECT 
    database,
    user,
    cl_active,
    cl_waiting,
    sv_active,
    sv_idle,
    sv_used,
    sv_tested,
    sv_login,
    maxwait,
    maxwait_us,
    pool_mode
FROM pgbouncer.stats;
"""

# PostgreSQL connection info for health check
def get_connection_info() -> dict:
    """Get current connection information"""
    try:
        with get_db_context() as db:
            result = db.execute("""
                SELECT 
                    current_user,
                    current_database(),
                    version(),
                    now() as server_time
            """)
            row = result.fetchone()
            
            return {
                "user": row[0],
                "database": row[1],
                "version": row[2],
                "server_time": row[3].isoformat(),
            }
    except Exception as e:
        return {
            "error": str(e),
        }

print("[Database] Connection pool configured successfully")
print(f"[Database] Pool: QueuePool(size={20 if USE_PGBOUNCER else 50}, max_overflow={40 if USE_PGBOUNCER else 100})")
print(f"[Database] Recycle: 3600 seconds")
print(f"[Database] Pre-ping: Enabled (connection testing)")