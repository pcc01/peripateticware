# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Unit tests for routes/student_activities.py's _approved_peri_script() —
the gate that keeps an unapproved teacher draft from ever reaching the
student detail payload (PERI_OFFLINE_SPEC_v2.md section B.5)."""

from __future__ import annotations

from types import SimpleNamespace

from routes.student_activities import _approved_peri_script


def test_returns_none_when_no_script():
    assert _approved_peri_script(SimpleNamespace(peri_script=None)) is None


def test_returns_none_when_unapproved():
    activity = SimpleNamespace(peri_script={"v": 1, "stages": {}, "approved": False})
    assert _approved_peri_script(activity) is None


def test_returns_none_when_approved_key_missing():
    activity = SimpleNamespace(peri_script={"v": 1, "stages": {}})
    assert _approved_peri_script(activity) is None


def test_returns_script_when_approved_true():
    script = {"v": 1, "stages": {}, "approved": True}
    activity = SimpleNamespace(peri_script=script)
    assert _approved_peri_script(activity) == script


def test_returns_none_when_script_is_not_a_dict():
    # Defensive: a malformed/legacy value should never raise or leak through.
    assert _approved_peri_script(SimpleNamespace(peri_script="not-a-dict")) is None
