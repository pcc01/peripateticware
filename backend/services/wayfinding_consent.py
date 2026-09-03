# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""The min() consent gate for scavenger-hunt wayfinding.

A student's effective capability is the LOWEST of three independent limits:

    effective = min( activity ceiling,   # what the teacher enabled
                     consent ceiling,     # highest rung with an active grant
                     age floor )          # under-13 + no guardian -> capped at B

Rungs (WAYFINDING_CONSENT_LADDER.md §2):
    A  static route, manual check-off        — no data
    B  on-device arrival detection           — index only, no coordinate, no consent
    C  coordinate stamp on evidence          — consent_type 'gps_tracking'  (existing)
    D  live position to teacher              — consent_type 'gps_live_share'
    E  breadcrumb track recording            — consent_type 'gps_track_recording'

Rung C deliberately keeps the pre-existing 'gps_tracking' consent_type so
grants made before this feature still count.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

RUNG_ORDER = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}

CONSENT_TYPE_FOR_RUNG = {
    "C": "gps_tracking",
    "D": "gps_live_share",
    "E": "gps_track_recording",
}
RUNG_FOR_CONSENT_TYPE = {v: k for k, v in CONSENT_TYPE_FOR_RUNG.items()}

# Retention windows shown inline in the consent dialog (WAYFINDING_CONSENT_LADDER.md §3).
RUNG_RETENTION_COPY = {
    "C": "Exact for 30 days, then blurred to roughly a city block; kept with the schoolwork.",
    "D": "Deleted 7 days after the session ends. Never stored for later viewing.",
    "E": "Deleted after 30 days, or the moment you ask — whichever is first.",
}
RUNG_DATA_CATEGORIES = {
    "C": ["location"],
    "D": ["location", "realtime_location"],
    "E": ["location", "movement_trace"],
}

# Grant lifetimes. Parent grants are short by design and get re-prompted.
PARENT_EXPIRY_DAYS = 30
STUDENT_EXPIRY_DAYS = 365


def _de_enabled() -> bool:
    """Rungs D/E are held pending counsel review — WAYFINDING_CONSENT_LADDER.md §7."""
    try:
        from core.config import settings
        return bool(getattr(settings, "WAYFINDING_DE_ENABLED", False))
    except Exception:
        return False


def clamp_ceiling(value):
    """Clamp a capability ceiling to 'C' while D/E are held. Passes 'A'/'B'/'C'
    (and None) through unchanged; maps 'D'/'E' -> 'C' unless WAYFINDING_DE_ENABLED."""
    if value in ("D", "E") and not _de_enabled():
        return "C"
    return value


def rung_max(a: str, b: str) -> str:
    return a if RUNG_ORDER.get(a, 0) >= RUNG_ORDER.get(b, 0) else b


def rung_min(*rungs: str) -> str:
    out = "E"
    for r in rungs:
        if RUNG_ORDER.get(r, 0) < RUNG_ORDER.get(out, 99):
            out = r
    return out


def normalize_rung(value: Any, default: str = "C") -> str:
    """Accept 'C'/'c'/'gps_tracking'/None → a canonical 'C'..'E'."""
    if not value:
        return default
    s = str(value).strip()
    if s in RUNG_ORDER:
        return s
    if s.upper() in RUNG_ORDER:
        return s.upper()
    if s in RUNG_FOR_CONSENT_TYPE:
        return RUNG_FOR_CONSENT_TYPE[s]
    return default


def activity_ceiling_rung(
    wayfinding_capability_ceiling: Optional[str],
    discovery_location_gps_capture_enabled: bool,
) -> str:
    """What the teacher's settings allow. A wayfinding hunt carries an explicit
    ceiling; a plain GPS-capture discovery activity (pre-wayfinding) implies C."""
    if wayfinding_capability_ceiling in RUNG_ORDER:
        # A stored D/E ceiling is treated as C while D/E are held.
        return clamp_ceiling(wayfinding_capability_ceiling)
    return "C" if discovery_location_gps_capture_enabled else "B"


async def active_consent_rung(db: "AsyncSession", student_id, activity_id) -> str:
    """Highest rung with an active (granted, non-withdrawn, non-expired)
    consent_logs row for this student — activity-scoped or global. 'B' if none
    (rung B needs no consent)."""
    from sqlalchemy import text
    if not student_id:
        return "B"
    try:
        rows = await db.execute(text("""
            SELECT DISTINCT consent_type FROM consent_logs
            WHERE student_id = CAST(:sid AS uuid)
              AND consent_type IN ('gps_tracking','gps_live_share','gps_track_recording')
              AND (activity_id = CAST(:aid AS uuid) OR activity_id IS NULL)
              AND (given_by_student = TRUE OR given_by_parent = TRUE)
              AND withdrawn_at IS NULL
              AND (expires_at IS NULL OR expires_at > NOW())
        """), {"sid": str(student_id), "aid": str(activity_id) if activity_id else None})
        granted = {r[0] for r in rows.fetchall()}
    except Exception as exc:
        logger.warning(f"active_consent_rung non-fatal error: {exc}")
        return "B"

    best = "B"
    for rung, ctype in CONSENT_TYPE_FOR_RUNG.items():
        if ctype in granted:
            best = rung_max(best, rung)
    return best


