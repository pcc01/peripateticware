# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
"""
Student Activity Proposals — "Reverse Scavenger Hunt"
=====================================================
Students propose place-based challenges for other students.
A teacher must approve before the proposal becomes a live Activity.

Student fields (stripped down — no taxonomy, no Bloom level):
  - title
  - challenge_description  (what to find / do / observe)
  - location_hint          (e.g. "any stream", "a local park")
  - subject                (science / geography / social studies / etc.)
  - note_to_teacher        (optional context)

States: draft → pending → approved | rejected
On approval: a real Activity row is created automatically.

Endpoints:
  POST   /api/v1/proposals                     Student submits proposal
  GET    /api/v1/proposals                     Student lists own proposals
  GET    /api/v1/proposals/{id}                Get single proposal
  PUT    /api/v1/proposals/{id}                Student edits draft/rejected
  DELETE /api/v1/proposals/{id}                Student withdraws
  POST   /api/v1/proposals/{id}/submit         Student moves draft → pending
  GET    /api/v1/teacher/proposals             Teacher lists pending proposals
  POST   /api/v1/teacher/proposals/{id}/approve  Teacher approves → creates Activity
  POST   /api/v1/teacher/proposals/{id}/reject   Teacher rejects with feedback
"""

import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(tags=["proposals"])


def _require_student(user: User) -> None:
    if user.role.upper() not in ("STUDENT",):
        raise HTTPException(status_code=403, detail="Students only")


def _require_teacher(user: User) -> None:
    if user.role.upper() not in ("TEACHER", "ADMIN", "HOMESCHOOL"):
        raise HTTPException(status_code=403, detail="Teachers only")


# ── Schemas ───────────────────────────────────────────────────────────────

class ProposalCreate(BaseModel):
    title: str
    challenge_description: str
    location_hint: str = ""
    subject: str = "General"
    note_to_teacher: str = ""


class ProposalUpdate(BaseModel):
    title: Optional[str] = None
    challenge_description: Optional[str] = None
    location_hint: Optional[str] = None
    subject: Optional[str] = None
    note_to_teacher: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────

def _serialize(r: dict) -> dict:
    # DB columns: description, location_name, note_to_teacher
    # Frontend expects: challenge_description, location_hint, note_to_teacher
    return {
        "id": str(r["id"]),
        "title": r["title"],
        "challenge_description": r.get("description") or r.get("challenge_description") or "",
        "location_hint": r.get("location_name") or r.get("location_hint") or "",
        "subject": r.get("subject") or "General",
        "note_to_teacher": r.get("note_to_teacher") or "",
        "status": r["status"],
        "teacher_feedback": r.get("teacher_feedback") or "",
        "student_id": str(r["student_id"]),
        "student_name": r.get("student_name") or "",
        "approved_activity_id": str(r["approved_activity_id"]) if r.get("approved_activity_id") else None,
        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
    }


# ── Student endpoints ─────────────────────────────────────────────────────

