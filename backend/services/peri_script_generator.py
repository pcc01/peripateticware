# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
services/peri_script_generator.py

Generates a draft on-device Peri dialogue script for an activity
(PERI_OFFLINE_SPEC_v2.md section B). One LLM call per question, reusing
build_peri_prompt() so the model's cognitive target is whatever the teacher
actually configured (framework/level/rubric), not a hardcoded Bloom level.

Returns a DRAFT (`approved: False`) — the caller (routes/activities.py) is
responsible for persisting it and never auto-approving it. Raises
agents.provider.ProviderUnavailableError on LLM outage so the caller can
translate that to HTTP 503, matching routes/inference.py's /inquiry.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.database import Activity, ActivityStandardsMap, StandardsSet
from services.prompt_library import SYSTEM_PERI, build_peri_prompt
from services.peri_script_validator import STAGE_ORDER

logger = logging.getLogger(__name__)

# DB column holding the integer level for each known framework
# (models/database.py Activity). Mirrors prompt_library._FRAMEWORK_INT_TO_KEY's
# framework set, minus the string/int key mapping (build_peri_prompt handles
# that part once we hand it the raw integer).
_FRAMEWORK_LEVEL_COLUMN = {
    "blooms": "bloom_level",
    "marzano": "marzano_level",
    "dok": "dok_level",
    "solo": "solo_level",
}

# "Low"/"high" level keys per framework, used only to bias how many
# questions land in the early vs. late inquiry stages (spec "How framework
# and level shape the script"). Mid-range levels get the flat default.
_LOW_LEVEL_BY_FRAMEWORK = {
    "blooms": {1, 2},
    "marzano": {1, 2},
    "dok": {1},
    "solo": {1, 2},
}
_HIGH_LEVEL_BY_FRAMEWORK = {
    "blooms": {5, 6},
    "marzano": {4},
    "dok": {3, 4},
    "solo": {4, 5},
}

_EARLY_STAGES = {"orient", "observe", "classify"}
_LATE_STAGES = {"explain", "connect", "reflect"}

_DEFAULT_QUESTIONS_PER_STAGE = 2
_MAX_RUBRIC_CRITERIA = 6


def resolve_framework_and_level(activity: Activity) -> tuple[str, Optional[int], bool]:
    """Resolve (framework, level, level_was_fallback_to_bloom) per
    PERI_OFFLINE_SPEC_v2.md "Taxonomy and rubric" resolution order steps 1-2.

    Unknown/missing framework -> "blooms" (the stated default). A resolved
    framework whose own level column is NULL falls back to the
    always-present bloom_level, with level_was_fallback_to_bloom=True so the
    caller can report that to the teacher.
    """
    framework = (activity.primary_framework or "").strip().lower()
    if framework not in _FRAMEWORK_LEVEL_COLUMN:
        framework = "blooms"
    level = getattr(activity, _FRAMEWORK_LEVEL_COLUMN[framework], None)
    if level is not None:
        return framework, level, False
    return "blooms", activity.bloom_level, True


def _question_count(stage: str, framework: str, level: Optional[int]) -> int:
    """2 by default; biased toward early or late stages at low/high
    cognitive levels (spec: "Low levels... put the weight on orient,
    observe and classify; high levels add more explain, connect and
    reflect questions. All stages remain present...")."""
    if level is None:
        return _DEFAULT_QUESTIONS_PER_STAGE
    if level in _LOW_LEVEL_BY_FRAMEWORK.get(framework, set()):
        return 2 if stage in _EARLY_STAGES else 1
    if level in _HIGH_LEVEL_BY_FRAMEWORK.get(framework, set()):
        return 1 if stage in _EARLY_STAGES else 2
    return _DEFAULT_QUESTIONS_PER_STAGE


async def select_rubric_criteria(db: AsyncSession, activity: Activity) -> Optional[list[dict]]:
    """Up to 6 criteria: required first, then highest weight, with criteria
    already mapped to this activity (ActivityStandardsMap) preferred within
    those ties (spec "Taxonomy and rubric", rubric criteria selection)."""
    if not activity.rubric_id:
        return None
    standards_set = (await db.execute(
        select(StandardsSet).where(StandardsSet.id == activity.rubric_id)
    )).scalar_one_or_none()
    if not standards_set or not standards_set.criteria:
        return None

    mapped_ids = set((await db.execute(
        select(ActivityStandardsMap.criterion_id).where(
            ActivityStandardsMap.activity_id == activity.id
        )
    )).scalars().all())

    def sort_key(c: dict) -> tuple:
        required = bool(c.get("required"))
        weight = float(c.get("weight") or 0)
        mapped = c.get("id") in mapped_ids
        return (not required, not mapped, -weight)

    ordered = sorted(standards_set.criteria, key=sort_key)
    return ordered[:_MAX_RUBRIC_CRITERIA] or None


