# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Breach Notification Routes — GDPR Art. 33/34 (P4 roadmap -> implemented)

Admin-only endpoints for managing personal data breach incidents:
  POST   /breach/incidents                      — log new incident (starts 72h clock)
  GET    /breach/incidents                      — list all incidents (paginated)
  GET    /breach/incidents/{id}                 — get incident detail
  PATCH  /breach/incidents/{id}                 — update status, root cause, etc.
  POST   /breach/incidents/{id}/notify-dpa      — trigger DPA notification email
  POST   /breach/incidents/{id}/notify-users    — batch-email affected users
  GET    /breach/incidents/{id}/timeline        — ordered audit trail
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.compliance import BreachIncident, BreachSeverity, BreachStatus
from models.database import User
from models.user import UserRole
from services.email_service import send_dpa_breach_notification, send_user_breach_notification

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/breach", tags=["breach-notification"])

DPA_CONTACTS = {
    "gdpr_eu":  "dpa@example-eu.org",           # Replace with real DPA email per country
    "ccpa":     "privacy@oag.ca.gov",
    "popia_za": "inforeg@justice.gov.za",
    "lpdc_mx":  "datospersonales@inai.org.mx",
    "aepd_ar":  "info@aaip.gob.ar",
}


def _require_admin(current_user: User):
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(403, "Admin access required")


# ── Schemas ───────────────────────────────────────────────────────────────────

class IncidentCreate(BaseModel):
    description: str
    severity: str = "medium"
    data_categories: List[str]
    jurisdictions: List[str]
    affected_user_count: Optional[int] = None
    user_notification_required: bool = False
    internal_notes: Optional[str] = None


class IncidentUpdate(BaseModel):
    status: Optional[str] = None
    root_cause: Optional[str] = None
    containment_actions: Optional[str] = None
    dpa_reference_number: Optional[str] = None
    internal_notes: Optional[str] = None
    affected_user_count: Optional[int] = None


class NotifyUsersRequest(BaseModel):
    description_for_users: str
    recommended_actions: Optional[List[str]] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/incidents", status_code=201)
