# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
License tier validation helpers.

TIER_ORDER defines the precedence of license tiers from lowest to highest.
byok_enabled:  True for school_byok, district_byok, enterprise.
require_byok_enabled() / require_min_tier() are FastAPI dependencies that raise
HTTP 403 if the org doesn't meet the requirement.

Usage:
    from services.license_validator import require_byok_enabled, require_min_tier

    @router.post("/org/ai-key")
    async def set_ai_key(
        _: None = Depends(require_byok_enabled),
        current_user = Depends(get_current_user),
        ...
    ):
        ...
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.user import User

logger = logging.getLogger(__name__)

# ── Tier ordering (lowest → highest) ─────────────────────────────────────────

TIER_ORDER: list[str] = [
    "free",
    "trial",
    "starter",
    "homeschool_family",
    "homeschool_coop",
    "school",
    "school_byok",
    "district",
    "district_byok",
    "enterprise",
]

BYOK_TIERS: frozenset[str] = frozenset(["school_byok", "district_byok", "enterprise"])


def tier_rank(tier: Optional[str]) -> int:
    """Return numeric rank for comparison; unknown tiers rank as 0 (free)."""
    try:
        return TIER_ORDER.index(tier or "free")
    except ValueError:
        return 0


def byok_enabled_for_tier(tier: Optional[str]) -> bool:
    return (tier or "free") in BYOK_TIERS


# ── Shared DB lookup ──────────────────────────────────────────────────────────

async def _get_org_tier(db: AsyncSession, org_id: str) -> Optional[str]:
    """Return the organisation's license_tier, or None if not found."""
    try:
        row = (await db.execute(
            text("SELECT license_tier FROM organizations WHERE id = :oid"),
            {"oid": org_id},
        )).first()
        return row[0] if row else None
    except Exception as exc:
        logger.warning(f"[license_validator] Could not fetch org tier for {org_id}: {exc}")
        return None


# ── FastAPI dependencies ──────────────────────────────────────────────────────

async def require_byok_enabled(
    current_user: User = Depends(get_current_user),
    db: AsyncSession  = Depends(get_db),
) -> None:
    """Raise HTTP 403 if the user's org is not on a BYOK-enabled tier."""
    org_id = str(current_user.org_id) if current_user.org_id else None
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "byok_not_available", "message": "No organisation found for this account."},
        )
    tier = await _get_org_tier(db, org_id)
    if not byok_enabled_for_tier(tier):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error":   "byok_not_available",
                "message": "Bring-Your-Own-Key requires a School BYOK, District BYOK, or Enterprise licence.",
                "current_tier": tier or "free",
                "required_tiers": sorted(BYOK_TIERS),
            },
        )


def make_require_min_tier(min_tier: str):
    """
    Factory that returns a FastAPI dependency requiring at least min_tier.

    Usage:
        @router.get("/some-feature")
        async def handler(_: None = Depends(make_require_min_tier("school"))):
            ...
    """
    async def _dep(
        current_user: User = Depends(get_current_user),
        db: AsyncSession   = Depends(get_db),
    ) -> None:
        org_id = str(current_user.org_id) if current_user.org_id else None
        if not org_id:
            raise HTTPException(status_code=403, detail="No organisation found.")
        tier = await _get_org_tier(db, org_id)
        if tier_rank(tier) < tier_rank(min_tier):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error":        "tier_too_low",
                    "message":      f"This feature requires a {min_tier} licence or higher.",
                    "current_tier": tier or "free",
                    "required_tier": min_tier,
                },
            )
    return _dep


# Convenience aliases
require_school_tier   = make_require_min_tier("school")
require_district_tier = make_require_min_tier("district")
require_min_tier      = make_require_min_tier   # re-export factory
