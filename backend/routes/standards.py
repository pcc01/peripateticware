# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Standards API
=============

Type taxonomy
-------------
  state_standards   Official academic standards (TEKS, NGSS, Common Core, etc.).
                    Shared globally (is_global=TRUE when uploaded by admin/teacher).
                    One set per state per year — all roles reuse the same set.
                    Ollama extracts criteria once; SHA-256 checksum gates re-processing.
                    valid_until defaults to July 31 of the current school year.

  state_reporting   Homeschool annual reporting requirements (vary by state law).
                    Personal to a homeschool parent (is_global=FALSE) unless an admin
                    uploads a canonical version for a state (is_global=TRUE).
                    valid_until defaults to December 31 of the current calendar year.

  rubric            Teacher-created assessment rubric. No expiry (valid_until=NULL).

  custom            Any other user-defined criteria set. No expiry.

Expiry & cache
--------------
  valid_until DATE        When the set should be re-verified or re-uploaded.
  source_checksum         SHA-256 hex of the uploaded source file.  If a re-upload
                          matches the stored checksum, Ollama is skipped and the
                          cached criteria are returned immediately (cache hit).
  processing_status       pending | processing | complete | failed
  last_processed_at       Timestamp of last successful Ollama extraction.

Endpoints
---------
  POST /api/v1/standards/upload           Parse doc -> return criteria for review
  POST /api/v1/standards                  Save approved set
  GET  /api/v1/standards                  List sets (own + global)
  GET  /api/v1/standards/{id}             Get set + criteria
  PUT  /api/v1/standards/{id}             Update name/description/valid_until
  DELETE /api/v1/standards/{id}           Delete owned set
  POST /api/v1/standards/{id}/refresh     Re-upload source; checksum-gated re-extraction
  POST /api/v1/standards/{id}/map         Map activity to criterion
  GET  /api/v1/standards/{id}/coverage    Coverage report for a student
"""

import hashlib
import logging
import uuid
from datetime import date, datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.database import StandardsSet, ActivityStandardsMap, LearningSession
from models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/standards", tags=["standards"])

VALID_TYPES = {"state_standards", "state_reporting", "rubric", "custom"}
MAX_FILE_BYTES = 10 * 1024 * 1024


def _default_valid_until(set_type: str) -> Optional[date]:
    today = date.today()
    if set_type == "state_standards":
        candidate = date(today.year, 7, 31)
        return candidate if candidate >= today else date(today.year + 1, 7, 31)
    if set_type == "state_reporting":
        return date(today.year, 12, 31)
    return None


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CriterionIn(BaseModel):
    id: str
    code: str = ""
    subject: str = ""
    description: str = ""
    category: str = "General"
    required: bool = True
    weight: float = 1.0


class StandardsSetCreate(BaseModel):
    name: str
    description: str = ""
    type: str = "rubric"
    state_code: Optional[str] = None
    is_global: bool = False
    valid_until: Optional[date] = None
    criteria: list[CriterionIn]


class StandardsSetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    valid_until: Optional[date] = None


class MappingCreate(BaseModel):
    activity_id: str
    criterion_id: str
    coverage_level: str = "partial"
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------

def _serialize(s: StandardsSet, include_criteria: bool = False) -> dict:
    today = date.today()
    vu = getattr(s, 'valid_until', None)
    is_expired = bool(vu and vu < today)
    days_until = (vu - today).days if vu else None

    out = {
        "id":                str(s.id),
        "name":              s.name,
        "description":       s.description or "",
        "type":              s.type,
        "state_code":        s.state_code,
        "is_global":         s.is_global,
        "owner_id":          str(s.owner_id) if s.owner_id else None,
        "criteria_count":    len(s.criteria or []),
        "processing_status": getattr(s, 'processing_status', 'complete') or 'complete',
        "last_processed_at": s.last_processed_at.isoformat() if getattr(s, 'last_processed_at', None) else None,
        "valid_until":       vu.isoformat() if vu else None,
        "is_expired":        is_expired,
        "days_until_expiry": days_until,
        "created_at":        s.created_at.isoformat() if s.created_at else "",
    }
    if include_criteria:
        out["criteria"] = s.criteria or []
    return out


# ---------------------------------------------------------------------------
# Upload -> parse -> return for review
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_and_parse(
    file: UploadFile = File(...),
    set_type: str = Form("rubric"),
    name: str = Form(""),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a PDF or CSV. Ollama extracts criteria; returns them for review.
    Nothing is saved yet. Also returns the SHA-256 checksum for cache checking.
    """
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    if set_type not in VALID_TYPES:
        raise HTTPException(status_code=422, detail=f"set_type must be one of {sorted(VALID_TYPES)}")

    checksum = hashlib.sha256(file_bytes).hexdigest()

    try:
        from services.document_parser import parse_document
        from services.standards_parser import extract_criteria
        parsed   = await parse_document(file_bytes, file.filename or "upload", file.content_type)
        criteria = await extract_criteria(parsed.text, set_type=set_type, name=name)
        return {
            "criteria":   criteria,
            "checksum":   checksum,
            "warnings":   parsed.warnings,
            "method":     parsed.method,
            "page_count": parsed.page_count,
            "char_count": len(parsed.text),
        }
    except Exception as exc:
        logger.warning(f"Document parsing failed: {exc}")
        return {
            "criteria":   [],
            "checksum":   checksum,
            "warnings":   [str(exc)],
            "method":     "failed",
            "page_count": 0,
            "char_count": 0,
        }


