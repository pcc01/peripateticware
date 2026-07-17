# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Calendar API — shared across parent, teacher, student, and homeschool.

There was previously no real "calendar" concept in the schema at all:
ParentCalendarPage.tsx filtered activities by `due_date`/`status` fields that
the activities API never actually returned, so the grid was always empty.
This module provides one real, role-aware events endpoint plus a small
`classroom_events` table (see startup.py) so teachers can put actual dated
items (deadlines, field trips, holidays) on the calendar, not just derive
everything from completed learning_sessions.

Two kinds of events are unified into one response:
  - "activity" events, derived from learning_sessions:
      planned   — status IN ('in_progress', 'paused'), dated by created_at
      completed — status = 'completed', dated by completed_at
  - "classroom_event" events — explicit rows in classroom_events, created by
    a teacher for their classroom (deadline / field_trip / holiday / event)

Routes (prefix: /api/v1/calendar, registered in main.py):
  GET    /events                    Unified event list (role-aware, see scope resolution below)
  POST   /events                    Teacher: create a classroom event
  DELETE /events/{event_id}         Teacher: delete their own classroom event
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import List, Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models import User

router = APIRouter(prefix="/calendar", tags=["calendar"])

_DEFAULT_RANGE_DAYS = 45  # how far back/forward to look when start/end aren't given


class CalendarEvent(BaseModel):
    id: str
    title: str
    date: str  # ISO date, YYYY-MM-DD
    type: Literal["planned", "completed", "event", "deadline", "field_trip", "holiday"]
    source: Literal["activity", "classroom_event"]
    subject: Optional[str] = None
    description: Optional[str] = None
    student_id: Optional[str] = None
    student_name: Optional[str] = None
    classroom_id: Optional[str] = None


class CreateEventRequest(BaseModel):
    classroom_id: str
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    event_date: str  # YYYY-MM-DD
    event_type: Literal["event", "deadline", "field_trip", "holiday"] = "event"


def _date_range(start: Optional[str], end: Optional[str]) -> tuple[datetime, datetime]:
    try:
        start_dt = datetime.fromisoformat(start) if start else datetime.utcnow() - timedelta(days=_DEFAULT_RANGE_DAYS)
        end_dt = datetime.fromisoformat(end) if end else datetime.utcnow() + timedelta(days=_DEFAULT_RANGE_DAYS)
    except ValueError:
        raise HTTPException(status_code=422, detail="start/end must be ISO dates (YYYY-MM-DD)")
    # end is inclusive through end-of-day
    end_dt = end_dt.replace(hour=23, minute=59, second=59)
    return start_dt, end_dt


async def _activity_events_for_students(
    db: AsyncSession, student_ids: List[str], start_dt: datetime, end_dt: datetime,
    include_student_name: bool = False,
) -> List[CalendarEvent]:
    if not student_ids:
        return []

    rows = (await db.execute(text("""
        SELECT ls.id AS session_id, a.title, COALESCE(a.subject, 'General') AS subject,
               ls.status, ls.created_at, ls.completed_at, ls.user_id,
               COALESCE(u.full_name, u.email) AS student_name
        FROM learning_sessions ls
        JOIN activities a ON a.id = ls.activity_id
        JOIN users u ON u.id = ls.user_id
        WHERE ls.user_id = ANY(:sids::uuid[])
          AND (
                (ls.status = 'completed' AND ls.completed_at BETWEEN :start AND :end)
             OR (ls.status IN ('in_progress', 'paused') AND ls.created_at BETWEEN :start AND :end)
          )
        ORDER BY COALESCE(ls.completed_at, ls.created_at) DESC
        LIMIT 500
    """), {"sids": student_ids, "start": start_dt, "end": end_dt})).mappings().all()

    events: List[CalendarEvent] = []
    for r in rows:
        completed = (r["status"] or "").lower() == "completed"
        event_date = r["completed_at"] if completed else r["created_at"]
        if not event_date:
            continue
        events.append(CalendarEvent(
            id=f"activity-{r['session_id']}",
            title=r["title"] or "Activity",
            date=event_date.date().isoformat(),
            type="completed" if completed else "planned",
            source="activity",
            subject=r["subject"],
            student_id=str(r["user_id"]),
            student_name=r["student_name"] if include_student_name else None,
        ))
    return events


async def _classroom_events(
    db: AsyncSession, classroom_ids: List[str], start_dt: datetime, end_dt: datetime,
) -> List[CalendarEvent]:
    if not classroom_ids:
        return []
    rows = (await db.execute(text("""
        SELECT id, classroom_id, title, description, event_date, event_type
        FROM classroom_events
        WHERE classroom_id = ANY(:cids::uuid[]) AND event_date BETWEEN :start AND :end
        ORDER BY event_date
    """), {"cids": classroom_ids, "start": start_dt.date(), "end": end_dt.date()})).mappings().all()

    return [
        CalendarEvent(
            id=f"event-{r['id']}",
            title=r["title"],
            date=r["event_date"].isoformat(),
            type=r["event_type"],
            source="classroom_event",
            description=r["description"],
            classroom_id=str(r["classroom_id"]),
        )
        for r in rows
    ]


