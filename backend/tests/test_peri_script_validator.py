# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Unit tests for services/peri_script_validator.py — pure, no DB/network."""

from __future__ import annotations

import json

from services.peri_script_validator import (
    HARD_CAP_BYTES,
    K2_MAX_WORDS,
    MIXED_AGE_HARD_CAP_BYTES,
    validate_peri_script,
    validate_question_text,
)


def _question(id_: str, q, on: list[str] | None = None) -> dict:
    d = {"id": id_, "q": q}
    if on:
        d["on"] = on
    return d


def _full_script(**stage_overrides) -> dict:
    """A clean, fully-populated script — every stage has >=1 valid question.
    Individual tests override one stage to introduce exactly one problem."""
    base = {
        "orient": [_question("o1", "What do you first notice here?")],
        "observe": [_question("b1", "How many rooms can you count?")],
        "classify": [_question("c1", "How would you group what you see?")],
        "explain": [_question("e1", "Why might this shape have been chosen?")],
        "connect": [_question("n1", "What does this remind you of elsewhere?")],
        "reflect": [_question("r1", "What is the one thing you want to remember?")],
    }
    base.update(stage_overrides)
    return {"v": 1, "place": "Cliff Palace", "stages": base}


class TestValidateQuestionText:
    def test_clean_question_has_no_problems(self):
        assert validate_question_text("How many rooms can you count?") == []

    def test_k2_rejects_a_question_over_the_word_ceiling(self):
        long_q = "What do you notice about the way the stones are stacked up near the base of this very old wall?"
        assert len(long_q.split()) > K2_MAX_WORDS
        problems = validate_question_text(long_q, grade_band="k-2")
        assert any("K-2" in p and "12 words" in p for p in problems)

    def test_k2_accepts_a_question_at_or_under_the_word_ceiling(self):
        short_q = "What color is the wall?"
        assert len(short_q.split()) <= K2_MAX_WORDS
        assert validate_question_text(short_q, grade_band="k-2") == []

    def test_non_k2_band_does_not_apply_the_word_ceiling(self):
        long_q = "What do you notice about the way the stones are stacked up near the base of this very old wall?"
        assert validate_question_text(long_q, grade_band="3-5") == []
        assert validate_question_text(long_q, grade_band=None) == []

    def test_empty_text_is_rejected(self):
        assert validate_question_text("") != []
        assert validate_question_text("   ") != []

    def test_rejects_zero_question_marks(self):
        problems = validate_question_text("Describe what you see.")
        assert any("question mark" in p for p in problems)

    def test_rejects_more_than_one_question_mark(self):
        problems = validate_question_text("What do you see? Why is that?")
        assert any("question mark" in p for p in problems)

    def test_rejects_more_than_two_sentences(self):
        problems = validate_question_text("Look around. Think carefully. What do you see?")
        assert any("2 sentences" in p for p in problems)

    def test_accepts_exactly_two_sentences(self):
        assert validate_question_text("Look around carefully. What do you see?") == []

    def test_rejects_yes_no_openers(self):
        for opener in ["Is the kiva round?", "Do you see rocks?", "Can you count the rooms?", "Will it rain?"]:
            problems = validate_question_text(opener)
            assert any("yes/no" in p for p in problems), opener

    def test_leakage_check_catches_copied_description_sentence(self):
        description = (
            "The alcove was carved from sandstone over many centuries by wind and water."
        )
        # Copies a 6+ word run verbatim from the description.
        leaky = "What do you think about the alcove was carved from sandstone over many centuries?"
        from services.peri_script_validator import _word_runs
        problems = validate_question_text(leaky, leakage_runs=_word_runs(description))
        assert any("leakage" in p or "verbatim" in p for p in problems)

    def test_no_leakage_false_positive_on_unrelated_question(self):
        description = "The alcove was carved from sandstone over many centuries by wind and water."
        from services.peri_script_validator import _word_runs
        problems = validate_question_text(
            "How many rooms can you count from here?", leakage_runs=_word_runs(description)
        )
        assert problems == []


