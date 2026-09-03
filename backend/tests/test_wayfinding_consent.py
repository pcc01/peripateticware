# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Unit tests for services/wayfinding_consent.py pure helpers — the min()
consent gate maths. DB-backed helpers (active_consent_rung, age_floor_rung)
are covered by the API tests. See WAYFINDING_CONSENT_LADDER.md §4."""

from __future__ import annotations

from services.wayfinding_consent import (
    activity_ceiling_rung,
    clamp_ceiling,
    normalize_rung,
    rung_max,
    rung_min,
    CONSENT_TYPE_FOR_RUNG,
    RUNG_FOR_CONSENT_TYPE,
)


def test_rung_min_is_the_gate():
    # effective = min(ceiling, consent, age_floor)
    assert rung_min("D", "C", "E") == "C"   # consent is the limit
    assert rung_min("C", "E", "E") == "C"   # activity ceiling is the limit
    assert rung_min("E", "E", "B") == "B"   # age floor is the limit
    assert rung_min("E", "E", "E") == "E"


def test_rung_max():
    assert rung_max("B", "D") == "D"
    assert rung_max("C", "C") == "C"
    assert rung_max("E", "A") == "E"


def test_normalize_rung_accepts_letters_and_consent_types():
    assert normalize_rung("C") == "C"
    assert normalize_rung("e") == "E"
    assert normalize_rung("gps_tracking") == "C"
    assert normalize_rung("gps_live_share") == "D"
    assert normalize_rung("gps_track_recording") == "E"
    assert normalize_rung(None) == "C"          # default, back-compat
    assert normalize_rung("nonsense") == "C"


def test_activity_ceiling_rung():
    # explicit wayfinding ceiling wins (B/C pass through)
    assert activity_ceiling_rung("C", False) == "C"
    assert activity_ceiling_rung("B", True) == "B"
    # no wayfinding ceiling, but legacy GPS-capture on -> implies C
    assert activity_ceiling_rung(None, True) == "C"
    # nothing on -> B (rung B needs no gate anyway)
    assert activity_ceiling_rung(None, False) == "B"


def test_de_rungs_are_held_by_default():
    # WAYFINDING_DE_ENABLED is false by default -> D/E clamp to C, everywhere.
    assert clamp_ceiling("D") == "C"
    assert clamp_ceiling("E") == "C"
    assert clamp_ceiling("C") == "C"
    assert clamp_ceiling("B") == "B"
    assert clamp_ceiling(None) is None
    # a stored D/E ceiling is treated as C by the gate too
    assert activity_ceiling_rung("D", False) == "C"
    assert activity_ceiling_rung("E", True) == "C"


def test_de_rungs_pass_through_when_enabled(monkeypatch):
    from core.config import settings
    monkeypatch.setattr(settings, "WAYFINDING_DE_ENABLED", True)
    assert clamp_ceiling("D") == "D"
    assert clamp_ceiling("E") == "E"
    assert activity_ceiling_rung("D", False) == "D"


def test_rung_c_keeps_the_preexisting_consent_type():
    # grants made before this feature (consent_type='gps_tracking') must still
    # count as rung C.
    assert CONSENT_TYPE_FOR_RUNG["C"] == "gps_tracking"
    assert RUNG_FOR_CONSENT_TYPE["gps_tracking"] == "C"
    assert set(CONSENT_TYPE_FOR_RUNG) == {"C", "D", "E"}
