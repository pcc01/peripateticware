# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Classroom management + invite system.

Routes (prefix: /api/v1/classrooms, registered in main.py):

  Teacher — classroom CRUD
  POST   /                           Create classroom (auto-creates org if teacher has none)
  GET    /                           List teacher's classrooms
  GET    /{id}                       Classroom detail + student list
  PATCH  /{id}                       Update name / grade / subject
  DELETE /{id}                       Archive (soft-delete)

  Teacher — invites
  POST   /{id}/invites               Create invite link(s) — single email, list, or open link
  POST   /{id}/invites/bulk-csv      Upload CSV of student emails → bulk invites
  GET    /{id}/invites               List active invites for this classroom
  DELETE /{id}/invites/{invite_id}   Revoke an invite

  Public — join flow (no auth required)
  GET    /join/{token}               Validate token, return classroom preview
  POST   /join/{token}               Accept invite + create student account

  Student
  GET    /my                         List classrooms the current student is enrolled in
"""

import csv
import io
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import get_db
from core.dependencies import get_current_user
from core.security import SecurityManager
from models import User
from services.email_service import send_classroom_invite_email, send_parent_consent_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/classrooms", tags=["classrooms"])

_PW_HASH = "$2b$12$nVqpepgIpsqIYLr5JzOtZeV/HYj1ib6CGtweKasJ4SN3sGQA0eBsG"  # SecurePass123!


# ── Helpers ────────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _invite_expires() -> datetime:
    return _now() + timedelta(days=14)


async def _get_or_create_org(db: AsyncSession, teacher: User) -> str:
    """Return teacher's org_id, auto-creating a personal org if they don't have one."""
    if teacher.org_id:
        return str(teacher.org_id)

    # Auto-create an org for this teacher
    org_id = str(uuid4())
    slug_base = (teacher.email.split("@")[0] + "-school").lower().replace("_", "-")
    slug = slug_base
    # Ensure slug uniqueness — bounded per NASA Rule 2 (no runaway loops)
    _MAX_SLUG_ATTEMPTS = 100
    for n in range(1, _MAX_SLUG_ATTEMPTS + 1):
        existing = (await db.execute(
            text("SELECT id FROM organizations WHERE slug = :s"), {"s": slug}
        )).first()
        if not existing:
            break
        slug = f"{slug_base}-{n}"
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not generate a unique organization slug after 100 attempts.",
        )

    await db.execute(text("""
        INSERT INTO organizations (id, slug, name, type, license_tier,
                                   license_status, max_teachers, max_classrooms,
                                   max_students, max_students_per_classroom,
                                   contact_email, created_at, updated_at)
        VALUES (:id, :slug, :name, 'school', 'free',
                'trial', 3, 1, 30, 30, :email, NOW(), NOW())
    """), {
        "id":    org_id,
        "slug":  slug,
        "name":  f"{teacher.first_name or teacher.email.split('@')[0]}'s School",
        "email": teacher.email,
    })

    # Assign teacher to org
    await db.execute(text(
        "UPDATE users SET org_id = :oid WHERE id = :uid"
    ), {"oid": org_id, "uid": str(teacher.id)})

    # Make teacher an org admin
    await db.execute(text("""
        INSERT INTO organization_members (id, org_id, user_id, role, joined_at)
        VALUES (:mid, :oid, :uid, 'admin', NOW())
        ON CONFLICT (org_id, user_id) DO NOTHING
    """), {"mid": str(uuid4()), "oid": org_id, "uid": str(teacher.id)})

    await db.commit()
    # Reload teacher object
    await db.refresh(teacher)
    return org_id


# ── Request / response models ──────────────────────────────────────────────────

class ClassroomCreate(BaseModel):
    name:        str
    grade_level: Optional[int] = None
    subject:     Optional[str] = None


class ClassroomUpdate(BaseModel):
    name:        Optional[str] = None
    grade_level: Optional[int] = None
    subject:     Optional[str] = None
    is_active:   Optional[bool] = None


class InviteRequest(BaseModel):
    emails: list[str] = []     # empty list = create an open link (anyone can join)
    note:   str = ""


class StudentJoinRequest(BaseModel):
    first_name:       str
    last_name:        str
    email:            EmailStr
    password:         str
    password_confirm: str
    date_of_birth:    Optional[str] = None   # YYYY-MM-DD — used for COPPA age gate
    parent_email:     Optional[EmailStr] = None  # required when student is under 13


# ── Teacher: classroom CRUD ────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_classroom(
    body: ClassroomCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("TEACHER", "HOMESCHOOL", "ADMIN"):
        raise HTTPException(status_code=403, detail="Only teachers can create classrooms")

    org_id = await _get_or_create_org(db, current_user)

    # Enforce license classroom limit
    count_row = (await db.execute(
        text("SELECT COUNT(*) FROM classrooms WHERE org_id = :oid AND is_active = TRUE"),
        {"oid": org_id},
    )).scalar()
    limit_row = (await db.execute(
        text("SELECT max_classrooms FROM organizations WHERE id = :oid"),
        {"oid": org_id},
    )).scalar()
    # Classroom limit enforced — upgrade to add more
    if count_row is not None and limit_row is not None and count_row >= limit_row:
        tier_now = (await db.execute(
            text("SELECT license_tier FROM organizations WHERE id = :oid"),
            {"oid": org_id},
        )).scalar() or "free"
        raise HTTPException(
            status_code=402,
            detail={
                "code":          "UPGRADE_REQUIRED",
                "feature":       "classroom_count",
                "required_tier": "school",
                "current_tier":  tier_now,
                "limit":         limit_row,
                "current":       count_row,
            },
        )

    classroom_id = str(uuid4())
    await db.execute(text("""
        INSERT INTO classrooms (id, org_id, teacher_id, name, grade_level, subject, created_at)
        VALUES (:id, :org_id, :teacher_id, :name, :grade_level, :subject, NOW())
    """), {
        "id":          classroom_id,
        "org_id":      org_id,
        "teacher_id":  str(current_user.id),
        "name":        body.name,
        "grade_level": body.grade_level,
        "subject":     body.subject,
    })
    await db.commit()
    return {"id": classroom_id, "name": body.name, "org_id": org_id}


@router.get("")
async def list_classrooms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(text("""
        SELECT c.id, c.name, c.grade_level, c.subject, c.is_active, c.created_at,
               COUNT(cs.student_id) AS student_count,
               COALESCE(o.max_students_per_classroom, 30) AS max_students_per_classroom
        FROM   classrooms c
        LEFT JOIN organizations o ON o.id = c.org_id
        LEFT JOIN classroom_students cs ON cs.classroom_id = c.id
        WHERE  c.teacher_id = :tid
        GROUP BY c.id, o.max_students_per_classroom
        ORDER BY c.created_at DESC
    """), {"tid": str(current_user.id)})).mappings().all()

    return [
        {
            "id":            str(r["id"]),
            "name":          r["name"],
            "grade_level":   r["grade_level"],
            "subject":       r["subject"],
            "is_active":     r["is_active"],
            "student_count":              r["student_count"],
            "max_students_per_classroom": r["max_students_per_classroom"],
            "at_capacity":                r["student_count"] >= r["max_students_per_classroom"],
            "created_at":                 r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


# ── Student: my classrooms (must be above /{classroom_id} to avoid shadowing) ──

@router.get("/my")
async def my_classrooms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(text("""
        SELECT c.id, c.name, c.grade_level, c.subject,
               u.first_name || ' ' || u.last_name AS teacher_name,
               o.name AS org_name,
               cs.enrolled_at
        FROM   classroom_students cs
        JOIN   classrooms c ON c.id = cs.classroom_id
        JOIN   users u      ON u.id = c.teacher_id
        JOIN   organizations o ON o.id = c.org_id
        WHERE  cs.student_id = :uid AND c.is_active = TRUE
        ORDER BY cs.enrolled_at DESC
    """), {"uid": str(current_user.id)})).mappings().all()

    return [
        {
            "id":           str(r["id"]),
            "name":         r["name"],
            "grade_level":  r["grade_level"],
            "subject":      r["subject"],
            "teacher_name": r["teacher_name"],
            "org_name":     r["org_name"],
            "enrolled_at":  r["enrolled_at"].isoformat() if r["enrolled_at"] else None,
        }
        for r in rows
    ]


@router.get("/{classroom_id}")
async def get_classroom(
    classroom_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(text("""
        SELECT c.id, c.name, c.grade_level, c.subject, c.is_active,
               c.org_id, c.teacher_id, c.created_at
        FROM   classrooms c
        WHERE  c.id = :cid AND c.teacher_id = :tid
    """), {"cid": classroom_id, "tid": str(current_user.id)})).first()

    if not row:
        raise HTTPException(status_code=404, detail="Classroom not found")

    students = (await db.execute(text("""
        SELECT u.id, u.email, u.first_name, u.last_name, u.full_name,
               cs.enrolled_at
        FROM   classroom_students cs
        JOIN   users u ON u.id = cs.student_id
        WHERE  cs.classroom_id = :cid
        ORDER BY u.last_name, u.first_name
    """), {"cid": classroom_id})).mappings().all()

    return {
        "id":            str(row[0]),
        "name":          row[1],
        "grade_level":   row[2],
        "subject":       row[3],
        "is_active":     row[4],
        "org_id":        str(row[5]),
        "teacher_id":    str(row[6]),
        "created_at":    row[7].isoformat() if row[7] else None,
        "students": [
            {
                "id":          str(s["id"]),
                "email":       s["email"],
                "name":        s["full_name"] or f"{s['first_name']} {s['last_name']}",
                "enrolled_at": s["enrolled_at"].isoformat() if s["enrolled_at"] else None,
            }
            for s in students
        ],
    }


@router.patch("/{classroom_id}")
async def update_classroom(
    classroom_id: str,
    body: ClassroomUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(text(
        "SELECT id FROM classrooms WHERE id = :cid AND teacher_id = :tid"
    ), {"cid": classroom_id, "tid": str(current_user.id)})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Classroom not found")

    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        return {"status": "no changes"}

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    await db.execute(
        text(f"UPDATE classrooms SET {set_clause} WHERE id = :cid"),
        {**updates, "cid": classroom_id},
    )
    await db.commit()
    return {"status": "updated"}


# ── Teacher: invites ───────────────────────────────────────────────────────────

@router.post("/{classroom_id}/invites", status_code=201)
async def create_invites(
    classroom_id: str,
    body: InviteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create invite links for a classroom.
    - If body.emails is empty: create one open link (anyone with it can join).
    - If body.emails has addresses: create one invite per email and send emails.
    Returns list of {email, token, join_url} objects.
    """
    row = (await db.execute(text("""
        SELECT c.id, c.org_id, c.name AS classroom_name, o.name AS org_name
        FROM classrooms c
        JOIN organizations o ON o.id = c.org_id
        WHERE c.id = :cid AND c.teacher_id = :tid
    """), {"cid": classroom_id, "tid": str(current_user.id)})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Classroom not found")

    org_id         = str(row[1])
    classroom_name = row[2] or "your class"
    org_name       = row[3] or "Peripateticware"
    teacher_name   = current_user.full_name or f"{current_user.first_name or ''} {current_user.last_name or ''}".strip() or "Your teacher"
    expires        = _invite_expires()
    created        = []

    emails = body.emails if body.emails else [None]  # None = open link

    for email in emails:
        token = secrets.token_urlsafe(32)
        invite_id = str(uuid4())
        await db.execute(text("""
            INSERT INTO classroom_invitations
                (id, classroom_id, org_id, created_by, email, token, status, expires_at, created_at)
            VALUES
                (:id, :cid, :oid, :by, :email, :token, 'pending', :exp, NOW())
        """), {
            "id":    invite_id,
            "cid":   classroom_id,
            "oid":   org_id,
            "by":    str(current_user.id),
            "email": email,
            "token": token,
            "exp":   expires,
        })

        join_url = f"{settings.FRONTEND_URL}/join/{token}"
        created.append({"email": email, "token": token, "join_url": f"/join/{token}", "expires_at": expires.isoformat()})

        if email:
            try:
                await send_classroom_invite_email(
                    email,
                    teacher_name=teacher_name,
                    classroom_name=classroom_name,
                    org_name=org_name,
                    join_url=join_url,
                )
            except Exception as e:
                logger.warning(f"Invite email failed for {email}: {e}")

    await db.commit()
    return {"invites": created}


@router.post("/{classroom_id}/invites/bulk-csv", status_code=201)
async def bulk_invite_csv(
    classroom_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a CSV file with student emails (one per row, first column).
    Creates invite links for each valid email found.
    """
    row = (await db.execute(text("""
        SELECT c.id, c.org_id, c.name AS classroom_name, o.name AS org_name
        FROM classrooms c
        JOIN organizations o ON o.id = c.org_id
        WHERE c.id = :cid AND c.teacher_id = :tid
    """), {"cid": classroom_id, "tid": str(current_user.id)})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Classroom not found")

    content = await file.read()
    try:
        text_content = content.decode("utf-8-sig")  # handle BOM
    except UnicodeDecodeError:
        text_content = content.decode("latin-1")

    reader = csv.reader(io.StringIO(text_content))
    emails = []
    for csv_row in reader:
        if csv_row:
            candidate = csv_row[0].strip().lower()
            if "@" in candidate and "." in candidate:
                emails.append(candidate)

    if not emails:
        raise HTTPException(status_code=422, detail="No valid email addresses found in CSV")

    if len(emails) > 200:
        raise HTTPException(status_code=422, detail="CSV too large — max 200 emails per upload")

    org_id         = str(row[1])
    classroom_name = row[2] or "your class"
    org_name       = row[3] or "Peripateticware"
    teacher_name   = current_user.full_name or f"{current_user.first_name or ''} {current_user.last_name or ''}".strip() or "Your teacher"
    expires        = _invite_expires()
    created        = []

    for email in emails:
        # Skip if already invited
        existing = (await db.execute(text("""
            SELECT id FROM classroom_invitations
            WHERE classroom_id = :cid AND email = :email AND status = 'pending'
        """), {"cid": classroom_id, "email": email})).first()
        if existing:
            created.append({"email": email, "status": "already_invited"})
            continue

        token = secrets.token_urlsafe(32)
        await db.execute(text("""
            INSERT INTO classroom_invitations
                (id, classroom_id, org_id, created_by, email, token, status, expires_at, created_at)
            VALUES
                (:id, :cid, :oid, :by, :email, :token, 'pending', :exp, NOW())
        """), {
            "id":    str(uuid4()),
            "cid":   classroom_id,
            "oid":   org_id,
            "by":    str(current_user.id),
            "email": email,
            "token": token,
            "exp":   expires,
        })
        created.append({"email": email, "token": token, "status": "invited"})

        try:
            await send_classroom_invite_email(
                email,
                teacher_name=teacher_name,
                classroom_name=classroom_name,
                org_name=org_name,
                join_url=f"{settings.FRONTEND_URL}/join/{token}",
            )
        except Exception as e:
            logger.warning(f"Bulk invite email failed for {email}: {e}")

    await db.commit()
    return {"total": len(emails), "invites": created}


@router.get("/{classroom_id}/invites")
async def list_invites(
    classroom_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(text(
        "SELECT id FROM classrooms WHERE id = :cid AND teacher_id = :tid"
    ), {"cid": classroom_id, "tid": str(current_user.id)})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Classroom not found")

    invites = (await db.execute(text("""
        SELECT i.id, i.email, i.token, i.status, i.expires_at, i.created_at,
               u.full_name AS accepted_by_name
        FROM   classroom_invitations i
        LEFT JOIN users u ON u.id = i.accepted_by
        WHERE  i.classroom_id = :cid
        ORDER BY i.created_at DESC
    """), {"cid": classroom_id})).mappings().all()

    return [
        {
            "id":               str(r["id"]),
            "email":            r["email"],
            "token":            r["token"],
            "status":           r["status"],
            "expires_at":       r["expires_at"].isoformat() if r["expires_at"] else None,
            "created_at":       r["created_at"].isoformat() if r["created_at"] else None,
            "accepted_by_name": r["accepted_by_name"],
            "join_url":         f"/join/{r['token']}",
        }
        for r in invites
    ]


@router.delete("/{classroom_id}/invites/{invite_id}", status_code=204)
async def revoke_invite(
    classroom_id: str,
    invite_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(text(
        "SELECT id FROM classrooms WHERE id = :cid AND teacher_id = :tid"
    ), {"cid": classroom_id, "tid": str(current_user.id)})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Classroom not found")

    await db.execute(text("""
        UPDATE classroom_invitations SET status = 'revoked'
        WHERE id = :iid AND classroom_id = :cid
    """), {"iid": invite_id, "cid": classroom_id})
    await db.commit()


# ── Public: join flow (no auth) ────────────────────────────────────────────────

@router.get("/join/{token}")
async def preview_invite(token: str, db: AsyncSession = Depends(get_db)):
    """Return classroom preview so the join page can show context before registration."""
    row = (await db.execute(text("""
        SELECT i.id, i.email, i.status, i.expires_at,
               c.id AS classroom_id, c.name AS classroom_name,
               c.grade_level, c.subject,
               o.name AS org_name, o.slug AS org_slug
        FROM   classroom_invitations i
        JOIN   classrooms c ON c.id = i.classroom_id
        JOIN   organizations o ON o.id = i.org_id
        WHERE  i.token = :token
    """), {"token": token})).first()

    if not row:
        raise HTTPException(status_code=404, detail="Invite link not found")
    if row[2] != "pending":
        raise HTTPException(status_code=410, detail=f"This invite has already been {row[2]}")
    if row[3] and row[3].replace(tzinfo=timezone.utc) < _now():
        raise HTTPException(status_code=410, detail="This invite link has expired")

    return {
        "classroom_id":   str(row[4]),
        "classroom_name": row[5],
        "grade_level":    row[6],
        "subject":        row[7],
        "org_name":       row[8],
        "org_slug":       row[9],
        "email_hint":     row[1],   # pre-fill email field if invite was addressed
    }


@router.post("/join/{token}", status_code=201)
async def accept_invite(
    token: str,
    body: StudentJoinRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a student account and enroll them in the classroom.
    Called from the public /join/:token page.
    """
    if body.password != body.password_confirm:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    pw = body.password
    pw_errs = []
    if len(pw) < 8:
        pw_errs.append("at least 8 characters")
    if not any(c.isupper() for c in pw):
        pw_errs.append("at least one uppercase letter")
    if not any(c.islower() for c in pw):
        pw_errs.append("at least one lowercase letter")
    if not any(c.isdigit() for c in pw):
        pw_errs.append("at least one number")
    if not any(c in "@$!%*?&" for c in pw):
        pw_errs.append("at least one special character (@$!%*?&)")
    if pw_errs:
        raise HTTPException(status_code=400, detail=f"Password must have: {', '.join(pw_errs)}")

    # Load and validate invite
    inv = (await db.execute(text("""
        SELECT i.id, i.email, i.status, i.expires_at,
               i.classroom_id, i.org_id
        FROM   classroom_invitations i
        WHERE  i.token = :token
    """), {"token": token})).first()

    if not inv:
        raise HTTPException(status_code=404, detail="Invite link not found")
    if inv[2] != "pending":
        raise HTTPException(status_code=410, detail=f"This invite has already been {inv[2]}")
    if inv[3] and inv[3].replace(tzinfo=timezone.utc) < _now():
        raise HTTPException(status_code=410, detail="This invite link has expired")

    # If invite was addressed, enforce email match
    if inv[1] and inv[1].lower() != body.email.lower():
        raise HTTPException(status_code=403, detail="This invite was sent to a different email address")

    # Check email not already registered
    existing = (await db.execute(text(
        "SELECT id FROM users WHERE email = :email"
    ), {"email": body.email.lower()})).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists. Please log in.")

    # Create student account
    user_id = str(uuid4())
    hashed  = SecurityManager.hash_password(body.password)
    await db.execute(text("""
        INSERT INTO users
            (id, email, username, first_name, last_name, full_name,
             hashed_password, role, is_active, org_id, invite_token_used, created_at, updated_at)
        VALUES
            (:id, :email, :username, :first, :last, :full,
             :pw, 'STUDENT', TRUE, :org_id, :token, NOW(), NOW())
    """), {
        "id":       user_id,
        "email":    body.email.lower(),
        "username": body.email.lower().split("@")[0],
        "first":    body.first_name,
        "last":     body.last_name,
        "full":     f"{body.first_name} {body.last_name}",
        "pw":       hashed,
        "org_id":   str(inv[5]),
        "token":    token,
    })

    # Age gate (COPPA compliance)
    if body.date_of_birth:
        from datetime import date as _date
        try:
            dob = datetime.strptime(str(body.date_of_birth), "%Y-%m-%d").date()
            age = (_date.today() - dob).days // 365
        except (ValueError, TypeError):
            age = 999  # unparseable DOB → treat as adult

        if age < 13:
            # COPPA: parent email is required for under-13 students
            if not body.parent_email:
                raise HTTPException(
                    status_code=400,
                    detail="A parent or guardian email address is required for students under 13.",
                )
            consent_token = secrets.token_urlsafe(32)
            await db.execute(text("""
                UPDATE users
                SET requires_parental_consent = TRUE,
                    is_active = FALSE,
                    age_group = 'under_13',
                    consent_token = :consent_token
                WHERE id = :uid
            """), {"uid": user_id, "consent_token": consent_token})
            # Commit the user row before sending email so the token is persisted
            # even if the email send itself fails
            await db.flush()
            student_name = f"{body.first_name} {body.last_name}"
            try:
                await send_parent_consent_email(
                    to=str(body.parent_email),
                    token=consent_token,
                    student_name=student_name,
                )
            except Exception as _email_exc:
                logger.warning(
                    "Parental consent email failed for student %s (parent: %s): %s",
                    user_id, body.parent_email, _email_exc,
                )
        elif age < 16:
            await db.execute(text(
                "UPDATE users SET age_group = 'under_16' WHERE id = :uid"
            ), {"uid": user_id})
        elif age < 18:
            await db.execute(text(
                "UPDATE users SET age_group = 'under_18' WHERE id = :uid"
            ), {"uid": user_id})
        else:
            await db.execute(text(
                "UPDATE users SET age_group = 'adult' WHERE id = :uid"
            ), {"uid": user_id})

    # Enforce class size limit before enrolling
    current_count = (await db.execute(text(
        "SELECT COUNT(*) FROM classroom_students WHERE classroom_id = :cid"
    ), {"cid": str(inv[4])})).scalar() or 0

    cap = (await db.execute(text(
        "SELECT max_students_per_classroom FROM organizations WHERE id = :oid"
    ), {"oid": str(inv[5])})).scalar() or 30

    if current_count >= cap:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This classroom is full ({cap} students). "
                "Ask your teacher to upgrade their plan or create a new classroom."
            ),
        )

    # Enroll in classroom
    await db.execute(text("""
        INSERT INTO classroom_students (classroom_id, student_id, enrolled_at)
        VALUES (:cid, :uid, NOW())
        ON CONFLICT (classroom_id, student_id) DO NOTHING
    """), {"cid": str(inv[4]), "uid": user_id})

    # Add as org member
    await db.execute(text("""
        INSERT INTO organization_members (id, org_id, user_id, role, joined_at)
        VALUES (:mid, :oid, :uid, 'member', NOW())
        ON CONFLICT (org_id, user_id) DO NOTHING
    """), {"mid": str(uuid4()), "oid": str(inv[5]), "uid": user_id})

    # Mark invite accepted
    await db.execute(text("""
        UPDATE classroom_invitations
        SET status = 'accepted', accepted_by = :uid, accepted_at = NOW()
        WHERE id = :iid
    """), {"uid": user_id, "iid": str(inv[0])})

    await db.commit()

    # Re-check is_active — age gate may have set it FALSE for under-13 students
    active_row = (await db.execute(
        text("SELECT is_active FROM users WHERE id = :uid"), {"uid": user_id}
    )).first()
    if active_row and not active_row[0]:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=403,
            content={
                "detail": "parental_consent_required",
                "message": "Parental consent is required. A teacher or administrator will contact your parent or guardian.",
            },
        )

    # Issue a JWT so the student is logged in immediately
    from core.security import create_access_token
    token_jwt = create_access_token(data={"sub": user_id})

    return {
        "access_token": token_jwt,
        "token_type":   "bearer",
        "user_id":      user_id,
        "role":         "STUDENT",
        "classroom_id": str(inv[4]),
        "org_slug":     (await db.execute(
            text("SELECT slug FROM organizations WHERE id = :oid"), {"oid": str(inv[5])}
        )).scalar(),
        "email":        body.email.lower(),
        "name":         f"{body.first_name} {body.last_name}",
    }