@router.post("/api/v1/proposals", status_code=201)
async def create_proposal(
    body: ProposalCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new draft proposal."""
    _require_student(current_user)
    proposal_id = uuid.uuid4()
    await db.execute(text("""
        INSERT INTO student_proposals
          (id, student_id, title, challenge_description, location_hint,
           subject, note_to_teacher, status, created_at, updated_at)
        VALUES
          (:id, :sid, :title, :desc, :loc, :subj, :note, 'draft', NOW(), NOW())
    """), {
        "id": proposal_id, "sid": current_user.id,
        "title": body.title, "desc": body.challenge_description,
        "loc": body.location_hint, "subj": body.subject,
        "note": body.note_to_teacher,
    })
    await db.commit()
    return {"id": str(proposal_id), "status": "draft"}


@router.get("/api/v1/proposals")
async def list_my_proposals(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Student: list own proposals."""
    _require_student(current_user)
    rows = (await db.execute(text("""
        SELECT * FROM student_proposals WHERE student_id = :sid ORDER BY created_at DESC
    """), {"sid": current_user.id})).mappings().all()
    return [_serialize(dict(r)) for r in rows]


@router.get("/api/v1/proposals/{proposal_id}")
async def get_proposal(
    proposal_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(text(
        "SELECT * FROM student_proposals WHERE id = :id"
    ), {"id": proposal_id})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    row = dict(row)
    # Students can only see their own; teachers can see all
    if current_user.role.upper() == "STUDENT" and str(row["student_id"]) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")
    return _serialize(row)


@router.put("/api/v1/proposals/{proposal_id}")
async def update_proposal(
    proposal_id: str,
    body: ProposalUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Student edits a draft or rejected proposal."""
    _require_student(current_user)
    row = (await db.execute(text(
        "SELECT * FROM student_proposals WHERE id = :id AND student_id = :sid"
    ), {"id": proposal_id, "sid": current_user.id})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    if dict(row)["status"] not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="Can only edit draft or rejected proposals")

    # Frontend field names now match the DB column names exactly
    # (challenge_description, location_hint — see database/init.sql) —
    # no translation needed. This used to map them to description/
    # location_name, columns that only ever existed in startup.py's
    # fallback CREATE TABLE, not in init.sql (the path this DB actually
    # bootstrapped through), so every edit 500'd the same way
    # create_proposal's INSERT did before this fix.
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"ok": True}
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = proposal_id
    updates["updated_at"] = datetime.utcnow()
    await db.execute(text(
        f"UPDATE student_proposals SET {set_clause}, updated_at = :updated_at WHERE id = :id"
    ), updates)
    await db.commit()
    return {"ok": True}


@router.post("/api/v1/proposals/{proposal_id}/submit")
async def submit_proposal(
    proposal_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Student submits draft for teacher review."""
    _require_student(current_user)
    row = (await db.execute(text(
        "SELECT * FROM student_proposals WHERE id = :id AND student_id = :sid"
    ), {"id": proposal_id, "sid": current_user.id})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    if dict(row)["status"] not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="Can only submit draft or rejected proposals")
    await db.execute(text(
        "UPDATE student_proposals SET status = 'pending', updated_at = NOW() WHERE id = :id"
    ), {"id": proposal_id})
    await db.commit()
    return {"status": "pending"}


@router.delete("/api/v1/proposals/{proposal_id}", status_code=204)
async def delete_proposal(
    proposal_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_student(current_user)
    await db.execute(text(
        "DELETE FROM student_proposals WHERE id = :id AND student_id = :sid"
    ), {"id": proposal_id, "sid": current_user.id})
    await db.commit()


# ── Teacher endpoints ─────────────────────────────────────────────────────

@router.get("/api/v1/teacher/proposals")
async def list_pending_proposals(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Teacher: list pending proposals with student name."""
    _require_teacher(current_user)
    rows = (await db.execute(text("""
        SELECT sp.*, u.full_name AS student_name, u.email AS student_email
        FROM student_proposals sp
        JOIN users u ON u.id = sp.student_id
        WHERE sp.status = 'pending'
        ORDER BY sp.created_at ASC
    """))).mappings().all()
    return [_serialize(dict(r)) for r in rows]


@router.post("/api/v1/teacher/proposals/{proposal_id}/approve")
async def approve_proposal(
    proposal_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Teacher approves a proposal.
    Creates a real Activity from the proposal data and marks it published.
    The student who created it is credited via the description.
    """
    _require_teacher(current_user)
    row = (await db.execute(text(
        "SELECT * FROM student_proposals WHERE id = :id AND status = 'pending'"
    ), {"id": proposal_id})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Proposal not found or not pending")
    row = dict(row)

    # Get student name for credit
    student = (await db.execute(text(
        "SELECT full_name, email FROM users WHERE id = :id"
    ), {"id": row["student_id"]})).mappings().first()
    student_name = dict(student)["full_name"] or dict(student)["email"] if student else "a student"

    # Build the description combining challenge + credit
    description = (
        f"{row['challenge_description']}\n\n"
        f"📍 Location: {row['location_hint'] or 'Any suitable location'}\n\n"
        f"💡 Proposed by: {student_name}"
    )

    activity_id = uuid.uuid4()
    await db.execute(text("""
        INSERT INTO activities
          (id, teacher_id, title, description, subject, grade_level,
           activity_type, difficulty_level, estimated_duration_minutes,
           bloom_level, assessment_type, status, is_active, is_student_proposed,
           proposed_by_student_id, created_at, updated_at)
        VALUES
          (:id, :teacher_id, :title, :description, :subject, 0,
           'discovery', 2, 60,
           'apply', 'observation', 'published', TRUE, TRUE,
           :student_id, NOW(), NOW())
    """), {
        "id": activity_id,
        "teacher_id": current_user.id,
        "title": row["title"],
        "description": description,
        "subject": row["subject"] or "General",
        "student_id": row["student_id"],
    })

    await db.execute(text("""
        UPDATE student_proposals
        SET status = 'approved', approved_activity_id = :activity_id, updated_at = NOW()
        WHERE id = :id
    """), {"id": proposal_id, "activity_id": activity_id})

    await db.commit()
    return {"status": "approved", "activity_id": str(activity_id)}


@router.post("/api/v1/teacher/proposals/{proposal_id}/reject")
async def reject_proposal(
    proposal_id: str,
    feedback: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Teacher rejects with feedback. Student can revise and resubmit."""
    _require_teacher(current_user)
    row = (await db.execute(text(
        "SELECT id FROM student_proposals WHERE id = :id AND status = 'pending'"
    ), {"id": proposal_id})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Proposal not found or not pending")

    await db.execute(text("""
        UPDATE student_proposals
        SET status = 'rejected', teacher_feedback = :feedback, updated_at = NOW()
        WHERE id = :id
    """), {"id": proposal_id, "feedback": feedback})
    await db.commit()
    return {"status": "rejected"}