def derive_focus_terms(location_wiki_data: dict, limit: int = 6) -> list[str]:
    """Candidate {focus} terms from the teacher's Wikidata/Wikipedia
    enrichment — features and keywords are short noun phrases, exactly the
    shape a script's `focus` list wants."""
    terms: list[str] = []
    for key in ("features", "keywords"):
        for raw in (location_wiki_data or {}).get(key) or []:
            term = str(raw).strip().lower()
            if term and term not in terms:
                terms.append(term)
    return terms[:limit]


def compute_source_hash(activity: Activity, framework: str, level: Optional[int]) -> str:
    """Hash of everything that should invalidate a generated script if it
    changes (spec: "hash of place + subject + grade + framework + level +
    rubric id/checksum"). Public so routes/activities.py can recompute it
    against the activity's CURRENT state and compare to the stored script's
    source_hash to detect staleness, without regenerating."""
    raw = json.dumps({
        "place": activity.location_name,
        "subject": activity.subject,
        "grade": activity.grade_level,
        "framework": framework,
        "level": level,
        "rubric_id": str(activity.rubric_id) if activity.rubric_id else None,
    }, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


async def _call_llm(prompt: str, *, system: str) -> str:
    """Call the configured LLM provider directly — same provider dispatch as
    routes/inference.py's _call_llm_inference(), but with no cache: each
    generated question is unique saved content, not a repeatable runtime
    lookup. Letting agents.provider.ProviderUnavailableError propagate is
    intentional — see this module's docstring."""
    messages: list[dict] = [{"role": "user", "content": prompt}]
    if system:
        messages = [{"role": "system", "content": system}] + messages
    if settings.LLM_PROVIDER.lower() == "claude":
        from agents.provider import call_claude
        return await call_claude(
            messages=messages, model=settings.CLAUDE_MODEL,
            max_tokens=settings.CLAUDE_MAX_TOKENS, timeout=30,
        )
    from agents.provider import call_ollama
    return await call_ollama(
        messages=messages, model=settings.OLLAMA_MODEL_TEXT,
        timeout=60, temperature=0.65, num_predict=180,
    )


async def generate_peri_script(db: AsyncSession, activity: Activity) -> dict[str, Any]:
    """Generate a full draft script (all six stages). One LLM call per
    question; see _call_llm for provider dispatch and error propagation."""
    location_wiki = activity.location_wiki_data or {}
    location_name = activity.location_name or "this place"
    location_description = (location_wiki.get("description") or "")[:800]

    framework, level, level_was_fallback = resolve_framework_and_level(activity)
    rubric_criteria = await select_rubric_criteria(db, activity)
    focus_terms = derive_focus_terms(location_wiki)

    stages: dict[str, list[dict]] = {}
    prior_questions: list[str] = []
    for stage in STAGE_ORDER:
        count = _question_count(stage, framework, level)
        stage_questions: list[dict] = []
        for i in range(count):
            prompt = build_peri_prompt(
                location_name=location_name,
                location_description=location_description,
                subject=activity.subject or "",
                grade_level=activity.grade_level or 0,
                bloom_level=str(activity.bloom_level or "analyze"),
                framework=framework,
                level=level,
                rubric_criteria=rubric_criteria,
                inquiry_stage=stage,
                learning_objectives=activity.learning_objectives or [],
                prior_questions=prior_questions[-3:],
            )
            question_text = (await _call_llm(prompt, system=SYSTEM_PERI)).strip()
            qid = f"{stage[0]}{i + 1}"
            item: dict[str, Any] = {"id": qid, "q": question_text}
            matched_focus = [t for t in focus_terms if t in question_text.lower()]
            if matched_focus:
                item["on"] = matched_focus
            if rubric_criteria and i < len(rubric_criteria):
                item["crit"] = rubric_criteria[i].get("id")
            stage_questions.append(item)
            prior_questions.append(question_text)
        stages[stage] = stage_questions

    script: dict[str, Any] = {
        "v": 1,
        "framework": framework,
        "level": level,
        "rubric": (
            {"id": str(activity.rubric_id), "criteria": [c.get("id") for c in rubric_criteria]}
            if rubric_criteria else None
        ),
        "place": location_name,
        "focus": focus_terms,
        "stages": stages,
        "probes": [
            "Look again. What exactly do you see at {place}?",
            "Can you describe it with a number, a colour, or a shape?",
        ],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_hash": compute_source_hash(activity, framework, level),
        "approved": False,
    }
    if level_was_fallback:
        # Reported to the teacher in the builder draft, not asserted to the
        # student (spec "Taxonomy and rubric" step 2).
        script["level_fallback_from_bloom"] = True
    if location_wiki.get("aiGenerated"):
        # spec section B.6 — the teacher must review facts more carefully
        # when the place description itself came from the LLM's general
        # knowledge rather than a real Wikipedia/Wikidata match.
        script["place_ai_generated"] = True
    return script
