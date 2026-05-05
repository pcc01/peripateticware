# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Activity management endpoints"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from datetime import datetime
from typing import Optional, List

from core.database import get_db
from core.dependencies import get_current_user
from models import User, Activity, ActivityStatus, ActivityType, Project
from schemas.activities import (
    ActivityCreate, 
    ActivityUpdate, 
    ActivityResponse,
    ActivityListResponse,
    PaginatedActivityResponse,
)

# Helper function to extract role
def get_user_role(user: User) -> str:
    """Extract role as uppercase string, handling both enum and string cases"""
    if hasattr(user.role, 'value'):
        return str(user.role.value).upper()
    return str(user.role).upper()


router = APIRouter(
    prefix="/api/v1/teacher/activities",
    tags=["activities"],
    dependencies=[Depends(get_current_user)]
)


@router.post("", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
async def create_activity(
    activity: ActivityCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new activity"""
    
    # Verify teacher role
    if get_user_role(current_user) != "TEACHER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can create activities"
        )
    
    # Create activity
    db_activity = Activity(
        teacher_id=current_user.id,
        title=activity.title,
        description=activity.description,
        location_latitude=activity.location_latitude,
        location_longitude=activity.location_longitude,
        location_radius_meters=activity.location_radius_meters,
        location_name=activity.location_name,
        grade_level=activity.grade_level,
        subject=activity.subject,
        difficulty_level=activity.difficulty_level,
        estimated_duration_minutes=activity.estimated_duration_minutes,
        materials_needed=activity.materials_needed,
        resources=activity.resources,
        learning_objectives=activity.learning_objectives,
        curriculum_unit_ids=activity.curriculum_unit_ids,
        bloom_level=activity.bloom_level,
        activity_type=ActivityType(activity.activity_type.value),
        is_shareable=activity.is_shareable,
        status=ActivityStatus.DRAFT
    )
    
    db.add(db_activity)
    await db.commit()
    await db.refresh(db_activity)
    
    return db_activity


@router.get("", response_model=PaginatedActivityResponse)
async def list_activities(
    status_filter: Optional[str] = Query(None, alias="status"),
    subject: Optional[str] = Query(None),
    grade_level: Optional[int] = Query(None),
    difficulty: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List activities for current teacher"""
    
    # DEBUG: Check what role we're getting
    print(f"DEBUG: current_user.role = {current_user.role}")
    print(f"DEBUG: current_user.role type = {type(current_user.role)}")
    print(f"DEBUG: current_user.role.value = {current_user.role.value if hasattr(current_user.role, 'value') else 'NO VALUE ATTR'}")
    
    # Verify teacher role
    if get_user_role(current_user) != "TEACHER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can view activities"
        )
    
    # Build query
    stmt = select(Activity).where(Activity.teacher_id == current_user.id)
    
    # Apply filters
    if status_filter:
        try:
            status_enum = ActivityStatus(status_filter)
            stmt = stmt.where(Activity.status == status_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {status_filter}"
            )
    
    if subject:
        stmt = stmt.where(Activity.subject.ilike(f"%{subject}%"))
    
    if grade_level:
        stmt = stmt.where(Activity.grade_level == grade_level)
    
    if difficulty:
        stmt = stmt.where(Activity.difficulty_level == difficulty)
    
    # Count total
    count_stmt = select(Activity).where(Activity.teacher_id == current_user.id)
    
    if status_filter:
        try:
            status_enum = ActivityStatus(status_filter)
            count_stmt = count_stmt.where(Activity.status == status_enum)
        except ValueError:
            pass
    
    if subject:
        count_stmt = count_stmt.where(Activity.subject.ilike(f"%{subject}%"))
    
    if grade_level:
        count_stmt = count_stmt.where(Activity.grade_level == grade_level)
    
    if difficulty:
        count_stmt = count_stmt.where(Activity.difficulty_level == difficulty)
    
    result = await db.execute(count_stmt)
    total = len(result.scalars().all())
    
    # Paginate
    offset = (page - 1) * page_size
    stmt = stmt.order_by(Activity.created_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(stmt)
    activities = result.scalars().all()
    
    # Calculate total pages
    total_pages = (total + page_size - 1) // page_size
    
    return PaginatedActivityResponse(
        items=[ActivityListResponse.from_orm(a) for a in activities],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/{activity_id}", response_model=ActivityResponse)
async def get_activity(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get activity details"""
    
    stmt = select(Activity).where(Activity.id == activity_id)
    result = await db.execute(stmt)
    activity = result.scalar_one_or_none()
    
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )
    
    # Check ownership or public status
    if activity.teacher_id != current_user.id and activity.status != ActivityStatus.PUBLISHED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this activity"
        )
    
    # Increment view count if not the owner
    if activity.teacher_id != current_user.id:
        activity.view_count += 1
        await db.commit()
    
    return activity


@router.put("/{activity_id}", response_model=ActivityResponse)
async def update_activity(
    activity_id: UUID,
    activity_update: ActivityUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an activity"""
    
    stmt = select(Activity).where(Activity.id == activity_id)
    result = await db.execute(stmt)
    activity = result.scalar_one_or_none()
    
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )
    
    # Check ownership
    if activity.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own activities"
        )
    
    # Update fields
    update_data = activity_update.dict(exclude_unset=True)
    
    # Convert enum to string for storage
    if 'activity_type' in update_data and update_data['activity_type']:
        update_data['activity_type'] = ActivityType(update_data['activity_type'].value)
    
    for field, value in update_data.items():
        setattr(activity, field, value)
    
    activity.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(activity)
    
    return activity


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete an activity"""
    
    stmt = select(Activity).where(Activity.id == activity_id)
    result = await db.execute(stmt)
    activity = result.scalar_one_or_none()
    
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )
    
    # Check ownership
    if activity.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own activities"
        )
    
    await db.delete(activity)
    await db.commit()


@router.post("/{activity_id}/publish", response_model=ActivityResponse)
async def publish_activity(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Publish an activity (move from draft to published)"""
    
    stmt = select(Activity).where(Activity.id == activity_id)
    result = await db.execute(stmt)
    activity = result.scalar_one_or_none()
    
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )
    
    # Check ownership
    if activity.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only publish your own activities"
        )
    
    # Check status
    if activity.status != ActivityStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft activities can be published"
        )
    
    activity.status = ActivityStatus.PUBLISHED
    activity.published_at = datetime.utcnow()
    activity.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(activity)
    
    return activity


@router.post("/{activity_id}/archive", response_model=ActivityResponse)
async def archive_activity(
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Archive an activity"""
    
    stmt = select(Activity).where(Activity.id == activity_id)
    result = await db.execute(stmt)
    activity = result.scalar_one_or_none()
    
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )
    
    # Check ownership
    if activity.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only archive your own activities"
        )
    
    activity.status = ActivityStatus.ARCHIVED
    activity.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(activity)
    
    return activity