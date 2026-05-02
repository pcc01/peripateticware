# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Project management endpoints"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime
from typing import Optional, List

from core.database import get_db
from core.dependencies import get_current_user
from models import User, Project, ProjectStatus, ProjectActivity, Activity
from schemas.activities import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
    PaginatedProjectResponse,
    ProjectActivityLink,
    ProjectActivityOrder,
)

router = APIRouter(
    prefix="/api/v1/teacher/projects",
    tags=["projects"],
    dependencies=[Depends(get_current_user)]
)


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new project"""
    
    # Verify teacher role
    if current_user.role.value != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can create projects"
        )
    
    # Create project
    db_project = Project(
        teacher_id=current_user.id,
        title=project.title,
        description=project.description,
        grade_level=project.grade_level,
        subject=project.subject,
        duration_weeks=project.duration_weeks,
        start_date=project.start_date,
        end_date=project.end_date,
        status=ProjectStatus.PLANNING
    )
    
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    return db_project


@router.get("", response_model=PaginatedProjectResponse)
async def list_projects(
    status_filter: Optional[str] = Query(None, alias="status"),
    subject: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List projects for current teacher"""
    
    # Verify teacher role
    if current_user.role.value != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can view projects"
        )
    
    # Build query
    query = db.query(Project).filter(Project.teacher_id == current_user.id)
    
    # Apply filters
    if status_filter:
        try:
            status_enum = ProjectStatus(status_filter)
            query = query.filter(Project.status == status_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {status_filter}"
            )
    
    if subject:
        query = query.filter(Project.subject.ilike(f"%{subject}%"))
    
    # Count total
    total = query.count()
    
    # Paginate
    offset = (page - 1) * page_size
    projects = query.order_by(Project.created_at.desc()).offset(offset).limit(page_size).all()
    
    # Calculate total pages
    total_pages = (total + page_size - 1) // page_size
    
    # Build response with activity counts
    items = []
    for p in projects:
        activity_count = db.query(ProjectActivity).filter(
            ProjectActivity.project_id == p.id
        ).count()
        item_dict = {
            'id': p.id,
            'teacher_id': p.teacher_id,
            'title': p.title,
            'description': p.description,
            'subject': p.subject,
            'grade_level': p.grade_level,
            'duration_weeks': p.duration_weeks,
            'start_date': p.start_date,
            'end_date': p.end_date,
            'status': p.status,
            'activity_count': activity_count,
            'created_at': p.created_at,
            'updated_at': p.updated_at,
        }
        items.append(ProjectListResponse(**item_dict))
    
    return PaginatedProjectResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get project details with activities"""
    
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check ownership
    if project.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )
    
    # Load activities in order
    project_activities = db.query(ProjectActivity).filter(
        ProjectActivity.project_id == project_id
    ).order_by(ProjectActivity.order).all()
    
    # Get activities
    activity_ids = [pa.activity_id for pa in project_activities]
    activities = db.query(Activity).filter(Activity.id.in_(activity_ids)).all() if activity_ids else []
    
    # Sort activities by order
    activity_map = {a.id: a for a in activities}
    ordered_activities = [activity_map[pa.activity_id] for pa in project_activities if pa.activity_id in activity_map]
    
    project.activities = ordered_activities
    
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    project_update: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a project"""
    
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check ownership
    if project.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own projects"
        )
    
    # Update fields
    update_data = project_update.dict(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(project, field, value)
    
    project.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(project)
    
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a project (also unlinks activities)"""
    
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check ownership
    if project.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own projects"
        )
    
    # Delete project (cascade will handle project_activities)
    db.delete(project)
    db.commit()


@router.post("/{project_id}/activities", response_model=ProjectResponse)
async def add_activity_to_project(
    project_id: UUID,
    link: ProjectActivityLink,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add an activity to a project"""
    
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check ownership
    if project.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own projects"
        )
    
    # Check activity exists and belongs to teacher
    activity = db.query(Activity).filter(Activity.id == link.activity_id).first()
    
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )
    
    if activity.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only add your own activities to projects"
        )
    
    # Check if already linked
    existing = db.query(ProjectActivity).filter(
        ProjectActivity.project_id == project_id,
        ProjectActivity.activity_id == link.activity_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Activity already linked to this project"
        )
    
    # Get next order
    max_order = db.query(ProjectActivity).filter(
        ProjectActivity.project_id == project_id
    ).count()
    
    # Create association
    project_activity = ProjectActivity(
        project_id=project_id,
        activity_id=link.activity_id,
        order=link.order or max_order
    )
    
    db.add(project_activity)
    db.commit()
    db.refresh(project)
    
    return get_project(project_id, current_user, db)


@router.delete("/{project_id}/activities/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_activity_from_project(
    project_id: UUID,
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove an activity from a project"""
    
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check ownership
    if project.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own projects"
        )
    
    # Find and delete association
    project_activity = db.query(ProjectActivity).filter(
        ProjectActivity.project_id == project_id,
        ProjectActivity.activity_id == activity_id
    ).first()
    
    if not project_activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not linked to this project"
        )
    
    db.delete(project_activity)
    db.commit()


@router.put("/{project_id}/reorder")
async def reorder_activities(
    project_id: UUID,
    reorder_request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reorder activities in a project"""
    
    project = db.query(Project).filter(Project.id == project_id).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check ownership
    if project.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own projects"
        )
    
    # Update order for each activity
    activities = reorder_request.get('activities', [])
    
    for item in activities:
        project_activity = db.query(ProjectActivity).filter(
            ProjectActivity.project_id == project_id,
            ProjectActivity.activity_id == UUID(str(item['id']))
        ).first()
        
        if project_activity:
            project_activity.order = item['order']
    
    db.commit()
    
    return get_project(project_id, current_user, db)
