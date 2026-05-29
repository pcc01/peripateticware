# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Privacy API — 8 endpoints
  GET  /api/v1/privacy/status           → compliance status, active rule count
  GET  /api/v1/privacy/jurisdictions    → list active JurisdictionConfigs (admin)
  GET  /api/v1/privacy/rules/{rule_id}  → single rule + version history (admin)
  POST /api/v1/privacy/rules            → upsert rule JSON (admin)
  GET  /api/v1/privacy/audit-log        → paginated audit trail (admin)
  GET  /api/v1/privacy/audit-log/export → CSV export (admin)
  POST /api/v1/privacy/check            → ad-hoc compliance check (teacher+)
  DELETE /api/v1/privacy/consent/{student_hash} → withdraw all consents (admin)
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.user import User
from models.compliance import ComplianceRule, RuleAuditLog, ConsentRecord
from services.privacy_engine import (
    _get_cached_rules,
    invalidate_rules_cache,
    get_audit_trail,
    hash_student_id,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/privacy",
    tags=["privacy"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Auth helpers
# ─────────────────────────────────────────────────────────────────────────────

def _require_admin(user: User) -> None:
    if user.role.upper() != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


def _require_teacher_or_admin(user: User) -> None:
    if user.role.upper() not in ("TEACHER", "ADMIN"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teacher or admin access required")


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas (route-level, no separate schemas file needed)
# ─────────────────────────────────────────────────────────────────────────────

class RuleUpsertRequest(BaseModel):
    rule_id:        str
    regulation_id:  str
    version:        str
    jurisdiction:   str
    effective_date: datetime
    rule_definition: Dict[str, Any]
    sunset_date:    Optional[datetime] = None
    change_log:     Optional[str]      = None
    previous_version_id: Optional[str] = None


class ComplianceCheckRequest(BaseModel):
    student_age:    int
    data_categories: List[str]
    jurisdiction_id: Optional[str] = None
    purpose:        Optional[str]  = "lesson_delivery"


# ─────────────────────────────────────────────────────────────────────────────
# GET /status  — public
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/status")
async def get_privacy_status(db: AsyncSession = Depends(get_db)):
    """
    Returns overall compliance status and count of active rules.
    Public endpoint — no authentication required.
    """
    try:
        result = await db.execute(
            select(ComplianceRule).where(ComplianceRule.is_active == True)
        )
        active_rules = result.scalars().all()

        latest_update = max(
            (r.created_at for r in active_rules if r.created_at),
            default=None,
        )

        jurisdictions = list({r.jurisdiction for r in active_rules})

        return {
            "status":            "active",
            "active_rules_count": len(active_rules),
            "jurisdictions":     jurisdictions,
            "last_updated":      latest_update.isoformat() if latest_update else None,
            "frameworks_enforced": list({
                r.rule_definition.get("framework", "unknown")
                for r in active_rules
                if isinstance(r.rule_definition, dict)
            }),
        }
    except Exception as exc:
        logger.error(f"GET /privacy/status error: {exc}")
        return {"status": "degraded", "error": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# GET /jurisdictions  — admin only
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/jurisdictions")
async def list_jurisdictions(
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    _require_admin(current_user)

    result = await db.execute(
        select(ComplianceRule).where(ComplianceRule.is_active == True)
    )
    rows = result.scalars().all()

    return [
        {
            "rule_id":        r.rule_id,
            "regulation_id":  r.regulation_id,
            "version":        r.version,
            "jurisdiction":   r.jurisdiction,
            "effective_date": r.effective_date.isoformat() if r.effective_date else None,
            "sunset_date":    r.sunset_date.isoformat() if r.sunset_date else None,
            "framework":      r.rule_definition.get("framework") if isinstance(r.rule_definition, dict) else None,
            "created_at":     r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# ─────────────────────────────────────────────────────────────────────────────
# GET /rules/{rule_id}  — admin only
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/rules/{rule_id}")
async def get_rule(
    rule_id:      str,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    _require_admin(current_user)

    result = await db.execute(
        select(ComplianceRule).where(ComplianceRule.rule_id == rule_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Rule {rule_id!r} not found")

    # Collect version history by walking previous_version_id chain
    history = []
    current = row
    for _ in range(50):  # guard against infinite loops
        if not current.previous_version_id:
            break
        prev_result = await db.execute(
            select(ComplianceRule).where(ComplianceRule.rule_id == current.previous_version_id)
        )
        prev = prev_result.scalar_one_or_none()
        if not prev:
            break
        history.append({
            "rule_id":    prev.rule_id,
            "version":    prev.version,
            "created_at": prev.created_at.isoformat() if prev.created_at else None,
            "change_log": prev.change_log,
        })
        current = prev

    return {
        "rule_id":           row.rule_id,
        "regulation_id":     row.regulation_id,
        "version":           row.version,
        "jurisdiction":      row.jurisdiction,
        "effective_date":    row.effective_date.isoformat() if row.effective_date else None,
        "sunset_date":       row.sunset_date.isoformat() if row.sunset_date else None,
        "rule_definition":   row.rule_definition,
        "created_by":        row.created_by,
        "created_at":        row.created_at.isoformat() if row.created_at else None,
        "change_log":        row.change_log,
        "is_active":         row.is_active,
        "audit_hash":        row.audit_hash,
        "version_history":   history,
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /rules  — admin only
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/rules", status_code=status.HTTP_201_CREATED)
async def upsert_rule(
    body:         RuleUpsertRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    _require_admin(current_user)

    # Compute audit hash over the rule definition JSON
    rule_json = json.dumps(body.rule_definition, sort_keys=True)
    audit_hash = hashlib.sha256(rule_json.encode()).hexdigest()

    # Deactivate any existing active rule for the same jurisdiction+regulation
    existing_result = await db.execute(
        select(ComplianceRule).where(
            and_(
                ComplianceRule.regulation_id == body.regulation_id,
                ComplianceRule.jurisdiction  == body.jurisdiction,
                ComplianceRule.is_active     == True,
            )
        )
    )
    existing = existing_result.scalar_one_or_none()
    previous_version_id = None
    if existing and existing.rule_id != body.rule_id:
        existing.is_active = False
        previous_version_id = existing.rule_id
        await db.flush()

    new_rule = ComplianceRule(
        rule_id             = body.rule_id,
        regulation_id       = body.regulation_id,
        version             = body.version,
        jurisdiction        = body.jurisdiction,
        effective_date      = body.effective_date,
        sunset_date         = body.sunset_date,
        rule_definition     = body.rule_definition,
        created_by          = current_user.email,
        created_at          = datetime.now(timezone.utc),
        previous_version_id = body.previous_version_id or previous_version_id,
        change_log          = body.change_log,
        is_active           = True,
        audit_hash          = audit_hash,
    )
    db.add(new_rule)
    await db.commit()

    # Invalidate the Redis cache so the service picks up the new rule immediately
    await invalidate_rules_cache()

    return {"status": "created", "rule_id": new_rule.rule_id, "audit_hash": audit_hash}


# ─────────────────────────────────────────────────────────────────────────────
# GET /audit-log  — admin only
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/audit-log")
async def get_audit_log(
    limit:             int           = Query(50, ge=1, le=500),
    offset:            int           = Query(0, ge=0),
    student_id_hash:   Optional[str] = Query(None),
    compliance_status: Optional[str] = Query(None),
    actor_role:        Optional[str] = Query(None),
    from_dt:           Optional[datetime] = Query(None),
    to_dt:             Optional[datetime] = Query(None),
    db:                AsyncSession  = Depends(get_db),
    current_user:      User          = Depends(get_current_user),
):
    _require_admin(current_user)

    rows, total = await get_audit_trail(
        db=db,
        limit=limit,
        offset=offset,
        student_id_hash=student_id_hash,
        compliance_status=compliance_status,
        actor_role=actor_role,
        from_dt=from_dt,
        to_dt=to_dt,
    )

    return {
        "total":  total,
        "limit":  limit,
        "offset": offset,
        "items":  rows,
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /audit-log/export  — admin only  (CSV)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/audit-log/export")
async def export_audit_log(
    compliance_status: Optional[str] = Query(None),
    from_dt:           Optional[datetime] = Query(None),
    to_dt:             Optional[datetime] = Query(None),
    db:                AsyncSession  = Depends(get_db),
    current_user:      User          = Depends(get_current_user),
):
    _require_admin(current_user)

    rows, _ = await get_audit_trail(
        db=db,
        limit=10_000,  # generous cap for export
        offset=0,
        compliance_status=compliance_status,
        from_dt=from_dt,
        to_dt=to_dt,
    )

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "id", "timestamp", "action", "data_type",
            "actor_role", "compliance_status",
            "student_id_hash", "actor_id",
            "rules_applied", "enforcement_actions", "jurisdiction_ids", "notes",
        ],
    )
    writer.writeheader()
    for row in rows:
        # Flatten JSONB fields to strings for CSV
        row["rules_applied"]       = json.dumps(row.get("rules_applied") or [])
        row["enforcement_actions"] = json.dumps(row.get("enforcement_actions") or {})
        row["jurisdiction_ids"]    = json.dumps(row.get("jurisdiction_ids") or [])
        writer.writerow(row)

    output.seek(0)
    filename = f"audit_log_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /check  — teacher or admin
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/check")
async def check_compliance(
    body:         ComplianceCheckRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    _require_teacher_or_admin(current_user)

    configs = await _get_cached_rules(db)
    jurisdiction_id = body.jurisdiction_id

    if jurisdiction_id and jurisdiction_id not in configs:
        raise HTTPException(status_code=404, detail=f"Jurisdiction {jurisdiction_id!r} not found")

    issues: List[str] = []
    warnings: List[str] = []

    if jurisdiction_id:
        cfg = configs[jurisdiction_id]
        # COPPA age gate
        if body.student_age < 13 and cfg.framework.value == "coppa":
            if any(c.upper() in ("BEHAVIORAL", "LOCATION") for c in body.data_categories):
                issues.append("COPPA: Cannot collect behavioral/location data from under-13 students")
        # GDPR special category
        if body.student_age < 16 and cfg.framework.value == "gdpr":
            if "SPECIAL" in [c.upper() for c in body.data_categories]:
                issues.append("GDPR: Parental consent required for special-category data under 16")
        # Data sharing warning
        if not cfg.student_data_sharing_allowed and body.purpose not in ("lesson_delivery", "grading"):
            warnings.append(f"Jurisdiction {jurisdiction_id} restricts student data sharing for purpose '{body.purpose}'")

    return {
        "compliant":       len(issues) == 0,
        "jurisdiction_id": jurisdiction_id,
        "issues":          issues,
        "warnings":        warnings,
    }


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /consent/{student_hash}  — admin only (GDPR right to erasure)
# ─────────────────────────────────────────────────────────────────────────────

@router.delete("/consent/{student_hash}", status_code=status.HTTP_200_OK)
async def withdraw_consents(
    student_hash: str,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    _require_admin(current_user)

    result = await db.execute(
        select(ConsentRecord).where(
            and_(
                ConsentRecord.student_id_hash == student_hash,
                ConsentRecord.is_active       == True,
            )
        )
    )
    records = result.scalars().all()

    now = datetime.now(timezone.utc)
    count = 0
    for rec in records:
        rec.is_active    = False
        rec.withdrawn_at = now
        count += 1

    await db.commit()

    return {
        "status":   "withdrawn",
        "student_hash": student_hash,
        "records_withdrawn": count,
        "withdrawn_at": now.isoformat(),
    }
