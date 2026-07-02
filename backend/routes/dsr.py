# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Data Subject Rights (DSR) Portal — P3-4
Implements GDPR Articles 15-21 and CCPA rights:
  POST /dsr/access-request      — Article 15: right to know what data we hold
  GET  /dsr/download-my-data    — Article 20: data portability (JSON export)
  POST /dsr/deletion-request    — Article 17: right to erasure
  POST /dsr/correction-request  — Article 16: right to rectification
  POST /dsr/opt-out             — CCPA: do not sell or share my personal information

All endpoints require authentication except opt-out (which also accepts email).
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user, optional_user
from models.database import User
from services.privacy_engine import hash_student_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dsr", tags=["data-subject-rights"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class DeletionRequest(BaseModel):
    reason: Optional[str] = None
    confirm: bool  # must be True


class CorrectionRequest(BaseModel):
    field_name: str        # e.g. "full_name", "email"
    current_value: str
    requested_value: str
    reason: Optional[str] = None


class OptOutRequest(BaseModel):
    email: Optional[EmailStr] = None   # for unauthenticated users
    scope: str = "all"                 # "all" | "analytics" | "marketing"


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _log_dsr_request(
    db: AsyncSession, user_id: str, request_type: str, details: dict
) -> None:
    """Insert a DSR request record into rule_audit_log.

    actor_id is HASHED before storage (rule_audit_log principle: never store
    raw IDs), and callers must not pass raw email addresses in details.
    """
    try:
        await db.execute(text("""
            INSERT INTO rule_audit_log
                (id, action, data_type, actor_id, actor_role, compliance_status, notes)
            VALUES
                (gen_random_uuid(), :action, 'dsr_request', :actor_id, 'data_subject', 'COMPLIANT', :notes)
        """), {
            "action": f"DSR_{request_type.upper()}",
            "actor_id": hash_student_id(user_id),
            "notes": str(details),
        })
    except Exception as e:
        logger.warning(f"DSR audit log failed (non-fatal): {e}")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/access-request", status_code=202)
