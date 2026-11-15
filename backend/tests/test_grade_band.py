# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Unit tests for services/grade_band.py — must match
mobile/src/lib/gradeBand.ts's gradeToBand() exactly."""

from __future__ import annotations

from services.grade_band import grade_to_band


def test_covers_every_grade_including_the_k2_edge():
    assert grade_to_band(0) == "k-2"
    assert grade_to_band(1) == "k-2"
    assert grade_to_band(2) == "k-2"
    assert grade_to_band(3) == "3-5"
    assert grade_to_band(5) == "3-5"
    assert grade_to_band(6) == "6-8"
    assert grade_to_band(8) == "6-8"
    assert grade_to_band(9) == "9-12"
    assert grade_to_band(12) == "9-12"


def test_returns_none_outside_0_12_or_when_missing():
    assert grade_to_band(-1) is None
    assert grade_to_band(13) is None
    assert grade_to_band(None) is None