@router.get("/events", response_model=List[CalendarEvent])
async def get_calendar_events(
    child_id: Optional[str] = Query(None, description="Parent/homeschool: which child's calendar"),
    classroom_id: Optional[str] = Query(None, description="Teacher: which classroom's calendar"),
    start: Optional[str] = Query(None, description="ISO date, defaults to 45 days ago"),
    end: Optional[str] = Query(None, description="ISO date, defaults to 45 days from now"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = (current_user.role or "").upper()
    start_dt, end_dt = _date_range(start, end)

    if role == "STUDENT":
        activity_events = await _activity_events_for_students(db, [str(current_user.id)], start_dt, end_dt)
        classroom_rows = (await db.execute(text(
            "SELECT classroom_id FROM classroom_students WHERE student_id = :sid"
        ), {"sid": str(current_user.id)})).all()
        class_events = await _classroom_events(db, [str(r[0]) for r in classroom_rows], start_dt, end_dt)
        return activity_events + class_events

    if role in ("PARENT", "HOMESCHOOL"):
        if not child_id:
            raise HTTPException(status_code=422, detail="child_id is required")
        # Verify the link — either parent_child_links (parent) or
        # homeschool_children (homeschool owner account)
        linked = (await db.execute(text("""
            SELECT 1 FROM parent_child_links WHERE parent_id = :pid AND child_id = :cid
            UNION
            SELECT 1 FROM homeschool_children WHERE parent_id = :pid AND child_id = :cid
        """), {"pid": str(current_user.id), "cid": child_id})).first()
        if not linked:
            raise HTTPException(status_code=403, detail="Not authorized to view this child's calendar")

        activity_events = await _activity_events_for_students(db, [child_id], start_dt, end_dt)
        classroom_rows = (await db.execute(text(
            "SELECT classroom_id FROM classroom_students WHERE student_id = :sid"
        ), {"sid": child_id})).all()
        class_events = await _classroom_events(db, [str(r[0]) for r in classroom_rows], start_dt, end_dt)
        return activity_events + class_events

    if role in ("TEACHER", "ADMIN"):
        if not classroom_id:
            raise HTTPException(status_code=422, detail="classroom_id is required")
        owns = (await db.execute(text(
            "SELECT 1 FROM classrooms WHERE id = :cid AND teacher_id = :tid"
        ), {"cid": classroom_id, "tid": str(current_user.id)})).first()
        if not owns and role != "ADMIN":
            raise HTTPException(status_code=404, detail="Classroom not found")

        student_rows = (await db.execute(text(
            "SELECT student_id FROM classroom_students WHERE classroom_id = :cid"
        ), {"cid": classroom_id})).all()
        activity_events = await _activity_events_for_students(
            db, [str(r[0]) for r in student_rows], start_dt, end_dt, include_student_name=True,
        )
        class_events = await _classroom_events(db, [classroom_id], start_dt, end_dt)
        return activity_events + class_events

    raise HTTPException(status_code=403, detail="Calendar not available for this role")


@router.post("/events", status_code=201, response_model=CalendarEvent)
async def create_classroom_event(
    body: CreateEventRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if (current_user.role or "").upper() not in ("TEACHER", "HOMESCHOOL", "ADMIN"):
        raise HTTPException(status_code=403, detail="Only teachers can create classroom events")

    owns = (await db.execute(text(
        "SELECT 1 FROM classrooms WHERE id = :cid AND teacher_id = :tid"
    ), {"cid": body.classroom_id, "tid": str(current_user.id)})).first()
    if not owns and (current_user.role or "").upper() != "ADMIN":
        raise HTTPException(status_code=404, detail="Classroom not found")

    try:
        event_date = date.fromisoformat(body.event_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="event_date must be an ISO date (YYYY-MM-DD)")

    event_id = str(uuid4())
    await db.execute(text("""
        INSERT INTO classroom_events (id, classroom_id, created_by, title, description, event_date, event_type, created_at, updated_at)
        VALUES (:id, :cid, :uid, :title, :desc, :edate, :etype, NOW(), NOW())
    """), {
        "id": event_id, "cid": body.classroom_id, "uid": str(current_user.id),
        "title": body.title, "desc": body.description, "edate": event_date, "etype": body.event_type,
    })
    await db.commit()

    return CalendarEvent(
        id=f"event-{event_id}", title=body.title, date=event_date.isoformat(),
        type=body.event_type, source="classroom_event", description=body.description,
        classroom_id=body.classroom_id,
    )


@router.delete("/events/{event_id}", status_code=204)
async def delete_classroom_event(
    event_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Accept either the raw event_id or the "event-<id>" form the list endpoint returns
    raw_id = event_id.replace("event-", "", 1) if event_id.startswith("event-") else event_id

    row = (await db.execute(text("""
        SELECT ce.id FROM classroom_events ce
        JOIN classrooms c ON c.id = ce.classroom_id
        WHERE ce.id = CAST(:eid AS uuid) AND c.teacher_id = :tid
    """), {"eid": raw_id, "tid": str(current_user.id)})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")

    await db.execute(text("DELETE FROM classroom_events WHERE id = CAST(:eid AS uuid)"), {"eid": raw_id})
    await db.commit()
