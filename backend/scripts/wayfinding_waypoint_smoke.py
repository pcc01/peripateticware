"""Live smoke test: a multi-point wayfinding hunt round-trips through the
real API exactly as a teacher's builder would send it — create with N
waypoints (each with its own clue + capture ask), fetch it back, update
(reorder/replace), fetch again, then clean up.

Closes the gap the unit test (tests/test_wayfinding_waypoints_apply.py)
can't reach: that gap is pure Python, this is schema validation + ORM
persist + response serialization against a real Postgres, run the same way
WAYFINDING_CONSENT_LADDER.md §7's "API smoke (real DB)" pass was done
manually. Matches the existing convention of a standalone script against
the live local stack (see scripts/debug_500s.py, scripts/privacy_sweep_local.py)
rather than a pytest file, since it needs a running server + real auth.

Usage (from the host, against the docker-compose stack on :8000):
    cd backend && python scripts/wayfinding_waypoint_smoke.py

Set BASE_URL to point elsewhere. Never point this at prod — it creates and
deletes a real activity row under whatever teacher account you give it.
"""

from __future__ import annotations

import os
import sys

import requests

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000")
TEACHER_EMAIL = os.environ.get("SMOKE_TEACHER_EMAIL", "teacher@test.local")
TEACHER_PASSWORD = os.environ.get("SMOKE_TEACHER_PASSWORD", "Test1234!")

_fail_count = 0


def check(label: str, cond: bool, detail: str = "") -> None:
    global _fail_count
    if cond:
        print(f"  ok   {label}")
    else:
        _fail_count += 1
        print(f"  FAIL {label}  {detail}")


def main() -> int:
    s = requests.Session()

    print(f"== login as {TEACHER_EMAIL} ({BASE_URL}) ==")
    r = s.post(f"{BASE_URL}/api/v1/auth/login",
               json={"email": TEACHER_EMAIL, "password": TEACHER_PASSWORD})
    r.raise_for_status()
    token = r.json()["access_token"]
    s.headers["Authorization"] = f"Bearer {token}"

    waypoints_v1 = [
        {
            "sequence_index": 0, "name": "The Old Oak",
            "clue_text": "Start at the big oak by the north path.",
            "latitude": 37.8716, "longitude": -122.2727,
            "arrival_radius_meters": 60, "required": True,
            "capture_requirements": {"photo": True, "note": False},
            "hint_unlock_rule": "immediate",
        },
        {
            "sequence_index": 1, "name": "Stone Bridge",
            "clue_text": "Follow the trail east to the little stone bridge.",
            "latitude": 37.8726, "longitude": -122.2717,
            "arrival_radius_meters": 60, "required": True,
            "capture_requirements": {"photo": False, "note": True},
            "hint_unlock_rule": "on_arrival",
        },
        {
            "sequence_index": 2, "name": "The Overlook",
            "clue_text": "Climb to the overlook with the view of the water.",
            "latitude": 37.8736, "longitude": -122.2707,
            "arrival_radius_meters": 60, "required": False,
            "capture_requirements": None,
            "hint_unlock_rule": "after_minutes", "hint_unlock_minutes": 5,
        },
    ]

    print("== create a 3-stop hunt ==")
    payload = {
        "title": "Smoke Test — Multi-Point Hunt",
        "description": "Automated wayfinding smoke test activity.",
        "location_latitude": 37.8716, "location_longitude": -122.2727,
        "location_radius_meters": 200, "location_name": "Smoke Test Field",
        "grade_level": 6, "subject": "Science",
        "estimated_duration_minutes": 30,
        "learning_objectives": ["Find each marked stop."],
        "bloom_level": 2,
        "activity_type": "discovery",
        "discovery_mode": "location_based",
        "discovery_wayfinding_enabled": True,
        "wayfinding_mode": "ordered",
        "wayfinding_capability_ceiling": "B",
        "waypoints": waypoints_v1,
    }
    r = s.post(f"{BASE_URL}/api/v1/activities", json=payload)
    check("create returns 201", r.status_code == 201, f"-> {r.status_code} {r.text[:300]}")
    if r.status_code != 201:
        return 1
    activity = r.json()
    activity_id = activity["id"]

    print("== verify create response carries all 3 points, in order, each with its own ask ==")
    wps = activity["waypoints"]
    check("3 waypoints returned", len(wps) == 3, f"-> {len(wps)}")
    check("order preserved", [w["name"] for w in wps] ==
          ["The Old Oak", "Stone Bridge", "The Overlook"], f"-> {[w['name'] for w in wps]}")
    check("stop 1 clue persisted", wps[0]["clue_text"] == waypoints_v1[0]["clue_text"])
    check("stop 1 capture ask persisted", wps[0]["capture_requirements"] == {"photo": True, "note": False})
    check("stop 2 capture ask persisted", wps[1]["capture_requirements"] == {"photo": False, "note": True})
    check("stop 2 hint rule persisted", wps[1]["hint_unlock_rule"] == "on_arrival")
    check("stop 3 is optional", wps[2]["required"] is False)
    check("stop 3 after_minutes rule + minutes persisted",
          wps[2]["hint_unlock_rule"] == "after_minutes" and wps[2]["hint_unlock_minutes"] == 5)

    print("== GET re-fetches the same 3 points ==")
    r = s.get(f"{BASE_URL}/api/v1/activities/{activity_id}")
    check("get returns 200", r.status_code == 200, f"-> {r.status_code}")
    fetched = r.json()
    check("get: 3 waypoints, same order", [w["name"] for w in fetched["waypoints"]] ==
          ["The Old Oak", "Stone Bridge", "The Overlook"])
    check("get: capture asks intact", fetched["waypoints"][1]["capture_requirements"] == {"photo": False, "note": True})

    print("== update: reorder + drop a stop + add a new one with a new ask ==")
    waypoints_v2 = [
        waypoints_v1[2] | {"sequence_index": 0},  # Overlook now first
        {
            "sequence_index": 1, "name": "New Fountain Stop",
            "clue_text": "Count the spouts on the fountain.",
            "latitude": 37.8700, "longitude": -122.2700,
            "arrival_radius_meters": 30, "required": True,
            "capture_requirements": {"photo": True, "note": True},
            "hint_unlock_rule": "immediate",
        },
        # Stone Bridge dropped entirely.
    ]
    r = s.put(f"{BASE_URL}/api/v1/activities/{activity_id}", json={"waypoints": waypoints_v2})
    check("update returns 200", r.status_code == 200, f"-> {r.status_code} {r.text[:300]}")
    updated = r.json() if r.status_code == 200 else {"waypoints": []}
    names = [w["name"] for w in updated["waypoints"]]
    check("update: 2 waypoints now, reordered", names == ["The Overlook", "New Fountain Stop"], f"-> {names}")
    check("update: sequence_index re-derived from new position",
          [w["sequence_index"] for w in updated["waypoints"]] == [0, 1])
    check("update: new stop's both-captures ask persisted",
          updated["waypoints"][1]["capture_requirements"] == {"photo": True, "note": True})
    check("update: dropped stop is actually gone (delete-orphan, not just hidden)",
          "Stone Bridge" not in names)

    print("== cleanup: archive the smoke-test activity ==")
    r = s.delete(f"{BASE_URL}/api/v1/activities/{activity_id}")
    check("delete/archive returns 2xx", 200 <= r.status_code < 300, f"-> {r.status_code} {r.text[:200]}")

    print()
    if _fail_count:
        print(f"{_fail_count} check(s) FAILED")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
