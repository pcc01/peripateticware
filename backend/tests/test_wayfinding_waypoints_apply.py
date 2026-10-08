# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Tests for routes/activities.py::_apply_waypoints — the function that turns
a multi-point hunt's authored payload (WaypointCreate list: name, clue_text,
coordinates, arrival radius, capture_requirements, hint rules) into the
ORM rows actually persisted on an Activity.

Gap this closes: test_wayfinding_endpoints.py covers the arrival/live-
position/track session routes, test_gpx_wayfinding.py covers GPX parsing,
but nothing exercised the "multiple points, each with its own clue/ask"
content path a teacher's builder actually sends on create/update. Pure
function, no DB/app needed — _apply_waypoints only builds ActivityWaypoint
objects in memory.
"""

from __future__ import annotations

from routes.activities import _apply_waypoints
from schemas.activities import WaypointCreate


def _wp(**overrides) -> WaypointCreate:
    base = dict(
        sequence_index=0,
        name="Stop",
        latitude=37.8716,
        longitude=-122.2727,
        arrival_radius_meters=25,
    )
    base.update(overrides)
    return WaypointCreate(**base)


def test_each_point_keeps_its_own_clue_and_capture_ask():
    """Three distinct points, each with a different "thing to do" — the
    content a hunt is actually built from."""
    payloads = [
        _wp(name="The Old Oak", clue_text="Start at the big oak.",
            capture_requirements={"photo": True, "note": False}),
        _wp(name="Stone Bridge", clue_text="Follow the trail east.",
            capture_requirements={"photo": False, "note": True}),
        _wp(name="The Overlook", clue_text="Climb to the view.",
            capture_requirements=None, required=False),
    ]

    activity = type("A", (), {})()  # bare object; only .waypoints is set
    _apply_waypoints(activity, payloads)

    assert [w.name for w in activity.waypoints] == [
        "The Old Oak", "Stone Bridge", "The Overlook",
    ]
    oak, bridge, overlook = activity.waypoints

    assert oak.clue_text == "Start at the big oak."
    assert oak.capture_requirements == {"photo": True, "note": False}
    assert oak.required is True

    assert bridge.clue_text == "Follow the trail east."
    assert bridge.capture_requirements == {"photo": False, "note": True}

    assert overlook.capture_requirements is None
    assert overlook.required is False


def test_sequence_index_is_re_derived_from_list_position():
    """A reorder sends points in the new order; sequence_index must follow
    list position, not whatever the caller happened to set it to."""
    payloads = [_wp(name="C", sequence_index=99), _wp(name="A", sequence_index=0),
                _wp(name="B", sequence_index=50)]

    activity = type("A", (), {})()
    _apply_waypoints(activity, payloads)

    assert [(w.name, w.sequence_index) for w in activity.waypoints] == [
        ("C", 0), ("A", 1), ("B", 2),
    ]


def test_hint_unlock_rule_defaults_to_immediate_when_blank():
    activity = type("A", (), {})()
    _apply_waypoints(activity, [_wp(hint_unlock_rule=None)])
    assert activity.waypoints[0].hint_unlock_rule == "immediate"


def test_hint_unlock_rule_and_minutes_pass_through():
    activity = type("A", (), {})()
    _apply_waypoints(activity, [
        _wp(hint_unlock_rule="after_minutes", hint_unlock_minutes=5),
    ])
    wp = activity.waypoints[0]
    assert wp.hint_unlock_rule == "after_minutes"
    assert wp.hint_unlock_minutes == 5


def test_empty_or_none_payload_clears_waypoints():
    activity = type("A", (), {})()
    _apply_waypoints(activity, [_wp(name="only")])
    assert len(activity.waypoints) == 1

    _apply_waypoints(activity, None)
    assert activity.waypoints == []

    _apply_waypoints(activity, [_wp(name="back")])
    _apply_waypoints(activity, [])
    assert activity.waypoints == []
