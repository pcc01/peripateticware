# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Unit tests for services/wayfinding_analytics.py pure helpers.

Covers the k>=5 cohort floor and the roll-up maths the de-link retention
task feeds into hunt_outcome_analytics. See WAYFINDING_CONSENT_LADDER.md §3.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from services.wayfinding_analytics import compute_outcome_stats, waypoint_count_bucket


def test_waypoint_count_bucket():
    assert waypoint_count_bucket(None) == "0"
    assert waypoint_count_bucket(0) == "0"
    assert waypoint_count_bucket(1) == "1-3"
    assert waypoint_count_bucket(3) == "1-3"
    assert waypoint_count_bucket(4) == "4-8"
    assert waypoint_count_bucket(8) == "4-8"
    assert waypoint_count_bucket(9) == "9-15"
    assert waypoint_count_bucket(15) == "9-15"
    assert waypoint_count_bucket(16) == "16+"
    assert waypoint_count_bucket(999) == "16+"


def _rows_for(n_students: int, *, reached_per: int, total_wps: int, base: datetime):
    """n_students, each with their own session, each reaching `reached_per`
    of `total_wps` waypoints, 10 minutes apart, all in sequence."""
    rows = []
    wp_ids = [uuid4() for _ in range(total_wps)]
    for s in range(n_students):
        sid = uuid4()
        stu = uuid4()
        for i in range(total_wps):
            arrived = base + timedelta(minutes=10 * i) if i < reached_per else None
            rows.append({
                "session_id": sid,
                "student_id": stu,
                "waypoint_id": wp_ids[i],
                "arrived_at": arrived,
                "arrival_was_in_sequence": True,
            })
    return rows


def test_below_cohort_floor_returns_none():
    base = datetime(2026, 6, 1, 9, 0, 0)
    rows = _rows_for(4, reached_per=3, total_wps=5, base=base)
    assert compute_outcome_stats(rows, waypoints_total=5, required_total=5) is None


def test_rollup_at_cohort_floor():
    base = datetime(2026, 6, 1, 9, 0, 0)
    # 5 students: 3 finish all 5, 2 reach only 3
    rows = _rows_for(3, reached_per=5, total_wps=5, base=base)
    rows += _rows_for(2, reached_per=3, total_wps=5, base=base)

    stats = compute_outcome_stats(rows, waypoints_total=5, required_total=5)
    assert stats is not None
    assert stats["cohort_size"] == 5
    assert stats["sessions_count"] == 5
    assert stats["waypoints_total"] == 5
    # reached counts: [5,5,5,3,3] -> median 5, mean 4.2
    assert stats["median_reached"] == 5
    assert round(stats["mean_reached"], 2) == 4.2
    # 3 of 5 sessions reached all required
    assert stats["completion_rate"] == 0.6
    # every recorded arrival was in sequence
    assert stats["in_sequence_rate"] == 1.0
    # stops 10 min apart
    assert stats["p50_minutes_between_stops"] == 10.0


def test_no_identifiers_in_output():
    base = datetime(2026, 6, 1, 9, 0, 0)
    rows = _rows_for(6, reached_per=4, total_wps=6, base=base)
    stats = compute_outcome_stats(rows, waypoints_total=6, required_total=6)
    # The roll-up must be counts/rates only — nothing that points at a person.
    for key in stats:
        assert key not in ("student_id", "session_id", "activity_id", "waypoint_id")
    assert set(stats) == {
        "cohort_size", "sessions_count", "waypoints_total", "median_reached",
        "mean_reached", "completion_rate", "in_sequence_rate",
        "p50_minutes_between_stops",
    }
