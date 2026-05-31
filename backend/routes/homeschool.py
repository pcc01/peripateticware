# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
"""
Homeschool API
==============
Homeschool parent = teacher + parent in one account.
They own their children's accounts directly (no link-code flow).
All teacher activity endpoints are also available via the HOMESCHOOL role guard
in activities.py / dependencies.py.

Endpoints:
  GET  /api/v1/homeschool/dashboard          Summary stats
  GET  /api/v1/homeschool/children           List owned child accounts
  POST /api/v1/homeschool/children           Create a child account
  PUT  /api/v1/homeschool/children/{id}      Update child account
  GET  /api/v1/homeschool/children/{id}/progress   Child progress detail
  GET  /api/v1/homeschool/coverage           Standards coverage for all children
  POST /api/v1/homeschool/export/portfolio   Generate PDF portfolio (uses export service)
"""

import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from core.security import SecurityManager
from models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/homeschool", tags=["homeschool"])


def _require_homeschool(user: User) -> None:
    if user.role.upper() not in ("HOMESCHOOL", "ADMIN"):
        raise HTTPException(status_code=403, detail="Homeschool access required")


# ── Schemas ───────────────────────────────────────────────────────────────

class ChildCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    grade_level: int = 0
    age_band: str = "k6"  # k6 | m712 | h1318

class ChildUpdate(BaseModel):
    full_name: Optional[str] = None
    grade_level: Optional[int] = None
    age_band: Optional[str] = None


# ── Dashboard ─────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def homeschool_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_homeschool(current_user)

    # Children owned by this homeschool parent
    children_result = await db.execute(
        text("SELECT COUNT(*) FROM homeschool_children WHERE parent_id = :pid"),
        {"pid": current_user.id},
    )
    child_count = children_result.scalar() or 0

    # Activities created by this user
    act_result = await db.execute(
        text("SELECT COUNT(*) FROM activities WHERE teacher_id = :uid"),
        {"uid": current_user.id},
    )
    activity_count = act_result.scalar() or 0

    # Total sessions across all children
    sessions_result = await db.execute(
        text("""
            SELECT COUNT(*) FROM learning_sessions ls
            JOIN homeschool_children hc ON hc.child_id = ls.user_id
            WHERE hc.parent_id = :pid
        """),
        {"pid": current_user.id},
    )
    session_count = sessions_result.scalar() or 0

    # Standards sets owned by this user
    standards_result = await db.execute(
        text("SELECT COUNT(*) FROM standards_sets WHERE owner_id = :uid"),
        {"uid": current_user.id},
    )
    standards_count = standards_result.scalar() or 0

    return {
        "child_count": child_count,
        "activity_count": activity_count,
        "session_count": session_count,
        "standards_count": standards_count,
    }


# ── Children ──────────────────────────────────────────────────────────────

