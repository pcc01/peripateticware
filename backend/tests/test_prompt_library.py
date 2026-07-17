# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Unit tests for services/prompt_library.py.

These are pure string-building functions with no DB or network
dependencies, so no mocking of get_db / get_current_user is required —
just call them directly with sample inputs and assert the resulting
prompt strings contain the expected placeholders/content.
"""

from __future__ import annotations

import json

import pytest

from services.prompt_library import (
    build_peri_prompt,
    build_standards_extraction_prompt,
    build_activity_generation_prompt,
    build_activity_prompt,
)


# ===========================================================================
# build_peri_prompt
# ===========================================================================

class TestBuildPeriPrompt:
    def test_includes_core_context_fields(self):
        prompt = build_peri_prompt(
            location_name="Forest Park",
            location_description="A dense urban forest with a creek.",
            subject="Biology",
            grade_level=5,
            bloom_level="analyze",
            inquiry_stage="observe",
            student_observation="I see a tall tree with red leaves.",
            learning_objectives=["Identify native tree species"],
            prior_questions=["What colors do you see?"],
        )
        assert isinstance(prompt, str)
        assert "Forest Park" in prompt
        assert "A dense urban forest with a creek." in prompt
        assert "Biology" in prompt
        assert "Grade level: 5" in prompt
        assert "analyze" in prompt
        assert "OBSERVE" in prompt  # inquiry stage uppercased
        assert "I see a tall tree with red leaves." in prompt
        assert "Identify native tree species" in prompt
        assert "What colors do you see?" in prompt
        # RULES section always present, regardless of inputs
        assert "Ask exactly ONE question" in prompt
        assert "RESPOND WITH THE QUESTION ONLY." in prompt

    def test_defaults_when_optional_fields_omitted(self):
        """When location_description/observation/objectives/prior_questions
        are omitted, the prompt still renders without raising and without
        leaking None into the text."""
        prompt = build_peri_prompt(
            location_name="Riverside Trail",
            subject="Ecology",
            grade_level=3,
        )
        assert "Riverside Trail" in prompt
        assert "None" not in prompt
        # default inquiry_stage is "observe"
        assert "OBSERVE" in prompt
        # default bloom_level is "analyze"
        assert "analyze" in prompt

    def test_unknown_bloom_level_falls_back_gracefully(self):
        prompt = build_peri_prompt(
            location_name="Beach",
            subject="Geology",
            grade_level=7,
            bloom_level="not-a-real-level",
        )
        # Falls back to the generic bloom_plain phrase rather than KeyError
        assert "analyse and explain" in prompt

    def test_unknown_inquiry_stage_falls_back_to_observe(self):
        prompt = build_peri_prompt(
            location_name="Beach",
            subject="Geology",
            grade_level=7,
            inquiry_stage="not-a-real-stage",
        )
        # Falls back to the "observe" stage instruction text
        assert "pushes them to describe MORE precisely" in prompt

    def test_prior_questions_truncated_to_last_three(self):
        prompt = build_peri_prompt(
            location_name="Beach",
            subject="Geology",
            grade_level=7,
            prior_questions=["Q1", "Q2", "Q3", "Q4", "Q5"],
        )
        assert "Q5" in prompt
        assert "Q4" in prompt
        assert "Q3" in prompt
        assert "Q1" not in prompt
        assert "Q2" not in prompt


# ===========================================================================
# build_standards_extraction_prompt
# ===========================================================================

class TestBuildStandardsExtractionPrompt:
    def test_includes_document_text_and_type_instructions(self):
        prompt = build_standards_extraction_prompt(
            document_text="LS1-1: Students who demonstrate understanding can...",
            document_type="standards",
            subject="Science",
            grade_band="3-5",
        )
        assert "DOCUMENT TYPE: STANDARDS" in prompt
        assert "Subject area: Science" in prompt
        assert "Grade band: 3-5" in prompt
        assert "LS1-1: Students who demonstrate understanding can..." in prompt
        assert "Extract every measurable standard or benchmark" in prompt
        # JSON field contract always present
        assert '"id"' not in prompt  # fields are listed without quotes here
        assert "id          — kebab-case unique identifier" in prompt
        assert "Return ONLY a valid JSON array" in prompt

    def test_rubric_document_type_uses_rubric_instructions(self):
        prompt = build_standards_extraction_prompt(
            document_text="Criterion 1: Evidence use...",
            document_type="rubric",
        )
        assert "Extract every assessment criterion and its performance levels" in prompt

    def test_unknown_document_type_falls_back_to_generic_instructions(self):
        prompt = build_standards_extraction_prompt(
            document_text="Some text",
            document_type="not-a-real-type",
        )
        assert "Extract every measurable learning criterion." in prompt

    def test_truncates_document_text_to_max_chars(self):
        long_text = "A" * 20000
        prompt = build_standards_extraction_prompt(
            document_text=long_text,
            max_chars=100,
        )
        # Only the first 100 chars of the document should appear between the markers
        start = prompt.index("DOCUMENT TEXT:\n---\n") + len("DOCUMENT TEXT:\n---\n")
        end = prompt.index("\n---\n\nJSON ARRAY:")
        embedded_doc = prompt[start:end]
        assert embedded_doc == "A" * 100
        assert len(embedded_doc) == 100


# ===========================================================================
# build_activity_generation_prompt
# ===========================================================================

class TestBuildActivityGenerationPrompt:
    def test_includes_location_and_curriculum_context(self):
        prompt = build_activity_generation_prompt(
            location_name="Golden Gate Park",
            location_description="A large urban park with diverse ecosystems.",
            wikipedia_extract="Golden Gate Park is an urban park...",
            subject="Environmental Science",
            grade_level=6,
            taxonomy_type="blooms",
            taxonomy_levels={"bloom_level": 4, "dok_level": 3},
            learning_objectives=["Understand urban ecosystem diversity"],
            curriculum_standards=["NGSS-MS-LS2-1"],
            num_activities=2,
            activity_types=["hands_on"],
        )
        assert "Golden Gate Park" in prompt
        assert "A large urban park with diverse ecosystems." in prompt
        assert "Golden Gate Park is an urban park..." in prompt
        assert "Environmental Science" in prompt
        assert "Grade level: 6" in prompt
        assert "Understand urban ecosystem diversity" in prompt
        assert "NGSS-MS-LS2-1" in prompt
        assert "Generate 2 field-based learning activities" in prompt
        # Bloom's / DOK descriptors resolved from taxonomy_levels
        assert "Level 4 — Analyse" in prompt
        assert "Level 3 — Strategic Thinking" in prompt
        # JSON schema contract present
        assert '"title": "string — 8 words max"' in prompt
        assert "Return ONLY a valid JSON array" in prompt

    def test_defaults_when_optional_fields_omitted(self):
        prompt = build_activity_generation_prompt(
            location_name="City Creek",
            subject="Geology",
            grade_level=4,
        )
        assert "City Creek" in prompt
        assert "Generate 3 field-based learning activities" in prompt  # default num_activities
        # default taxonomy_levels bloom=4, dok=3
        assert "Level 4 — Analyse" in prompt
        assert "Level 3 — Strategic Thinking" in prompt
        assert "None" not in prompt

    def test_wikipedia_extract_truncated_to_600_chars(self):
        long_extract = "B" * 5000
        prompt = build_activity_generation_prompt(
            location_name="Test Location",
            subject="History",
            grade_level=8,
            wikipedia_extract=long_extract,
        )
        assert ("B" * 600) in prompt
        assert ("B" * 601) not in prompt


# ===========================================================================
# build_activity_prompt (sibling function — sanity-checked alongside the
# three primary targets since it shares the same taxonomy-descriptor logic)
# ===========================================================================

class TestBuildActivityPrompt:
    def test_includes_coords_when_provided(self):
        prompt = build_activity_prompt(
            title="Creek Study",
            description="Investigate the creek ecosystem",
            subject="Biology",
            grade_level=5,
            location_name="Cedar Creek",
            location_lat=37.1234,
            location_lng=-122.5678,
        )
        assert "Coordinates: 37.1234, -122.5678" in prompt

    def test_omits_coords_when_not_provided(self):
        prompt = build_activity_prompt(
            title="Creek Study",
            description="Investigate the creek ecosystem",
            subject="Biology",
            grade_level=5,
            location_name="Cedar Creek",
        )
        assert "Coordinates:" not in prompt
