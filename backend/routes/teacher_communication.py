# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Teacher communication API.

The parent portal already had a full Messages + Notifications experience
(routes/parent.py) built on two generic tables:
  parent_messages  — from_user_id / to_user_id / subject / body / conversation_id
  notifications    — user_id / title / message / type / related_child_id / action_url

...but there was no way for a *teacher* to originate a message or notification —
only to receive a parent's reply. This file adds that missing half, reusing the
same two tables (no new schema needed) so messages sent here show up directly
in ParentMessagesPage / ParentNotificationsPage with no changes on that side.

Routes (prefix: /api/v1/teacher, registered in main.py):

  GET  /classrooms/{classroom_id}/recipients   Students + their linked parents, for the compose picker
  GET  /messages                                Teacher's conversations (as sender or recipient), threaded
  GET  /messages/{conversation_id}              Full thread for one conversation
  POST /messages                                Send a new message (one recipient, or a classroom-wide broadcast)
  POST /messages/{conversation_id}/reply         Reply within an existing conversation

Every parent_child_links join below filters status='approved' — a
pending (not-yet-approved-by-the-child) or denied link grants no access
anywhere else in the app (see routes/parent.py's link_child() docstring
and the progress/activities/reports authorization checks there), so a
teacher's recipient list shouldn't be able to message a parent who hasn't
actually been confirmed as this student's parent yet either.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models import User

router = APIRouter(prefix="/teacher", tags=["teacher-communication"])


def _require_teacher(user: User) -> None:
    if (user.role or "").upper() not in ("TEACHER", "HOMESCHOOL", "ADMIN"):
        raise HTTPException(status_code=403, detail="Teacher access required")


# ── Schemas ─────────────────────────────────────────────────────────────────

class SendMessageRequest(BaseModel):
    classroom_id: str
    audience: Literal["student", "parent", "all_students", "all_parents"]
    student_id: Optional[str] = None  # required when audience is "student" or "parent"
    subject: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1)
    notify: bool = True  # also create a row in `notifications` for each recipient


class ReplyRequest(BaseModel):
    body: str = Field(..., min_length=1)


class AnnouncementCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1)


class AnnouncementResponse(BaseModel):
    id: str
    classroom_id: str
    classroom_name: str
    teacher_id: str
    teacher_name: str
    title: str
    body: str
    created_at: str


# ── Helpers ───────────────────────────────────────────────────────────────

