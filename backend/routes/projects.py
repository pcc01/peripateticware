# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Project management endpoints"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import datetime
from typing import Optional, List

from core.database import get_db
from core.dependencies import get_current_user
from models import User, Project, ProjectStatus, ProjectActivity, Activity
from routes.sessions import _check_gps_consent
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


async def _load_project_with_activities(project_id: UUID, current_user: User, db: AsyncSession) -> Project:
    """Fetch a project (with ownership check) and attach ordered activities.

    Shared by get_project / add_activity_to_project / remove_activity_from_project /
    reorder_activities so they all return the same fully-populated shape.
    """
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )

    if project.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )

    # Load activities in order
    pa_result = await db.execute(
        select(ProjectActivity)
        .where(ProjectActivity.project_id == project_id)
        .order_by(ProjectActivity.order)
    )
    project_activities = pa_result.scalars().all()

    activity_ids = [pa.activity_id for pa in project_activities]
    if activity_ids:
        act_result = await db.execute(select(Activity).where(Activity.id.in_(activity_ids)))
        activities = act_result.scalars().all()
    else:
        activities = []

    activity_map = {a.id: a for a in activities}
    ordered_activities = [activity_map[pa.activity_id] for pa in project_activities if pa.activity_id in activity_map]

    project.activities = ordered_activities

    return project


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new project"""

    # Verify teacher role
    if current_user.role.upper() != "TEACHER":
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
    await db.commit()
    await db.refresh(db_project)

    db_project.activities = []

    return db_project


@router.get("", response_model=PaginatedProjectResponse)
async def list_projects(
    status_filter: Optional[str] = Query(None, alias="status"),
    subject: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List projects for current teacher"""

    # Verify teacher role
    if current_user.role.upper() != "TEACHER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can view projects"
        )

    # Build base filter conditions (shared by count + page query)
    conditions = [Project.teacher_id == current_user.id]

    if status_filter:
        try:
            status_enum = ProjectStatus(status_filter)
            conditions.append(Project.status == status_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {status_filter}"
            )

    if subject:
        conditions.append(Project.subject.ilike(f"%{subject}%"))

    # Count total
    count_result = await db.execute(
        select(func.count()).select_from(Project).where(*conditions)
    )
    total = count_result.scalar() or 0

    # Paginate
    offset = (page - 1) * page_size
    projects_result = await db.execute(
        select(Project)
        .where(*conditions)
        .order_by(Project.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    projects = projects_result.scalars().all()

    # Calculate total pages
    total_pages = (total + page_size - 1) // page_size

    # Build response with activity counts
    items = []
    for p in projects:
        count_result = await db.execute(
            select(func.count()).select_from(ProjectActivity).where(ProjectActivity.project_id == p.id)
        )
        activity_count = count_result.scalar() or 0
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
    db: AsyncSession = Depends(get_db)
):
    """Get project details with activities"""
    return await _load_project_with_activities(project_id, current_user, db)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    project_update: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a project"""

    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

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

    await db.commit()
    await db.refresh(project)

    return await _load_project_with_activities(project_id, current_user, db)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a project (also unlinks activities)"""

    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

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
    await db.delete(project)
    await db.commit()


@router.post("/{project_id}/activities", response_model=ProjectResponse)
async def add_activity_to_project(
    project_id: UUID,
    link: ProjectActivityLink,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Add an activity to a project"""

    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

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
    activity_result = await db.execute(select(Activity).where(Activity.id == link.activity_id))
    activity = activity_result.scalar_one_or_none()

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
    existing_result = await db.execute(
        select(ProjectActivity).where(
            ProjectActivity.project_id == project_id,
            ProjectActivity.activity_id == link.activity_id
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Activity already linked to this project"
        )

    # Get next order
    count_result = await db.execute(
        select(func.count()).select_from(ProjectActivity).where(ProjectActivity.project_id == project_id)
    )
    max_order = count_result.scalar() or 0

    # Create association
    project_activity = ProjectActivity(
        project_id=project_id,
        activity_id=link.activity_id,
        order=link.order or max_order
    )

    db.add(project_activity)
    await db.commit()

    return await _load_project_with_activities(project_id, current_user, db)


@router.delete("/{project_id}/activities/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_activity_from_project(
    project_id: UUID,
    activity_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove an activity from a project"""

    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

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
    pa_result = await db.execute(
        select(ProjectActivity).where(
            ProjectActivity.project_id == project_id,
            ProjectActivity.activity_id == activity_id
        )
    )
    project_activity = pa_result.scalar_one_or_none()

    if not project_activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not linked to this project"
        )

    await db.delete(project_activity)
    await db.commit()


@router.put("/{project_id}/reorder")
async def reorder_activities(
    project_id: UUID,
    reorder_request: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reorder activities in a project"""

    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

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
        pa_result = await db.execute(
            select(ProjectActivity).where(
                ProjectActivity.project_id == project_id,
                ProjectActivity.activity_id == UUID(str(item['id']))
            )
        )
        project_activity = pa_result.scalar_one_or_none()

        if project_activity:
            project_activity.order = item['order']

    await db.commit()

    return await _load_project_with_activities(project_id, current_user, db)


@router.get("/{project_id}/active-sessions")
async def project_active_sessions(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Currently in-progress field sessions across every activity in this
    project, for the project-level live tracking map.

    Scope is deliberately gated on the existing per-activity
    discovery_location_gps_capture_enabled flag rather than a new
    project-level toggle — a project's live map only ever shows sessions
    for activities that already have tracking turned on individually (see
    THREAD_HANDOFF.md for why a redundant project-level switch was rejected).

    Consent is enforced here, not deferred: for each candidate row we
    replicate the same "who actually needs consent" rule already live in
    sessions.py's log_session_event (13+ students who don't require
    parental consent self-consent separately and bypass the gate), and
    drop any row that still needs consent but doesn't have it, via the
    same _check_gps_consent() used there.
    """
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if project.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have access to this project")

    gps_count_result = await db.execute(
        text("""
            SELECT COUNT(*) FROM project_activities pa
            JOIN activities a ON pa.activity_id = a.id
            WHERE pa.project_id = :pid AND a.discovery_location_gps_capture_enabled = TRUE
        """),
        {"pid": str(project_id)},
    )
    gps_enabled_activity_count = gps_count_result.scalar() or 0

    rows_result = await db.execute(
        text("""
            SELECT
                ls.id AS session_id, ls.user_id AS student_id, ls.status,
                ls.created_at AS started_at, ls.latitude, ls.longitude, ls.location_name,
                a.id AS activity_id, a.title AS activity_title,
                u.first_name, u.last_name, u.age_group, u.requires_parental_consent
            FROM learning_sessions ls
            JOIN activities a ON ls.activity_id = a.id
            JOIN project_activities pa ON pa.activity_id = a.id
            JOIN users u ON ls.user_id = u.id
            WHERE pa.project_id = :pid AND a.teacher_id = :tid
              AND a.discovery_location_gps_capture_enabled = TRUE
              AND ls.status = 'in_progress' AND ls.is_active = true
            ORDER BY ls.created_at DESC
        """),
        {"pid": str(project_id), "tid": current_user.id},
    )
    candidates = rows_result.mappings().all()

    sessions_out = []
    for r in candidates:
        needs_consent = True
        age_group = r["age_group"]
        rpc = r["requires_parental_consent"]
        if age_group not in ("under_13", None) and not rpc:
            needs_consent = False  # 13+ self-consents separately

        if needs_consent:
            has_consent = await _check_gps_consent(db, r["student_id"], r["activity_id"])
            if not has_consent:
                continue

        sessions_out.append({
            "session_id": str(r["session_id"]),
            "student_id": str(r["student_id"]),
            "student_name": f"{r['first_name']} {r['last_name']}".strip(),
            "activity_id": str(r["activity_id"]),
            "activity_title": r["activity_title"],
            "status": r["status"],
            "started_at": r["started_at"].isoformat() if r["started_at"] else None,
            "latitude": r["latitude"],
            "longitude": r["longitude"],
            "location_name": r["location_name"],
        })

    return {
        "sessions": sessions_out,
        "gps_enabled_activity_count": gps_enabled_activity_count,
    }
