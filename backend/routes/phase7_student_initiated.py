# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Phase 7 — Student-Initiated Activities: Field Notes & Peer Projects

Routes registered in main.py:
    from routes.phase7_student_initiated import router as phase7_router
    app.include_router(phase7_router, prefix="/api/v1", tags=["phase7"])

These routes are scaffolded with full schema definitions and permission
documentation. DB queries are stubbed with NotImplementedError so the
app starts cleanly — implement each handler as you build out the feature.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status as http_status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.database import User

router = APIRouter()


# =============================================================================
# PYDANTIC SCHEMAS
# =============================================================================

# --- Field Notes ---

class FieldNoteCreate(BaseModel):
    title: str
    description: Optional[str] = None
    self_project_id: Optional[UUID] = None
    self_tagged_objective_ids: List[UUID] = []

class FieldNoteUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    self_project_id: Optional[UUID] = None
    self_tagged_objective_ids: Optional[List[UUID]] = None

class FieldNotePromoteRequest(BaseModel):
    message: Optional[str] = None  # Student's note to teacher

class TeacherFieldNoteApproveRequest(BaseModel):
    feedback: Optional[str] = None
    create_as: str = "activity"  # "activity" | "project"

class TeacherFieldNoteRejectRequest(BaseModel):
    feedback: str  # Required — student needs to know why

# --- Self Projects ---

class SelfProjectCreate(BaseModel):
    title: str
    description: Optional[str] = None

class SelfProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None

# --- Peer Projects ---

class PeerProjectCreate(BaseModel):
    title: str
    description: str
    learning_objectives_text: List[dict] = []  # [{"text": "...", "order": 1}]
    guiding_prompts: List[dict] = []           # [{"prompt": "...", "order": 1}]
    allowed_capture_types: List[str]           # ["photo", "audio", "text", ...]
    audience: str = "whole_class"              # "whole_class" | "specific_students"
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
    curriculum_objective_ids: List[UUID] = []  # Teacher adds curriculum mapping

class TeacherPeerProjectRejectRequest(BaseModel):
    feedback: str

class ClassSettingsUpdate(BaseModel):
    peer_project_approval_mode: Optional[str] = None          # "teacher_gate" | "auto_publish"
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
    """
    Create a new Field Note. Status defaults to DRAFT (private to student).

    Permissions: Any authenticated student.
    Check: settings.FIELD_NOTES_ENABLED (return 403 if disabled).
    """
    # TODO: Check settings.FIELD_NOTES_ENABLED
    # TODO: Validate self_project_id belongs to current_user if provided
    # TODO: Create StudentFieldNote record
    # TODO: Return serialized FieldNote
    raise NotImplementedError("Field note creation not yet implemented")


