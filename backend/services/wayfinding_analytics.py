# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Analytics lane (Lane 2) for scavenger-hunt wayfinding.

Two writers, both feeding tables that are identifier-free BY CONSTRUCTION —
no student_id / session_id / activity_id / teacher_id / fine-grained org_id /
precise timestamps / free text. See WAYFINDING_CONSENT_LADDER.md §3.

  snapshot_authoring()      — one authoring_analytics row per activity publish.
                              Called fire-and-forget from publish_activity.
  compute_outcome_stats()   — pure roll-up of a cohort's expired
                              session_waypoint_progress rows into the numbers
                              hunt_outcome_analytics stores. The DB
                              orchestration (cohort floor, delete source) lives
                              in tasks/retention_cleanup.delink_expired_waypoint_progress().
"""

from __future__ import annotations

import logging
import statistics
from datetime import date
from typing import TYPE_CHECKING, Any, Dict, Iterable, List, Optional

if TYPE_CHECKING:  # keep the module importable for the pure helpers without SQLAlchemy
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

MIN_COHORT = 5  # k-anonymity floor — never aggregate below this


def waypoint_count_bucket(n: Optional[int]) -> str:
    """Bucket a waypoint count so the exact number never identifies a hunt."""
    if not n:
        return "0"
    if n <= 3:
        return "1-3"
    if n <= 8:
        return "4-8"
    if n <= 15:
        return "9-15"
    return "16+"


async def snapshot_authoring(
    db: AsyncSession,
    *,
    activity_type: Optional[str],
    discovery_mode: Optional[str],
    wayfinding_mode: Optional[str],
    wayfinding_enabled: bool,
    capability_ceiling: Optional[str],
    waypoint_count: Optional[int],
    route_imported: bool,
    grade_level: Optional[int],
    subject: Optional[str],
    bloom_level: Optional[int],
    difficulty: Optional[int],
    region_country: Optional[str],
) -> None:
    """Insert one authoring_analytics row. Every argument is a scalar the
    caller pulled off the activity — the row object itself is never passed in,
    so nothing that links to a person can leak. Best-effort: a failure here
    must never affect a publish."""
    from sqlalchemy import text
    try:
        await db.execute(text("""
            INSERT INTO authoring_analytics
                (id, activity_type, discovery_mode, wayfinding_mode,
                 wayfinding_enabled, capability_ceiling, waypoint_count_bucket,
                 route_imported, grade_level, subject, bloom_level, difficulty,
                 region_country, created_month, snapshot_at)
            VALUES
                (gen_random_uuid(), :atype, :dmode, :wmode,
                 :wen, :ceil, :bucket,
                 :rimp, :grade, :subject, :bloom, :difficulty,
                 :country, :month, NOW())
        """), {
            "atype": activity_type,
            "dmode": discovery_mode,
            "wmode": wayfinding_mode,
            "wen": bool(wayfinding_enabled),
            "ceil": capability_ceiling,
            "bucket": waypoint_count_bucket(waypoint_count),
            "rimp": bool(route_imported),
            "grade": grade_level,
            "subject": (subject or None),
            "bloom": bloom_level,
            "difficulty": difficulty,
            "country": ((region_country or "").upper()[:10] or None),
            "month": date.today().replace(day=1),
        })
    except Exception as exc:  # pragma: no cover - best-effort
        logger.warning(f"authoring_analytics snapshot skipped (non-fatal): {exc}")


def compute_outcome_stats(
    progress_rows: Iterable[Dict[str, Any]],
    *,
    waypoints_total: Optional[int],
    required_total: Optional[int],
) -> Optional[Dict[str, Any]]:
    """Roll a cohort's session_waypoint_progress rows up to the numbers
    hunt_outcome_analytics stores. Returns None if the cohort is below the
    k>=5 floor (caller then deletes the source without aggregating).

    Each row: {session_id, student_id, waypoint_id, arrived_at,
               arrival_was_in_sequence}
    """
    rows = list(progress_rows)
    students = {r["student_id"] for r in rows if r.get("student_id")}
    if len(students) < MIN_COHORT:
        return None

    by_session: Dict[Any, List[Dict[str, Any]]] = {}
    for r in rows:
        by_session.setdefault(r["session_id"], []).append(r)

    reached_per_session: List[int] = []
    completed_sessions = 0
    arrivals = 0
    in_sequence = 0
    inter_stop_minutes: List[float] = []

    for _sid, srows in by_session.items():
        arrived = [x for x in srows if x.get("arrived_at") is not None]
        reached_per_session.append(len(arrived))
        arrivals += len(arrived)
        in_sequence += sum(1 for x in arrived if x.get("arrival_was_in_sequence"))
        if required_total and len(arrived) >= required_total:
            completed_sessions += 1
        times = sorted(x["arrived_at"] for x in arrived if x.get("arrived_at"))
        for a, b in zip(times, times[1:]):
            gap = (b - a).total_seconds() / 60.0
            if 0 < gap < 24 * 60:  # ignore same-instant and multi-day gaps
                inter_stop_minutes.append(gap)

    n_sessions = len(by_session)
    return {
        "cohort_size": len(students),
        "sessions_count": n_sessions,
        "waypoints_total": waypoints_total,
        "median_reached": statistics.median(reached_per_session) if reached_per_session else None,
        "mean_reached": (sum(reached_per_session) / len(reached_per_session)) if reached_per_session else None,
        "completion_rate": (completed_sessions / n_sessions) if n_sessions else None,
        "in_sequence_rate": (in_sequence / arrivals) if arrivals else None,
        "p50_minutes_between_stops": statistics.median(inter_stop_minutes) if inter_stop_minutes else None,
    }


async def insert_hunt_outcome(
    db: AsyncSession,
    *,
    activity_type: Optional[str],
    wayfinding_mode: Optional[str],
    period_start: Optional[date],
    period_end: Optional[date],
    stats: Dict[str, Any],
) -> None:
    from sqlalchemy import text
    await db.execute(text("""
        INSERT INTO hunt_outcome_analytics
            (id, activity_type, wayfinding_mode, waypoints_total, cohort_size,
             sessions_count, median_reached, mean_reached, completion_rate,
             in_sequence_rate, p50_minutes_between_stops,
             period_start, period_end, rolled_up_at)
        VALUES
            (gen_random_uuid(), :atype, :wmode, :wtot, :cohort,
             :sessions, :medr, :meanr, :crate,
             :seqrate, :p50,
             :pstart, :pend, NOW())
    """), {
        "atype": activity_type,
        "wmode": wayfinding_mode,
        "wtot": stats.get("waypoints_total"),
        "cohort": stats["cohort_size"],
        "sessions": stats["sessions_count"],
        "medr": stats.get("median_reached"),
        "meanr": stats.get("mean_reached"),
        "crate": stats.get("completion_rate"),
        "seqrate": stats.get("in_sequence_rate"),
        "p50": stats.get("p50_minutes_between_stops"),
        "pstart": period_start,
        "pend": period_end,
    })
