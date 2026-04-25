"""Learning sessions routes"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid
from core.database import get_db
from models.database import LearningSession, User, TripleJoinRecord
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateSessionRequest(BaseModel):
    """Create learning session request"""
    title: str
    curriculum_id: str
    latitude: float
    longitude: float
    location_name: str


class UpdateSessionRequest(BaseModel):
    """Update learning session request"""
    title: Optional[str] = None
    status: Optional[str] = None
    inquiry_log: Optional[dict] = None


class SessionResponse(BaseModel):
    """Learning session response"""
    session_id: str
    title: str
    curriculum_id: str
    status: str
    location: dict
    created_at: str
    updated_at: str
    
    class Config:
        from_attributes = True


@router.post("/", response_model=SessionResponse)
async def create_session(
    request: CreateSessionRequest,
    db: AsyncSession = Depends(get_db)
):
    """Create a new learning session"""
    try:
        # Get current user (simplified)
        query = select(User).limit(1)
        result = await db.execute(query)
        user = result.scalar()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated"
            )
        
        # Create session
        session = LearningSession(
            user_id=user.id,
            curriculum_id=uuid.UUID(request.curriculum_id),
            title=request.title,
            latitude=request.latitude,
            longitude=request.longitude,
            location_name=request.location_name,
            status="in_progress",
            inquiry_log=[]
        )
        
        db.add(session)
        await db.commit()
        await db.refresh(session)
        
        logger.info(f"Created session: {session.id}")
        
        return SessionResponse(
            session_id=str(session.id),
            title=session.title,
            curriculum_id=str(session.curriculum_id),
            status=session.status,
            location={
                "latitude": session.latitude,
                "longitude": session.longitude,
                "name": session.location_name
            },
            created_at=session.created_at.isoformat(),
            updated_at=session.updated_at.isoformat()
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create session"
        )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get learning session details"""
    try:
        query = select(LearningSession).where(
            LearningSession.id == uuid.UUID(session_id)
        )
        result = await db.execute(query)
        session = result.scalar()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        return SessionResponse(
            session_id=str(session.id),
            title=session.title,
            curriculum_id=str(session.curriculum_id),
            status=session.status,
            location={
                "latitude": session.latitude,
                "longitude": session.longitude,
                "name": session.location_name
            },
            created_at=session.created_at.isoformat(),
            updated_at=session.updated_at.isoformat()
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch session"
        )


@router.patch("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: str,
    request: UpdateSessionRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update learning session"""
    try:
        query = select(LearningSession).where(
            LearningSession.id == uuid.UUID(session_id)
        )
        result = await db.execute(query)
        session = result.scalar()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        # Update fields
        if request.title:
            session.title = request.title
        if request.status:
            session.status = request.status
        if request.inquiry_log:
            session.inquiry_log = request.inquiry_log
        
        session.updated_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(session)
        
        logger.info(f"Updated session: {session.id}")
        
        return SessionResponse(
            session_id=str(session.id),
            title=session.title,
            curriculum_id=str(session.curriculum_id),
            status=session.status,
            location={
                "latitude": session.latitude,
                "longitude": session.longitude,
                "name": session.location_name
            },
            created_at=session.created_at.isoformat(),
            updated_at=session.updated_at.isoformat()
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating session: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update session"
        )


@router.get("/{session_id}/evidence")
async def get_evidence_of_learning(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get Evidence of Learning for a session (for parents/teachers)"""
    try:
        query = select(LearningSession).where(
            LearningSession.id == uuid.UUID(session_id)
        )
        result = await db.execute(query)
        session = result.scalar()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        return {
            "session_id": str(session.id),
            "title": session.title,
            "evidence": session.evidence or {},
            "status": session.status,
            "completed_at": session.completed_at.isoformat() if session.completed_at else None
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching evidence: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch evidence"
        )


@router.get("/{session_id}/inquiry-log")
async def get_inquiry_log(
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Get Socratic inquiry log (raw artifacts for teachers)"""
    try:
        query = select(LearningSession).where(
            LearningSession.id == uuid.UUID(session_id)
        )
        result = await db.execute(query)
        session = result.scalar()
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        return {
            "session_id": str(session.id),
            "title": session.title,
            "inquiry_log": session.inquiry_log or [],
            "teacher_observations": []
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching inquiry log: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch inquiry log"
        )
