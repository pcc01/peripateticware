# Copyright (c) 2026 Paul Christopher Cerda
# Licensed under BSL 1.1

"""
Parent Portal API Routes
Complete REST API for parent dashboard, evidence gallery, messaging, reports
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import List, Optional
from datetime import datetime

from database import get_db
from models import User
from parent_service import ParentService

router = APIRouter(prefix="/api/v1/parent", tags=["parent"])


# ============================================================================
# DEPENDENCIES
# ============================================================================

async def get_current_parent(token: str = Depends()) -> User:
    """Verify parent is authenticated (JWT)"""
    # JWT verification logic would go here
    pass


async def get_parent_service(db: AsyncSession = Depends(get_db)) -> ParentService:
    """Dependency to inject ParentService"""
    return ParentService(db)


# ============================================================================
# ENDPOINTS: CHILDREN & RELATIONSHIPS
# ============================================================================

@router.get("/children")
async def get_children(
    parent_id: UUID = Depends(get_current_parent),
    service: ParentService = Depends(get_parent_service)
):
    """
    Get all children linked to parent account
    Returns: List of children with current activities
    """
    try:
        children = await service.get_children(parent_id)
        return {
            "status": "success",
            "data": children,
            "count": len(children)
        }
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINTS: LEARNING SESSIONS & ACTIVITIES
# ============================================================================

@router.get("/children/{child_id}/sessions")
async def get_sessions(
    child_id: UUID,
    parent_id: UUID = Depends(get_current_parent),
    status: Optional[str] = Query(None, regex="^(active|completed|upcoming)$"),
    subject: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    service: ParentService = Depends(get_parent_service)
):
    """
    Get learning sessions for a child with filtering and pagination
    Filters: status (active/completed/upcoming), subject
    """
    try:
        result = await service.get_child_sessions(
            parent_id=parent_id,
            child_id=child_id,
            status=status,
            subject=subject,
            page=page,
            limit=limit
        )
        return {
            "status": "success",
            "data": result["sessions"],
            "pagination": {
                "total": result["total"],
                "page": page,
                "limit": limit,
                "pages": (result["total"] + limit - 1) // limit
            }
        }
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINTS: COMPETENCY TRACKING
# ============================================================================

@router.get("/children/{child_id}/competencies")
async def get_competencies(
    child_id: UUID,
    parent_id: UUID = Depends(get_current_parent),
    service: ParentService = Depends(get_parent_service)
):
    """
    Get competency progress for a child
    Returns: Competencies with proficiency levels and trends
    Cached for 1 hour
    """
    try:
        competencies = await service.get_child_competencies(parent_id, child_id)
        return {
            "status": "success",
            "data": competencies,
            "as_of": datetime.utcnow().isoformat(),
            "cache_ttl": 3600
        }
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINTS: EVIDENCE GALLERY
# ============================================================================

@router.get("/children/{child_id}/evidence")
async def get_evidence_gallery(
    child_id: UUID,
    parent_id: UUID = Depends(get_current_parent),
    capture_type: Optional[str] = Query(None, regex="^(photo|video|audio|sketch|measurement)$"),
    activity_id: Optional[UUID] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    service: ParentService = Depends(get_parent_service)
):
    """
    Get student captures (evidence) visible to parents
    Includes: photos, videos, audio, sketches, measurements
    Filters: capture_type, activity, date_range, full_text_search
    """
    try:
        result = await service.get_evidence_gallery(
            parent_id=parent_id,
            child_id=child_id,
            capture_type=capture_type,
            activity_id=activity_id,
            date_from=date_from,
            date_to=date_to,
            page=page,
            limit=limit,
            search=search
        )
        return {
            "status": "success",
            "data": result["captures"],
            "pagination": {
                "total": result["total"],
                "page": page,
                "limit": limit,
                "pages": (result["total"] + limit - 1) // limit
            }
        }
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINTS: REFLECTIONS & NOTEBOOKS
# ============================================================================

@router.get("/children/{child_id}/reflections")
async def get_reflections(
    child_id: UUID,
    parent_id: UUID = Depends(get_current_parent),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    service: ParentService = Depends(get_parent_service)
):
    """
    Get student notebook entries (reflections) visible to parents
    Includes: reflections, discoveries, hypotheses, questions
    Shows: student annotations, teacher feedback, linked evidence
    """
    try:
        result = await service.get_reflections(
            parent_id=parent_id,
            child_id=child_id,
            page=page,
            limit=limit
        )
        return {
            "status": "success",
            "data": result["reflections"],
            "pagination": {
                "total": result["total"],
                "page": page,
                "limit": limit
            }
        }
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINTS: PROGRESS REPORTS (PRE-COMPUTED, CACHED)
# ============================================================================

@router.get("/children/{child_id}/progress-report")
async def get_progress_report(
    child_id: UUID,
    parent_id: UUID = Depends(get_current_parent),
    month: Optional[str] = Query(None, regex="^\\d{4}-\\d{2}$"),
    service: ParentService = Depends(get_parent_service)
):
    """
    Get monthly progress report (pre-computed and cached)
    Format: month as YYYY-MM
    Response includes: summary stats, competency trends, achievements, teacher feedback
    Cached for 24 hours
    """
    try:
        if not month:
            month = datetime.utcnow().strftime("%Y-%m")
        
        report = await service.get_progress_report(
            parent_id=parent_id,
            child_id=child_id,
            month=month
        )
        return {
            "status": "success",
            "data": report,
            "cache_ttl": 86400
        }
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINTS: TEACHER MESSAGING
# ============================================================================

@router.get("/children/{child_id}/messages")
async def get_messages(
    child_id: UUID,
    parent_id: UUID = Depends(get_current_parent),
    teacher_id: Optional[UUID] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    service: ParentService = Depends(get_parent_service)
):
    """
    Get message threads between parent and teacher(s)
    Includes: conversation history, read status, timestamps
    """
    try:
        result = await service.get_messages(
            parent_id=parent_id,
            child_id=child_id,
            teacher_id=teacher_id,
            page=page,
            limit=limit
        )
        return {
            "status": "success",
            "data": result["threads"],
            "pagination": {
                "total": result["total"],
                "page": page
            }
        }
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/children/{child_id}/messages")
async def send_message(
    child_id: UUID,
    parent_id: UUID = Depends(get_current_parent),
    message_data: dict = None,
    service: ParentService = Depends(get_parent_service)
):
    """
    Send message to teacher
    Required: teacher_id, content
    Optional: subject, thread_id (to continue conversation), attachments
    """
    try:
        if not message_data or 'teacher_id' not in message_data:
            raise HTTPException(status_code=400, detail="teacher_id required")
        
        result = await service.send_message(
            parent_id=parent_id,
            teacher_id=message_data['teacher_id'],
            child_id=child_id,
            content=message_data['content'],
            subject=message_data.get('subject'),
            thread_id=message_data.get('thread_id')
        )
        return {
            "status": "success",
            "data": result
        }
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINTS: PREFERENCES & SETTINGS
# ============================================================================

@router.get("/preferences")
async def get_preferences(
    parent_id: UUID = Depends(get_current_parent),
    service: ParentService = Depends(get_parent_service)
):
    """
    Get parent notification and privacy preferences
    Returns: notification frequency, types, report format, language, timezone
    """
    try:
        preferences = await service.get_preferences(parent_id)
        return {
            "status": "success",
            "data": preferences
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/preferences")
async def update_preferences(
    parent_id: UUID = Depends(get_current_parent),
    preferences_data: dict = None,
    service: ParentService = Depends(get_parent_service)
):
    """
    Update parent preferences
    Allows: notification_frequency, notification_types, report_format, language, timezone
    """
    try:
        updated = await service.update_preferences(parent_id, preferences_data or {})
        return {
            "status": "success",
            "data": updated
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# HEALTH CHECK
# ============================================================================

@router.get("/health")
async def health_check():
    """Health check endpoint for load balancers"""
    return {
        "status": "healthy",
        "service": "parent-portal",
        "timestamp": datetime.utcnow().isoformat()
    }