async def age_floor_rung(db: "AsyncSession", student_id) -> str:
    """Under-13 (or consent-required) with no linked guardian account can reach
    at most rung B — D and E are impossible regardless of any consent UI."""
    from sqlalchemy import text
    if not student_id:
        return "B"
    try:
        u = (await db.execute(text(
            "SELECT age_group, requires_parental_consent FROM users WHERE id = CAST(:sid AS uuid)"
        ), {"sid": str(student_id)})).fetchone()
        if not u:
            return "B"
        age_group, rpc = u[0], bool(u[1])
        minor = (age_group == "under_13") or rpc
        if not minor:
            return "E"
        link = (await db.execute(text(
            "SELECT 1 FROM parent_child_links WHERE child_id = CAST(:sid AS uuid) LIMIT 1"
        ), {"sid": str(student_id)})).fetchone()
        return "E" if link else "B"
    except Exception as exc:
        logger.warning(f"age_floor_rung non-fatal error: {exc}")
        return "B"  # conservative


async def coarsen_captures_now(db: "AsyncSession", student_id, activity_id) -> int:
    """Immediately blur (to 3 dp) this student's evidence-capture coordinates
    for an activity — used when rung C consent is withdrawn, so the promise
    'the stamps are coarsened immediately' in WAYFINDING_CONSENT_LADDER.md §4
    is kept rather than waiting for the 30-day sweeper."""
    from sqlalchemy import text
    if not (student_id and activity_id):
        return 0
    try:
        res = await db.execute(text("""
            UPDATE evidence_captures
            SET location_latitude  = ROUND(location_latitude::numeric,  3),
                location_longitude = ROUND(location_longitude::numeric, 3)
            WHERE student_id = CAST(:sid AS uuid)
              AND activity_id = CAST(:aid AS uuid)
              AND location_latitude IS NOT NULL
              AND location_longitude IS NOT NULL
              AND (location_latitude  <> ROUND(location_latitude::numeric,  3)
                OR location_longitude <> ROUND(location_longitude::numeric, 3))
        """), {"sid": str(student_id), "aid": str(activity_id)})
        return res.rowcount or 0
    except Exception as exc:
        logger.warning(f"coarsen_captures_now non-fatal error: {exc}")
        return 0


async def delete_tracks_now(db: "AsyncSession", student_id, activity_id) -> int:
    """Immediately hard-delete this student's recorded breadcrumb tracks for an
    activity — used when rung E consent is withdrawn, so the '§4: deleted
    within 24 h, not left to its timer' promise is kept."""
    from sqlalchemy import text
    if not (student_id and activity_id):
        return 0
    try:
        res = await db.execute(text("""
            DELETE FROM session_tracks
            WHERE student_id = CAST(:sid AS uuid) AND activity_id = CAST(:aid AS uuid)
        """), {"sid": str(student_id), "aid": str(activity_id)})
        return res.rowcount or 0
    except Exception as exc:
        logger.warning(f"delete_tracks_now non-fatal error: {exc}")
        return 0


async def effective_capability_rung(
    db: "AsyncSession",
    student_id,
    *,
    activity_id,
    wayfinding_capability_ceiling: Optional[str],
    discovery_location_gps_capture_enabled: bool,
) -> dict:
    """Resolve the full gate. Returns every input plus the effective rung so a
    client can show the right consent card."""
    ceiling = activity_ceiling_rung(
        wayfinding_capability_ceiling, discovery_location_gps_capture_enabled
    )
    consent = await active_consent_rung(db, student_id, activity_id)
    floor = await age_floor_rung(db, student_id)
    effective = rung_min(ceiling, consent, floor)
    return {
        "effective_rung": effective,
        "activity_ceiling": ceiling,
        "consent_rung": consent,
        "age_floor": floor,
        # Rungs the teacher enabled that the student has NOT yet consented to
        # and COULD (age floor permitting) — what to prompt for.
        "consent_needed_for": [
            r for r in ("C", "D", "E")
            if RUNG_ORDER[r] <= RUNG_ORDER[ceiling]
            and RUNG_ORDER[r] <= RUNG_ORDER[floor]
            and RUNG_ORDER[r] > RUNG_ORDER[consent]
        ],
    }
