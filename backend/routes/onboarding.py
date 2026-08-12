# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Onboarding checklist API.

After a teacher or homeschool parent signs up and verifies their email they
land on an empty dashboard.  These endpoints power the "Getting started"
checklist widget that walks them through the four first steps.

Routes (prefix /api/v1/onboarding, registered in main.py):

  GET  /status    — return checklist state for the current user's org
  POST /dismiss   — mark onboarding complete (hides the checklist permanently)

Checklist items
---------------
  email_verified         user.is_active == True
  classroom_created      at least one classroom in this org
  student_invited        at least one classroom_invitation for this org
  activity_created       at least one activity created by this user
  all_done               all four above are True
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/onboarding", tags=["onboarding"])


# ── GET /onboarding/status ─────────────────────────────────────────────────────

@router.get("/status")
async def onboarding_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the onboarding checklist for the current user.

    Only meaningful for TEACHER and HOMESCHOOL roles; students and parents
    receive all_done=True immediately (no checklist for them).
    """
    if current_user.role not in ("TEACHER", "HOMESCHOOL", "ADMIN"):
        return {
            "role":              current_user.role,
            "email_verified":    current_user.is_active,
            "classroom_created": True,
            "student_invited":   True,
            "activity_created":  True,
            "all_done":          True,
            "dismissed":         True,
        }

    org_id = str(current_user.org_id) if current_user.org_id else None

    # No org means no checklist to show — mirror /dismiss's own stance
    # ("no org yet — nothing to dismiss") instead of leaving `dismissed`
    # at its unset False default below. Without this, an org-less account
    # (e.g. seed_demo_users()/seed_homeschool_demo() in startup.py, which
    # insert straight into `users` and never create/attach an
    # organizations row) could never see dismissed:true from this endpoint
    # no matter how many times /dismiss was called or all_done became
    # true — classroom_created/student_invited/activity_created all
    # require org_id too, so all_done's auto-dismiss fallback can't save
    # it either. The mobile welcome wizard (app/homeschool-welcome.tsx)
    # calls /dismiss then immediately re-checks /status on every
    # (tabs)/_layout.tsx mount; a permanently-false dismissed here bounces
    # the user straight back to the wizard's first step regardless of
    # whether they tapped "Skip setup" or completed all three steps.
    if org_id is None:
        return {
            "role":              current_user.role,
            "email_verified":    current_user.is_active,
            "classroom_created": True,
            "student_invited":   True,
            "activity_created":  True,
            "all_done":          True,
            "dismissed":         True,
            "next_step":         None,
        }

    # 1. email verified
    email_verified: bool = current_user.is_active

    # 2. classroom created
    classroom_created: bool = False
    if org_id:
        count = (await db.execute(
            text("SELECT COUNT(*) FROM classrooms WHERE org_id = :oid AND is_active = TRUE"),
            {"oid": org_id},
        )).scalar() or 0
        classroom_created = count > 0

    # 3. student invited (any invitation created, regardless of acceptance)
    student_invited: bool = False
    if org_id:
        inv_count = (await db.execute(
            text("SELECT COUNT(*) FROM classroom_invitations WHERE org_id = :oid"),
            {"oid": org_id},
        )).scalar() or 0
        student_invited = inv_count > 0

    # 4. first activity created by this teacher
    activity_created: bool = False
    act_count = (await db.execute(
        text("SELECT COUNT(*) FROM activities WHERE teacher_id = :uid"),
        {"uid": str(current_user.id)},
    )).scalar() or 0
    activity_created = act_count > 0

    all_done: bool = (
        email_verified and classroom_created and student_invited and activity_created
    )

    # 5. check if user/org has dismissed the checklist
    dismissed: bool = False
    if org_id:
        dismissed_at = (await db.execute(
            text("SELECT onboarding_completed_at FROM organizations WHERE id = :oid"),
            {"oid": org_id},
        )).scalar()
        dismissed = dismissed_at is not None
    if all_done and not dismissed:
        dismissed = True  # auto-dismiss once everything is done

    return {
        "role":              current_user.role,
        "email_verified":    email_verified,
        "classroom_created": classroom_created,
        "student_invited":   student_invited,
        "activity_created":  activity_created,
        "all_done":          all_done,
        "dismissed":         dismissed,
        # Hints the frontend can display next to incomplete items
        "next_step": _next_step(email_verified, classroom_created, student_invited, activity_created),
    }


def _next_step(
    email_verified: bool,
    classroom_created: bool,
    student_invited: bool,
    activity_created: bool,
) -> str | None:
    """Return a short action key for the first incomplete step."""
    if not email_verified:
        return "verify_email"
    if not classroom_created:
        return "create_classroom"
    if not student_invited:
        return "invite_students"
    if not activity_created:
        return "create_activity"
    return None


# ── POST /onboarding/dismiss ──────────────────────────────────────────────────

@router.post("/dismiss")
async def dismiss_onboarding(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark onboarding as dismissed for this org.
    Records onboarding_completed_at on the organization row.
    The checklist widget will stop appearing after this call.
    """
    if not current_user.org_id:
        # No org yet — nothing to dismiss; return success silently
        return {"dismissed": True}

    await db.execute(
        text("""
            UPDATE organizations
            SET    onboarding_completed_at = NOW()
            WHERE  id = :oid
              AND  onboarding_completed_at IS NULL
        """),
        {"oid": str(current_user.org_id)},
    )
    await db.commit()
    logger.info(
        f"[onboarding] Dismissed for org={current_user.org_id} "
        f"user={current_user.id} ({current_user.email})"
    )
    return {"dismissed": True}
