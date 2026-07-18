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
from core.encryption import blind_index as _blind_index, encrypt as _encrypt, decrypt as _decrypt

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
            # u.email / u.full_name are EncryptedString columns — raw SQL bypasses
            # the ORM TypeDecorator, so they must be decrypted explicitly here.
            "email": _decrypt(r["email"]) if r["email"] else r["email"],
            "full_name": _decrypt(r["full_name"]) if r["full_name"] else r["full_name"],
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

    # Free tier: max 2 children — upgrade to add more
    from sqlalchemy import text as _t
    tier_row = (await db.execute(
        _t("SELECT license_tier FROM organizations WHERE id = :oid"),
        {"oid": str(current_user.org_id)},
    )).scalar() if current_user.org_id else "free"
    tier = tier_row or "free"

    if tier in ("free", "homeschool_free", None):
        child_count = (await db.execute(
            _t("SELECT COUNT(*) FROM homeschool_children WHERE parent_id = :pid"),
            {"pid": str(current_user.id)},
        )).scalar() or 0
        if child_count >= 2:
            raise HTTPException(
                status_code=402,
                detail={
                    "code":          "UPGRADE_REQUIRED",
                    "feature":       "homeschool_children",
                    "required_tier": "homeschool_family",
                    "current_tier":  tier,
                    "limit":         2,
                    "current":       child_count,
                },
            )

    # Check email not already taken
    existing = (await db.execute(select(User).where(User.email_index == _blind_index(body.email)))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Email already in use")

    child_id = uuid.uuid4()
    child = User(
        id=child_id,
        email=body.email,
        email_index=_blind_index(body.email),
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
        # full_name is an EncryptedString column — raw SQL bypasses the ORM
        # TypeDecorator, so it must be encrypted explicitly before writing,
        # otherwise this stores plaintext in a column meant to be ciphertext.
        await db.execute(
            text("UPDATE users SET full_name = :name WHERE id = :id"),
            {"name": _encrypt(body.full_name), "id": child_id},
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


@router.delete("/children/{child_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_child(
    child_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove a child from this homeschool parent's account.

    Unlinks the homeschool_children row only — same pattern as removing a
    student from a classroom (routes/classrooms.py remove_student). The
    child's underlying user account is not deleted, since it may have its
    own learning history (sessions, field notes, captures, etc.) referencing
    it by foreign key; unlinking is also reversible if removed by mistake.
    """
    _require_homeschool(current_user)

    row = (await db.execute(
        text("SELECT id FROM homeschool_children WHERE parent_id = :pid AND child_id = :cid"),
        {"pid": current_user.id, "cid": child_id},
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Child not found")

    await db.execute(
        text("DELETE FROM homeschool_children WHERE parent_id = :pid AND child_id = :cid"),
        {"pid": current_user.id, "cid": child_id},
    )
    await db.commit()


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

    # State standards compliance reporting requires Homeschool Family plan —
    # same gate as generate_report()/export_portfolio() below. Previously this
    # view had no tier check at all (see docs/FEATURE_GATE_AUDIT.md item 3);
    # demo/sample accounts still bypass it so prospective users can preview
    # the feature as an upgrade incentive.
    _DEMO_DOMAINS = ("@example.com", "@test.local")
    _is_demo = any(str(current_user.email or "").endswith(d) for d in _DEMO_DOMAINS)

    if not _is_demo:
        if current_user.org_id:
            tier = (await db.execute(
                text("SELECT license_tier FROM organizations WHERE id = :oid"),
                {"oid": str(current_user.org_id)},
            )).scalar() or "free"
        else:
            tier = "free"

        if tier in ("free", "homeschool_free"):
            raise HTTPException(
                status_code=402,
                detail={
                    "code":          "UPGRADE_REQUIRED",
                    "feature":       "standards_compliance_report",
                    "required_tier": "homeschool_family",
                    "current_tier":  tier,
                },
            )

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


# ── Export / Reports ──────────────────────────────────────────────────────
#
# Supports any date range (monthly / quarterly / annual / custom).
# GET  /homeschool/report?child_id=&from=YYYY-MM-DD&to=YYYY-MM-DD&format=pdf|csv
# POST /homeschool/export/portfolio  (legacy alias — same as GET with body)

import io as _io
import csv as _csv
from datetime import date as _date
from fastapi.responses import StreamingResponse as _StreamingResponse

async def _fetch_report_data(
    db,
    parent_id: str,
    child_id:  str,
    date_from: _date,
    date_to:   _date,
) -> dict:
    """Fetch all data needed for a period report."""

    # Verify ownership
    child_row = (await db.execute(
        text("""
            SELECT u.id, u.first_name, u.last_name, u.full_name,
                   hc.grade_level, hc.age_band
            FROM homeschool_children hc
            JOIN users u ON u.id = hc.child_id
            WHERE hc.parent_id = :pid AND hc.child_id = :cid
        """),
        {"pid": parent_id, "cid": child_id},
    )).first()
    if not child_row:
        raise HTTPException(status_code=404, detail="Child not found")

    parent_row = (await db.execute(
        text("SELECT first_name, last_name FROM users WHERE id = :pid"),
        {"pid": parent_id},
    )).first()

    # Sessions in the date range
    sessions = (await db.execute(
        text("""
            SELECT ls.id, ls.created_at, ls.completed_at, ls.status,
                   a.title AS activity_title, a.subject, a.grade_level,
                   a.location_name, a.estimated_duration_minutes,
                   a.bloom_level, a.completion_mode,
                   COUNT(DISTINCT ec.id) AS evidence_count
            FROM learning_sessions ls
            JOIN activities a ON a.id = ls.activity_id
            LEFT JOIN evidence_captures ec ON ec.session_id = ls.id
            WHERE ls.user_id = :cid
              AND DATE(ls.created_at) BETWEEN :from_d AND :to_d
            GROUP BY ls.id, a.title, a.subject, a.grade_level,
                     a.location_name, a.estimated_duration_minutes,
                     a.bloom_level, a.completion_mode
            ORDER BY ls.created_at ASC
        """),
        {"cid": child_id, "from_d": date_from, "to_d": date_to},
    )).mappings().all()

    # Standards coverage for the period
    standards = (await db.execute(
        text("""
            SELECT asm.criterion_id, asm.coverage_level,
                   ss.name AS set_name, ss.state_code,
                   a.title AS activity_title, a.subject
            FROM activity_standards_map asm
            JOIN standards_sets ss ON ss.id = asm.standards_set_id
            JOIN activities a      ON a.id  = asm.activity_id
            JOIN learning_sessions ls ON ls.activity_id = a.id AND ls.user_id = :cid
            WHERE DATE(ls.created_at) BETWEEN :from_d AND :to_d
              AND ss.owner_id = :pid
            ORDER BY ss.name, asm.criterion_id
        """),
        {"cid": child_id, "pid": parent_id, "from_d": date_from, "to_d": date_to},
    )).mappings().all()

    completed = [s for s in sessions if s["status"] == "completed"]
    total_minutes = sum(
        (s["estimated_duration_minutes"] or 45) for s in completed
    )

    subjects: dict[str, int] = {}
    for s in sessions:
        sub = s["subject"] or "General"
        subjects[sub] = subjects.get(sub, 0) + 1

    # child_row[3] is u.full_name — an EncryptedString column read via raw SQL,
    # so it must be decrypted explicitly before use.
    _child_full_name = _decrypt(child_row[3]) if child_row[3] else child_row[3]

    return {
        "child":       {
            "id":         child_id,
            "name":       _child_full_name or f"{child_row[1]} {child_row[2]}",
            "first_name": child_row[1],
            "grade":      child_row[4],
            "age_band":   child_row[5],
        },
        "parent":      {"name": f"{parent_row[0]} {parent_row[1]}"},
        "period":      {"from": str(date_from), "to": str(date_to)},
        "sessions":    [dict(s) for s in sessions],
        "completed":   len(completed),
        "total":       len(sessions),
        "hours":       round(total_minutes / 60, 1),
        "subjects":    subjects,
        "standards":   [dict(s) for s in standards],
    }


def _build_csv(data: dict) -> bytes:
    buf = _io.StringIO()
    w   = _csv.writer(buf)

    w.writerow(["Peripateticware — Activity Log"])
    w.writerow(["Child",  data["child"]["name"]])
    w.writerow(["Period", f"{data['period']['from']} to {data['period']['to']}"])
    w.writerow(["Generated", str(_date.today())])
    w.writerow([])
    w.writerow(["Date", "Activity", "Subject", "Location",
                "Grade Level", "Status", "Est. Minutes", "Evidence Items", "Bloom Level"])

    for s in data["sessions"]:
        started = s["created_at"]
        if hasattr(started, "date"):
            started = started.date()
        w.writerow([
            str(started),
            s["activity_title"] or "",
            s["subject"] or "",
            s["location_name"] or "",
            s["grade_level"] or "",
            s["status"] or "",
            s["estimated_duration_minutes"] or 45,
            s["evidence_count"] or 0,
            s["bloom_level"] or "",
        ])

    w.writerow([])
    w.writerow(["Summary"])
    w.writerow(["Total activities",   data["total"]])
    w.writerow(["Completed",          data["completed"]])
    w.writerow(["Total hours",        data["hours"]])
    w.writerow([])
    w.writerow(["Subject", "Sessions"])
    for subj, count in data["subjects"].items():
        w.writerow([subj, count])

    if data["standards"]:
        w.writerow([])
        w.writerow(["Standards Coverage"])
        w.writerow(["Criterion ID", "Standards Set", "State", "Coverage", "Activity", "Subject"])
        for s in data["standards"]:
            w.writerow([
                s["criterion_id"], s["set_name"], s["state_code"] or "",
                s["coverage_level"], s["activity_title"], s["subject"] or "",
            ])

    return buf.getvalue().encode("utf-8-sig")  # BOM for Excel compatibility


def _build_pdf(data: dict) -> bytes:
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        )
    except ImportError:
        raise HTTPException(status_code=501, detail="reportlab not installed")

    buf    = _io.BytesIO()
    doc    = SimpleDocTemplate(buf, pagesize=letter,
                               leftMargin=inch, rightMargin=inch,
                               topMargin=inch, bottomMargin=inch)
    styles = getSampleStyleSheet()
    story  = []

    GREEN  = colors.HexColor("#2d6a4f")
    LIGHT  = colors.HexColor("#f0fdf4")
    GREY   = colors.HexColor("#6b7280")

    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=GREEN, fontSize=20, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=GREEN, fontSize=13, spaceBefore=14, spaceAfter=6)
    sm = ParagraphStyle("sm", parent=styles["Normal"], fontSize=9, textColor=GREY)
    bd = ParagraphStyle("bd", parent=styles["Normal"], fontSize=10, leading=16)

    # Cover
    story.append(Paragraph("Peripateticware", ParagraphStyle("brand", parent=h1, fontSize=10, textColor=GREY)))
    story.append(Paragraph(f"Portfolio Report — {data['child']['name']}", h1))
    story.append(Paragraph(
        f"Period: {data['period']['from']} to {data['period']['to']} &nbsp;|&nbsp; "
        f"Generated: {_date.today()} &nbsp;|&nbsp; Parent: {data['parent']['name']}",
        sm,
    ))
    story.append(HRFlowable(width="100%", color=GREEN, spaceAfter=12))

    # Summary stats
    story.append(Paragraph("Period Summary", h2))
    summary_data = [
        ["Activities completed", str(data["completed"])],
        ["Total activities",     str(data["total"])],
        ["Estimated hours",      str(data["hours"])],
        ["Subjects covered",     ", ".join(data["subjects"].keys()) or "—"],
    ]
    t = Table(summary_data, colWidths=[2.2*inch, 4*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,-1), LIGHT),
        ("FONTNAME",   (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,-1), 9),
        ("GRID",       (0,0), (-1,-1), 0.3, colors.HexColor("#d1fae5")),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.white, LIGHT]),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING",   (0,0), (-1,-1), 5),
        ("BOTTOMPADDING",(0,0), (-1,-1), 5),
    ]))
    story.append(t)

    # Activity log
    story.append(Paragraph("Activity Log", h2))
    if data["sessions"]:
        rows = [["Date", "Activity", "Subject", "Location", "Status", "Evidence"]]
        for s in data["sessions"]:
            d = s["created_at"]
            if hasattr(d, "date"):
                d = d.date()
            rows.append([
                str(d),
                (s["activity_title"] or "")[:40],
                (s["subject"] or "")[:20],
                (s["location_name"] or "")[:25],
                s["status"] or "",
                str(s["evidence_count"] or 0),
            ])
        t2 = Table(rows, colWidths=[0.9*inch, 2*inch, 1*inch, 1.3*inch, 0.8*inch, 0.6*inch])
        t2.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,0),  GREEN),
            ("TEXTCOLOR",     (0,0), (-1,0),  colors.white),
            ("FONTNAME",      (0,0), (-1,0),  "Helvetica-Bold"),
            ("FONTSIZE",      (0,0), (-1,-1), 8),
            ("ROWBACKGROUNDS",(0,1), (-1,-1), [colors.white, LIGHT]),
            ("GRID",          (0,0), (-1,-1), 0.2, colors.HexColor("#d1fae5")),
            ("LEFTPADDING",   (0,0), (-1,-1), 5),
            ("RIGHTPADDING",  (0,0), (-1,-1), 5),
            ("TOPPADDING",    (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
        story.append(t2)
    else:
        story.append(Paragraph("No activities recorded in this period.", bd))

    # Standards coverage
    if data["standards"]:
        story.append(Paragraph("Standards Coverage", h2))
        std_rows = [["Criterion", "Standards Set", "State", "Coverage", "Activity"]]
        for s in data["standards"]:
            std_rows.append([
                s["criterion_id"][:15],
                (s["set_name"] or "")[:20],
                s["state_code"] or "",
                s["coverage_level"] or "",
                (s["activity_title"] or "")[:30],
            ])
        t3 = Table(std_rows, colWidths=[1.1*inch, 1.6*inch, 0.5*inch, 0.8*inch, 2.1*inch])
        t3.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,0),  GREEN),
            ("TEXTCOLOR",     (0,0), (-1,0),  colors.white),
            ("FONTNAME",      (0,0), (-1,0),  "Helvetica-Bold"),
            ("FONTSIZE",      (0,0), (-1,-1), 8),
            ("ROWBACKGROUNDS",(0,1), (-1,-1), [colors.white, LIGHT]),
            ("GRID",          (0,0), (-1,-1), 0.2, colors.HexColor("#d1fae5")),
            ("LEFTPADDING",   (0,0), (-1,-1), 5),
            ("RIGHTPADDING",  (0,0), (-1,-1), 5),
            ("TOPPADDING",    (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
        story.append(t3)

    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph(
        "Generated by Peripateticware · peripateticware.com",
        ParagraphStyle("foot", parent=sm, alignment=1),
    ))

    doc.build(story)
    return buf.getvalue()


@router.get("/report")
async def generate_report(
    child_id:  str,
    date_from: str,
    date_to:   str,
    format:    str = "pdf",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a period report for a homeschool child.
    format = pdf | csv
    date_from / date_to = YYYY-MM-DD
    """
    _require_homeschool(current_user)

    # Reports and portfolio exports require Homeschool Family plan.
    # Demo/sample accounts (@example.com, @test.local) bypass this check so
    # prospective users can see the feature as an upgrade incentive.
    _DEMO_DOMAINS = ("@example.com", "@test.local")
    _is_demo = any(str(current_user.email or "").endswith(d) for d in _DEMO_DOMAINS)

    if not _is_demo:
        from sqlalchemy import text as _t2
        if current_user.org_id:
            tier_r = (await db.execute(
                _t2("SELECT license_tier FROM organizations WHERE id = :oid"),
                {"oid": str(current_user.org_id)},
            )).scalar() or "free"
        else:
            tier_r = "free"

        if tier_r in ("free", "homeschool_free"):
            raise HTTPException(
                status_code=402,
                detail={
                    "code":          "UPGRADE_REQUIRED",
                    "feature":       "portfolio_export",
                    "required_tier": "homeschool_family",
                    "current_tier":  tier_r,
                },
            )

    try:
        d_from = _date.fromisoformat(date_from)
        d_to   = _date.fromisoformat(date_to)
    except ValueError:
        raise HTTPException(status_code=422, detail="Dates must be YYYY-MM-DD")

    if d_from > d_to:
        raise HTTPException(status_code=422, detail="date_from must be before date_to")

    data     = await _fetch_report_data(db, str(current_user.id), child_id, d_from, d_to)
    child_fn = data["child"]["name"].replace(" ", "_")
    period   = f"{date_from}_to_{date_to}"

    if format == "csv":
        content  = _build_csv(data)
        filename = f"Peripateticware_{child_fn}_{period}.csv"
        return _StreamingResponse(
            _io.BytesIO(content),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    content  = _build_pdf(data)
    filename = f"Peripateticware_Portfolio_{child_fn}_{period}.pdf"
    return _StreamingResponse(
        _io.BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/export/portfolio")
async def export_portfolio(
    child_id:  str  = Body(...),
    format:    str  = Body("pdf"),
    date_from: str  = Body(None),
    date_to:   str  = Body(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Legacy POST alias — delegates to GET /report."""
    from datetime import date as _d
    today = _d.today()
    if not date_from:
        # Default to current month
        date_from = today.replace(day=1).isoformat()
    if not date_to:
        date_to = today.isoformat()
    return await generate_report(child_id, date_from, date_to, format, current_user, db)


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
