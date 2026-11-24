# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
services/peri_script_validator.py

Validates a Peri dialogue script (Activity.peri_script, PERI_OFFLINE_SPEC_v2.md
section A) before it is saved — run once right after
POST /activities/{id}/peri-script/generate produces a draft, and again on
every teacher edit in the builder UI (spec section B.3). Pure function over
the script dict: no DB, no network, fully unit-testable.

Rules enforced (spec section B.3):
  • size cap (hard cap 8 KB; 12 KB when the script has mixed-age lo/hi
    wordings — "Mixed-age groups")
  • every question has exactly one question mark
  • every question is at most 2 sentences
  • no yes/no openers ("Is...", "Do...", "Can...", etc.)
  • no leakage: a question must not copy a long run of words verbatim from
    the place description — the script asks, it never asserts place facts
    (section B.6)
  • no empty stages — all six inquiry stages must have at least one question
    so the on-device engine never dead-ends

A question's `q` field is either a plain string (one wording for everyone)
or `{"lo": ..., "hi": ...}` (mixed-age — "Mixed-age groups"). Each wording
is validated independently against its OWN grade band when one is given.

Plus one engine-correctness check not explicitly named in the spec's bullet
list but required by it implicitly: mobile/src/lib/peri/engine.ts tracks
`askedIds` as a single flat list across the WHOLE script (not per stage), so
a question id reused in a second stage would make the engine treat that
second question as already asked the moment the first one is. Duplicate ids
anywhere in the script are rejected for that reason.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

STAGE_ORDER = ["orient", "observe", "classify", "explain", "connect", "reflect"]

TARGET_SIZE_BYTES = 6 * 1024
HARD_CAP_BYTES = 8 * 1024
# Raised cap when the script carries mixed-age lo/hi wordings (spec:
# "the cap rises from 8 KB to 12 KB for a script").
MIXED_AGE_HARD_CAP_BYTES = 12 * 1024

# A question opening with one of these (case-insensitive) collapses to a
# yes/no answer — not useful for Aristotelian inquiry ("Ask Peri" RULES in
# services/prompt_library.py already tell the model this; this is the
# server-side backstop for generated AND teacher-edited text).
_YES_NO_OPENERS = (
    "is ", "are ", "was ", "were ", "am ",
    "do ", "does ", "did ",
    "can ", "could ", "will ", "would ", "should ", "shall ",
    "has ", "have ", "had ",
)

# A run of this many consecutive words copied verbatim from the place
# description counts as leakage.
LEAKAGE_RUN_LENGTH = 6


@dataclass(frozen=True)
class PeriScriptIssue:
    stage: str | None
    question_id: str | None
    code: str
    message: str


def _word_runs(text: str, run_length: int = LEAKAGE_RUN_LENGTH) -> set[str]:
    """All `run_length`-word runs in `text`, lowercased, for substring
    comparison against another text's runs."""
    words = re.findall(r"[a-z0-9']+", (text or "").lower())
    if len(words) < run_length:
        return set()
    return {
        " ".join(words[i : i + run_length])
        for i in range(len(words) - run_length + 1)
    }


def _sentence_count(text: str) -> int:
    parts = [p for p in re.split(r"[.!?]+", text.strip()) if p.strip()]
    return len(parts) or 1


def _starts_with_yes_no(text: str) -> bool:
    t = text.strip().lower()
    return any(t.startswith(opener) for opener in _YES_NO_OPENERS)


# K-2 readability ceiling (spec "Adding the K-2 band": "target 12 words or
# fewer, one idea" -- pre-readers need short, plain, spoken-style questions
# that the existing speaker button can read aloud in one breath).
K2_MAX_WORDS = 12


def validate_question_text(
    text: str, *, leakage_runs: set[str] | None = None, grade_band: str | None = None,
) -> list[str]:
    """Rules that apply to one question's text in isolation. Returns a list
    of human-readable problem strings (empty = clean)."""
    problems: list[str] = []
    stripped = (text or "").strip()
    if not stripped:
        return ["question text is empty"]

    if stripped.count("?") != 1:
        problems.append(f"must contain exactly one question mark (found {stripped.count('?')})")
    if _sentence_count(stripped) > 2:
        problems.append("must be at most 2 sentences")
    if _starts_with_yes_no(stripped):
        problems.append("must not be a yes/no question")
    if leakage_runs and (_word_runs(stripped) & leakage_runs):
        problems.append("copies a long run of words verbatim from the place description")
    if grade_band == "k-2":
        word_count = len(stripped.split())
        if word_count > K2_MAX_WORDS:
            problems.append(f"K-2 questions must be {K2_MAX_WORDS} words or fewer (found {word_count})")
    return problems


def _mentions_other_stop(text: str, own_name: str | None, all_names: list[str]) -> list[str]:
    """Other waypoints' names found inside `text` (case-insensitive
    substring) -- spec "No spoilers": a stop question must never name or
    hint at another stop, in ANY route mode (ordered hunts have no fixed
    "next" either once compare_prev is in play, and free-choice has no
    fixed next at all)."""
    lowered = (text or "").lower()
    return [n for n in all_names if n and n != own_name and n.lower() in lowered]