# ── Teacher: remove student ───────────────────────────────────────────────────

@router.delete("/{classroom_id}/students/{student_id}", status_code=204)
async def remove_student(
    classroom_id: str,
    student_id:   str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a student from a classroom (does not delete their account)."""
    row = (await db.execute(text(
        "SELECT id FROM classrooms WHERE id = :cid AND teacher_id = :tid"
    ), {"cid": classroom_id, "tid": str(current_user.id)})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Classroom not found")

    await db.execute(text("""
        DELETE FROM classroom_students
        WHERE classroom_id = :cid AND student_id = :sid
    """), {"cid": classroom_id, "sid": student_id})
    await db.commit()


# ── Admin/Teacher: add an existing student to a classroom ─────────────────────

class AddStudentRequest(BaseModel):
    student_id: str


@router.post("/{classroom_id}/students", status_code=201)
async def add_student(
    classroom_id: str,
    body: AddStudentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Directly enroll an existing user into a classroom (no invite email).
    Admins may add to any classroom in their org; teachers only to their own.
    """
    is_admin = (current_user.role or "").upper() == "ADMIN"
    if is_admin:
        row = (await db.execute(text(
            "SELECT id, org_id FROM classrooms WHERE id = :cid"
        ), {"cid": classroom_id})).first()
    else:
        row = (await db.execute(text(
            "SELECT id, org_id FROM classrooms WHERE id = :cid AND teacher_id = :tid"
        ), {"cid": classroom_id, "tid": str(current_user.id)})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Classroom not found")
    org_id = str(row[1])

    # Validate the student exists
    student = (await db.execute(text(
        "SELECT id FROM users WHERE id = :sid"
    ), {"sid": body.student_id})).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student account not found")

    # Enforce class size limit
    current_count = (await db.execute(text(
        "SELECT COUNT(*) FROM classroom_students WHERE classroom_id = :cid"
    ), {"cid": classroom_id})).scalar() or 0
    cap = (await db.execute(text(
        "SELECT max_students_per_classroom FROM organizations WHERE id = :oid"
    ), {"oid": org_id})).scalar() or 30
    if current_count >= cap:
        seat_tier = (await db.execute(
            text("SELECT license_tier FROM organizations WHERE id = :oid"),
            {"oid": org_id},
        )).scalar() or "free"
        raise HTTPException(
            status_code=402,
            detail={
                "code":          "UPGRADE_REQUIRED",
                "feature":       "student_seats",
                 "required_tier": "school",
                "current_tier":  seat_tier,
                "limit":         cap,
                "current":       current_count,
            },
        )

    await db.execute(text("""
        INSERT INTO classroom_students (classroom_id, student_id, enrolled_at)
        VALUES (:cid, :sid, NOW())
        ON CONFLICT (classroom_id, student_id) DO NOTHING
    """), {"cid": classroom_id, "sid": body.student_id})
    await db.execute(text("""
        INSERT INTO organization_members (id, org_id, user_id, role, joined_at)
        VALUES (:mid, :oid, :uid, 'member', NOW())
        ON CONFLICT (org_id, user_id) DO NOTHING
    """), {"mid": str(uuid4()), "oid": org_id, "uid": body.student_id})
    await db.commit()
    return {"success": True, "classroom_id": classroom_id, "student_id": body.student_id}
