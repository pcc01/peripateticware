# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tiered live-tracking poll-interval hints.

Continuous 5s/15s polling is right for a single-day field trip; it's wasteful
(mobile battery/bandwidth, unnecessary load on the active-sessions endpoints)
for a multi-week Project where nobody needs 5-second updates. This module is
the single source of truth for the cutoff and the two tiers so
teacher_active_sessions (activities.py) and project_active_sessions
(projects.py) — and, transitively, every client that reads their
poll_interval_seconds field — agree on what "long-running" means without
duplicating the rule.

An activity/session is "long-running" if either:
  - it belongs to a Project (every Project spans duration_weeks >= 1 by
    schema constraint, so membership alone is a multi-week signal — no
    separate per-project toggle needed), or
  - its own estimated_duration_minutes exceeds a single field-trip day.
"""
from typing import Optional

# Longer than a single field-trip day (8hr) implies multi-day even without a Project.
LONG_RUNNING_DURATION_MINUTES_THRESHOLD = 480

TRIP_DETAIL_POLL_SECONDS = 5
TRIP_OVERVIEW_POLL_SECONDS = 15
LONG_RUNNING_DETAIL_POLL_SECONDS = 60
LONG_RUNNING_OVERVIEW_POLL_SECONDS = 180


def is_long_running(estimated_duration_minutes: Optional[int], in_project: bool) -> bool:
    if in_project:
        return True
    return bool(estimated_duration_minutes) and estimated_duration_minutes > LONG_RUNNING_DURATION_MINUTES_THRESHOLD


def poll_interval_seconds(estimated_duration_minutes: Optional[int], in_project: bool, *, detail: bool) -> int:
    """detail=True for a single-session detail view (5s/60s); False for an
    overview list of many sessions (15s/180s)."""
    long_running = is_long_running(estimated_duration_minutes, in_project)
    if detail:
        return LONG_RUNNING_DETAIL_POLL_SECONDS if long_running else TRIP_DETAIL_POLL_SECONDS
    return LONG_RUNNING_OVERVIEW_POLL_SECONDS if long_running else TRIP_OVERVIEW_POLL_SECONDS