def validate_peri_script(
    script: dict, *, location_description: str = "",
    grade_band: str | None = None,
    lo_band: str | None = None, hi_band: str | None = None,
    # Hunt stops (spec "Impact on wayfinding"). `waypoints`: this activity's
    # own waypoints as [{"id": str, "name": str, "clue_text": str|None}],
    # for the no-spoiler check against every OTHER stop's name/clue and
    # (when wayfinding_mode == 'free_choice') a stricter cross-stop-
    # reference rejection. Omit for a non-hunt activity.
    waypoints: list[dict] | None = None,
    wayfinding_mode: str | None = None,
) -> list[PeriScriptIssue]:
    """Validate a full peri_script dict. Returns [] if clean.

    `grade_band` (spec "Adding the K-2 band" / "Grade level"): pass the
    ACTIVITY's own band (services.grade_band.grade_to_band(activity.grade_level))
    so the K-2 word-count ceiling applies to a single-wording script.

    `lo_band`/`hi_band` (spec "Mixed-age groups"): for a script with lo/hi
    wordings, pass each side's own band
    (grade_to_band(activity.grade_span_min) / grade_to_band(activity.grade_span_max))
    so each wording is checked against ITS OWN band, not the activity's.
    """
    issues: list[PeriScriptIssue] = []

    is_mixed_age = bool((script or {}).get("grade_span"))
    cap = MIXED_AGE_HARD_CAP_BYTES if is_mixed_age else HARD_CAP_BYTES
    raw = json.dumps(script or {}, ensure_ascii=False)
    size_bytes = len(raw.encode("utf-8"))
    if size_bytes > cap:
        issues.append(PeriScriptIssue(
            None, None, "size_exceeded",
            f"script is {size_bytes} bytes, over the {cap}-byte hard cap",
        ))

    leakage_runs = _word_runs(location_description) if location_description else set()
    stages = (script or {}).get("stages") or {}
    has_stops = bool((script or {}).get("stops"))
    seen_ids: dict[str, str] = {}  # id -> first stage it appeared in
    any_questions = False

    for stage in STAGE_ORDER:
        questions = stages.get(stage) or []
        if not questions:
            # Impact on wayfinding" point 1: for a hunt, observe/classify/
            # explain intentionally move to the per-stop level -- the
            # activity-level stage is SUPPOSED to be empty, not missing
            # content. orient/connect/reflect stay activity-level
            # regardless and are still required.
            if has_stops and stage in ("observe", "classify", "explain"):
                continue
            issues.append(PeriScriptIssue(stage, None, "empty_stage", f"stage '{stage}' has no questions"))
            continue
        any_questions = True
        for q in questions:
            qid = q.get("id")
            qtext = q.get("q", "")
            if qid in seen_ids:
                issues.append(PeriScriptIssue(
                    stage, qid, "duplicate_id",
                    f"question id '{qid}' already used in stage '{seen_ids[qid]}' — "
                    "ids must be unique across the whole script",
                ))
            else:
                seen_ids[qid] = stage

            if isinstance(qtext, dict):
                for key, band in (("lo", lo_band), ("hi", hi_band)):
                    for problem in validate_question_text(
                        qtext.get(key, ""), leakage_runs=leakage_runs, grade_band=band,
                    ):
                        issues.append(PeriScriptIssue(stage, qid, "question_text", f"[{key}] {problem}"))
            else:
                for problem in validate_question_text(qtext, leakage_runs=leakage_runs, grade_band=grade_band):
                    issues.append(PeriScriptIssue(stage, qid, "question_text", problem))

    if not any_questions:
        issues.append(PeriScriptIssue(None, None, "no_questions", "script has no questions in any stage"))

    stops = (script or {}).get("stops") or {}
    if stops and waypoints:
        by_id = {str(w.get("id")): w for w in waypoints}
        all_names = [w.get("name") for w in waypoints if w.get("name")]
        for wp_id, stop in stops.items():
            waypoint = by_id.get(str(wp_id))
            own_name = waypoint.get("name") if waypoint else None
            clue_runs = _word_runs(waypoint.get("clue_text") or "") if waypoint else set()
            stop_stages = stop.get("stages") or {}
            for stage_name, questions in stop_stages.items():
                for q in questions:
                    qid = q.get("id")
                    qtext = q.get("q", "")
                    texts = (
                        [("lo", qtext.get("lo", "")), ("hi", qtext.get("hi", ""))]
                        if isinstance(qtext, dict) else [(None, qtext)]
                    )
                    for key, text in texts:
                        prefix = f"[{key}] " if key else ""
                        for problem in validate_question_text(text, leakage_runs=clue_runs):
                            issues.append(PeriScriptIssue(f"stop:{stage_name}", qid, "question_text", f"{prefix}{problem}"))
                        if len(text) > 140:
                            issues.append(PeriScriptIssue(
                                f"stop:{stage_name}", qid, "size_exceeded",
                                f"{prefix}stop question is {len(text)} characters, over the 140-character cap",
                            ))
                        mentioned = _mentions_other_stop(text, own_name, all_names)
                        if mentioned:
                            issues.append(PeriScriptIssue(
                                f"stop:{stage_name}", qid, "spoiler",
                                f"{prefix}question names another stop ({', '.join(mentioned)}) -- "
                                + ("not allowed in a free-choice hunt" if wayfinding_mode == "free_choice" else "must never name or hint at another stop"),
                            ))

    return issues


def is_valid(
    script: dict, *, location_description: str = "",
    grade_band: str | None = None, lo_band: str | None = None, hi_band: str | None = None,
    waypoints: list[dict] | None = None, wayfinding_mode: str | None = None,
) -> bool:
    return len(validate_peri_script(
        script, location_description=location_description,
        grade_band=grade_band, lo_band=lo_band, hi_band=hi_band,
        waypoints=waypoints, wayfinding_mode=wayfinding_mode,
    )) == 0
