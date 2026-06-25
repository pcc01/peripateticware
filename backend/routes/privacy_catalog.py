# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Privacy Regulation Catalog API — 6 endpoints
  GET    /api/v1/privacy-catalog/              → list all active regulations (teacher+)
  POST   /api/v1/privacy-catalog/              → add a regulation to the catalog (teacher+)
  GET    /api/v1/privacy-catalog/my-assignments → current user's assigned regulations (teacher+)
  GET    /api/v1/privacy-catalog/{catalog_id}  → single regulation detail (teacher+)
  POST   /api/v1/privacy-catalog/{catalog_id}/assign   → assign regulation (teacher+)
  DELETE /api/v1/privacy-catalog/{catalog_id}/assign   → unassign regulation (teacher+)
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.user import User
from services import privacy_catalog_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/privacy-catalog",
    tags=["privacy-catalog"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Auth helper
# ─────────────────────────────────────────────────────────────────────────────

def _require_admin_or_teacher(user: User) -> None:
    if user.role.upper() not in ("ADMIN", "TEACHER"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher or admin access required",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────────────────────────────────────

class AddCatalogEntryRequest(BaseModel):
    short_name:       str
    full_name:        str
    jurisdiction_code: str
    framework:        str = "custom"
    region:           Optional[str]       = None
    summary:          Optional[str]       = None
    country_codes:    Optional[List[str]] = None
    key_requirements: Optional[List[str]] = None
    applies_to:       Optional[List[str]] = None
    age_threshold:    Optional[int]       = None
    is_child_safety:  bool                = False
    is_featured:      bool                = False
    source_url:       Optional[str]       = None
    effective_date:   Optional[str]       = None  # "YYYY-MM-DD"
    rule_id:          Optional[str]       = None


class AssignRequest(BaseModel):
    notes: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Helper: resolve org_id for the current user
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_org_id(user: User) -> str | None:
    """
    Return the user's primary_org_id as a string, or None for solo teachers.
    primary_org_id was added in migration 20260607_org_jurisdiction.
    """
    org = getattr(user, "primary_org_id", None) or getattr(user, "org_id", None)
    return str(org) if org else None


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v1/privacy-catalog/
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[Dict[str, Any]])
async def list_catalog(
    framework:     Optional[str]  = Query(None, description="Filter by framework (e.g. gdpr, coppa)"),
    region:        Optional[str]  = Query(None, description="Filter by region (substring match)"),
    search:        Optional[str]  = Query(None, description="Search short_name, full_name, summary"),
    featured_only: bool           = Query(False, description="Only return featured regulations"),
    db:            AsyncSession   = Depends(get_db),
    current_user:  User           = Depends(get_current_user),
):
    """List all active privacy regulations in the catalog."""
    return await privacy_catalog_service.list_catalog(
        db,
        framework=framework,
        region=region,
        search=search,
        featured_only=featured_only,
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/v1/privacy-catalog/
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED, response_model=Dict[str, Any])
async def add_catalog_entry(
    body:         AddCatalogEntryRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Add a new regulation to the shared catalog. Admin or Teacher only."""
    _require_admin_or_teacher(current_user)
    role = current_user.role.lower()
    try:
        entry = await privacy_catalog_service.add_catalog_entry(
            db,
            data=body.model_dump(),
            added_by_user_id=str(current_user.id),
            added_by_role=role,
        )
    except Exception as exc:
        logger.error("Failed to add catalog entry: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    return entry


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v1/privacy-catalog/my-assignments
# NOTE: this route must be declared BEFORE /{catalog_id} to avoid being
#       captured as a path param.
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/my-assignments", response_model=List[Dict[str, Any]])
async def get_my_assignments(
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Return the current user's assigned regulations."""
    _require_admin_or_teacher(current_user)
    org_id = _resolve_org_id(current_user)
    return await privacy_catalog_service.get_my_assignments(
        db,
        user_id=str(current_user.id),
        org_id=org_id,
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v1/privacy-catalog/{catalog_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{catalog_id}", response_model=Dict[str, Any])
async def get_catalog_entry(
    catalog_id:   str,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Return a single catalog entry by ID."""
    entry = await privacy_catalog_service.get_catalog_entry(db, catalog_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Catalog entry {catalog_id!r} not found",
        )
    return entry


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/v1/privacy-catalog/{catalog_id}/assign
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{catalog_id}/assign", response_model=Dict[str, Any])
async def assign_regulation(
    catalog_id:   str,
    body:         AssignRequest  = AssignRequest(),
    db:           AsyncSession   = Depends(get_db),
    current_user: User           = Depends(get_current_user),
):
    """Assign a catalog regulation to the current user (or their org)."""
    _require_admin_or_teacher(current_user)
    org_id = _resolve_org_id(current_user)
    try:
        result = await privacy_catalog_service.assign_regulation(
            db,
            catalog_id=catalog_id,
            user_id=str(current_user.id),
            org_id=org_id,
            notes=body.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return result


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /api/v1/privacy-catalog/{catalog_id}/assign
# ─────────────────────────────────────────────────────────────────────────────

@router.delete("/{catalog_id}/assign", response_model=Dict[str, Any])
async def unassign_regulation(
    catalog_id:   str,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Remove a regulation assignment for the current user (or their org)."""
    _require_admin_or_teacher(current_user)
    org_id = _resolve_org_id(current_user)
    removed = await privacy_catalog_service.unassign_regulation(
        db,
        catalog_id=catalog_id,
        user_id=str(current_user.id),
        org_id=org_id,
    )
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )
    return {"status": "unassigned"}