async def log_breach_incident(
    body: IncidentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Log a new breach incident. Starts the 72-hour DPA notification clock."""
    _require_admin(current_user)

    now = datetime.utcnow()
    incident = BreachIncident(
        discovered_at=now,
        reported_by=str(current_user.email or current_user.id),
        description=body.description,
        severity=body.severity,
        data_categories=body.data_categories,
        jurisdictions=body.jurisdictions,
        affected_user_count=body.affected_user_count,
        user_notification_required=body.user_notification_required,
        internal_notes=body.internal_notes,
        dpa_notification_required=True,
        dpa_deadline=now + timedelta(hours=72),
    )
    db.add(incident)
    await db.flush()

    # Log to audit trail
    await db.execute(text("""
        INSERT INTO rule_audit_log
            (id, action, data_type, actor_id, actor_role, compliance_status, notes)
        VALUES
            (gen_random_uuid(), 'BREACH_INCIDENT_LOGGED', 'breach',
             :actor, 'admin', 'COMPLIANT', :notes)
    """), {
        "actor": str(current_user.id),
        "notes": f"Incident {incident.id} severity={body.severity}",
    })

    await db.commit()

    return {
        "id": str(incident.id),
        "severity": incident.severity,
        "status": incident.status,
        "dpa_deadline": incident.dpa_deadline.isoformat(),
        "hours_remaining": 72,
        "message": "Incident logged. DPA notification required within 72 hours.",
    }


@router.get("/incidents")
async def list_incidents(
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    q = (
        select(BreachIncident)
        .order_by(BreachIncident.discovered_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if status:
        q = q.where(BreachIncident.status == status)
    rows = (await db.execute(q)).scalars().all()
    return {"total": len(rows), "incidents": [_serialize(r) for r in rows]}


@router.get("/incidents/{incident_id}")
async def get_incident(
    incident_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    incident = await _get_or_404(db, incident_id)
    return _serialize(incident)


@router.patch("/incidents/{incident_id}")
async def update_incident(
    incident_id: UUID,
    body: IncidentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    incident = await _get_or_404(db, incident_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(incident, field, value)
    if body.status == BreachStatus.CLOSED:
        incident.closed_at = datetime.utcnow()
    incident.updated_at = datetime.utcnow()
    await db.commit()
    return _serialize(incident)


@router.post("/incidents/{incident_id}/notify-dpa")
async def notify_dpa(
    incident_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send GDPR Art. 33 notification email to all relevant DPAs."""
    _require_admin(current_user)
    incident = await _get_or_404(db, incident_id)

    if incident.dpa_notified_at:
        return {
            "status": "already_notified",
            "notified_at": incident.dpa_notified_at.isoformat(),
        }

    sent_to: List[str] = []
    failed: List[str] = []
    for jurisdiction in (incident.jurisdictions or ["gdpr_eu"]):
        dpa_email = DPA_CONTACTS.get(jurisdiction)
        if not dpa_email:
            logger.warning(f"No DPA contact configured for jurisdiction '{jurisdiction}'")
            continue
        ok = await send_dpa_breach_notification(
            dpa_email=dpa_email,
            incident_id=str(incident.id),
            discovered_at=incident.discovered_at.isoformat(),
            severity=incident.severity,
            description=incident.description,
            data_categories=incident.data_categories or [],
            affected_count=incident.affected_user_count,
            jurisdictions=incident.jurisdictions or [],
        )
        (sent_to if ok else failed).append(jurisdiction)

    if sent_to:
        incident.dpa_notified_at = datetime.utcnow()
        incident.updated_at = datetime.utcnow()
        await db.commit()

    return {
        "notified_jurisdictions": sent_to,
        "failed_jurisdictions": failed,
        "notified_at": incident.dpa_notified_at.isoformat() if incident.dpa_notified_at else None,
    }


@router.post("/incidents/{incident_id}/notify-users")
async def notify_users(
    incident_id: UUID,
    body: NotifyUsersRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Batch-email affected users per GDPR Art. 34."""
    _require_admin(current_user)
    incident = await _get_or_404(db, incident_id)

    if incident.users_notified_at:
        return {"status": "already_notified", "count": incident.users_notified_count}

    # Fetch active users (scope to actually affected users in production)
    users = (await db.execute(text(
        "SELECT email FROM users WHERE is_active = true AND deleted_at IS NULL LIMIT 10000"
    ))).fetchall()

    sent = 0
    for (email,) in users:
        if not email:
            continue
        try:
            ok = await send_user_breach_notification(
                to=email,
                incident_id=str(incident.id),
                data_categories=incident.data_categories or [],
                description_for_users=body.description_for_users,
                recommended_actions=body.recommended_actions,
            )
            if ok:
                sent += 1
        except Exception as exc:
            logger.error(f"Failed to notify user {email}: {exc}")

    incident.users_notified_at = datetime.utcnow()
    incident.users_notified_count = sent
    incident.updated_at = datetime.utcnow()
    await db.commit()

    return {"status": "sent", "notified_count": sent}


@router.get("/incidents/{incident_id}/timeline")
async def get_timeline(
    incident_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    incident = await _get_or_404(db, incident_id)

    events = []
    events.append({
        "time": incident.discovered_at.isoformat(),
        "event": "Breach discovered",
        "actor": incident.reported_by,
    })
    if incident.dpa_notified_at:
        hours = (incident.dpa_notified_at - incident.discovered_at).total_seconds() / 3600
        events.append({
            "time": incident.dpa_notified_at.isoformat(),
            "event": f"DPA notified ({hours:.1f}h after discovery)",
            "actor": "system",
        })
    if incident.users_notified_at:
        events.append({
            "time": incident.users_notified_at.isoformat(),
            "event": f"Users notified ({incident.users_notified_count} emails)",
            "actor": "system",
        })
    if incident.closed_at:
        events.append({
            "time": incident.closed_at.isoformat(),
            "event": "Incident closed",
            "actor": "admin",
        })

    hours_to_deadline = None
    if incident.dpa_deadline and not incident.dpa_notified_at:
        hours_to_deadline = (incident.dpa_deadline - datetime.utcnow()).total_seconds() / 3600

    return {
        "incident_id": str(incident.id),
        "status": incident.status,
        "severity": incident.severity,
        "dpa_deadline": incident.dpa_deadline.isoformat() if incident.dpa_deadline else None,
        "hours_until_dpa_deadline": round(hours_to_deadline, 1) if hours_to_deadline is not None else None,
        "dpa_overdue": hours_to_deadline is not None and hours_to_deadline < 0,
        "timeline": sorted(events, key=lambda e: e["time"]),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_or_404(db: AsyncSession, incident_id: UUID) -> BreachIncident:
    row = (
        await db.execute(
            select(BreachIncident).where(BreachIncident.id == incident_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Incident not found")
    return row


def _serialize(i: BreachIncident) -> dict:
    now = datetime.utcnow()
    hours_remaining = None
    if i.dpa_deadline and not i.dpa_notified_at:
        hours_remaining = round((i.dpa_deadline - now).total_seconds() / 3600, 1)
    return {
        "id": str(i.id),
        "discovered_at": i.discovered_at.isoformat(),
        "reported_by": i.reported_by,
        "description": i.description,
        "severity": i.severity,
        "status": i.status,
        "data_categories": i.data_categories,
        "jurisdictions": i.jurisdictions,
        "affected_user_count": i.affected_user_count,
        "dpa_deadline": i.dpa_deadline.isoformat() if i.dpa_deadline else None,
        "dpa_notified_at": i.dpa_notified_at.isoformat() if i.dpa_notified_at else None,
        "dpa_overdue": hours_remaining is not None and hours_remaining < 0,
        "hours_until_dpa_deadline": hours_remaining,
        "user_notification_required": i.user_notification_required,
        "users_notified_at": i.users_notified_at.isoformat() if i.users_notified_at else None,
        "users_notified_count": i.users_notified_count,
        "created_at": i.created_at.isoformat(),
    }