async def _verify_classroom_ownership(db: AsyncSession, classroom_id: str, teacher: User) -> str:
    """Returns classroom name if the teacher owns this classroom, else 404s."""
    row = (await db.execute(text("""
        SELECT name FROM classrooms WHERE id = :cid AND teacher_id = :tid
    """), {"cid": classroom_id, "tid": str(teacher.id)})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Classroom not found")
    return row[0]


async def _verify_classroom_ownership_403(db: AsyncSession, classroom_id: str, teacher: User) -> str:
    """
    Same intent as _verify_classroom_ownership, but distinguishes the two
    failure modes for the announcements endpoints (per spec: a *non-owning*
    teacher trying to post/read another classroom's announcements must get
    403, not a 404 that conflates "doesn't exist" with "isn't yours"):
      - classroom_id doesn't exist at all -> 404
      - classroom exists but belongs to a different teacher -> 403
    Returns the classroom name on success.
    """
    row = (await db.execute(text("""
        SELECT name, teacher_id FROM classrooms WHERE id = :cid
    """), {"cid": classroom_id})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Classroom not found")
    if str(row[1]) != str(teacher.id):
        raise HTTPException(status_code=403, detail="Not authorized for this classroom")
    return row[0]


async def _resolve_recipients(
    db: AsyncSession, classroom_id: str, audience: str, student_id: Optional[str]
) -> List[dict]:
    """Returns a list of {user_id, name} for the chosen audience."""
    if audience == "student":
        if not student_id:
            raise HTTPException(status_code=422, detail="student_id is required for audience=student")
        row = (await db.execute(text("""
            SELECT u.id, COALESCE(u.full_name, u.email) AS name
            FROM classroom_students cs
            JOIN users u ON u.id = cs.student_id
            WHERE cs.classroom_id = :cid AND cs.student_id = :sid
        """), {"cid": classroom_id, "sid": student_id})).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Student not found in this classroom")
        return [{"user_id": str(row["id"]), "name": row["name"]}]

    if audience == "all_students":
        rows = (await db.execute(text("""
            SELECT u.id, COALESCE(u.full_name, u.email) AS name
            FROM classroom_students cs
            JOIN users u ON u.id = cs.student_id
            WHERE cs.classroom_id = :cid
        """), {"cid": classroom_id})).mappings().all()
        return [{"user_id": str(r["id"]), "name": r["name"]} for r in rows]

    if audience == "parent":
        if not student_id:
            raise HTTPException(status_code=422, detail="student_id is required for audience=parent")
        rows = (await db.execute(text("""
            SELECT DISTINCT p.id, COALESCE(p.full_name, p.email) AS name
            FROM classroom_students cs
            JOIN parent_child_links pcl ON pcl.child_id = cs.student_id AND pcl.status = 'approved'
            JOIN users p ON p.id = pcl.parent_id
            WHERE cs.classroom_id = :cid AND cs.student_id = :sid
        """), {"cid": classroom_id, "sid": student_id})).mappings().all()
        if not rows:
            raise HTTPException(status_code=404, detail="No linked parent found for this student")
        return [{"user_id": str(r["id"]), "name": r["name"]} for r in rows]

    if audience == "all_parents":
        rows = (await db.execute(text("""
            SELECT DISTINCT p.id, COALESCE(p.full_name, p.email) AS name
            FROM classroom_students cs
            JOIN parent_child_links pcl ON pcl.child_id = cs.student_id AND pcl.status = 'approved'
            JOIN users p ON p.id = pcl.parent_id
            WHERE cs.classroom_id = :cid
        """), {"cid": classroom_id})).mappings().all()
        return [{"user_id": str(r["id"]), "name": r["name"]} for r in rows]

    raise HTTPException(status_code=422, detail=f"Unknown audience: {audience}")


# ── Recipients picker ───────────────────────────────────────────────────────

@router.get("/classrooms/{classroom_id}/recipients")
async def list_recipients(
    classroom_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(current_user)
    await _verify_classroom_ownership(db, classroom_id, current_user)

    students = (await db.execute(text("""
        SELECT u.id, COALESCE(u.full_name, u.email) AS name, u.email
        FROM classroom_students cs
        JOIN users u ON u.id = cs.student_id
        WHERE cs.classroom_id = :cid
        ORDER BY name
    """), {"cid": classroom_id})).mappings().all()

    parents = (await db.execute(text("""
        SELECT DISTINCT p.id AS parent_id, COALESCE(p.full_name, p.email) AS parent_name,
               p.email AS parent_email, s.id AS student_id, COALESCE(s.full_name, s.email) AS student_name
        FROM classroom_students cs
        JOIN users s ON s.id = cs.student_id
        JOIN parent_child_links pcl ON pcl.child_id = s.id AND pcl.status = 'approved'
        JOIN users p ON p.id = pcl.parent_id
        WHERE cs.classroom_id = :cid
        ORDER BY parent_name
    """), {"cid": classroom_id})).mappings().all()

    return {
        "students": [{"id": str(r["id"]), "name": r["name"], "email": r["email"]} for r in students],
        "parents": [
            {
                "id": str(r["parent_id"]), "name": r["parent_name"], "email": r["parent_email"],
                "student_id": str(r["student_id"]), "student_name": r["student_name"],
            }
            for r in parents
        ],
    }


# ── Send / broadcast ────────────────────────────────────────────────────────

@router.post("/messages", status_code=201)
async def send_message(
    body: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(current_user)
    classroom_name = await _verify_classroom_ownership(db, body.classroom_id, current_user)

    recipients = await _resolve_recipients(db, body.classroom_id, body.audience, body.student_id)
    if not recipients:
        raise HTTPException(status_code=404, detail="No recipients found for this audience")

    sent = []
    for recipient in recipients:
        conversation_id = str(uuid4())
        message_id = str(uuid4())
        await db.execute(text("""
            INSERT INTO parent_messages (id, from_user_id, to_user_id, subject, body, conversation_id)
            VALUES (CAST(:id AS uuid), CAST(:from_uid AS uuid), CAST(:to_uid AS uuid), :subject, :body, CAST(:conv AS uuid))
        """), {
            "id": message_id, "from_uid": str(current_user.id), "to_uid": recipient["user_id"],
            "subject": body.subject, "body": body.body, "conv": conversation_id,
        })

        if body.notify:
            await db.execute(text("""
                INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at, updated_at)
                VALUES (:id, :uid, :title, :msg, 'message', :url, FALSE, NOW(), NOW())
            """), {
                "id": str(uuid4()), "uid": recipient["user_id"],
                "title": f"New message from {current_user.full_name or 'your teacher'}",
                "msg": body.subject, "url": "/parent/messages",
            })

        sent.append({"recipient_id": recipient["user_id"], "recipient_name": recipient["name"], "conversation_id": conversation_id})

    await db.commit()
    return {"success": True, "classroom_name": classroom_name, "sent_count": len(sent), "recipients": sent}


# ── List / read ──────────────────────────────────────────────────────────────

@router.get("/messages")
async def list_conversations(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(current_user)

    rows = (await db.execute(text("""
        SELECT DISTINCT ON (m.conversation_id)
               m.conversation_id, m.subject, m.body, m.created_at, m.from_user_id, m.to_user_id, m.read_at,
               CASE WHEN m.from_user_id = :uid THEN m.to_user_id ELSE m.from_user_id END AS other_user_id,
               COALESCE(u.full_name, u.email) AS other_user_name
        FROM parent_messages m
        JOIN users u ON u.id = CASE WHEN m.from_user_id = :uid THEN m.to_user_id ELSE m.from_user_id END
        WHERE m.from_user_id = :uid OR m.to_user_id = :uid
        ORDER BY m.conversation_id, m.created_at DESC
        LIMIT :lim
    """), {"uid": str(current_user.id), "lim": limit})).mappings().all()

    return [
        {
            "conversation_id": str(r["conversation_id"]),
            "other_user_id": str(r["other_user_id"]),
            "other_user_name": r["other_user_name"],
            "subject": r["subject"],
            "last_message": r["body"],
            "last_message_at": r["created_at"].isoformat() if r["created_at"] else None,
            "unread": r["read_at"] is None and str(r["to_user_id"]) == str(current_user.id),
        }
        for r in rows
    ]


@router.get("/messages/{conversation_id}")
async def get_conversation_thread(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(current_user)

    rows = (await db.execute(text("""
        SELECT m.id, m.from_user_id, m.to_user_id, m.subject, m.body, m.created_at, m.read_at,
               COALESCE(u.full_name, u.email) AS from_name
        FROM parent_messages m
        JOIN users u ON u.id = m.from_user_id
        WHERE m.conversation_id = CAST(:conv AS uuid)
          AND (m.from_user_id = :uid OR m.to_user_id = :uid)
        ORDER BY m.created_at ASC
    """), {"conv": conversation_id, "uid": str(current_user.id)})).mappings().all()

    if not rows:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return [
        {
            "id": str(r["id"]),
            "from_user_id": str(r["from_user_id"]),
            "from_name": r["from_name"],
            "is_mine": str(r["from_user_id"]) == str(current_user.id),
            "subject": r["subject"],
            "body": r["body"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "read_at": r["read_at"].isoformat() if r["read_at"] else None,
        }
        for r in rows
    ]


@router.post("/messages/{conversation_id}/reply", status_code=201)
async def reply_in_conversation(
    conversation_id: str,
    body: ReplyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(current_user)

    orig = (await db.execute(text("""
        SELECT from_user_id, to_user_id, subject FROM parent_messages
        WHERE conversation_id = CAST(:conv AS uuid)
        ORDER BY created_at DESC LIMIT 1
    """), {"conv": conversation_id})).first()
    if not orig:
        raise HTTPException(status_code=404, detail="Conversation not found")

    participant_ids = {str(orig[0]), str(orig[1])}
    if str(current_user.id) not in participant_ids:
        raise HTTPException(status_code=403, detail="Not authorized to reply to this conversation")

    other_user_id = str(orig[1]) if str(orig[0]) == str(current_user.id) else str(orig[0])
    message_id = str(uuid4())
    await db.execute(text("""
        INSERT INTO parent_messages (id, from_user_id, to_user_id, subject, body, conversation_id)
        VALUES (CAST(:id AS uuid), CAST(:from_uid AS uuid), CAST(:to_uid AS uuid), :subject, :body, CAST(:conv AS uuid))
    """), {
        "id": message_id, "from_uid": str(current_user.id), "to_uid": other_user_id,
        "subject": f"Re: {orig[2]}" if orig[2] and not str(orig[2]).startswith("Re:") else (orig[2] or "Re:"),
        "body": body.body, "conv": conversation_id,
    })
    await db.execute(text("""
        INSERT INTO notifications (id, user_id, title, message, type, action_url, is_read, created_at, updated_at)
        VALUES (:id, :uid, :title, :msg, 'message', '/parent/messages', FALSE, NOW(), NOW())
    """), {
        "id": str(uuid4()), "uid": other_user_id,
        "title": f"New reply from {current_user.full_name or 'your teacher'}", "msg": body.body[:200],
    })
    await db.commit()
    return {"success": True, "message_id": message_id, "created_at": datetime.utcnow().isoformat()}


# ── Announcements (broadcast) ──────────────────────────────────────────────
# Distinct from the 1:1 / fan-out messages above: a single classroom_announcements
# row visible to every student + parent tied to that classroom (via
# classroom_students / parent_child_links), rather than N individual
# parent_messages rows. See routes/parent.py::get_parent_announcements and
# routes/student.py::get_student_announcements for the read side.

@router.post("/classrooms/{classroom_id}/announcements", status_code=201, response_model=AnnouncementResponse)
async def create_announcement(
    classroom_id: str,
    body: AnnouncementCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(current_user)
    classroom_name = await _verify_classroom_ownership_403(db, classroom_id, current_user)

    announcement_id = str(uuid4())
    await db.execute(text("""
        INSERT INTO classroom_announcements (id, classroom_id, teacher_id, title, body)
        VALUES (CAST(:id AS uuid), CAST(:cid AS uuid), CAST(:tid AS uuid), :title, :body)
    """), {
        "id": announcement_id, "cid": classroom_id, "tid": str(current_user.id),
        "title": body.title, "body": body.body,
    })
    await db.commit()

    return AnnouncementResponse(
        id=announcement_id,
        classroom_id=classroom_id,
        classroom_name=classroom_name,
        teacher_id=str(current_user.id),
        teacher_name=current_user.full_name or current_user.email,
        title=body.title,
        body=body.body,
        created_at=datetime.utcnow().isoformat(),
    )


@router.get("/classrooms/{classroom_id}/announcements", response_model=List[AnnouncementResponse])
async def list_classroom_announcements(
    classroom_id: str,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_teacher(current_user)
    classroom_name = await _verify_classroom_ownership_403(db, classroom_id, current_user)

    rows = (await db.execute(text("""
        SELECT a.id, a.classroom_id, a.teacher_id, a.title, a.body, a.created_at,
               COALESCE(u.full_name, u.email) AS teacher_name
        FROM classroom_announcements a
        JOIN users u ON u.id = a.teacher_id
        WHERE a.classroom_id = CAST(:cid AS uuid)
        ORDER BY a.created_at DESC
        LIMIT :lim
    """), {"cid": classroom_id, "lim": limit})).mappings().all()

    return [
        AnnouncementResponse(
            id=str(r["id"]),
            classroom_id=str(r["classroom_id"]),
            classroom_name=classroom_name,
            teacher_id=str(r["teacher_id"]),
            teacher_name=r["teacher_name"],
            title=r["title"],
            body=r["body"],
            created_at=r["created_at"].isoformat() if r["created_at"] else datetime.utcnow().isoformat(),
        )
        for r in rows
    ]
