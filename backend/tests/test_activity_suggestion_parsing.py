# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for ActivityGenerationService._parse_suggestions() — found broken via
a real live prod test of "Suggest Activities": the prompt instructs the
model to "Return ONLY a valid JSON array. No markdown, no preamble," but a
model can (and, against real Claude, did) add a conversational sentence
before the array anyway while still omitting the markdown fence, e.g.
"Here are three activities:\n\n[...]". The parser only ever stripped
markdown fences — with no fence present, the whole response (preamble
included) went to json.loads() as one blob and failed, and the failure
fallback surfaces the raw text as a single card's description, which is
exactly the "unformatted JSON" a teacher saw instead of real suggestions.
"""

import json

from services.activity_generation_service import ActivityGenerationService

_ONE_ACTIVITY = {
    "title": "Wetland Watch",
    "description": "Students survey the wetland edge for signs of life.",
    "learning_objectives": ["Identify indicator species"],
    "bloom_level": 4,
    "marzano_level": 3,
    "dok_level": 3,
    "solo_level": 4,
    "estimated_duration_minutes": 60,
    "materials_needed": ["clipboard", "field guide"],
    "activity_type": "field_observation",
    "reasoning": "Uses the site as an active learning environment.",
}


def _service() -> ActivityGenerationService:
    return ActivityGenerationService(llm_provider="claude")


class TestParseSuggestionsHappyPaths:
    def test_bare_json_array_no_fence_no_preamble(self):
        """The exact shape the prompt asks for — must keep working."""
        raw = json.dumps([_ONE_ACTIVITY])
        result = _service()._parse_suggestions(raw, "Golden Gate Park")
        assert len(result) == 1
        assert result[0]["title"] == "Wetland Watch"

    def test_json_fenced_with_json_marker(self):
        raw = f"```json\n{json.dumps([_ONE_ACTIVITY])}\n```"
        result = _service()._parse_suggestions(raw, "Golden Gate Park")
        assert len(result) == 1
        assert result[0]["title"] == "Wetland Watch"

    def test_json_fenced_plain(self):
        raw = f"```\n{json.dumps([_ONE_ACTIVITY])}\n```"
        result = _service()._parse_suggestions(raw, "Golden Gate Park")
        assert len(result) == 1


class TestParseSuggestionsPreambleRegression:
    """The specific bug: no markdown fence, but a sentence before the array."""

    def test_preamble_sentence_no_fence(self):
        raw = f"Here are three field-based activities for your class:\n\n{json.dumps([_ONE_ACTIVITY])}"
        result = _service()._parse_suggestions(raw, "Golden Gate Park")
        assert len(result) == 1
        assert result[0]["title"] == "Wetland Watch"
        # The real bug's symptom: raw JSON ending up in the description.
        assert "Here are three" not in result[0]["description"]

    def test_trailing_commentary_no_fence(self):
        raw = f"{json.dumps([_ONE_ACTIVITY])}\n\nLet me know if you'd like more detail on any of these!"
        result = _service()._parse_suggestions(raw, "Golden Gate Park")
        assert len(result) == 1
        assert result[0]["title"] == "Wetland Watch"

    def test_preamble_and_trailing_commentary_no_fence(self):
        raw = (
            "Sure! Here are some ideas:\n\n"
            f"{json.dumps([_ONE_ACTIVITY])}\n\n"
            "Happy to adjust the difficulty level if needed."
        )
        result = _service()._parse_suggestions(raw, "Golden Gate Park")
        assert len(result) == 1
        assert result[0]["title"] == "Wetland Watch"


class TestParseSuggestionsGenuineFailure:
    def test_no_json_at_all_falls_back_gracefully(self):
        """No brackets anywhere — must degrade to the single-activity
        fallback, not raise, and must not crash on the ValueError from
        str.index()/.rindex() finding nothing."""
        raw = "I'm sorry, I can't generate activities for that location."
        result = _service()._parse_suggestions(raw, "Golden Gate Park")
        assert len(result) == 1
        assert result[0]["title"] == "Activity Suggestion"
        assert "sorry" in result[0]["description"].lower()

    def test_malformed_json_inside_brackets_falls_back_gracefully(self):
        raw = "Here you go:\n\n[{title: 'missing quotes on keys'}]"
        result = _service()._parse_suggestions(raw, "Golden Gate Park")
        assert len(result) == 1
        assert result[0]["title"] == "Activity Suggestion"
