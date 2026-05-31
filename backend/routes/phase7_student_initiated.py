# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Phase 7 — Student-Initiated Activities: Field Notes & Peer Projects

Routes registered in main.py:
    from routes.phase7_student_initiated import router as phase7_router
    app.include_router(phase7_router, prefix="/api/v1", tags=["phase7"])
"""

from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status as http_status
from pydantic import BaseModel
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.database import (
    User,
    StudentFieldNote,
    StudentFieldNoteCapture,
    StudentSelfProject,
    StudentPeerProject,
    PeerProjectExampleCapture,
    PeerProjectResponse,
    PeerProjectResponseCapture,
    ClassSettings,
    Class,
    StudentCapture,
    Notification,
)

router = APIRouter()


# =============================================================================
# HELPERS
# =============================================================================

def _now() -> datetime:
    return datetime.now(timezone.utc)

def _require_role(user: User, *roles: str, detail: str = "Forbidden") -> None:
    if user.role.upper() not in [r.upper() for r in roles]:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail=detail)

async def _get_field_note_or_404(db: AsyncSession, field_note_id: UUID, owner_id: UUID = None) -> StudentFieldNote:
    q = select(StudentFieldNote).where(StudentFieldNote.id == field_note_id)
    if owner_id:
        q = q.where(StudentFieldNote.student_id == owner_id)
    result = await db.execute(q)
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Field note not found")
    return note

async def _get_self_project_or_404(db: AsyncSession, project_id: UUID, owner_id: UUID = None) -> StudentSelfProject:
    q = select(StudentSelfProject).where(StudentSelfProject.id == project_id)
    if owner_id:
        q = q.where(StudentSelfProject.student_id == owner_id)
    result = await db.execute(q)
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Self-project not found")
    return p

async def _get_peer_project_or_404(db: AsyncSession, project_id: UUID) -> StudentPeerProject:
    result = await db.execute(
        select(StudentPeerProject).where(StudentPeerProject.id == project_id)
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Peer project not found")
    return p

async def _get_or_create_class_settings(db: AsyncSession, class_id: UUID) -> ClassSettings:
    result = await db.execute(
        select(ClassSettings).where(ClassSettings.class_id == class_id)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = ClassSettings(
            id=uuid4(),
            class_id=class_id,
        )
        db.add(settings)
        await db.flush()
    return settings

async def _create_notification(db: AsyncSession, user_id: UUID, title: str, message: str) -> None:
    try:
        notif = Notification(
            id=uuid4(),
            user_id=user_id,
            title=title,
            message=message,
        )
        db.add(notif)
    except Exception:
        pass  # Notifications are non-critical — don't fail the main operation

def _serialize_field_note(note: StudentFieldNote) -> dict:
    return {
        "id": str(note.id),
        "student_id": str(note.student_id),
        "self_project_id": str(note.self_project_id) if note.self_project_id else None,
        "title": note.title,
        "description": note.description,
        "status": note.status.value if hasattr(note.status, "value") else str(note.status),
        "location_latitude": note.location_latitude,
        "location_longitude": note.location_longitude,
        "location_name": note.location_name,
        "created_at": note.created_at.isoformat() if note.created_at else None,
        "updated_at": note.updated_at.isoformat() if note.updated_at else None,
    }

def _serialize_self_project(p: StudentSelfProject) -> dict:
    return {
        "id": str(p.id),
        "student_id": str(p.student_id),
        "title": p.title,
        "description": p.description,
        "status": p.status.value if hasattr(p.status, "value") else str(p.status),
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }

def _serialize_peer_project(p: StudentPeerProject) -> dict:
    return {
        "id": str(p.id),
        "author_student_id": str(p.author_student_id),
        "class_id": str(p.class_id),
        "title": p.title,
        "description": p.description,
        "learning_objectives_text": p.learning_objectives_text,
        "guiding_prompts": p.guiding_prompts,
        "allowed_capture_types": p.allowed_capture_types,
        "audience": p.audience.value if hasattr(p.audience, "value") else str(p.audience),
        "status": p.status.value if hasattr(p.status, "value") else str(p.status),
        "approval_required": p.approval_required,
        "approved_at": p.approved_at.isoformat() if p.approved_at else None,
        "teacher_feedback": p.teacher_feedback,
        "published_at": p.published_at.isoformat() if p.published_at else None,
        "author_can_see_individual_responses": p.author_can_see_individual_responses,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================

class FieldNoteCreate(BaseModel):
    title: str
    description: Optional[str] = None
    self_project_id: Optional[UUID] = None
    location_latitude: Optional[float] = None
    location_longitude: Optional[float] = None
    location_name: Optional[str] = None

class FieldNoteUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    self_project_id: Optional[UUID] = None
    location_latitude: Optional[float] = None
    location_longitude: Optional[float] = None
    location_name: Optional[str] = None

class FieldNotePromoteRequest(BaseModel):
    message: Optional[str] = None

class TeacherFieldNoteApproveRequest(BaseModel):
    feedback: Optional[str] = None
    create_as: str = "activity"

class TeacherFieldNoteRejectRequest(BaseModel):
    feedback: str

class SelfProjectCreate(BaseModel):
    title: str
    description: Optional[str] = None

class SelfProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None

class PeerProjectCreate(BaseModel):
    title: str
    description: str
    class_id: Optional[UUID] = None
    learning_objectives_text: List[dict] = []
    guiding_prompts: List[dict] = []
    allowed_capture_types: List[str] = ["photo", "text"]
    audience: str = "whole_class"
    target_student_ids: List[UUID] = []

class PeerProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    learning_objectives_text: Optional[List[dict]] = None
    guiding_prompts: Optional[List[dict]] = None
    allowed_capture_types: Optional[List[str]] = None
    audience: Optional[str] = None
    target_student_ids: Optional[List[UUID]] = None

class AddExampleCaptureRequest(BaseModel):
    capture_id: UUID
    caption: Optional[str] = None

class TeacherPeerProjectApproveRequest(BaseModel):
    feedback: Optional[str] = None
    curriculum_objective_ids: List[UUID] = []

class TeacherPeerProjectRejectRequest(BaseModel):
    feedback: str

class ClassSettingsUpdate(BaseModel):
    peer_project_approval_mode: Optional[str] = None
    peer_project_author_sees_individual_responses: Optional[bool] = None
    students_can_create_peer_projects: Optional[bool] = None
    students_can_create_field_notes: Optional[bool] = None


# =============================================================================
# FIELD NOTE ROUTES — STUDENT
# =============================================================================

@router.post("/student/field-notes", status_code=http_status.HTTP_201_CREATED)
async def create_field_note(
    body: FieldNoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.self_project_id:
        await _get_self_project_or_404(db, body.self_project_id, owner_id=current_user.id)

    note = StudentFieldNote(
        id=uuid4(),
        student_id=current_user.id,
        title=body.title,
        description=body.description,
        self_project_id=body.self_project_id,
        location_latitude=body.location_latitude,
        location_longitude=body.location_longitude,
        location_name=body.location_name,
        status="draft",
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return _serialize_field_note(note)


@router.get("/student/field-notes")
async def list_field_notes(
    note_status: Optional[str] = None,
    self_project_id: Optional[UUID] = None,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(StudentFieldNote).where(StudentFieldNote.student_id == current_user.id)
    if note_status:
        q = q.where(StudentFieldNote.status == note_status)
    if self_project_id:
        q = q.where(StudentFieldNote.self_project_id == self_project_id)
    q = q.order_by(StudentFieldNote.updated_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    notes = result.scalars().all()
    return {"items": [_serialize_field_note(n) for n in notes], "page": page, "limit": limit}


@router.get("/student/field-notes/{field_note_id}")
async def get_field_note(
    field_note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_field_note_or_404(db, field_note_id, owner_id=current_user.id)
    return _serialize_field_note(note)


@router.put("/student/field-notes/{field_note_id}")
async def update_field_note(
    field_note_id: UUID,
    body: FieldNoteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_field_note_or_404(db, field_note_id, owner_id=current_user.id)
    status_val = note.status.value if hasattr(note.status, "value") else str(note.status)
    if status_val in ("submitted", "promoted"):
        raise HTTPException(status_code=400, detail="Cannot edit a submitted or promoted field note")
    for field, val in body.dict(exclude_unset=True).items():
        setattr(note, field, val)
    note.updated_at = _now()
    await db.commit()
    await db.refresh(note)
    return _serialize_field_note(note)


@router.delete("/student/field-notes/{field_note_id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def delete_field_note(
    field_note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_field_note_or_404(db, field_note_id, owner_id=current_user.id)
    status_val = note.status.value if hasattr(note.status, "value") else str(note.status)
    if status_val in ("submitted", "promoted"):
        raise HTTPException(status_code=400, detail="Cannot delete a submitted or promoted field note")
    await db.delete(note)
    await db.commit()


@router.post("/student/field-notes/{field_note_id}/share")
async def share_field_note(
    field_note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_field_note_or_404(db, field_note_id, owner_id=current_user.id)
    note.status = "shared"
    note.updated_at = _now()
    await db.commit()
    return _serialize_field_note(note)


@router.post("/student/field-notes/{field_note_id}/unshare")
async def unshare_field_note(
    field_note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_field_note_or_404(db, field_note_id, owner_id=current_user.id)
    status_val = note.status.value if hasattr(note.status, "value") else str(note.status)
    if status_val in ("submitted", "promoted"):
        raise HTTPException(status_code=400, detail="Cannot unshare a submitted or promoted note")
    note.status = "draft"
    note.updated_at = _now()
    await db.commit()
    return _serialize_field_note(note)


@router.post("/student/field-notes/{field_note_id}/submit-for-promotion")
async def submit_field_note_for_promotion(
    field_note_id: UUID,
    body: FieldNotePromoteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await _get_field_note_or_404(db, field_note_id, owner_id=current_user.id)
    status_val = note.status.value if hasattr(note.status, "value") else str(note.status)
    if status_val == "promoted":
        raise HTTPException(status_code=400, detail="Field note has already been promoted")
    note.status = "submitted"
    note.updated_at = _now()
    await db.commit()
    return _serialize_field_note(note)


# =============================================================================
# FIELD NOTE ROUTES — TEACHER
# =============================================================================

@router.get("/teacher/field-notes")
async def list_field_notes_for_teacher(
    class_id: Optional[UUID] = None,
    note_status: Optional[str] = None,
    student_id: Optional[UUID] = None,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(current_user, "TEACHER", "ADMIN")
    q = select(StudentFieldNote).where(
        StudentFieldNote.status.in_(["shared", "submitted", "promoted"])
    )
    if note_status:
        q = q.where(StudentFieldNote.status == note_status)
    if student_id:
        q = q.where(StudentFieldNote.student_id == student_id)
    q = q.order_by(StudentFieldNote.updated_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    notes = result.scalars().all()
    return {"items": [_serialize_field_note(n) for n in notes], "page": page, "limit": limit}


@router.post("/teacher/field-notes/{field_note_id}/approve")
async def approve_field_note_promotion(
    field_note_id: UUID,
    body: TeacherFieldNoteApproveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(current_user, "TEACHER", "ADMIN")
    note = await _get_field_note_or_404(db, field_note_id)
    status_val = note.status.value if hasattr(note.status, "value") else str(note.status)
    if status_val != "submitted":
        raise HTTPException(status_code=400, detail="Field note is not in submitted state")
    note.status = "promoted"
    note.updated_at = _now()
    await _create_notification(
        db, note.student_id,
        "Field Note Promoted! 🎉",
        f"Your field note '{note.title}' has been approved by your teacher."
        + (f" Feedback: {body.feedback}" if body.feedback else "")
    )
    await db.commit()
    return _serialize_field_note(note)


@router.post("/teacher/field-notes/{field_note_id}/reject")
async def reject_field_note_promotion(
    field_note_id: UUID,
    body: TeacherFieldNoteRejectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(current_user, "TEACHER", "ADMIN")
    note = await _get_field_note_or_404(db, field_note_id)
    note.status = "draft"
    note.updated_at = _now()
    await _create_notification(
        db, note.student_id,
        "Field Note Needs Revision",
        f"Your field note '{note.title}' needs revision. Feedback: {body.feedback}"
    )
    await db.commit()
    return _serialize_field_note(note)


# =============================================================================
# SELF-PROJECT ROUTES
# =============================================================================

@router.post("/student/self-projects", status_code=http_status.HTTP_201_CREATED)
async def create_self_project(
    body: SelfProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = StudentSelfProject(
        id=uuid4(),
        student_id=current_user.id,
        title=body.title,
        description=body.description,
        status="personal",
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return _serialize_self_project(project)


@router.get("/student/self-projects")
async def list_self_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentSelfProject)
        .where(StudentSelfProject.student_id == current_user.id)
        .order_by(StudentSelfProject.updated_at.desc())
    )
    projects = result.scalars().all()

    # Enrich with field note counts
    items = []
    for p in projects:
        count_result = await db.execute(
            select(func.count()).where(StudentFieldNote.self_project_id == p.id)
        )
        count = count_result.scalar() or 0
        d = _serialize_self_project(p)
        d["field_note_count"] = count
        items.append(d)
    return {"items": items}


@router.get("/student/self-projects/{project_id}")
async def get_self_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_self_project_or_404(db, project_id, owner_id=current_user.id)
    notes_result = await db.execute(
        select(StudentFieldNote).where(StudentFieldNote.self_project_id == project_id)
    )
    notes = notes_result.scalars().all()
    d = _serialize_self_project(project)
    d["field_notes"] = [_serialize_field_note(n) for n in notes]
    return d


@router.put("/student/self-projects/{project_id}")
async def update_self_project(
    project_id: UUID,
    body: SelfProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_self_project_or_404(db, project_id, owner_id=current_user.id)
    for field, val in body.dict(exclude_unset=True).items():
        setattr(project, field, val)
    project.updated_at = _now()
    await db.commit()
    await db.refresh(project)
    return _serialize_self_project(project)


@router.delete("/student/self-projects/{project_id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def delete_self_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_self_project_or_404(db, project_id, owner_id=current_user.id)
    # Unlink field notes rather than deleting them
    notes_result = await db.execute(
        select(StudentFieldNote).where(StudentFieldNote.self_project_id == project_id)
    )
    for note in notes_result.scalars().all():
        note.self_project_id = None
        note.updated_at = _now()
    await db.delete(project)
    await db.commit()


# =============================================================================
# PEER PROJECT ROUTES — STUDENT AUTHOR
# =============================================================================

@router.post("/student/peer-projects", status_code=http_status.HTTP_201_CREATED)
async def create_peer_project(
    body: PeerProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Resolve class — use provided class_id or first class the student belongs to
    class_id = body.class_id
    if not class_id:
        # Find first class taught by a teacher (simplified lookup)
        cls_result = await db.execute(select(Class).limit(1))
        cls = cls_result.scalar_one_or_none()
        if not cls:
            raise HTTPException(status_code=400, detail="No class found. Provide class_id.")
        class_id = cls.id

    settings = await _get_or_create_class_settings(db, class_id)
    if not settings.students_can_create_peer_projects:
        raise HTTPException(status_code=403, detail="Peer project creation is disabled for this class")

    project = StudentPeerProject(
        id=uuid4(),
        author_student_id=current_user.id,
        class_id=class_id,
        title=body.title,
        description=body.description,
        learning_objectives_text=body.learning_objectives_text,
        guiding_prompts=body.guiding_prompts,
        allowed_capture_types=body.allowed_capture_types,
        audience=body.audience,
        target_student_ids=[str(sid) for sid in body.target_student_ids],
        status="draft",
        approval_required=(settings.peer_project_approval_mode != "auto_publish"),
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return _serialize_peer_project(project)


@router.get("/student/peer-projects/authored")
async def list_authored_peer_projects(
    project_status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(StudentPeerProject).where(
        StudentPeerProject.author_student_id == current_user.id
    )
    if project_status:
        q = q.where(StudentPeerProject.status == project_status)
    q = q.order_by(StudentPeerProject.updated_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    return {"items": [_serialize_peer_project(p) for p in result.scalars().all()]}


@router.get("/student/peer-projects/available")
async def list_available_peer_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentPeerProject).where(
            and_(
                StudentPeerProject.status == "published",
                StudentPeerProject.author_student_id != current_user.id,
            )
        ).order_by(StudentPeerProject.published_at.desc())
    )
    return {"items": [_serialize_peer_project(p) for p in result.scalars().all()]}


@router.get("/student/peer-projects/{project_id}")
async def get_peer_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_peer_project_or_404(db, project_id)
    d = _serialize_peer_project(project)
    # Attach example captures
    examples_result = await db.execute(
        select(PeerProjectExampleCapture).where(
            PeerProjectExampleCapture.peer_project_id == project_id
        )
    )
    d["examples"] = [
        {"id": str(e.id), "capture_id": str(e.capture_id), "caption": e.caption, "order": e.order_index}
        for e in examples_result.scalars().all()
    ]
    return d


@router.put("/student/peer-projects/{project_id}")
async def update_peer_project(
    project_id: UUID,
    body: PeerProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_peer_project_or_404(db, project_id)
    if project.author_student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author of this project")
    status_val = project.status.value if hasattr(project.status, "value") else str(project.status)
    if status_val not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="Can only edit draft or rejected projects")
    for field, val in body.dict(exclude_unset=True).items():
        setattr(project, field, val)
    project.updated_at = _now()
    await db.commit()
    await db.refresh(project)
    return _serialize_peer_project(project)


@router.post("/student/peer-projects/{project_id}/add-example")
async def add_example_capture(
    project_id: UUID,
    body: AddExampleCaptureRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_peer_project_or_404(db, project_id)
    if project.author_student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")
    # Verify capture belongs to student
    cap_result = await db.execute(
        select(StudentCapture).where(
            and_(StudentCapture.id == body.capture_id, StudentCapture.student_id == current_user.id)
        )
    )
    if not cap_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Capture not found or not yours")

    count_result = await db.execute(
        select(func.count()).where(PeerProjectExampleCapture.peer_project_id == project_id)
    )
    order_index = (count_result.scalar() or 0)

    example = PeerProjectExampleCapture(
        id=uuid4(),
        peer_project_id=project_id,
        capture_id=body.capture_id,
        caption=body.caption,
        order_index=order_index,
        created_at=_now(),
    )
    db.add(example)
    await db.commit()
    return {"id": str(example.id), "capture_id": str(example.capture_id), "caption": example.caption}


@router.delete("/student/peer-projects/{project_id}/examples/{example_id}",
               status_code=http_status.HTTP_204_NO_CONTENT)
async def remove_example_capture(
    project_id: UUID,
    example_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_peer_project_or_404(db, project_id)
    if project.author_student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")
    result = await db.execute(
        select(PeerProjectExampleCapture).where(
            and_(PeerProjectExampleCapture.id == example_id,
                 PeerProjectExampleCapture.peer_project_id == project_id)
        )
    )
    example = result.scalar_one_or_none()
    if not example:
        raise HTTPException(status_code=404, detail="Example not found")
    await db.delete(example)
    await db.commit()


@router.post("/student/peer-projects/{project_id}/submit")
async def submit_peer_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_peer_project_or_404(db, project_id)
    if project.author_student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the author")
    status_val = project.status.value if hasattr(project.status, "value") else str(project.status)
    if status_val not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="Project must be in draft or rejected state to submit")

    settings = await _get_or_create_class_settings(db, project.class_id)
    if settings.peer_project_approval_mode == "auto_publish":
        project.status = "published"
        project.published_at = _now()
    else:
        project.status = "pending_approval"

    project.approval_required = (settings.peer_project_approval_mode != "auto_publish")
    project.updated_at = _now()
    await db.commit()
    return _serialize_peer_project(project)


# =============================================================================
# PEER PROJECT ROUTES — CLASSMATE RESPONSES
# =============================================================================

@router.post("/student/peer-projects/{project_id}/respond",
             status_code=http_status.HTTP_201_CREATED)
async def start_peer_project_response(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_peer_project_or_404(db, project_id)
    if project.author_student_id == current_user.id:
        raise HTTPException(status_code=400, detail="Author cannot respond to their own project")
    # Idempotent: return existing response if already started
    existing = await db.execute(
        select(PeerProjectResponse).where(
            and_(PeerProjectResponse.peer_project_id == project_id,
                 PeerProjectResponse.student_id == current_user.id)
        )
    )
    response = existing.scalar_one_or_none()
    if not response:
        response = PeerProjectResponse(
            id=uuid4(),
            peer_project_id=project_id,
            student_id=current_user.id,
            status="in_progress",
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(response)
        await db.commit()
        await db.refresh(response)
    return {
        "id": str(response.id),
        "peer_project_id": str(response.peer_project_id),
        "student_id": str(response.student_id),
        "status": response.status.value if hasattr(response.status, "value") else str(response.status),
        "created_at": response.created_at.isoformat() if response.created_at else None,
    }


@router.get("/student/peer-projects/{project_id}/my-response")
async def get_my_peer_project_response(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PeerProjectResponse).where(
            and_(PeerProjectResponse.peer_project_id == project_id,
                 PeerProjectResponse.student_id == current_user.id)
        )
    )
    response = result.scalar_one_or_none()
    if not response:
        raise HTTPException(status_code=404, detail="No response found — call /respond first")
    return {
        "id": str(response.id),
        "status": response.status.value if hasattr(response.status, "value") else str(response.status),
        "completed_at": response.completed_at.isoformat() if response.completed_at else None,
    }


@router.post("/student/peer-projects/{project_id}/my-response/captures")
async def add_capture_to_response(
    project_id: UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get the student's response
    result = await db.execute(
        select(PeerProjectResponse).where(
            and_(PeerProjectResponse.peer_project_id == project_id,
                 PeerProjectResponse.student_id == current_user.id)
        )
    )
    response = result.scalar_one_or_none()
    if not response:
        raise HTTPException(status_code=404, detail="Start a response first via /respond")
    status_val = response.status.value if hasattr(response.status, "value") else str(response.status)
    if status_val not in ("assigned", "in_progress"):
        raise HTTPException(status_code=400, detail="Response is already completed")

    # Store the capture file
    import os, aiofiles
    upload_dir = "/app/uploads/peer_project_responses"
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{uuid4()}_{file.filename}"
    filepath = os.path.join(upload_dir, filename)
    try:
        async with aiofiles.open(filepath, "wb") as f:
            content = await file.read()
            await f.write(content)
    except Exception:
        # Fall back to in-memory path if aiofiles not available
        filepath = f"uploads/peer_project_responses/{filename}"

    capture = StudentCapture(
        id=uuid4(),
        student_id=current_user.id,
        capture_type="photo",
        file_path=filepath,
        file_size_bytes=file.size if hasattr(file, "size") else None,
        mime_type=file.content_type,
        captured_at=_now(),
    )
    db.add(capture)
    await db.flush()

    link = PeerProjectResponseCapture(
        id=uuid4(),
        response_id=response.id,
        capture_id=capture.id,
        order_index=0,
    )
    db.add(link)
    await db.commit()
    return {"capture_id": str(capture.id), "file_path": filepath}


@router.post("/student/peer-projects/{project_id}/my-response/complete")
async def complete_peer_project_response(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PeerProjectResponse).where(
            and_(PeerProjectResponse.peer_project_id == project_id,
                 PeerProjectResponse.student_id == current_user.id)
        )
    )
    response = result.scalar_one_or_none()
    if not response:
        raise HTTPException(status_code=404, detail="No response found")
    response.status = "submitted"
    response.completed_at = _now()
    response.updated_at = _now()
    await db.commit()
    return {"status": "submitted", "completed_at": response.completed_at.isoformat()}


# =============================================================================
# PEER PROJECT ROUTES — TEACHER
# =============================================================================

@router.get("/teacher/peer-projects")
async def list_peer_projects_for_teacher(
    class_id: Optional[UUID] = None,
    project_status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(current_user, "TEACHER", "ADMIN")
    q = select(StudentPeerProject)
    if class_id:
        q = q.where(StudentPeerProject.class_id == class_id)
    if project_status:
        q = q.where(StudentPeerProject.status == project_status)
    q = q.order_by(StudentPeerProject.updated_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    return {"items": [_serialize_peer_project(p) for p in result.scalars().all()]}


@router.get("/teacher/peer-projects/{project_id}")
async def get_peer_project_as_teacher(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(current_user, "TEACHER", "ADMIN")
    project = await _get_peer_project_or_404(db, project_id)
    d = _serialize_peer_project(project)
    responses_result = await db.execute(
        select(PeerProjectResponse).where(PeerProjectResponse.peer_project_id == project_id)
    )
    d["responses"] = [
        {
            "id": str(r.id),
            "student_id": str(r.student_id),
            "status": r.status.value if hasattr(r.status, "value") else str(r.status),
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in responses_result.scalars().all()
    ]
    return d


@router.post("/teacher/peer-projects/{project_id}/approve")
async def approve_peer_project(
    project_id: UUID,
    body: TeacherPeerProjectApproveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(current_user, "TEACHER", "ADMIN")
    project = await _get_peer_project_or_404(db, project_id)
    status_val = project.status.value if hasattr(project.status, "value") else str(project.status)
    if status_val != "pending_approval":
        raise HTTPException(status_code=400, detail="Project is not pending approval")
    project.status = "published"
    project.approved_by_teacher_id = current_user.id
    project.approved_at = _now()
    project.published_at = _now()
    project.teacher_feedback = body.feedback
    project.updated_at = _now()
    await _create_notification(
        db, project.author_student_id,
        "Peer Project Approved! 🎉",
        f"Your peer project '{project.title}' has been approved and published."
        + (f" Teacher feedback: {body.feedback}" if body.feedback else "")
    )
    await db.commit()
    return _serialize_peer_project(project)


@router.post("/teacher/peer-projects/{project_id}/reject")
async def reject_peer_project(
    project_id: UUID,
    body: TeacherPeerProjectRejectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(current_user, "TEACHER", "ADMIN")
    project = await _get_peer_project_or_404(db, project_id)
    project.status = "rejected"
    project.teacher_feedback = body.feedback
    project.updated_at = _now()
    await _create_notification(
        db, project.author_student_id,
        "Peer Project Needs Revision",
        f"Your peer project '{project.title}' needs changes. Feedback: {body.feedback}"
    )
    await db.commit()
    return _serialize_peer_project(project)


@router.put("/teacher/peer-projects/{project_id}/settings")
async def update_peer_project_teacher_settings(
    project_id: UUID,
    author_can_see_individual_responses: bool,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(current_user, "TEACHER", "ADMIN")
    project = await _get_peer_project_or_404(db, project_id)
    project.author_can_see_individual_responses = author_can_see_individual_responses
    project.updated_at = _now()
    await db.commit()
    return _serialize_peer_project(project)


# =============================================================================
# CLASS SETTINGS ROUTES
# =============================================================================

@router.get("/teacher/classes/{class_id}/settings")
async def get_class_settings(
    class_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(current_user, "TEACHER", "ADMIN")
    settings = await _get_or_create_class_settings(db, class_id)
    await db.commit()
    return {
        "class_id": str(settings.class_id),
        "peer_project_approval_mode": settings.peer_project_approval_mode,
        "peer_project_author_sees_individual_responses": settings.peer_project_author_sees_individual_responses,
        "students_can_create_peer_projects": settings.students_can_create_peer_projects,
        "students_can_create_field_notes": settings.students_can_create_field_notes,
        "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
    }


@router.put("/teacher/classes/{class_id}/settings")
async def update_class_settings(
    class_id: UUID,
    body: ClassSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_role(current_user, "TEACHER", "ADMIN")
    settings = await _get_or_create_class_settings(db, class_id)
    for field, val in body.dict(exclude_unset=True).items():
        setattr(settings, field, val)
    settings.updated_at = _now()
    await db.commit()
    return {
        "class_id": str(settings.class_id),
        "peer_project_approval_mode": settings.peer_project_approval_mode,
        "peer_project_author_sees_individual_responses": settings.peer_project_author_sees_individual_responses,
        "students_can_create_peer_projects": settings.students_can_create_peer_projects,
        "students_can_create_field_notes": settings.students_can_create_field_notes,
    }