class TestValidatePeriScript:
    def test_clean_script_has_no_issues(self):
        assert validate_peri_script(_full_script()) == []

    def test_rejects_empty_stage(self):
        script = _full_script(observe=[])
        issues = validate_peri_script(script)
        codes = [i.code for i in issues]
        assert "empty_stage" in codes
        assert any(i.stage == "observe" for i in issues)

    def test_rejects_missing_stage_key_same_as_empty(self):
        script = _full_script()
        del script["stages"]["reflect"]
        issues = validate_peri_script(script)
        assert any(i.code == "empty_stage" and i.stage == "reflect" for i in issues)

    def test_rejects_duplicate_ids_across_stages(self):
        script = _full_script(reflect=[_question("o1", "What will you remember?")])
        issues = validate_peri_script(script)
        assert any(i.code == "duplicate_id" for i in issues)

    def test_rejects_question_text_problems_with_stage_and_id_context(self):
        script = _full_script(observe=[_question("b1", "Is it big")])
        issues = validate_peri_script(script)
        q_issues = [i for i in issues if i.code == "question_text"]
        assert q_issues
        assert q_issues[0].stage == "observe"
        assert q_issues[0].question_id == "b1"

    def test_rejects_oversized_script(self):
        huge_question = "What do you see? " + ("x" * (HARD_CAP_BYTES + 1000))
        script = _full_script(reflect=[_question("r1", huge_question)])
        issues = validate_peri_script(script)
        assert any(i.code == "size_exceeded" for i in issues)

    def test_accepts_script_at_target_size(self):
        # A normal, moderately-worded 6-stage script comfortably under the cap.
        issues = validate_peri_script(_full_script())
        assert not any(i.code == "size_exceeded" for i in issues)
        assert len(json.dumps(_full_script()).encode("utf-8")) < HARD_CAP_BYTES

    def test_rejects_script_with_no_questions_anywhere(self):
        issues = validate_peri_script({"v": 1, "stages": {}})
        assert any(i.code == "no_questions" for i in issues)
        # Every stage is also individually flagged empty.
        assert len([i for i in issues if i.code == "empty_stage"]) == 6

    def test_leakage_check_applied_across_whole_script(self):
        description = "The alcove was carved from sandstone over many centuries by wind and water."
        script = _full_script(
            observe=[_question("b1", "What do you think about the alcove was carved from sandstone over many centuries?")]
        )
        issues = validate_peri_script(script, location_description=description)
        assert any(i.code == "question_text" and "verbatim" in i.message for i in issues)


class TestMixedAgeWordings:
    def _mixed_script(self, **stage_overrides) -> dict:
        script = _full_script(**stage_overrides)
        script["grade_span"] = {"min": 1, "max": 6}
        # Convert every plain-string q into a clean {lo, hi} pair unless the
        # test already overrode that stage with its own dict-form q.
        for stage, questions in script["stages"].items():
            for q in questions:
                if isinstance(q["q"], str):
                    q["q"] = {"lo": q["q"], "hi": q["q"]}
        return script

    def test_clean_mixed_age_script_has_no_issues(self):
        assert validate_peri_script(self._mixed_script()) == []

    def test_each_wording_checked_against_its_own_band(self):
        long_q = "What do you notice about the way the stones are stacked up near the base of this very old wall?"
        script = self._mixed_script(
            observe=[_question("b1", {"lo": long_q, "hi": long_q})]
        )
        issues = validate_peri_script(script, lo_band="k-2", hi_band="9-12")
        lo_issues = [i for i in issues if i.code == "question_text" and i.message.startswith("[lo]")]
        hi_issues = [i for i in issues if i.code == "question_text" and i.message.startswith("[hi]")]
        assert any("12 words" in i.message for i in lo_issues)
        assert hi_issues == []  # same long text is fine for a 9-12 band

    def test_short_wording_passes_k2_band_on_both_sides(self):
        script = self._mixed_script(
            observe=[_question("b1", {"lo": "What color is the wall?", "hi": "What color is the wall?"})]
        )
        issues = validate_peri_script(script, lo_band="k-2", hi_band="k-2")
        assert issues == []

    def test_raised_cap_applies_when_grade_span_present(self):
        # Comfortably over the plain 8 KB cap but under the mixed-age 12 KB one.
        padding = "x" * 9000
        script = self._mixed_script(
            reflect=[_question("r1", {"lo": f"What do you see? {padding}", "hi": "What do you see?"})]
        )
        size = len(json.dumps(script).encode("utf-8"))
        assert HARD_CAP_BYTES < size < MIXED_AGE_HARD_CAP_BYTES
        issues = validate_peri_script(script)
        assert not any(i.code == "size_exceeded" for i in issues)

    def test_plain_string_q_still_works_in_an_otherwise_mixed_age_script(self):
        # Spec: "A plain string q means one wording for everyone (also how
        # old scripts keep working)" -- even inside a script that otherwise
        # has a grade_span set.
        script = _full_script()
        script["grade_span"] = {"min": 1, "max": 6}
        assert validate_peri_script(script) == []


