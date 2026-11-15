# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Unit tests for services/peri_script_generator.py's pure helpers (no DB,
no LLM call). generate_peri_script() itself needs a live DB session + LLM
provider, so it's exercised by API-level/integration tests, not here."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from services.peri_script_generator import (
    _question_count,
    _STAGE_ID_PREFIX,
    compute_source_hash,
    derive_focus_terms,
    resolve_framework_and_level,
    select_rubric_criteria,
)
from services.peri_script_validator import STAGE_ORDER


class TestStageIdPrefixes:
    def test_every_stage_has_a_prefix(self):
        assert set(_STAGE_ID_PREFIX.keys()) == set(STAGE_ORDER)

    def test_no_two_stages_share_a_prefix(self):
        # Caught during manual end-to-end testing: "orient"/"observe" both
        # start with 'o' and "classify"/"connect" both start with 'c', so a
        # naive stage[0] prefix produced colliding ids across stages (the
        # engine's askedIds is one flat list for the whole script).
        prefixes = list(_STAGE_ID_PREFIX.values())
        assert len(prefixes) == len(set(prefixes))


def _activity(**overrides) -> SimpleNamespace:
    base = dict(
        id="11111111-1111-1111-1111-111111111111",
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


class TestResolveFrameworkAndLevel:
    def test_blooms_default_uses_bloom_level(self):
        fw, level, fallback = resolve_framework_and_level(_activity())
        assert (fw, level, fallback) == ("blooms", 4, False)

    def test_unknown_framework_falls_back_to_blooms(self):
        fw, level, fallback = resolve_framework_and_level(
            _activity(primary_framework="not-a-real-framework", bloom_level=3)
        )
        assert fw == "blooms"
        assert level == 3
        assert fallback is False

    def test_marzano_with_level_set_is_used_directly(self):
        fw, level, fallback = resolve_framework_and_level(
            _activity(primary_framework="marzano", marzano_level=3)
        )
        assert (fw, level, fallback) == ("marzano", 3, False)

    def test_dok_with_level_set(self):
        fw, level, fallback = resolve_framework_and_level(
            _activity(primary_framework="dok", dok_level=2)
        )
        assert (fw, level, fallback) == ("dok", 2, False)

    def test_solo_with_level_set(self):
        fw, level, fallback = resolve_framework_and_level(
            _activity(primary_framework="solo", solo_level=5)
        )
        assert (fw, level, fallback) == ("solo", 5, False)

    def test_null_framework_level_falls_back_to_bloom_and_reports_it(self):
        fw, level, fallback = resolve_framework_and_level(
            _activity(primary_framework="marzano", marzano_level=None, bloom_level=2)
        )
        assert fw == "blooms"
        assert level == 2
        assert fallback is True

    def test_empty_framework_string_defaults_to_blooms(self):
        fw, level, fallback = resolve_framework_and_level(
            _activity(primary_framework="", bloom_level=1)
        )
        assert fw == "blooms"
        assert fallback is False


class TestQuestionCount:
    def test_low_bloom_level_weights_early_stages(self):
        assert _question_count("orient", "blooms", 1) == 2
        assert _question_count("reflect", "blooms", 1) == 1

    def test_high_bloom_level_weights_late_stages(self):
        assert _question_count("orient", "blooms", 6) == 1
        assert _question_count("reflect", "blooms", 6) == 2

    def test_mid_level_is_flat_default(self):
        assert _question_count("orient", "blooms", 3) == 2
        assert _question_count("reflect", "blooms", 3) == 2

    def test_null_level_is_flat_default(self):
        assert _question_count("orient", "blooms", None) == 2
        assert _question_count("reflect", "blooms", None) == 2

    def test_every_stage_gets_at_least_one_question(self):
        from services.peri_script_validator import STAGE_ORDER
        for level in (1, 2, 3, 4, 5, 6, None):
            for stage in STAGE_ORDER:
                assert _question_count(stage, "blooms", level) >= 1


class TestDeriveFocusTerms:
    def test_combines_features_and_keywords_deduped(self):
        terms = derive_focus_terms({
            "features": ["Rooms", "alcove"],
            "keywords": ["alcove", "Kiva"],
        })
        assert terms == ["rooms", "alcove", "kiva"]

    def test_handles_missing_fields_gracefully(self):
        assert derive_focus_terms({}) == []
        assert derive_focus_terms(None) == []

    def test_caps_at_limit(self):
        terms = derive_focus_terms({"features": [f"term{i}" for i in range(10)]}, limit=4)
        assert len(terms) == 4


class TestComputeSourceHash:
    def test_same_inputs_produce_same_hash(self):
        a1 = _activity()
        a2 = _activity()
        assert compute_source_hash(a1, "blooms", 4) == compute_source_hash(a2, "blooms", 4)

    def test_changing_location_changes_hash(self):
        base = compute_source_hash(_activity(), "blooms", 4)
        changed = compute_source_hash(_activity(location_name="Somewhere Else"), "blooms", 4)
        assert base != changed

    def test_changing_grade_changes_hash(self):
        base = compute_source_hash(_activity(), "blooms", 4)
        changed = compute_source_hash(_activity(grade_level=6), "blooms", 4)
        assert base != changed

    def test_changing_framework_or_level_changes_hash(self):
        base = compute_source_hash(_activity(), "blooms", 4)
        assert base != compute_source_hash(_activity(), "marzano", 4)
        assert base != compute_source_hash(_activity(), "blooms", 5)

    def test_changing_rubric_id_changes_hash(self):
        base = compute_source_hash(_activity(), "blooms", 4)
        changed = compute_source_hash(
            _activity(rubric_id="33333333-3333-3333-3333-333333333333"), "blooms", 4
        )
        assert base != changed


@pytest.mark.asyncio
class TestSelectRubricCriteria:
    async def test_no_rubric_id_returns_none(self):
        class _FakeDB:
            async def execute(self, *a, **k):
                raise AssertionError("should not query when rubric_id is None")
        result = await select_rubric_criteria(_FakeDB(), _activity(rubric_id=None))
        assert result is None

    async def test_prefers_required_then_weight_capped_at_six(self):
        criteria = (
            [{"id": f"opt{i}", "name": f"Optional {i}", "required": False, "weight": 10 - i} for i in range(5)]
            + [{"id": "req1", "name": "Required low weight", "required": True, "weight": 1}]
            + [{"id": "req2", "name": "Required high weight", "required": True, "weight": 9}]
        )

        class _Result:
            def __init__(self, value):
                self._value = value
            def scalar_one_or_none(self):
                return self._value
            def scalars(self):
                return self
            def all(self):
                return self._value

        standards_set = SimpleNamespace(criteria=criteria)

        class _FakeDB:
            def __init__(self):
                self._call = 0
            async def execute(self, *a, **k):
                self._call += 1
                if self._call == 1:
                    return _Result(standards_set)
                return _Result([])

        activity = _activity(rubric_id="22222222-2222-2222-2222-222222222222")
        result = await select_rubric_criteria(_FakeDB(), activity)
        assert result is not None
        assert len(result) == 6
        # Both required criteria must be present, ahead of every optional one.
        ids = [c["id"] for c in result]
        assert ids[0] == "req2"  # required, higher weight
        assert ids[1] == "req1"  # required, lower weight
        assert set(ids[2:]) <= {f"opt{i}" for i in range(5)}