async def submit_access_request(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    GDPR Art. 15 / CCPA: Request a copy of all personal data we hold.
    Returns a summary immediately; full export is available via GET /dsr/download-my-data.
    """
    uid = str(current_user.id)
    await _log_dsr_request(db, uid, "ACCESS", {})  # no raw PII in audit notes
    await db.commit()
    return {
        "request_id": str(uuid4()),
        "status": "accepted",
        "message": (
            "Your data access request has been recorded. "
            "Use GET /dsr/download-my-data to download your data immediately."
        ),
        "submitted_at": datetime.utcnow().isoformat(),
        "response_deadline": (datetime.utcnow() + timedelta(days=30)).isoformat(),
    }


@router.get("/download-my-data")
async def download_my_data(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    GDPR Art. 20: Data portability — return all personal data as structured JSON.
    Collects profile, learning sessions, evidence captures, consents, and notifications.
    """
    uid = str(current_user.id)
    # Salted hash — must match how ConsentManager / routes/privacy.py write
    # consent_records.student_id_hash, or the export silently misses consents.
    uid_hash = hash_student_id(uid)

    profile = {
        "id": uid,
        "email": current_user.email,
        "full_name": getattr(current_user, "full_name", None),
        "role": str(current_user.role),
        "created_at": current_user.created_at.isoformat() if getattr(current_user, "created_at", None) else None,
    }

    sessions = (await db.execute(text("""
        SELECT id, activity_id, status, created_at, updated_at
        FROM learning_sessions WHERE user_id = :uid ORDER BY created_at DESC LIMIT 500
    """), {"uid": uid})).mappings().all()

    evidence = (await db.execute(text("""
        SELECT id, session_id, input_type, captured_at FROM student_captures
        WHERE session_id IN (SELECT id FROM learning_sessions WHERE user_id = :uid)
        ORDER BY captured_at DESC LIMIT 1000
    """), {"uid": uid})).mappings().all()

    consents = (await db.execute(text("""
        SELECT consent_type, jurisdiction, is_active, granted_at, withdrawn_at, consent_version
        FROM consent_records WHERE student_id_hash = :hash ORDER BY granted_at DESC
    """), {"hash": uid_hash})).mappings().all()

    notifications = (await db.execute(text("""
        SELECT title, message, is_read, created_at FROM notifications
        WHERE user_id = :uid ORDER BY created_at DESC LIMIT 100
    """), {"uid": uid})).mappings().all()

    await _log_dsr_request(db, uid, "DOWNLOAD", {
        "records_exported": len(sessions) + len(evidence),
    })
    await db.commit()

    return {
        "export_generated_at": datetime.utcnow().isoformat(),
        "subject": profile,
        "learning_sessions": [dict(r) for r in sessions],
        "evidence_captures": [dict(r) for r in evidence],
        "consent_records": [dict(r) for r in consents],
        "notifications": [dict(r) for r in notifications],
    }


@router.post("/deletion-request", status_code=202)
async def submit_deletion_request(
    body: DeletionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    GDPR Art. 17: Right to erasure ("right to be forgotten").
    Soft-deletes the account immediately (sets deleted_at + deactivates).
    Hard delete is performed by the retention cleanup scheduler after 30 days.
    """
    if not body.confirm:
        raise HTTPException(
            status_code=400,
            detail="confirm must be true to proceed with deletion",
        )

    uid = str(current_user.id)

    # Soft-delete: anonymise email + names AND clear the email blind index.
    # Without clearing email_index, the HMAC of the real email address stays in
    # the DB (a linkable identifier — not erasure) and permanently blocks the
    # person from ever re-registering with the same email.
    try:
        await db.execute(text("""
            UPDATE users
            SET is_active   = false,
                deleted_at  = NOW(),
                email       = CONCAT('deleted_', id::text, '_',
                                     EXTRACT(EPOCH FROM NOW())::int, '@deleted.invalid'),
                email_index = CONCAT('deleted_', id::text),
                full_name   = 'Deleted User',
                first_name  = 'Deleted',
                last_name   = 'User'
            WHERE id = :uid AND deleted_at IS NULL
        """), {"uid": uid})
    except Exception:
        # deleted_at column may not exist on this schema version — fall back gracefully
        await db.execute(
            text("UPDATE users SET is_active = false WHERE id = :uid"),
            {"uid": uid},
        )

    await _log_dsr_request(db, uid, "DELETION", {
        "reason": body.reason,
        "soft_delete": True,
    })
    await db.commit()

    return {
        "request_id": str(uuid4()),
        "status": "accepted",
        "message": (
            "Your account has been deactivated. "
            "All personal data will be permanently deleted within 30 days."
        ),
        "submitted_at": datetime.utcnow().isoformat(),
        "completion_deadline": (datetime.utcnow() + timedelta(days=30)).isoformat(),
    }


@router.post("/correction-request", status_code=202)
async def submit_correction_request(
    body: CorrectionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    GDPR Art. 16: Right to rectification.
    Correctable fields (full_name) are applied immediately;
    others are flagged for manual review within 30 days.
    """
    uid = str(current_user.id)
    SELF_SERVICE_FIELDS = {"full_name"}

    if body.field_name in SELF_SERVICE_FIELDS:
        await db.execute(
            text(f"UPDATE users SET {body.field_name} = :val WHERE id = :uid"),
            {"val": body.requested_value, "uid": uid},
        )
        resolution = "applied_immediately"
    else:
        resolution = "pending_manual_review"

    await _log_dsr_request(db, uid, "CORRECTION", {
        "field": body.field_name,
        "resolution": resolution,
        "reason": body.reason,
    })
    await db.commit()

    return {
        "request_id": str(uuid4()),
        "status": "accepted",
        "field": body.field_name,
        "resolution": resolution,
        "message": (
            f"Your correction to '{body.field_name}' has been applied."
            if resolution == "applied_immediately"
            else (
                f"Your correction request for '{body.field_name}' has been "
                "submitted for review within 30 days."
            )
        ),
        "submitted_at": datetime.utcnow().isoformat(),
    }


@router.post("/opt-out", status_code=200)
async def opt_out_of_data_sale(
    body: OptOutRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(optional_user),
):
    """
    CCPA/CPRA: Do Not Sell or Share My Personal Information.
    Authenticated users: opt-out is recorded against their account.
    Unauthenticated users: opt-out is recorded by email hash.

    Also honours the Global Privacy Control (GPC) browser signal: if the request
    carries `Sec-GPC: 1`, that is treated as a valid opt-out request per CPRA,
    even without an explicit form submission.
    """
    user_id: Optional[str] = None
    email_for_log: Optional[str] = body.email

    gpc_signal = request.headers.get("Sec-GPC", "") == "1"

    raw_ip = (
        request.headers.get("x-forwarded-for", "")
        or (request.client.host if request.client else "")
    )
    ip_hash = hashlib.sha256(raw_ip.encode()).hexdigest()

    if current_user:
        user_id = str(current_user.id)
        email_for_log = current_user.email
    elif body.email:
        # Record by email hash for unauthenticated users
        user_id = hashlib.sha256(body.email.lower().encode()).hexdigest()
    elif gpc_signal:
        # GPC-only opt-out (no email, not logged in): record by IP hash so the
        # signal is honoured even though we can't tie it to an account. CPRA
        # requires GPC to be processed as a valid opt-out on its own.
        user_id = ip_hash
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide email for unauthenticated opt-out, or log in first.",
        )

    # Record opt-out as a consent record
    try:
        await db.execute(text("""
            INSERT INTO consent_records
                (id, student_id_hash, jurisdiction, consent_type, data_categories,
                 granted_by, consent_version, ip_hash, is_active)
            VALUES
                (gen_random_uuid(), :hash, 'ccpa', 'opt_out_data_sale',
                 '["all"]'::jsonb, :granted_by, '1.0', :ip_hash, true)
            ON CONFLICT DO NOTHING
        """), {
            "hash": user_id,
            "granted_by": email_for_log or "anonymous",
            "ip_hash": ip_hash,
        })
    except Exception as e:
        logger.warning(f"opt-out consent insert failed (non-fatal): {e}")

    await _log_dsr_request(
        db,
        user_id or "anonymous",
        "OPT_OUT",
        {"scope": body.scope, "source": "gpc" if gpc_signal else "form"},
    )
    await db.commit()

    return {
        "status": "recorded",
        "message": (
            "Your opt-out preference has been recorded. "
            "We will not sell or share your personal information."
        ),
        "scope": body.scope,
        "recorded_at": datetime.utcnow().isoformat(),
    }