_WAYPOINTS = [
    {"id": "wp-1", "name": "Oak Tree", "clue_text": "Look for the biggest trunk."},
    {"id": "wp-2", "name": "Stone Bridge", "clue_text": "It crosses the creek."},
]


def _hunt_script(stop_question: dict, **stop_overrides) -> dict:
    """A clean activity-level script (orient/connect/reflect only -- stop
    questions live in 'stops', not the activity stages) plus one stop for
    wp-1 with a single overridable question."""
    script = _full_script(
        observe=[], classify=[], explain=[],
    )
    script["stops"] = {
        "wp-1": {"focus": ["oak tree"], "stages": {"observe": [stop_question]}},
        **stop_overrides,
    }
    return script


class TestHuntStops:
    """PERI_OFFLINE_SPEC_v2.md 'Impact on wayfinding' points 2, 5: per-stop
    questions get the same text-quality checks as activity-level ones, plus
    a no-spoiler check against the stop's own clue and every OTHER stop's
    name."""

    def test_clean_stop_question_has_no_issues(self):
        script = _hunt_script(_question("b1_wp-1", "What pattern do you see in the bark?"))
        issues = validate_peri_script(script, waypoints=_WAYPOINTS)
        assert issues == []

    def test_stop_question_naming_another_stop_is_rejected(self):
        script = _hunt_script(_question("b1_wp-1", "Is this taller than the Stone Bridge?"))
        issues = validate_peri_script(script, waypoints=_WAYPOINTS)
        assert any(i.code == "spoiler" for i in issues)

    def test_stop_question_leaking_its_own_clue_is_rejected(self):
        # LEAKAGE_RUN_LENGTH is 6 words -- _WAYPOINTS's 5-word clue can never
        # trigger it, so this test uses its own longer clue.
        waypoints = [{"id": "wp-1", "name": "Oak Tree", "clue_text": "Look for the biggest trunk you can find here"}]
        script = _hunt_script(_question("b1_wp-1", "Can you look for the biggest trunk you can find?"))
        issues = validate_peri_script(script, waypoints=waypoints)
        assert any(i.code == "question_text" and "copies a long run" in i.message for i in issues)

    def test_stop_question_over_140_chars_is_rejected(self):
        long_q = "What " + ("very " * 30) + "long question is this one here right now?"
        script = _hunt_script(_question("b1_wp-1", long_q))
        issues = validate_peri_script(script, waypoints=_WAYPOINTS)
        assert any(i.code == "size_exceeded" and i.stage == "stop:observe" for i in issues)

    def test_free_choice_mode_still_rejects_naming_another_stop(self):
        # The check itself doesn't vary by mode (every mode rejects naming
        # another stop -- see _mentions_other_stop's docstring) but the
        # message should say so for a free-choice hunt specifically.
        script = _hunt_script(_question("b1_wp-1", "Is the Stone Bridge visible from here?"))
        issues = validate_peri_script(script, waypoints=_WAYPOINTS, wayfinding_mode="free_choice")
        spoiler_issues = [i for i in issues if i.code == "spoiler"]
        assert spoiler_issues
        assert "free-choice" in spoiler_issues[0].message

    def test_mixed_age_stop_wording_checked_on_both_sides(self):
        script = _hunt_script(_question("b1_wp-1", {"lo": "Is the Stone Bridge visible?", "hi": "What do you see?"}))
        issues = validate_peri_script(script, waypoints=_WAYPOINTS)
        assert any(i.code == "spoiler" and "[lo]" in i.message for i in issues)

    def test_stops_ignored_when_no_waypoints_passed(self):
        # Caller omits waypoints for a non-hunt activity -- the whole
        # stops-validation block is skipped, not an error.
        script = _hunt_script(_question("b1_wp-1", "Is the Stone Bridge visible from here?"))
        issues = validate_peri_script(script)
        assert not any(i.code == "spoiler" for i in issues)