# ---------------------------------------------------------------------------
# Save approved set
# ---------------------------------------------------------------------------

@router.post("", status_code=201)
async def create_standards_set(
    body: StandardsSetCreate,
    source_checksum: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.type not in VALID_TYPES:
        raise HTTPException(status_code=422, detail=f"type must be one of {sorted(VALID_TYPES)}")

    if body.is_global and current_user.role.upper() not in ("ADMIN", "TEACHER"):
        raise HTTPException(status_code=403, detail="Only admins/teachers can create global sets")

    # Cache check — same file already processed?
    if source_checksum:
        cached = (await db.execute(
            select(StandardsSet).where(
                StandardsSet.source_checksum == source_checksum,
                (StandardsSet.owner_id == current_user.id) | (StandardsSet.is_global == True),
            )
        )).scalar_one_or_none()
        if cached:
            logger.info(f"Cache hit for checksum {source_checksum[:8]}...")
            return {**_serialize(cached, include_criteria=True), "cache_hit": True}

    valid_until = body.valid_until or _default_valid_until(body.type)

    new_set = StandardsSet(
        id=uuid.uuid4(),
        name=body.name,
        description=body.description,
        type=body.type,
        owner_id=current_user.id,
        state_code=body.state_code,
        is_global=body.is_global,
        source_checksum=source_checksum,
        processing_status="complete",
        last_processed_at=datetime.utcnow(),
        valid_until=valid_until,
        criteria=[c.dict() for c in body.criteria],
    )
    db.add(new_set)
    await db.commit()
    await db.refresh(new_set)
    return {**_serialize(new_set, include_criteria=True), "cache_hit": False}


# ---------------------------------------------------------------------------
# List sets
# ---------------------------------------------------------------------------

@router.get("")
async def list_standards_sets(
    type: Optional[str] = Query(None),
    state_code: Optional[str] = Query(None),
    include_expired: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(StandardsSet).where(
        (StandardsSet.owner_id == current_user.id) | (StandardsSet.is_global == True)
    )
    if type:
        q = q.where(StandardsSet.type == type)
    if state_code:
        q = q.where(StandardsSet.state_code == state_code.upper())
    q = q.order_by(StandardsSet.is_global.desc(), StandardsSet.created_at.desc())

    rows = (await db.execute(q)).scalars().all()
    today = date.today()
    result = []
    for s in rows:
        vu = getattr(s, 'valid_until', None)
        if not include_expired and vu and vu < today:
            continue
        result.append(_serialize(s))
    return result


# ---------------------------------------------------------------------------
# Get single set
# ---------------------------------------------------------------------------

@router.get("/{set_id}")
async def get_standards_set(
    set_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_set(set_id, current_user, db)
    return _serialize(s, include_criteria=True)


# ---------------------------------------------------------------------------
# Update metadata
# ---------------------------------------------------------------------------

@router.put("/{set_id}")
async def update_standards_set(
    set_id: UUID,
    body: StandardsSetUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_set(set_id, current_user, db)
    if str(s.owner_id) != str(current_user.id) and current_user.role.upper() != "ADMIN":
        raise HTTPException(status_code=403, detail="Cannot update this set")
    if body.name is not None:
        s.name = body.name
    if body.description is not None:
        s.description = body.description
    if body.valid_until is not None:
        s.valid_until = body.valid_until
    s.updated_at = datetime.utcnow()
    await db.commit()
    return _serialize(s)


# ---------------------------------------------------------------------------
# Refresh (checksum-gated re-extraction)
# ---------------------------------------------------------------------------

@router.post("/{set_id}/refresh")
async def refresh_standards_set(
    set_id: UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Re-upload a source file to refresh an existing set.

    Cache hit  (same SHA-256): criteria unchanged; valid_until extended; Ollama skipped.
    Cache miss (new file)    : Ollama re-processes; criteria + last_processed_at updated.
    """
    s = await _get_set(set_id, current_user, db)
    if str(s.owner_id) != str(current_user.id) and current_user.role.upper() != "ADMIN":
        raise HTTPException(status_code=403, detail="Cannot refresh this set")

    file_bytes   = await file.read()
    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    new_checksum    = hashlib.sha256(file_bytes).hexdigest()
    stored_checksum = getattr(s, 'source_checksum', None)

    if stored_checksum and new_checksum == stored_checksum:
        s.valid_until = _default_valid_until(s.type)
        s.updated_at  = datetime.utcnow()
        await db.commit()
        return {
            **_serialize(s, include_criteria=True),
            "cache_hit": True,
            "message":   "File unchanged — cached criteria kept; validity window extended.",
        }

    # Cache miss — re-extract
    s.processing_status = "pending"
    s.source_checksum   = new_checksum
    s.updated_at        = datetime.utcnow()
    await db.commit()

    try:
        from services.document_parser import parse_document
        from services.standards_parser import extract_criteria
        parsed   = await parse_document(file_bytes, file.filename or "upload", file.content_type)
        criteria = await extract_criteria(parsed.text, set_type=s.type, name=s.name)
        s.criteria          = criteria
        s.processing_status = "complete"
        s.last_processed_at = datetime.utcnow()
        s.valid_until       = _default_valid_until(s.type)
        s.updated_at        = datetime.utcnow()
        await db.commit()
        return {
            **_serialize(s, include_criteria=True),
            "cache_hit": False,
            "message":   f"Re-processed successfully. {len(criteria)} criteria extracted.",
        }
    except Exception as exc:
        s.processing_status = "failed"
        await db.commit()
        logger.error(f"Refresh failed for {set_id}: {exc}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {exc}")


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

@router.delete("/{set_id}", status_code=204)
async def delete_standards_set(
    set_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s = await _get_set(set_id, current_user, db)
    if str(s.owner_id) != str(current_user.id) and current_user.role.upper() != "ADMIN":
        raise HTTPException(status_code=403, detail="Cannot delete this set")
    await db.delete(s)
    await db.commit()


# ---------------------------------------------------------------------------
# Map activity -> criterion
# ---------------------------------------------------------------------------

@router.post("/{set_id}/map", status_code=201)
async def map_activity_to_criterion(
    set_id: UUID,
    body: MappingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_set(set_id, current_user, db)
    existing = (await db.execute(
        select(ActivityStandardsMap).where(
            ActivityStandardsMap.activity_id      == UUID(body.activity_id),
            ActivityStandardsMap.standards_set_id == set_id,
            ActivityStandardsMap.criterion_id     == body.criterion_id,
        )
    )).scalar_one_or_none()

    if existing:
        existing.coverage_level = body.coverage_level
        existing.notes          = body.notes
    else:
        db.add(ActivityStandardsMap(
            activity_id      = UUID(body.activity_id),
            standards_set_id = set_id,
            criterion_id     = body.criterion_id,
            coverage_level   = body.coverage_level,
            notes            = body.notes,
            mapped_by        = current_user.id,
        ))
    await db.commit()
    return {"status": "mapped"}


# ---------------------------------------------------------------------------
# Coverage report
# ---------------------------------------------------------------------------

@router.get("/{set_id}/coverage")
async def get_coverage(
    set_id: UUID,
    student_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s      = await _get_set(set_id, current_user, db)
    target = UUID(student_id) if student_id else current_user.id

    maps = (await db.execute(
        select(ActivityStandardsMap).where(ActivityStandardsMap.standards_set_id == set_id)
    )).scalars().all()

    completed_ids = {
        str(r) for r in (await db.execute(
            select(LearningSession.activity_id).where(
                LearningSession.user_id == target,
                LearningSession.status  == "completed",
            )
        )).scalars().all()
    }

    criteria = s.criteria or []
    coverage = {}
    for c in criteria:
        cid      = c.get("id") or c.get("code", "")
        relevant = [m for m in maps if m.criterion_id == cid and str(m.activity_id) in completed_ids]
        coverage[cid] = {
            "criterion":       c,
            "times_addressed": len(relevant),
            "best_level":      _best_level(relevant),
            "met":             len(relevant) > 0,
        }

    total = len(criteria)
    met   = sum(1 for v in coverage.values() if v["met"])
    today = date.today()
    vu    = getattr(s, 'valid_until', None)

    return {
        "standards_set_id":   str(set_id),
        "standards_set_name": s.name,
        "is_expired":         bool(vu and vu < today),
        "valid_until":        vu.isoformat() if vu else None,
        "student_id":         str(target),
        "total_criteria":     total,
        "criteria_met":       met,
        "percent_complete":   round(met / total * 100) if total else 0,
        "coverage":           coverage,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_set(set_id: UUID, user: User, db: AsyncSession) -> StandardsSet:
    result = await db.execute(
        select(StandardsSet).where(
            StandardsSet.id == set_id,
            (StandardsSet.owner_id == user.id) | (StandardsSet.is_global == True),
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Standards set not found")
    return s


_LEVEL_ORDER = {"partial": 1, "full": 2, "exceeds": 3}

def _best_level(maps: list) -> Optional[str]:
    if not maps:
        return None
    return max((m.coverage_level for m in maps), key=lambda l: _LEVEL_ORDER.get(l, 0))
