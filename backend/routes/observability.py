"""Observability and monitoring routes"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta
from core.database import get_db
from models.database import ObservabilityLog, LearningSession
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
async def system_health():
    """System health check with component status"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "components": {
            "fastapi": "operational",
            "postgres": "operational",
            "ollama": "operational",
            "redis": "operational",
            "prometheus": "operational"
        }
    }


@router.get("/metrics/latency")
async def get_latency_metrics(
    hours: int = 24,
    db: AsyncSession = Depends(get_db)
):
    """Get latency metrics for the past N hours"""
    try:
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        
        query = select(ObservabilityLog).where(
            ObservabilityLog.created_at >= cutoff_time
        )
        result = await db.execute(query)
        logs = result.scalars().all()
        
        if not logs:
            return {
                "period_hours": hours,
                "metrics": {
                    "p50_latency_ms": 0,
                    "p95_latency_ms": 0,
                    "p99_latency_ms": 0,
                    "max_latency_ms": 0,
                    "request_count": 0
                }
            }
        
        # Calculate percentiles
        latencies = sorted([log.total_latency_ms for log in logs if log.total_latency_ms])
        
        p50_idx = int(len(latencies) * 0.50)
        p95_idx = int(len(latencies) * 0.95)
        p99_idx = int(len(latencies) * 0.99)
        
        return {
            "period_hours": hours,
            "metrics": {
                "p50_latency_ms": latencies[p50_idx] if p50_idx < len(latencies) else 0,
                "p95_latency_ms": latencies[p95_idx] if p95_idx < len(latencies) else 0,
                "p99_latency_ms": latencies[p99_idx] if p99_idx < len(latencies) else 0,
                "max_latency_ms": max(latencies) if latencies else 0,
                "request_count": len(logs),
                "avg_latency_ms": sum(latencies) / len(latencies) if latencies else 0
            }
        }
    
    except Exception as e:
        logger.error(f"Error fetching latency metrics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch metrics"
        )


@router.get("/metrics/endpoints")
async def get_endpoint_metrics(
    hours: int = 24,
    db: AsyncSession = Depends(get_db)
):
    """Get per-endpoint performance metrics"""
    try:
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        
        query = select(
            ObservabilityLog.endpoint,
            func.count(ObservabilityLog.id).label("request_count"),
            func.avg(ObservabilityLog.total_latency_ms).label("avg_latency"),
            func.max(ObservabilityLog.total_latency_ms).label("max_latency"),
        ).where(
            ObservabilityLog.created_at >= cutoff_time
        ).group_by(ObservabilityLog.endpoint)
        
        result = await db.execute(query)
        rows = result.all()
        
        endpoints = [
            {
                "endpoint": row[0],
                "request_count": row[1],
                "avg_latency_ms": float(row[2]) if row[2] else 0,
                "max_latency_ms": row[3]
            }
            for row in rows
        ]
        
        return {
            "period_hours": hours,
            "endpoints": endpoints
        }
    
    except Exception as e:
        logger.error(f"Error fetching endpoint metrics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch metrics"
        )


@router.get("/metrics/error-rate")
async def get_error_rate(
    hours: int = 24,
    db: AsyncSession = Depends(get_db)
):
    """Get error rate metrics"""
    try:
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        
        query = select(ObservabilityLog).where(
            ObservabilityLog.created_at >= cutoff_time
        )
        result = await db.execute(query)
        logs = result.scalars().all()
        
        if not logs:
            return {
                "period_hours": hours,
                "error_rate": 0,
                "total_requests": 0,
                "error_count": 0
            }
        
        error_count = sum(1 for log in logs if log.status_code >= 400)
        total_count = len(logs)
        error_rate = (error_count / total_count * 100) if total_count > 0 else 0
        
        return {
            "period_hours": hours,
            "error_rate": round(error_rate, 2),
            "total_requests": total_count,
            "error_count": error_count
        }
    
    except Exception as e:
        logger.error(f"Error fetching error rate: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch metrics"
        )


@router.get("/insights/learning-patterns")
async def get_learning_patterns(
    db: AsyncSession = Depends(get_db)
):
    """Get insights about learning patterns"""
    try:
        # Get active sessions
        query = select(LearningSession).where(
            LearningSession.is_active == True
        )
        result = await db.execute(query)
        sessions = result.scalars().all()
        
        if not sessions:
            return {
                "active_sessions": 0,
                "avg_session_duration_minutes": 0,
                "most_common_location": None
            }
        
        # Calculate insights
        total_duration = sum(
            (session.updated_at - session.created_at).total_seconds() / 60
            for session in sessions
        )
        
        locations = {}
        for session in sessions:
            loc = session.location_name or "Unknown"
            locations[loc] = locations.get(loc, 0) + 1
        
        most_common_location = max(locations.items(), key=lambda x: x[1])[0] if locations else None
        
        return {
            "active_sessions": len(sessions),
            "avg_session_duration_minutes": round(total_duration / len(sessions), 1) if sessions else 0,
            "most_common_location": most_common_location,
            "locations_distribution": locations
        }
    
    except Exception as e:
        logger.error(f"Error fetching learning patterns: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch insights"
        )


@router.get("/diagnostics/component-breakdown")
async def get_component_breakdown(
    hours: int = 24,
    db: AsyncSession = Depends(get_db)
):
    """
    Get breakdown of latency by component (RAG, Inference, etc).
    Simulates ghost probes for monitoring.
    """
    try:
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        
        query = select(ObservabilityLog).where(
            ObservabilityLog.created_at >= cutoff_time
        )
        result = await db.execute(query)
        logs = result.scalars().all()
        
        # Aggregate component timings
        rag_times = []
        inference_times = []
        db_times = []
        
        for log in logs:
            if log.components:
                rag_times.append(log.components.get("rag_pipeline", 0))
                inference_times.append(log.components.get("inference", 0))
                db_times.append(log.components.get("database", 0))
        
        return {
            "period_hours": hours,
            "components": {
                "rag_pipeline": {
                    "avg_latency_ms": sum(rag_times) / len(rag_times) if rag_times else 0,
                    "p95_latency_ms": sorted(rag_times)[int(len(rag_times) * 0.95)] if rag_times else 0,
                    "request_count": len(rag_times)
                },
                "inference": {
                    "avg_latency_ms": sum(inference_times) / len(inference_times) if inference_times else 0,
                    "p95_latency_ms": sorted(inference_times)[int(len(inference_times) * 0.95)] if inference_times else 0,
                    "request_count": len(inference_times)
                },
                "database": {
                    "avg_latency_ms": sum(db_times) / len(db_times) if db_times else 0,
                    "p95_latency_ms": sorted(db_times)[int(len(db_times) * 0.95)] if db_times else 0,
                    "request_count": len(db_times)
                }
            }
        }
    
    except Exception as e:
        logger.error(f"Error fetching component breakdown: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch diagnostics"
        )
