"""
Health check endpoints for monitoring application status
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from datetime import datetime

router = APIRouter()

@router.get("/health")
async def health_check():
    """Basic health check"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "Peripateticware API",
        "version": "2.0.0"
    }

@router.get("/health/ready")
async def readiness_check(db: AsyncSession = Depends(get_db)):
    """Readiness check - verifies database connection"""
    try:
        await db.execute("SELECT 1")
        return {
            "status": "ready",
            "timestamp": datetime.utcnow().isoformat(),
            "database": "connected"
        }
    except Exception as e:
        return {
            "status": "not_ready",
            "error": str(e),
            "database": "disconnected"
        }

@router.get("/health/live")
async def liveness_check():
    """Liveness check - simple status"""
    return {
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat()
    }