# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Data Protection Impact Assessment (DPIA) generator — GDPR Art. 35.

Generates a structured DPIA for an organisation from its configured privacy
jurisdictions and the data categories this product processes, then STORES it so
there's an auditable record (Art. 35 requires the DPIA to be documented and kept
under review).

Routes:
  POST /api/v1/privacy/dpia/generate   → build + store a DPIA for the caller's org
  GET  /api/v1/privacy/dpia            → list stored DPIAs for the caller's org
  GET  /api/v1/privacy/dpia/{id}       → fetch one stored DPIA (full JSON)

Storage table is created on first use (CREATE TABLE IF NOT EXISTS) to match the
project's existing inline-migration style.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.database import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/privacy/dpia", tags=["privacy-dpia"])


_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS privacy_impact_assessments (
    id            UUID PRIMARY KEY,
    org_id        UUID,
    generated_by  UUID,
    version       INTEGER NOT NULL DEFAULT 1,
    jurisdictions JSONB   NOT NULL DEFAULT '[]'::jsonb,
    content       JSONB   NOT NULL,
    risk_level    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"""


async def _ensure_table(db: AsyncSession) -> None:
    await db.execute(text(_CREATE_TABLE))


# ── The data-processing inventory this product performs ────────────────────────
# This is the factual basis of the DPIA. Keep it in sync with what the app
# actually collects. Each entry: what, why, category, whether it's high-risk.
_PROCESSING_ACTIVITIES: List[Dict[str, Any]] = [
    {"activity": "Account identity (name, email)", "purpose": "Authentication and communication",
     "category": "identity", "special_category": False, "children": True},
    {"activity": "Student learning evidence (text, audio, photo, video)",
     "purpose": "Formative assessment and teacher review", "category": "educational",
     "special_category": False, "children": True},
    {"activity": "Geolocation of field activities (GPS)",
     "purpose": "Outdoor/peripatetic activity mapping for teachers", "category": "location",
     "special_category": False, "children": True, "high_risk": True},
    {"activity": "Audio recordings / transcription",
     "purpose": "Spoken-response capture and ASR", "category": "biometric_adjacent",
     "special_category": False, "children": True, "high_risk": True},
    {"activity": "Parental consent records", "purpose": "COPPA/GDPR lawful basis for minors",
     "category": "consent", "special_category": False, "children": True},
    {"activity": "AI-assisted assessment (LLM inference)",
     "purpose": "Suggested feedback and standards mapping", "category": "educational",
     "special_category": False, "children": True, "high_risk": True,
     "processors": ["Anthropic", "OpenAI", "self-hosted Ollama"]},
]


def _build_dpia(org_row: Dict[str, Any], jurisdictions: List[str]) -> Dict[str, Any]:
    """Assemble the DPIA content from the org context + processing inventory."""
    high_risk = [a for a in _PROCESSING_ACTIVITIES if a.get("high_risk")]
    processes_children = any(a.get("children") for a in _PROCESSING_ACTIVITIES)

    # Necessity/proportionality + risk narrative, keyed to Art. 35(7).
    risks: List[Dict[str, str]] = []
    if any("location" == a["category"] for a in _PROCESSING_ACTIVITIES):
        risks.append({
            "risk": "Location data of minors could reveal home/school patterns.",
            "likelihood": "medium", "severity": "high",
            "mitigation": "GPS is opt-in per activity via verifiable parental consent; "
                          "coordinates are field-level encrypted; retention minimised; "
                          "raw location excluded from parent/student views.",
        })
    if any(a["category"] == "biometric_adjacent" for a in _PROCESSING_ACTIVITIES):
        risks.append({
            "risk": "Audio recordings may incidentally capture third parties.",
            "likelihood": "medium", "severity": "medium",
            "mitigation": "Recordings scoped to the student, streamed via short-lived signed "
                          "tokens, encrypted at rest, deleted per retention policy.",
        })
    risks.append({
        "risk": "Third-party AI processors receive student-derived text.",
        "likelihood": "medium", "severity": "medium",
        "mitigation": "DPAs/SCCs with each processor; self-hosted Ollama option keeps data "
                      "on-prem; no training on customer data; PII minimised before inference.",
    })
    if processes_children:
        risks.append({
            "risk": "Processing personal data of children under 13/16.",
            "likelihood": "high", "severity": "high",
            "mitigation": "Students cannot self-register; under-13 accounts gated on verifiable "
                          "parental consent (single-use signed token); no behavioural advertising; "
                          "short retention; strictest-wins jurisdiction merge.",
        })

    overall = "high" if (high_risk or processes_children) else "medium"

    return {
        "title": "Data Protection Impact Assessment",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "organisation": {
            "id": org_row.get("id"),
            "name": org_row.get("name"),
            "country_code": org_row.get("country_code"),
        },
        "applicable_jurisdictions": jurisdictions,
        "legal_basis": "GDPR Art. 6(1)(e)/(f) and Art. 9 where applicable; parental consent "
                       "(Art. 8) for minors; FERPA 'school official' exception for US schools.",
        "processing_activities": _PROCESSING_ACTIVITIES,
        "necessity_and_proportionality": (
            "Each category is limited to what is required to deliver formative outdoor "
            "learning. Data minimisation, purpose limitation, and short retention are enforced "
            "by the privacy engine (strictest-wins across applicable jurisdictions)."
        ),
        "risks": risks,
        "overall_risk_level": overall,
        "review": {
            "requires_dpo": overall == "high",
            "next_review_due_days": 365,
            "status": "draft — review with counsel/DPO before relying on it",
        },
        "disclaimer": (
            "Auto-generated from the product's processing inventory and this org's configured "
            "jurisdictions. It is a starting point, not legal advice — have a DPO or counsel "
            "review and sign off before treating it as your Art. 35 record."
        ),
    }


@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def generate_dpia(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate and store a DPIA for the caller's organisation (admin/teacher)."""
    if current_user.role.upper() not in ("ADMIN", "TEACHER", "HOMESCHOOL"):
        raise HTTPException(status_code=403, detail="Admin, teacher, or homeschool access required")

    await _ensure_table(db)

    org_id = getattr(current_user, "org_id", None)
    org_row: Dict[str, Any] = {"id": str(org_id) if org_id else None}
    jurisdictions: List[str] = []
    if org_id:
        row = (await db.execute(text(
            "SELECT id, name, country_code, privacy_jurisdiction_ids "
            "FROM organizations WHERE id = :oid"
        ), {"oid": str(org_id)})).mappings().first()
        if row:
            org_row = {"id": str(row["id"]), "name": row.get("name"),
                       "country_code": row.get("country_code")}
            j = row.get("privacy_jurisdiction_ids")
            if j:
                jurisdictions = j if isinstance(j, list) else json.loads(j)

    content = _build_dpia(org_row, jurisdictions)

    # Version = count of prior DPIAs for this org + 1.
    prior = (await db.execute(text(
        "SELECT COALESCE(MAX(version), 0) FROM privacy_impact_assessments WHERE org_id = :oid"
    ), {"oid": str(org_id) if org_id else None})).scalar() or 0
    dpia_id = uuid.uuid4()

    await db.execute(text("""
        INSERT INTO privacy_impact_assessments
            (id, org_id, generated_by, version, jurisdictions, content, risk_level)
        VALUES
            (:id, :oid, :uid, :ver, CAST(:jur AS jsonb), CAST(:content AS jsonb), :risk)
    """), {
        "id": str(dpia_id),
        "oid": str(org_id) if org_id else None,
        "uid": str(current_user.id),
        "ver": prior + 1,
        "jur": json.dumps(jurisdictions),
        "content": json.dumps(content),
        "risk": content["overall_risk_level"],
    })
    await db.commit()

    return {"id": str(dpia_id), "version": prior + 1, "risk_level": content["overall_risk_level"],
            "dpia": content}


@router.get("")
async def list_dpias(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List stored DPIAs for the caller's org (metadata only)."""
    await _ensure_table(db)
    org_id = getattr(current_user, "org_id", None)
    rows = (await db.execute(text("""
        SELECT id, version, risk_level, jurisdictions, created_at
        FROM privacy_impact_assessments
        WHERE org_id = :oid OR (:oid IS NULL AND org_id IS NULL)
        ORDER BY version DESC
    """), {"oid": str(org_id) if org_id else None})).mappings().all()
    return {"dpias": [
        {"id": str(r["id"]), "version": r["version"], "risk_level": r["risk_level"],
         "jurisdictions": r["jurisdictions"],
         "created_at": r["created_at"].isoformat() if r["created_at"] else None}
        for r in rows
    ]}


@router.get("/{dpia_id}")
async def get_dpia(
    dpia_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch one stored DPIA (full content), scoped to the caller's org."""
    await _ensure_table(db)
    org_id = getattr(current_user, "org_id", None)
    row = (await db.execute(text("""
        SELECT id, org_id, version, content, created_at
        FROM privacy_impact_assessments WHERE id = :id
    """), {"id": dpia_id})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="DPIA not found")
    # Org-scope: only the owning org (or platform-level null-org) may read it.
    if row["org_id"] is not None and str(row["org_id"]) != str(org_id):
        raise HTTPException(status_code=403, detail="Access denied")
    return {"id": str(row["id"]), "version": row["version"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "dpia": row["content"]}
