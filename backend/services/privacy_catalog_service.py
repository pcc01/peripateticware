# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Privacy Regulation Catalog Service
===================================
Service layer for the user-facing privacy regulation catalog.
Reads from and writes to:
  - privacy_regulation_catalog
  - school_regulation_assignments
  - user_regulation_assignments

Redis cache keys:
  - "privacy:catalog:list"            TTL 3600s — full catalog list
  - "privacy:assignments:{user_id}"   TTL 300s  — per-user assignments
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select, insert, delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from core import cache as redis_cache
from models.compliance import (
    PrivacyRegulationCatalog,
    SchoolRegulationAssignment,
    UserRegulationAssignment,
)

logger = logging.getLogger(__name__)

_CATALOG_CACHE_KEY = "privacy:catalog:list"
_CATALOG_TTL = 3600       # 1 hour
_ASSIGNMENTS_TTL = 300    # 5 minutes


# ─────────────────────────────────────────────────────────────────────────────
# Serialisation helpers
# ─────────────────────────────────────────────────────────────────────────────

def _catalog_to_dict(row: PrivacyRegulationCatalog) -> dict:
    return {
        "id":               str(row.id),
        "rule_id":          row.rule_id,
        "short_name":       row.short_name,
        "full_name":        row.full_name,
        "jurisdiction_code": row.jurisdiction_code,
        "subdivision_code": row.subdivision_code,
        "region":           row.region,
        "country_codes":    row.country_codes,
        "framework":        row.framework,
        "summary":          row.summary,
        "key_requirements": row.key_requirements,
        "applies_to":       row.applies_to,
        "age_threshold":    row.age_threshold,
        "is_child_safety":  row.is_child_safety,
        "is_featured":      row.is_featured,
        "effective_date":   row.effective_date.isoformat() if row.effective_date else None,
        "source_url":       row.source_url,
        "added_by_user_id": str(row.added_by_user_id) if row.added_by_user_id else None,
        "added_by_role":    row.added_by_role,
        "is_active":        row.is_active,
        "is_verified":      row.is_verified,
        "discovery_method": row.discovery_method,
        "last_synced_at":   row.last_synced_at.isoformat() if row.last_synced_at else None,
        "created_at":       row.created_at.isoformat() if row.created_at else None,
        "updated_at":       row.updated_at.isoformat() if row.updated_at else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Cache helpers
# ─────────────────────────────────────────────────────────────────────────────

async def invalidate_catalog_cache() -> None:
    """Delete the full catalog list cache."""
    await redis_cache.delete_cache(_CATALOG_CACHE_KEY)


async def invalidate_assignments_cache(user_id: str) -> None:
    """Delete the per-user assignments cache."""
    await redis_cache.delete_cache(f"privacy:assignments:{user_id}")


# ─────────────────────────────────────────────────────────────────────────────
# Catalog read functions
# ─────────────────────────────────────────────────────────────────────────────

async def list_catalog(
    db: AsyncSession,
    framework: str | None = None,
    region: str | None = None,
    search: str | None = None,
    featured_only: bool = False,
) -> list[dict]:
    """
    Return all active catalog entries.
    Attempts Redis cache first; falls through to DB on miss.
    Post-fetches filters are applied in-memory (catalog < 50 rows).
    """
    # Try cache (only for the unfiltered case — cache the full list)
    cached = await redis_cache.get_cache(_CATALOG_CACHE_KEY)
    if cached is not None:
        rows = cached
    else:
        # DB fetch
        stmt = (
            select(PrivacyRegulationCatalog)
            .where(PrivacyRegulationCatalog.is_active == True)
            .order_by(
                PrivacyRegulationCatalog.is_featured.desc(),
                PrivacyRegulationCatalog.short_name,
            )
        )
        result = await db.execute(stmt)
        db_rows = result.scalars().all()
        rows = [_catalog_to_dict(r) for r in db_rows]
        # Cache full list
        await redis_cache.set_cache(_CATALOG_CACHE_KEY, rows, _CATALOG_TTL)

    # Apply filters in-memory
    if featured_only:
        rows = [r for r in rows if r.get("is_featured")]
    if framework:
        rows = [r for r in rows if r.get("framework") == framework.lower()]
    if region:
        region_lower = region.lower()
        rows = [r for r in rows if r.get("region") and region_lower in r["region"].lower()]
    if search:
        search_lower = search.lower()
        rows = [
            r for r in rows
            if search_lower in (r.get("short_name") or "").lower()
            or search_lower in (r.get("full_name") or "").lower()
            or search_lower in (r.get("summary") or "").lower()
        ]

    return rows


async def find_catalog_matches(
    db: AsyncSession,
    country_code: str | None,
    subdivision_code: str | None = None,
    region_text: str | None = None,
) -> list[dict]:
    """
    Precise matches for the jurisdiction resolver (privacy_jurisdiction_resolver.py) —
    distinct from list_catalog()'s fuzzy browse-page filtering. A row matches when:
      - country_code is in the row's country_codes list (or the row has no
        country_codes at all, treated as country-agnostic), AND
      - subdivision_code is an exact match to the row's subdivision_code, OR the
        row has no subdivision_code (country/global-level rule), OR no
        subdivision_code was given to search with, AND
      - if region_text is given, it's a case-insensitive substring match against
        the row's region (skipped entirely if region_text is not provided).
    """
    rows = await list_catalog(db)
    cc = (country_code or "").upper()
    sub = (subdivision_code or "").upper()
    region_lower = (region_text or "").lower()

    matches = []
    for r in rows:
        row_countries = [c.upper() for c in (r.get("country_codes") or [])]
        if row_countries and cc and cc not in row_countries:
            continue
        row_sub = (r.get("subdivision_code") or "").upper()
        if row_sub and sub and row_sub != sub:
            continue
        if region_text:
            if not r.get("region") or region_lower not in r["region"].lower():
                continue
        matches.append(r)
    return matches


async def get_catalog_entry_by_code(db: AsyncSession, jurisdiction_code: str) -> dict | None:
    """Return a single active catalog entry by jurisdiction_code, or None."""
    stmt = select(PrivacyRegulationCatalog).where(
        PrivacyRegulationCatalog.jurisdiction_code == jurisdiction_code,
        PrivacyRegulationCatalog.is_active == True,
    )
    result = await db.execute(stmt)
    row = result.scalars().first()
    return _catalog_to_dict(row) if row else None


async def touch_last_synced(db: AsyncSession, catalog_id: str) -> None:
    """Update last_synced_at to now — called by the auto-renew job after a no-op check."""
    stmt = select(PrivacyRegulationCatalog).where(PrivacyRegulationCatalog.id == uuid.UUID(catalog_id))
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row:
        row.last_synced_at = datetime.utcnow()
        await db.commit()
        await invalidate_catalog_cache()


async def get_catalog_entry(db: AsyncSession, catalog_id: str) -> dict | None:
    """Return a single catalog entry by ID, or None if not found."""
    try:
        uid = uuid.UUID(catalog_id)
    except ValueError:
        return None
    stmt = select(PrivacyRegulationCatalog).where(PrivacyRegulationCatalog.id == uid)
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    return _catalog_to_dict(row) if row else None


# ─────────────────────────────────────────────────────────────────────────────
# Catalog write functions
# ─────────────────────────────────────────────────────────────────────────────

async def add_catalog_entry(
    db: AsyncSession,
    data: dict,
    added_by_user_id: str,
    added_by_role: str,
) -> dict:
    """
    Insert a new entry into privacy_regulation_catalog.
    Invalidates the catalog cache after commit.
    """
    new_entry = PrivacyRegulationCatalog(
        short_name=data["short_name"],
        full_name=data["full_name"],
        jurisdiction_code=data["jurisdiction_code"],
        subdivision_code=data.get("subdivision_code"),
        framework=data.get("framework", "custom").lower(),
        region=data.get("region"),
        country_codes=data.get("country_codes"),
        summary=data.get("summary"),
        key_requirements=data.get("key_requirements"),
        applies_to=data.get("applies_to"),
        age_threshold=data.get("age_threshold"),
        is_child_safety=bool(data.get("is_child_safety", False)),
        is_featured=bool(data.get("is_featured", False)),
        effective_date=data.get("effective_date"),
        source_url=data.get("source_url"),
        rule_id=data.get("rule_id"),
        added_by_user_id=uuid.UUID(added_by_user_id) if added_by_user_id else None,
        added_by_role=added_by_role,
        is_active=True,
        is_verified=bool(data.get("is_verified", True)),
        discovery_method=data.get("discovery_method"),
        last_synced_at=data.get("last_synced_at"),
    )
    db.add(new_entry)
    await db.commit()
    await db.refresh(new_entry)
    await invalidate_catalog_cache()
    return _catalog_to_dict(new_entry)


# ─────────────────────────────────────────────────────────────────────────────
# Assignment functions
# ─────────────────────────────────────────────────────────────────────────────

async def get_my_assignments(
    db: AsyncSession,
    user_id: str,
    org_id: str | None,
) -> list[dict]:
    """
    Return the current user's regulation assignments.
    Org users → school_regulation_assignments.
    Solo teachers → user_regulation_assignments.
    Cached per user for 5 minutes.
    """
    cache_key = f"privacy:assignments:{user_id}"
    cached = await redis_cache.get_cache(cache_key)
    if cached is not None:
        return cached

    results: list[dict] = []

    if org_id:
        try:
            org_uuid = uuid.UUID(org_id)
        except ValueError:
            org_uuid = None

        if org_uuid:
            stmt = (
                select(SchoolRegulationAssignment, PrivacyRegulationCatalog)
                .join(
                    PrivacyRegulationCatalog,
                    SchoolRegulationAssignment.catalog_id == PrivacyRegulationCatalog.id,
                )
                .where(SchoolRegulationAssignment.org_id == org_uuid)
            )
            result = await db.execute(stmt)
            for assignment, entry in result.all():
                results.append({
                    "id":          str(assignment.id),
                    "catalog_id":  str(assignment.catalog_id),
                    "assigned_at": assignment.assigned_at.isoformat() if assignment.assigned_at else None,
                    "notes":       assignment.notes,
                    "entry":       _catalog_to_dict(entry),
                })
    else:
        try:
            user_uuid = uuid.UUID(user_id)
        except ValueError:
            user_uuid = None

        if user_uuid:
            stmt = (
                select(UserRegulationAssignment, PrivacyRegulationCatalog)
                .join(
                    PrivacyRegulationCatalog,
                    UserRegulationAssignment.catalog_id == PrivacyRegulationCatalog.id,
                )
                .where(UserRegulationAssignment.user_id == user_uuid)
            )
            result = await db.execute(stmt)
            for assignment, entry in result.all():
                results.append({
                    "id":          str(assignment.id),
                    "catalog_id":  str(assignment.catalog_id),
                    "assigned_at": assignment.assigned_at.isoformat() if assignment.assigned_at else None,
                    "notes":       assignment.notes,
                    "entry":       _catalog_to_dict(entry),
                })

    await redis_cache.set_cache(cache_key, results, _ASSIGNMENTS_TTL)
    return results


async def assign_regulation(
    db: AsyncSession,
    catalog_id: str,
    user_id: str,
    org_id: str | None,
    notes: str | None,
) -> dict:
    """
    Assign a catalog regulation to the user (or their org).
    Uses ON CONFLICT DO NOTHING — safe to call repeatedly.
    """
    try:
        catalog_uuid = uuid.UUID(catalog_id)
    except ValueError:
        raise ValueError(f"Invalid catalog_id: {catalog_id}")

    assigned_at = datetime.utcnow()

    if org_id:
        try:
            org_uuid = uuid.UUID(org_id)
            user_uuid = uuid.UUID(user_id)
        except ValueError:
            raise ValueError("Invalid org_id or user_id")

        stmt = text("""
            INSERT INTO school_regulation_assignments (org_id, catalog_id, assigned_by, notes, assigned_at)
            VALUES (:org_id, :catalog_id, :assigned_by, :notes, :assigned_at)
            ON CONFLICT (org_id, catalog_id) DO NOTHING
        """)
        await db.execute(stmt, {
            "org_id":      str(org_uuid),
            "catalog_id":  str(catalog_uuid),
            "assigned_by": str(user_uuid),
            "notes":       notes,
            "assigned_at": assigned_at,
        })
    else:
        try:
            user_uuid = uuid.UUID(user_id)
        except ValueError:
            raise ValueError(f"Invalid user_id: {user_id}")

        stmt = text("""
            INSERT INTO user_regulation_assignments (user_id, catalog_id, notes, assigned_at)
            VALUES (:user_id, :catalog_id, :notes, :assigned_at)
            ON CONFLICT (user_id, catalog_id) DO NOTHING
        """)
        await db.execute(stmt, {
            "user_id":    str(user_uuid),
            "catalog_id": str(catalog_uuid),
            "notes":      notes,
            "assigned_at": assigned_at,
        })

    await db.commit()
    await invalidate_assignments_cache(user_id)

    return {
        "status":      "assigned",
        "catalog_id":  catalog_id,
        "assigned_at": assigned_at.isoformat(),
    }


async def unassign_regulation(
    db: AsyncSession,
    catalog_id: str,
    user_id: str,
    org_id: str | None,
) -> bool:
    """
    Remove a regulation assignment. Returns True if a row was deleted.
    """
    try:
        catalog_uuid = uuid.UUID(catalog_id)
    except ValueError:
        return False

    if org_id:
        try:
            org_uuid = uuid.UUID(org_id)
        except ValueError:
            return False
        stmt = delete(SchoolRegulationAssignment).where(
            SchoolRegulationAssignment.org_id == org_uuid,
            SchoolRegulationAssignment.catalog_id == catalog_uuid,
        )
    else:
        try:
            user_uuid = uuid.UUID(user_id)
        except ValueError:
            return False
        stmt = delete(UserRegulationAssignment).where(
            UserRegulationAssignment.user_id == user_uuid,
            UserRegulationAssignment.catalog_id == catalog_uuid,
        )

    result = await db.execute(stmt)
    await db.commit()
    await invalidate_assignments_cache(user_id)
    return result.rowcount > 0
