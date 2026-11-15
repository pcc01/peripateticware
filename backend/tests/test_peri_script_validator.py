# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Unit tests for services/peri_script_validator.py — pure, no DB/network."""

from __future__ import annotations

import json

from services.peri_script_validator import (
    HARD_CAP_BYTES,
    validate_peri_script,
    validate_question_text,
)


def _question(id_: str, q: str, on: list[str] | None = None) -> dict:
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
