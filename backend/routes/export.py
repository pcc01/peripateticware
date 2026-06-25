# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Export API
==========
  POST /api/v1/export/pdf/{template}   Generate and download a PDF
  POST /api/v1/export/csv/{template}   Generate and download a CSV

Templates:  activity_log | student_progress | homeschool_portfolio | session_log | standards_coverage
Scope params (query): student_id, date_from, date_to, standards_set_id
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.database import Activity, LearningSession, StandardsSet
from models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/export", tags=["export"])

ALLOWED_TEMPLATES = {
    "pdf": {"activity_log", "student_progress", "homeschool_portfolio"},
    "csv": {"activity_log", "session_log", "standards_coverage"},
}


# ---------------------------------------------------------------------------
# PDF export
# ---------------------------------------------------------------------------

@router.get("/pdf/{template}")
async def export_pdf(
    template: str,
    student_id: Optional[str] = Query(None),
    standards_set_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if template not in ALLOWED_TEMPLATES["pdf"]:
        raise HTTPException(status_code=400, detail=f"Unknown template. Choose: {ALLOWED_TEMPLATES['pdf']}")

    data = await _build_data(
        template, current_user, db,
        student_id=student_id,
        standards_set_id=standards_set_id,
        date_from=date_from,
        date_to=date_to,
    )

    from services.export_service import generate_pdf
    try:
        pdf_bytes = generate_pdf(template, data)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    filename = f"peripateticware_{template}_{_today()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------

@router.get("/csv/{template}")
async def export_csv(
    template: str,
    student_id: Optional[str] = Query(None),
    standards_set_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if template not in ALLOWED_TEMPLATES["csv"]:
        raise HTTPException(status_code=400, detail=f"Unknown template. Choose: {ALLOWED_TEMPLATES['csv']}")

    data = await _build_data(
        template, current_user, db,
        student_id=student_id,
        standards_set_id=standards_set_id,
        date_from=date_from,
        date_to=date_to,
    )

    from services.export_service import generate_csv

    rows = data.get("activities") or data.get("sessions") or data.get("coverage_rows") or []
    csv_str = generate_csv(template, rows)

    filename = f"peripateticware_{template}_{_today()}.csv"
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Data builder
# ---------------------------------------------------------------------------

async def _build_data(
    template: str,
    user: User,
    db: AsyncSession,
    student_id: Optional[str] = None,
    standards_set_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> dict:
    """Fetch DB data needed for the requested template."""
    from datetime import datetime as dt

    target_id = UUID(student_id) if student_id else user.id

    # Activities created by or accessible to the user
    if user.role.upper() in ("TEACHER", "ADMIN", "HOMESCHOOL"):
        act_q = select(Activity).where(Activity.teacher_id == user.id)
    else:
        act_q = select(Activity).where(Activity.status == "published")

    act_result = await db.execute(act_q.order_by(Activity.created_at.desc()).limit(200))
    activities = act_result.scalars().all()

    # Sessions for target student
    sess_q = select(LearningSession).where(LearningSession.user_id == target_id)
    if date_from:
        try:
            sess_q = sess_q.where(LearningSession.created_at >= dt.fromisoformat(date_from))
        except ValueError:
            logger.warning("export: invalid date_from ignored")  # NASA Rule 7
    if date_to:
        try:
            sess_q = sess_q.where(LearningSession.created_at <= dt.fromisoformat(date_to))
        except ValueError:
            logger.warning("export: invalid date_to ignored")  # NASA Rule 7
    sess_result = await db.execute(sess_q.order_by(LearningSession.created_at.desc()).limit(500))
    sessions = sess_result.scalars().all()

    completed = [s for s in sessions if s.status == "completed"]

    act_dicts = [
        {
            "id": str(a.id),
            "title": a.title,
            "subject": a.subject,
            "grade_level": a.grade_level,
            "estimated_duration_minutes": a.estimated_duration_minutes,
            "status": a.status,
            "location_name": a.location_name,
            "bloom_level": a.bloom_level,
            "created_at": a.created_at.isoformat() if a.created_at else "",
        }
        for a in activities
    ]
    sess_dicts = [
        {
            "id": str(s.id),
            "title": s.title or "",
            "status": s.status,
            "activity_id": str(s.activity_id) if s.activity_id else "",
            "location_name": s.location_name or "",
            "created_at": s.created_at.isoformat() if s.created_at else "",
            "completed_at": s.completed_at.isoformat() if s.completed_at else "",
        }
        for s in sessions
    ]

    # Standards coverage if requested
    standards_coverage = None
    if standards_set_id:
        try:
            from routes.standards import get_coverage
            # Re-use the coverage endpoint logic directly
            std_result = await db.execute(
                select(StandardsSet).where(StandardsSet.id == UUID(standards_set_id))
            )
            std_set = std_result.scalar_one_or_none()
            if std_set:
                from routes.standards import get_coverage as _cov
                # Build inline since we can't call FastAPI endpoints internally
                from models.database import ActivityStandardsMap
                maps_result = await db.execute(
                    select(ActivityStandardsMap).where(
                        ActivityStandardsMap.standards_set_id == UUID(standards_set_id)
                    )
                )
                all_maps = maps_result.scalars().all()
                completed_ids = {str(s.activity_id) for s in completed}
                criteria = std_set.criteria or []
                cov: dict = {}
                for c in criteria:
                    cid = c["id"]
                    relevant = [m for m in all_maps if m.criterion_id == cid
                                and str(m.activity_id) in completed_ids]
                    best = max((m.coverage_level for m in relevant),
                               key=lambda l: {"partial":1,"full":2,"exceeds":3}.get(l,0),
                               default=None) if relevant else None
                    cov[cid] = {
                        "criterion": c, "times_addressed": len(relevant),
                        "best_level": best, "met": len(relevant) > 0,
                    }
                met = sum(1 for v in cov.values() if v["met"])
                total = len(criteria)
                standards_coverage = {
                    "standards_set_name": std_set.name,
                    "total_criteria": total,
                    "criteria_met": met,
                    "percent_complete": round(met / total * 100) if total else 0,
                    "coverage": cov,
                }
        except Exception as e:
            logger.warning("Could not build standards coverage: %s", e)

    subjects = list({a.subject for a in activities if a.subject})
    days_logged = len({s.created_at.date() for s in completed if s.created_at})

    return {
        "report_title": {
            "activity_log": "Activity Log",
            "student_progress": "Student Progress Report",
            "homeschool_portfolio": "Homeschool Portfolio",
            "session_log": "Session Log",
            "standards_coverage": "Standards Coverage Report",
        }.get(template, "Export"),
        "student_name": user.full_name or user.email,
        "child_name": user.full_name or user.email,
        "year": dt.utcnow().year,
        "state_code": None,  # Set by homeschool user profile when built
        "activities": act_dicts,
        "sessions": sess_dicts,
        "recent_sessions": sess_dicts[:10],
        "sessions_completed": len(completed),
        "activities_count": len(activities),
        "competencies_count": 0,  # TODO: wire to competencies table
        "days_logged": days_logged,
        "days_required": 180,
        "subjects": subjects,
        "standards_coverage": standards_coverage,
        "coverage_rows": [
            {
                "criterion_id": k,
                "name": v["criterion"].get("name", ""),
                "category": v["criterion"].get("category", ""),
                "required": v["criterion"].get("required", True),
                "times_addressed": v["times_addressed"],
                "best_level": v["best_level"] or "",
                "met": v["met"],
            }
            for k, v in (standards_coverage or {}).get("coverage", {}).items()
        ],
    }


def _today() -> str:
    from datetime import date
    return date.today().isoformat()
