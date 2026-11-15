# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
services/grade_band.py

Grade-band conversion, server side (PERI_OFFLINE_SPEC_v2.md item 20:
"Add gradeToBand() (server and device)"). Mirrors
mobile/src/lib/gradeBand.ts's gradeToBand() exactly -- same four bands,
same boundaries, same K-2 convention (kindergarten = 0).
"""

from __future__ import annotations

from typing import Literal, Optional

GradeBand = Literal["k-2", "3-5", "6-8", "9-12"]


def grade_to_band(grade_level: Optional[int]) -> Optional[GradeBand]:
    """0-2 -> k-2, 3-5 -> 3-5, 6-8 -> 6-8, 9-12 -> 9-12. None for anything
    outside 0-12 rather than guessing."""
    if grade_level is None:
        return None
    if grade_level < 0 or grade_level > 12:
        return None
    if grade_level <= 2:
        return "k-2"
    if grade_level <= 5:
        return "3-5"
    if grade_level <= 8:
        return "6-8"
    return "9-12"