@router.get("/student/field-notes")
async def list_field_notes(
    note_status: Optional[str] = None,
    self_project_id: Optional[UUID] = None,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List field notes owned by the current student.
    Filters: note_status, self_project_id.

    Permissions: Student sees only their own notes.
    """
    # TODO: Query StudentFieldNote WHERE student_id = current_user.id
    # TODO: Apply status / self_project_id filters
    # TODO: Paginate and return
    raise NotImplementedError


@router.get("/student/field-notes/{field_note_id}")
async def get_field_note(
    field_note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a single field note with its captures and self-tagged objectives.

    Permissions: Owner only.
    """
    raise NotImplementedError


@router.put("/student/field-notes/{field_note_id}")
async def update_field_note(
    field_note_id: UUID,
    body: FieldNoteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update a field note.

    Permissions: Owner only.
    Constraint: Cannot update if status is SUBMITTED or PROMOTED.
                Can update if REJECTED (student can revise and resubmit).
    """
    raise NotImplementedError


@router.delete("/student/field-notes/{field_note_id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def delete_field_note(
    field_note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a field note.

    Permissions: Owner only.
    Constraint: Cannot delete if status is SUBMITTED or PROMOTED.
    """
    raise NotImplementedError


@router.post("/student/field-notes/{field_note_id}/share")
async def share_field_note(
    field_note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Share a field note with the student's teacher(s).
    Status: DRAFT → SHARED

    Side effect: Notify teacher via existing notification system.
    Permissions: Owner only.
    """
    raise NotImplementedError


@router.post("/student/field-notes/{field_note_id}/unshare")
async def unshare_field_note(
    field_note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Revoke teacher visibility. Status: SHARED → DRAFT.
    Not allowed if status is SUBMITTED or PROMOTED.
    """
    raise NotImplementedError


@router.post("/student/field-notes/{field_note_id}/submit-for-promotion")
async def submit_field_note_for_promotion(
    field_note_id: UUID,
    body: FieldNotePromoteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a field note for teacher review + potential promotion to Activity.
    Status: DRAFT | SHARED | REJECTED → SUBMITTED

    Side effect: Notify teacher. Sets submitted_for_promotion_at, submitted_with_message.
    Permissions: Owner only.
    """
    raise NotImplementedError


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
    """
    List field notes visible to the teacher (SHARED + SUBMITTED status only).
    Filter by class, status, or specific student.

    Permissions: Teacher role; sees notes from students in their classes only.
    """
    raise NotImplementedError


@router.post("/teacher/field-notes/{field_note_id}/approve")
async def approve_field_note_promotion(
    field_note_id: UUID,
    body: TeacherFieldNoteApproveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Approve a field note for promotion.
    Creates a DRAFT Activity owned by the teacher with originator_student_id set.
    Status: SUBMITTED → PROMOTED

    Side effects:
      - Draft Activity created (body.create_as = "activity" | "project")
      - promoted_activity_id set on the field note
      - Student notified with optional teacher feedback
    Permissions: Teacher who has the student in their class.
    """
    raise NotImplementedError


@router.post("/teacher/field-notes/{field_note_id}/reject")
async def reject_field_note_promotion(
    field_note_id: UUID,
    body: TeacherFieldNoteRejectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Reject a field note promotion request with required feedback.
    Status: SUBMITTED → REJECTED

    Side effects: Student notified with teacher_feedback.
    """
    raise NotImplementedError


# =============================================================================
# SELF-PROJECT ROUTES
# =============================================================================

@router.post("/student/self-projects", status_code=http_status.HTTP_201_CREATED)
async def create_self_project(
    body: SelfProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a personal project container for organizing field notes."""
    raise NotImplementedError


@router.get("/student/self-projects")
async def list_self_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List student's self-projects with field note counts."""
    raise NotImplementedError


@router.get("/student/self-projects/{project_id}")
async def get_self_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get self-project with linked field notes."""
    raise NotImplementedError


@router.put("/student/self-projects/{project_id}")
async def update_self_project(
    project_id: UUID,
    body: SelfProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    raise NotImplementedError


@router.delete("/student/self-projects/{project_id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def delete_self_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete self-project. Field notes are unlinked (self_project_id → null),
    not deleted. Student retains their notes.
    """
    raise NotImplementedError


# =============================================================================
# PEER PROJECT ROUTES — STUDENT AUTHOR
# =============================================================================

@router.post("/student/peer-projects", status_code=http_status.HTTP_201_CREATED)
async def create_peer_project(
    body: PeerProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a Peer Project (draft state).

    Permissions: Any student where ClassSettings.students_can_create_peer_projects = true.
    Validate: class_id resolved from student's current class enrollment.
    """
    raise NotImplementedError


@router.get("/student/peer-projects/authored")
async def list_authored_peer_projects(
    project_status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List peer projects where author_student_id = current_user.id."""
    raise NotImplementedError


@router.get("/student/peer-projects/available")
async def list_available_peer_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List published peer projects the student can participate in.

    Logic:
      WHERE status = 'published'
        AND class_id IN (student's classes)
        AND (audience = 'whole_class' OR current_user.id IN target_student_ids)
        AND author_student_id != current_user.id
    """
    raise NotImplementedError


@router.get("/student/peer-projects/{project_id}")
async def get_peer_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get peer project detail.
    - Author: include response stats
    - Responding classmate: include prompts, examples, own response
    - Teachers: see everything
    """
    raise NotImplementedError


@router.put("/student/peer-projects/{project_id}")
async def update_peer_project(
    project_id: UUID,
    body: PeerProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a peer project. Only allowed in DRAFT or REJECTED status."""
    raise NotImplementedError


@router.post("/student/peer-projects/{project_id}/add-example")
async def add_example_capture(
    project_id: UUID,
    body: AddExampleCaptureRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Add one of the author's own captures as an example for classmates.

    Validation:
      - capture.student_id == current_user.id
      - project is in DRAFT or REJECTED status
    """
    raise NotImplementedError


@router.delete("/student/peer-projects/{project_id}/examples/{example_id}",
               status_code=http_status.HTTP_204_NO_CONTENT)
async def remove_example_capture(
    project_id: UUID,
    example_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    raise NotImplementedError


@router.post("/student/peer-projects/{project_id}/submit")
async def submit_peer_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a peer project for approval or direct publication.

    Logic:
      1. Fetch ClassSettings for the project's class
      2. Snapshot approval_required from ClassSettings.peer_project_approval_mode
      3. IF auto_publish: status → PUBLISHED, notify teacher + classmates
         IF teacher_gate: status → PENDING, notify teacher (action required)
    """
    raise NotImplementedError


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
    """
    Start (or retrieve) a PeerProjectResponse for the current student.
    Idempotent: returns existing response if already started.

    Permissions: Classmate in the target audience, not the author.
    """
    raise NotImplementedError


@router.get("/student/peer-projects/{project_id}/my-response")
async def get_my_peer_project_response(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    raise NotImplementedError


@router.post("/student/peer-projects/{project_id}/my-response/captures")
async def add_capture_to_response(
    project_id: UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a capture as part of the student's peer project response.

    Validation:
      - capture type must be in project.allowed_capture_types
      - Response must be IN_PROGRESS
    """
    raise NotImplementedError


@router.post("/student/peer-projects/{project_id}/my-response/complete")
async def complete_peer_project_response(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark response as COMPLETED. completed_at = now."""
    raise NotImplementedError


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
    """
    List all peer projects in the teacher's class(es), any status.
    Teacher always has full visibility.
    """
    raise NotImplementedError


@router.get("/teacher/peer-projects/{project_id}")
async def get_peer_project_as_teacher(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full detail: project + all responses + all response captures."""
    raise NotImplementedError


@router.post("/teacher/peer-projects/{project_id}/approve")
async def approve_peer_project(
    project_id: UUID,
    body: TeacherPeerProjectApproveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Approve a pending peer project.
    Status: PENDING → PUBLISHED

    Side effects:
      - Sets approved_by_teacher_id, approved_at, teacher_feedback, published_at
      - Optionally maps curriculum_objective_ids (teacher enrichment)
      - Notifies author student + target classmates
    """
    raise NotImplementedError


@router.post("/teacher/peer-projects/{project_id}/reject")
async def reject_peer_project(
    project_id: UUID,
    body: TeacherPeerProjectRejectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Reject a pending peer project. Status: PENDING → REJECTED.
    Side effect: Author notified with feedback. Author can edit and resubmit.
    """
    raise NotImplementedError


@router.put("/teacher/peer-projects/{project_id}/settings")
async def update_peer_project_teacher_settings(
    project_id: UUID,
    author_can_see_individual_responses: bool,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle whether the author can see individual classmate responses."""
    raise NotImplementedError


# =============================================================================
# CLASS SETTINGS ROUTES
# =============================================================================

@router.get("/teacher/classes/{class_id}/settings")
async def get_class_settings(
    class_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get ClassSettings for a class.
    Creates a default ClassSettings record if one doesn't exist yet.
    Permissions: Teacher who owns the class.
    """
    raise NotImplementedError


@router.put("/teacher/classes/{class_id}/settings")
async def update_class_settings(
    class_id: UUID,
    body: ClassSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update class-level settings for student-initiated features.
    Permissions: Teacher who owns the class.
    """
    raise NotImplementedError