@router.get("/children")
async def list_children(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_homeschool(current_user)

    result = await db.execute(
        text("""
            SELECT u.id, u.email, u.full_name, u.is_active, u.created_at,
                   hc.grade_level, hc.age_band
            FROM homeschool_children hc
            JOIN users u ON u.id = hc.child_id
            WHERE hc.parent_id = :pid
            ORDER BY u.full_name
        """),
        {"pid": current_user.id},
    )
    rows = result.mappings().all()
    return [
        {
            "id": str(r["id"]),
            "email": r["email"],
            "full_name": r["full_name"],
            "is_active": r["is_active"],
            "grade_level": r["grade_level"],
            "age_band": r["age_band"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


@router.post("/children", status_code=201)
async def create_child(
    body: ChildCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_homeschool(current_user)

    # Check email not already taken
    existing = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Email already in use")

    child_id = uuid.uuid4()
    child = User(
        id=child_id,
        email=body.email,
        username=body.email.split("@")[0] + "_" + str(child_id)[:8],
        hashed_password=SecurityManager.hash_password(body.password),
        full_name=body.full_name,
        role="STUDENT",
        is_active=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(child)
    await db.flush()

    await db.execute(
        text("""
            INSERT INTO homeschool_children (id, parent_id, child_id, grade_level, age_band, created_at)
            VALUES (:id, :parent_id, :child_id, :grade_level, :age_band, NOW())
        """),
        {
            "id": uuid.uuid4(),
            "parent_id": current_user.id,
            "child_id": child_id,
            "grade_level": body.grade_level,
            "age_band": body.age_band,
        },
    )
    await db.commit()

    return {"id": str(child_id), "email": body.email, "full_name": body.full_name}


@router.put("/children/{child_id}")
async def update_child(
    child_id: str,
    body: ChildUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_homeschool(current_user)

    # Verify ownership
    row = (await db.execute(
        text("SELECT id FROM homeschool_children WHERE parent_id = :pid AND child_id = :cid"),
        {"pid": current_user.id, "cid": child_id},
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Child not found")

    if body.full_name:
        await db.execute(
            text("UPDATE users SET full_name = :name WHERE id = :id"),
            {"name": body.full_name, "id": child_id},
        )
    if body.grade_level is not None or body.age_band is not None:
        updates = {}
        if body.grade_level is not None:
            updates["grade_level"] = body.grade_level
        if body.age_band is not None:
            updates["age_band"] = body.age_band
        set_clause = ", ".join(f"{k} = :{k}" for k in updates)
        updates["pid"] = current_user.id
        updates["cid"] = child_id
        await db.execute(
            text(f"UPDATE homeschool_children SET {set_clause} WHERE parent_id = :pid AND child_id = :cid"),
            updates,
        )
    await db.commit()
    return {"ok": True}


@router.get("/children/{child_id}/progress")
async def child_progress(
    child_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_homeschool(current_user)

    # Verify ownership
    row = (await db.execute(
        text("SELECT child_id FROM homeschool_children WHERE parent_id = :pid AND child_id = :cid"),
        {"pid": current_user.id, "cid": child_id},
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Child not found")

    child = (await db.execute(select(User).where(User.id == child_id))).scalar_one_or_none()

    sessions = (await db.execute(
        text("SELECT COUNT(*) FROM learning_sessions WHERE user_id = :uid"),
        {"uid": child_id},
    )).scalar() or 0

    completed = (await db.execute(
        text("SELECT COUNT(*) FROM learning_sessions WHERE user_id = :uid AND status = 'completed'"),
        {"uid": child_id},
    )).scalar() or 0

    return {
        "child_id": child_id,
        "child_name": child.full_name if child else "Unknown",
        "total_sessions": sessions,
        "completed_sessions": completed,
        "overall_progress": round((completed / sessions * 100) if sessions > 0 else 0),
    }


# ── Coverage ──────────────────────────────────────────────────────────────

@router.get("/coverage")
async def coverage_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Full coverage report.

    For each state_reporting standards set owned by this user, returns:
      - The set metadata
      - Each criterion with:
          - how many activities cover it (full / partial)
          - the activity titles involved
          - a coverage_status: 'met' | 'partial' | 'not_met'
    Also returns summary counts across children's completed sessions.
    """
    _require_homeschool(current_user)

    # Get children IDs
    child_rows = (await db.execute(
        text("SELECT child_id FROM homeschool_children WHERE parent_id = :pid"),
        {"pid": current_user.id},
    )).mappings().all()
    child_ids = [str(r["child_id"]) for r in child_rows]

    # Completed sessions across all children
    completed_sessions = 0
    total_sessions = 0
    if child_ids:
        id_list = ", ".join(f"'{c}'" for c in child_ids)
        total_sessions = (await db.execute(
            text(f"SELECT COUNT(*) FROM learning_sessions WHERE user_id IN ({id_list})")
        )).scalar() or 0
        completed_sessions = (await db.execute(
            text(f"SELECT COUNT(*) FROM learning_sessions WHERE user_id IN ({id_list}) AND status = 'completed'")
        )).scalar() or 0

    # Standards sets
    sets = (await db.execute(
        text("""
            SELECT id, name, description, state_code, criteria, created_at
            FROM standards_sets
            WHERE owner_id = :uid AND type = 'state_reporting'
            ORDER BY created_at DESC
        """),
        {"uid": current_user.id},
    )).mappings().all()

    result_sets = []
    for s in sets:
        set_id = str(s["id"])
        criteria = s["criteria"] or []

        # All mappings for this standards set
        mappings = (await db.execute(
            text("""
                SELECT asm.criterion_id, asm.coverage_level, asm.notes,
                       a.title AS activity_title, a.id AS activity_id, a.subject
                FROM activity_standards_map asm
                JOIN activities a ON a.id = asm.activity_id
                WHERE asm.standards_set_id = :sid AND a.teacher_id = :uid
                ORDER BY asm.criterion_id, a.title
            """),
            {"sid": set_id, "uid": current_user.id},
        )).mappings().all()

        # Group mappings by criterion_id
        by_criterion: dict = {}
        for m in mappings:
            cid = m["criterion_id"]
            if cid not in by_criterion:
                by_criterion[cid] = []
            by_criterion[cid].append({
                "activity_id":    str(m["activity_id"]),
                "activity_title": m["activity_title"],
                "subject":        m["subject"],
                "coverage_level": m["coverage_level"],
                "notes":          m["notes"] or "",
            })

        # Build per-criterion summary
        criteria_summary = []
        met_count = 0
        partial_count = 0
        for c in criteria:
            cid = c.get("id") or c.get("code", "")
            activities = by_criterion.get(cid, [])
            has_full    = any(a["coverage_level"] == "full"    for a in activities)
            has_partial = any(a["coverage_level"] == "partial" for a in activities)

            if has_full:
                status = "met"
                met_count += 1
            elif has_partial:
                status = "partial"
                partial_count += 1
            else:
                status = "not_met"

            criteria_summary.append({
                "id":          cid,
                "code":        c.get("code", cid),
                "subject":     c.get("subject", ""),
                "description": c.get("description", ""),
                "status":      status,
                "activities":  activities,
            })

        total_criteria = len(criteria_summary)
        result_sets.append({
            "id":              set_id,
            "name":            s["name"],
            "description":     s["description"] or "",
            "state_code":      s["state_code"] or "",
            "created_at":      s["created_at"].isoformat() if s["created_at"] else None,
            "total_criteria":  total_criteria,
            "met":             met_count,
            "partial":         partial_count,
            "not_met":         total_criteria - met_count - partial_count,
            "criteria":        criteria_summary,
        })

    return {
        "standards_sets":     result_sets,
        "total_sessions":     total_sessions,
        "completed_sessions": completed_sessions,
    }


# ── Export ────────────────────────────────────────────────────────────────

@router.post("/export/portfolio")
async def export_portfolio(
    child_id: str = Body(...),
    format: str = Body("pdf"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_homeschool(current_user)

    # Verify ownership
    row = (await db.execute(
        text("SELECT child_id FROM homeschool_children WHERE parent_id = :pid AND child_id = :cid"),
        {"pid": current_user.id, "cid": child_id},
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Child not found")

    # TODO: wire to export_service.py when SH-6 is built
    return {
        "status": "queued",
        "message": "Portfolio export queued. This feature will be available once the export service is built (SH-6).",
        "child_id": child_id,
        "format": format,
    }
    result_sets = []
    for s in sets:
        set_id   = str(s["id"])
        criteria = s["criteria"] or []

        mappings = (await db.execute(
            text("""
                SELECT asm.criterion_id, asm.coverage_level, asm.notes,
                       a.title AS activity_title, a.id AS activity_id, a.subject
                FROM activity_standards_map asm
                JOIN activities a ON a.id = asm.activity_id
                WHERE asm.standards_set_id = :sid AND a.teacher_id = :uid
                ORDER BY asm.criterion_id, a.title
            """),
            {"sid": set_id, "uid": current_user.id},
        )).mappings().all()

        by_criterion: dict = {}
        for m in mappings:
            cid = m["criterion_id"]
            if cid not in by_criterion:
                by_criterion[cid] = []
            by_criterion[cid].append({
                "activity_id":    str(m["activity_id"]),
                "activity_title": m["activity_title"],
                "subject":        m["subject"],
                "coverage_level": m["coverage_level"],
                "notes":          m["notes"] or "",
            })

        criteria_summary = []
        met_count = 0
        partial_count = 0
        for c in criteria:
            cid        = c.get("id") or c.get("code", "")
            activities = by_criterion.get(cid, [])
            has_full    = any(a["coverage_level"] == "full"    for a in activities)
            has_partial = any(a["coverage_level"] == "partial" for a in activities)
            if has_full:
                status_val = "met";    met_count     += 1
            elif has_partial:
                status_val = "partial"; partial_count += 1
            else:
                status_val = "not_met"

            criteria_summary.append({
                "id":          cid,
                "code":        c.get("code", cid),
                "subject":     c.get("subject", ""),
                "description": c.get("description", ""),
                "status":      status_val,
                "activities":  activities,
            })

        total_criteria = len(criteria_summary)
        result_sets.append({
            "id":             set_id,
            "name":           s["name"],
            "description":    s["description"] or "",
            "state_code":     s["state_code"] or "",
            "created_at":     s["created_at"].isoformat() if s["created_at"] else None,
            "total_criteria": total_criteria,
            "met":            met_count,
            "partial":        partial_count,
            "not_met":        total_criteria - met_count - partial_count,
            "criteria":       criteria_summary,
        })

    return {
        "standards_sets":     result_sets,
        "total_sessions":     total_sessions,
        "completed_sessions": completed_sessions,
    }
