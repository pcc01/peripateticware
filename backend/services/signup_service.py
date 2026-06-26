# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
signup_service.create_user_and_org()

Extracted from auth.py to keep the route thin.  Handles:
  - user row creation
  - org auto-creation (TEACHER / HOMESCHOOL)
  - org_type_v2, country_code, subdivision_code, has_under_13_students columns
  - primary_org_id + signup_country_code on users
  - privacy_seeder call after org creation

Called from POST /api/v1/auth/signup.

SignupRequest is extended here with optional location fields:
    country_code        — ISO 3166-1 alpha-2 (from /geo/hint or user selection)
    subdivision_code    — e.g. 'US-CA'  (from user selection)
    has_under_13        — bool (from Teaching Context step)
    org_type_v2         — one of individual_teacher | homeschool_family |
                          homeschool_coop | school | district | enterprise
    ip_country_hint     — raw country_code returned by /geo/hint (stored for audit)
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.security import SecurityManager
from models.user import User
from services.privacy_seeder import seed_privacy_jurisdictions

logger = logging.getLogger(__name__)


# ── Extended SignupRequest ─────────────────────────────────────────────────────

class SignupData(BaseModel):
    """
    Full signup payload — superset of the existing SignupRequest.
    auth.py should accept this model (or extend SignupRequest with these fields).
    """
    # Core fields (must match existing SignupRequest)
    email:            EmailStr
    password:         str
    password_confirm: str
    first_name:       str
    last_name:        str
    username:         Optional[str] = None
    role:             Optional[str] = "STUDENT"
    invite_token:     Optional[str] = None
    school_name:      Optional[str] = None

    # ── Location / privacy fields (new in sprint 2A/2C) ──────────────────────
    country_code:     Optional[str] = None   # ISO-3166-1 alpha-2, e.g. 'US'
    subdivision_code: Optional[str] = None   # e.g. 'US-CA'
    has_under_13:     Optional[bool] = True  # default safe: assume under-13 present
    org_type_v2:      Optional[str] = None   # individual_teacher | homeschool_family | …
    ip_country_hint:  Optional[str] = None   # raw hint from /geo/hint (audit only)


async def create_user_and_org(
    db:   AsyncSession,
    data: SignupData,
    new_user_id: Optional[uuid.UUID] = None,
) -> tuple[User, Optional[str]]:
    """
    Create a user row and (for TEACHER/HOMESCHOOL) an organisation.

    Returns (User ORM instance, org_id_str_or_None).

    Callers must:
      1. Call db.add(user) + db.flush() before calling this for the user flush,
         OR pass new_user_id explicitly.
      2. Commit after this returns.

    This function is intentionally thin — it does not commit, so the caller
    (auth.py signup route) controls the transaction boundary.
    """
    role_upper = (data.role or "STUDENT").upper()

    if new_user_id is None:
        new_user_id = uuid.uuid4()

    # ── Determine org_type_v2 ─────────────────────────────────────────────────
    ot2 = data.org_type_v2
    if not ot2:
        if role_upper == "TEACHER":
            ot2 = "individual_teacher"
        elif role_upper == "HOMESCHOOL":
            ot2 = "homeschool_family"

    org_id: Optional[str] = None

    if role_upper in ("TEACHER", "HOMESCHOOL"):
        org_id = str(uuid.uuid4())

        school_name = (
            data.school_name
            or f"{data.first_name}'s {'School' if role_upper == 'TEACHER' else 'Homeschool'}"
        )

        # Unique slug — bounded per NASA Rule 2 (no runaway loops)
        _MAX_SLUG_ATTEMPTS = 100
        slug_base = (str(data.email).split("@")[0]).lower().replace("_", "-")
        slug = slug_base
        for n in range(1, _MAX_SLUG_ATTEMPTS + 1):
            exists = (await db.execute(
                text("SELECT id FROM organizations WHERE slug = :s"), {"s": slug}
            )).first()
            if not exists:
                break
            slug = f"{slug_base}-{n}"
        else:
            raise ValueError(
                "Could not generate a unique organization slug after 100 attempts."
            )

        org_type_v1 = "school" if role_upper == "TEACHER" else "homeschool_family"
        has_under_13 = data.has_under_13 if data.has_under_13 is not None else True

        await db.execute(text("""
            INSERT INTO organizations
                (id, slug, name, type, license_tier, license_status,
                 max_teachers, max_classrooms, max_students,
                 contact_email, trial_started_at, created_at, updated_at,
                 country_code, subdivision_code, has_under_13_students,
                 org_type_v2, ip_country_hint,
                 privacy_jurisdiction_ids)
            VALUES
                (:id, :slug, :name, :type, 'free', 'trial',
                 3, 1, 30,
                 :email, NOW(), NOW(), NOW(),
                 :cc, :sub, :u13,
                 :ot2, :hint,
                 '[]'::jsonb)
        """), {
            "id":    org_id,
            "slug":  slug,
            "name":  school_name,
            "type":  org_type_v1,
            "email": str(data.email).lower(),
            "cc":    (data.country_code or "").upper() or None,
            "sub":   data.subdivision_code or None,
            "u13":   has_under_13,
            "ot2":   ot2,
            "hint":  (data.ip_country_hint or "").upper() or None,
        })

        # Link user → org
        await db.execute(text(
            "UPDATE users SET org_id = :oid, primary_org_id = :oid, signup_country_code = :cc WHERE id = :uid"
        ), {
            "oid": org_id,
            "cc":  (data.country_code or "").upper() or None,
            "uid": str(new_user_id),
        })

        # Enforce teacher seat limit before inserting org member
        teacher_count = (await db.execute(
            text("""
                SELECT COUNT(*) FROM organization_members
                WHERE org_id = :oid AND role IN ('owner', 'admin', 'teacher')
            """),
            {"oid": org_id},
        )).scalar() or 0
        max_teachers_row = (await db.execute(
            text("SELECT max_teachers, license_tier FROM organizations WHERE id = :oid"),
            {"oid": org_id},
        )).first()
        max_teachers  = (max_teachers_row[0] if max_teachers_row else None) or 3
        license_tier  = (max_teachers_row[1] if max_teachers_row else None) or "free"
        if teacher_count >= max_teachers:
            raise HTTPException(
                status_code=402,
                detail={
                    "code":          "UPGRADE_REQUIRED",
                    "feature":       "teacher_seats",
                    "required_tier": "starter",
                    "current_tier":  license_tier,
                    "limit":         max_teachers,
                    "current":       teacher_count,
                },
            )

        # Make owner
        await db.execute(text("""
            INSERT INTO organization_members (id, org_id, user_id, role, joined_at)
            VALUES (:mid, :oid, :uid, 'owner', NOW())
            ON CONFLICT (org_id, user_id) DO NOTHING
        """), {"mid": str(uuid.uuid4()), "oid": org_id, "uid": str(new_user_id)})

        # Seed privacy jurisdictions (non-fatal)
        try:
            await seed_privacy_jurisdictions(db, org_id)
        except Exception as exc:
            logger.warning(f"[signup_service] privacy seeder failed (non-fatal): {exc}")

    return org_id
