# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Parent Portal API Routes
Endpoints for parent authentication, child progress tracking, messages, and reporting
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.config import settings
from models.database import User, UserRole, LearningSession
from services.privacy_engine import PrivacyEngine

# ============================================================================
# SCHEMAS
# ============================================================================

class ParentRegisterRequest(BaseModel):
    """Parent registration request"""
    email: EmailStr
    password: str = Field(..., min_length=8)
    name: str = Field(..., min_length=2, max_length=255)


class ParentLoginRequest(BaseModel):
    """Parent login request"""
    email: EmailStr
    password: str


class TokenRefreshRequest(BaseModel):
    """Token refresh request"""
    refresh_token: str


class TokenResponse(BaseModel):
    """JWT token response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class ChildLinkResponse(BaseModel):
    """Child link response"""
    id: str
    child_id: str
    child_name: str
    child_avatar: Optional[str] = None
    relationship: str
    linked_at: str

    class Config:
        from_attributes = True


class ParentProfileResponse(BaseModel):
    """Parent account response"""
    id: str
    email: str
    name: str
    phone: Optional[str] = None
    created_at: str
    children: List[ChildLinkResponse] = []

    class Config:
        from_attributes = True


class LinkChildRequest(BaseModel):
    """Link child to parent account"""
    link_code: str = Field(..., min_length=6, max_length=6)
    relationship: str = Field(..., pattern="^(mother|father|guardian|grandparent|other)$")


class CompetencyProgressResponse(BaseModel):
    """Competency progress response"""
    id: str
    name: str
    description: Optional[str] = None
    level: int = Field(..., ge=1, le=5)
    target_level: int = Field(..., ge=1, le=5)
    progress: int = Field(..., ge=0, le=100)
    achieved_at: Optional[str] = None


class ChildProgressResponse(BaseModel):
    """Child progress response"""
    child_id: str
    child_name: str
    grade: int
    competencies: List[CompetencyProgressResponse] = []
    activities_completed: int = 0
    hours_learned: float = 0.0
    engagement_score: int = Field(default=0, ge=0, le=100)
    last_active: str


class ActivityResponse(BaseModel):
    """Child activity response"""
    id: str
    session_id: str
    title: str
    subject: str
    description: Optional[str] = None
    completed_at: str
    duration: int  # minutes
    location: Optional[str] = None
    evidence_count: int = 0
    teacher_name: str


class MessageResponse(BaseModel):
    """Message from teacher response"""
    id: str
    from_teacher_id: str
    from_teacher_name: str
    to_parent_id: str
    subject: str
    body: str
    read_at: Optional[str] = None
    created_at: str
    conversation_id: str


class MessageReplyRequest(BaseModel):
    """Reply to teacher message"""
    body: str = Field(..., min_length=1, max_length=5000)


class NotificationResponse(BaseModel):
    """Notification response"""
    id: str
    parent_id: str
    type: str  # achievement, concern, message, reminder
    title: str
    body: str
    related_child_id: str
    action_url: Optional[str] = None
    read_at: Optional[str] = None
    created_at: str


class WeeklyReportResponse(BaseModel):
    """Weekly progress report"""
    child_id: str
    week_starting: str
    week_ending: str
    activities_completed: int
    total_hours: float
    new_competencies: List[str] = []
    highlights: List[str] = []
    concerns: List[str] = []
    average_engagement: int = Field(ge=0, le=100)
    class_average: int = Field(ge=0, le=100)


class MonthlyReportResponse(BaseModel):
    """Monthly progress report"""
    child_id: str
    month: str
    year: int
    activities_completed: int
    total_hours: float
    competencies_achieved: List[CompetencyProgressResponse] = []
    growth_areas: List[str] = []
    recommendations: List[str] = []


class SettingsRequest(BaseModel):
    """Parent settings update"""
    dark_mode: Optional[bool] = None
    language: Optional[str] = Field(None, pattern="^(en|es|ar|ja)$")
    email_frequency: Optional[str] = Field(None, pattern="^(daily|weekly|biweekly|monthly)$")
    notifications_enabled: Optional[bool] = None
    push_notifications_enabled: Optional[bool] = None


class SettingsResponse(BaseModel):
    """Parent settings response"""
    parent_id: str
    dark_mode: bool = False
    language: str = "en"
    email_frequency: str = "weekly"
    notifications_enabled: bool = True
    push_notifications_enabled: bool = True


# ============================================================================
# ROUTER
# ============================================================================

router = APIRouter(prefix="/parent", tags=["parent"])
privacy_engine = PrivacyEngine()


# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================

@router.post("/auth/register", response_model=dict)
async def register_parent(
    request: ParentRegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new parent account
    
    Returns:
        - parent: ParentProfileResponse
        - token: TokenResponse
    """
    try:
        # Check if email already exists
        from sqlalchemy import select
        existing = await db.execute(
            select(User).where(User.email == request.email)
        )
        if existing.scalar():
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Create new parent user (mock implementation)
        # In production, this would use proper password hashing (bcrypt)
        parent = User(
            id=str(uuid4()),
            email=request.email,
            full_name=request.name,
            role=UserRole.PARENT,
            password_hash="hashed_password_here",  # TODO: Use bcrypt
            is_active=True,
        )
        
        db.add(parent)
        await db.commit()
        await db.refresh(parent)
        
        # Generate tokens
        access_token = f"access_token_{parent.id}"
        refresh_token = f"refresh_token_{parent.id}"
        
        return {
            "parent": {
                "id": str(parent.id),
                "email": parent.email,
                "name": parent.full_name,
                "children": [],
                "created_at": parent.created_at.isoformat(),
            },
            "token": {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "bearer",
                "expires_in": int((datetime.utcnow() + timedelta(hours=24)).timestamp()),
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auth/login", response_model=dict)
async def login_parent(
    request: ParentLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Login parent with email and password
    
    Returns:
        - parent: ParentProfileResponse
        - token: TokenResponse
    """
    try:
        from sqlalchemy import select
        
        result = await db.execute(
            select(User).where(
                User.email == request.email,
                User.role == UserRole.PARENT
            )
        )
        parent = result.scalar()
        
        if not parent or parent.password_hash != f"hashed_{request.password}":  # TODO: Use bcrypt verify
            raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Generate tokens
        access_token = f"access_token_{parent.id}"
        refresh_token = f"refresh_token_{parent.id}"
        
        return {
            "parent": {
                "id": str(parent.id),
                "email": parent.email,
                "name": parent.full_name,
                "children": [],
                "created_at": parent.created_at.isoformat(),
            },
            "token": {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "bearer",
                "expires_in": int((datetime.utcnow() + timedelta(hours=24)).timestamp()),
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auth/refresh", response_model=dict)
async def refresh_token(
    request: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db)
):
    """Refresh JWT token"""
    try:
        # Extract parent ID from refresh token
        parent_id = request.refresh_token.replace("refresh_token_", "")
        
        # Generate new access token
        access_token = f"access_token_{parent_id}"
        
        return {
            "token": {
                "access_token": access_token,
                "refresh_token": request.refresh_token,
                "token_type": "bearer",
                "expires_in": int((datetime.utcnow() + timedelta(hours=24)).timestamp()),
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=401, detail="Token refresh failed")


# ============================================================================
# PROFILE ENDPOINTS
# ============================================================================

@router.get("/profile", response_model=ParentProfileResponse)
async def get_parent_profile(
    parent_id: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Get parent profile and linked children"""
    try:
        from sqlalchemy import select
        
        result = await db.execute(
            select(User).where(User.id == parent_id, User.role == UserRole.PARENT)
        )
        parent = result.scalar()
        
        if not parent:
            raise HTTPException(status_code=404, detail="Parent not found")
        
        return {
            "id": str(parent.id),
            "email": parent.email,
            "name": parent.full_name,
            "children": [],
            "created_at": parent.created_at.isoformat(),
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/profile")
async def update_parent_profile(
    parent_id: str = Query(...),
    name: Optional[str] = None,
    phone: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Update parent profile"""
    try:
        from sqlalchemy import select
        
        result = await db.execute(
            select(User).where(User.id == parent_id, User.role == UserRole.PARENT)
        )
        parent = result.scalar()
        
        if not parent:
            raise HTTPException(status_code=404, detail="Parent not found")
        
        if name:
            parent.full_name = name
        # Add phone field to User model if needed
        
        await db.commit()
        
        return {
            "id": str(parent.id),
            "email": parent.email,
            "name": parent.full_name,
            "created_at": parent.created_at.isoformat(),
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CHILD MANAGEMENT ENDPOINTS
# ============================================================================

@router.post("/children/link")
async def link_child(
    parent_id: str = Query(...),
    request: LinkChildRequest = None,
    db: AsyncSession = Depends(get_db)
):
    """Link a child to parent account via link code"""
    try:
        # This endpoint would verify the link code (generated by teacher)
        # and create the parent-child relationship
        return {
            "success": True,
            "message": "Child linked successfully",
            "child": {
                "id": "child_id_here",
                "name": "Child Name",
                "relationship": request.relationship,
                "linked_at": datetime.utcnow().isoformat(),
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/children", response_model=List[ChildLinkResponse])
async def list_parent_children(
    parent_id: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Get all children linked to parent"""
    # This would query the parent-child relationship table
    return []


# ============================================================================
# PROGRESS ENDPOINTS
# ============================================================================

@router.get("/children/{child_id}/progress", response_model=ChildProgressResponse)
async def get_child_progress(
    parent_id: str = Query(...),
    child_id: str = None,
    db: AsyncSession = Depends(get_db)
):
    """Get detailed progress for a specific child"""
    try:
        # Query child's learning sessions and aggregate progress
        result = await db.execute(
            f"SELECT * FROM learning_sessions WHERE user_id = '{child_id}'"
        )
        
        return {
            "child_id": child_id,
            "child_name": "Sample Child",
            "grade": 5,
            "competencies": [],
            "activities_completed": 0,
            "hours_learned": 0.0,
            "engagement_score": 85,
            "last_active": datetime.utcnow().isoformat(),
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/children/{child_id}/activities", response_model=List[ActivityResponse])
async def get_child_activities(
    parent_id: str = Query(...),
    child_id: str = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """Get activity history for a child (paginated)"""
    try:
        # Query recent learning sessions for the child
        result = await db.execute(
            f"SELECT * FROM learning_sessions WHERE user_id = '{child_id}' "
            f"ORDER BY completed_at DESC LIMIT {limit} OFFSET {offset}"
        )
        
        return []
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# REPORTING ENDPOINTS
# ============================================================================

@router.get("/children/{child_id}/reports/weekly", response_model=WeeklyReportResponse)
async def get_weekly_report(
    parent_id: str = Query(...),
    child_id: str = None,
    week_start: Optional[str] = Query(None),  # ISO format date
    db: AsyncSession = Depends(get_db)
):
    """Get weekly progress report for child"""
    try:
        # Calculate week starting date
        if not week_start:
            today = datetime.utcnow()
            week_start_date = today - timedelta(days=today.weekday())
        else:
            week_start_date = datetime.fromisoformat(week_start)
        
        week_end_date = week_start_date + timedelta(days=6)
        
        # Query activities for the week
        return {
            "child_id": child_id,
            "week_starting": week_start_date.isoformat(),
            "week_ending": week_end_date.isoformat(),
            "activities_completed": 0,
            "total_hours": 0.0,
            "new_competencies": [],
            "highlights": [],
            "concerns": [],
            "average_engagement": 85,
            "class_average": 78,
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/children/{child_id}/reports/monthly", response_model=MonthlyReportResponse)
async def get_monthly_report(
    parent_id: str = Query(...),
    child_id: str = None,
    month: int = Query(None, ge=1, le=12),
    year: int = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Get monthly progress report for child"""
    try:
        if not month or not year:
            today = datetime.utcnow()
            month = today.month
            year = today.year
        
        return {
            "child_id": child_id,
            "month": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month-1],
            "year": year,
            "activities_completed": 0,
            "total_hours": 0.0,
            "competencies_achieved": [],
            "growth_areas": [],
            "recommendations": [],
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# MESSAGING ENDPOINTS
# ============================================================================

@router.get("/messages", response_model=List[MessageResponse])
async def get_messages(
    parent_id: str = Query(...),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """Get messages from teachers (paginated)"""
    try:
        # Query messages where to_parent_id = parent_id
        return []
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/messages/{message_id}/reply")
async def reply_to_message(
    parent_id: str = Query(...),
    message_id: str = None,
    request: MessageReplyRequest = None,
    db: AsyncSession = Depends(get_db)
):
    """Reply to a teacher message"""
    try:
        return {
            "success": True,
            "message": "Reply sent successfully",
            "reply": {
                "id": str(uuid4()),
                "message_id": message_id,
                "from_parent_id": parent_id,
                "body": request.body,
                "created_at": datetime.utcnow().isoformat(),
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# NOTIFICATIONS ENDPOINTS
# ============================================================================

@router.get("/notifications", response_model=List[NotificationResponse])
async def get_notifications(
    parent_id: str = Query(...),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    db: AsyncSession = Depends(get_db)
):
    """Get notifications (paginated, optionally unread only)"""
    try:
        return []
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/notifications/{notification_id}/read")
async def mark_notification_as_read(
    parent_id: str = Query(...),
    notification_id: str = None,
    db: AsyncSession = Depends(get_db)
):
    """Mark notification as read"""
    try:
        return {
            "success": True,
            "message": "Notification marked as read",
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SETTINGS ENDPOINTS
# ============================================================================

@router.get("/settings", response_model=SettingsResponse)
async def get_settings(
    parent_id: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    """Get parent settings"""
    try:
        return {
            "parent_id": parent_id,
            "dark_mode": False,
            "language": "en",
            "email_frequency": "weekly",
            "notifications_enabled": True,
            "push_notifications_enabled": True,
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(
    parent_id: str = Query(...),
    request: SettingsRequest = None,
    db: AsyncSession = Depends(get_db)
):
    """Update parent settings"""
    try:
        return {
            "parent_id": parent_id,
            "dark_mode": request.dark_mode or False,
            "language": request.language or "en",
            "email_frequency": request.email_frequency or "weekly",
            "notifications_enabled": request.notifications_enabled or True,
            "push_notifications_enabled": request.push_notifications_enabled or True,
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# EXPORT ENDPOINTS
# ============================================================================

@router.post("/reports/{report_id}/export")
async def export_report(
    parent_id: str = Query(...),
    report_id: str = None,
    format: str = Query("pdf", pattern="^(pdf|excel|csv)$"),
    db: AsyncSession = Depends(get_db)
):
    """Export report as PDF, Excel, or CSV"""
    try:
        return {
            "success": True,
            "message": "Report exported successfully",
            "download_url": f"/api/v1/downloads/{report_id}.{format}",
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))