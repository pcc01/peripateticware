# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

# File: backend/routes/health.py
# Health check endpoint for mobile app initialization
# Mobile app calls this on startup to verify backend is available

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from core.database import get_db
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/health", tags=["health"])

@router.get("/")
async def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint for mobile app
    
    Used by:
    - Mobile app on startup to verify backend is running
    - Monitoring/observability to check service health
    - Load balancers for routing decisions
    
    Response:
    - status: "ok" if all systems healthy
    - database: true if database connection works
    - timestamp: current server time
    
    🚩 MOBILE REQUIREMENT:
    - Must return status 200 with { "status": "ok" } if healthy
    - Used by mobile app to decide if backend is available
    - If this fails, mobile uses cached data (graceful degradation)
    """
    try:
        # Test database connection
        result = db.execute("SELECT 1")
        db_ok = result.scalar() == 1
    except Exception as e:
        logger.error(f"Health check: database connection failed: {e}")
        db_ok = False
    
    from datetime import datetime
    
    return {
        "status": "ok" if db_ok else "degraded",
        "database": db_ok,
        "timestamp": datetime.utcnow().isoformat(),
        "service": "peripateticware-api",
        "version": "1.0.0",
    }


@router.get("/ready")
async def readiness_check(db: Session = Depends(get_db)):
    """
    Readiness check - app is ready to accept traffic
    
    Used by:
    - Kubernetes for pod readiness probes
    - Docker Compose for healthchecks
    - Load balancers before routing requests
    """
    try:
        # Test database
        result = db.execute("SELECT 1")
        db_ok = result.scalar() == 1
        
        if not db_ok:
            return {"status": "not_ready", "reason": "database"}
        
        return {"status": "ready"}
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return {"status": "not_ready", "reason": str(e)}


@router.get("/live")
async def liveness_check():
    """
    Liveness check - app is still running
    
    Used by:
    - Kubernetes for pod liveness probes
    - Health monitoring to detect dead processes
    - Doesn't check dependencies (just if process is alive)
    """
    return {"status": "alive"}