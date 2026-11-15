# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Unit tests for routes/activities.py's _peri_is_stale() — the builder UI's
"this activity changed, regenerate" signal (PERI_OFFLINE_SPEC_v2.md section
B.4)."""

from __future__ import annotations

from types import SimpleNamespace

from routes.activities import _peri_is_stale
from services.peri_script_generator import compute_source_hash


def _activity(**overrides) -> SimpleNamespace:
    base = dict(
        primary_framework="blooms",
        bloom_level=4,
        marzano_level=None,
        dok_level=None,
        solo_level=None,
        rubric_id=None,
        location_name="Cliff Palace",
        subject="History",
        grade_level=5,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _fresh_script(activity: SimpleNamespace) -> dict:
    return {"v": 1, "stages": {}, "source_hash": compute_source_hash(activity, "blooms", activity.bloom_level)}


def test_no_script_is_not_stale():
    assert _peri_is_stale(_activity(), {}) is False


def test_script_with_no_source_hash_is_not_stale():
    assert _peri_is_stale(_activity(), {"v": 1, "stages": {}}) is False


def test_freshly_generated_script_is_not_stale():
    activity = _activity()
    assert _peri_is_stale(activity, _fresh_script(activity)) is False


def test_changing_grade_level_marks_stale():
    activity = _activity()
    script = _fresh_script(activity)
    activity.grade_level = 6  # teacher edited the activity after generating
    assert _peri_is_stale(activity, script) is True


def test_changing_location_marks_stale():
    activity = _activity()
    script = _fresh_script(activity)
    activity.location_name = "A Different Place"
    assert _peri_is_stale(activity, script) is True


def test_changing_bloom_level_marks_stale():
    activity = _activity()
    script = _fresh_script(activity)
    activity.bloom_level = 6
    assert _peri_is_stale(activity, script) is True
