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
  • size cap (hard cap 8 KB)
  • every question has exactly one question mark
  • every question is at most 2 sentences
  • no yes/no openers ("Is...", "Do...", "Can...", etc.)
  • no leakage: a question must not copy a long run of words verbatim from
    the place description — the script asks, it never asserts place facts
    (section B.6)
  • no empty stages — all six inquiry stages must have at least one question
    so the on-device engine never dead-ends

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


def validate_question_text(text: str, *, leakage_runs: set[str] | None = None) -> list[str]:
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
    return problems


def validate_peri_script(script: dict, *, location_description: str = "") -> list[PeriScriptIssue]:
    """Validate a full peri_script dict. Returns [] if clean."""
    issues: list[PeriScriptIssue] = []

    raw = json.dumps(script or {}, ensure_ascii=False)
    size_bytes = len(raw.encode("utf-8"))
    if size_bytes > HARD_CAP_BYTES:
        issues.append(PeriScriptIssue(
            None, None, "size_exceeded",
            f"script is {size_bytes} bytes, over the {HARD_CAP_BYTES}-byte hard cap",
        ))

    leakage_runs = _word_runs(location_description) if location_description else set()
    stages = (script or {}).get("stages") or {}
    seen_ids: dict[str, str] = {}  # id -> first stage it appeared in
    any_questions = False

    for stage in STAGE_ORDER:
        questions = stages.get(stage) or []
        if not questions:
            issues.append(PeriScriptIssue(stage, None, "empty_stage", f"stage '{stage}' has no questions"))
            continue
        any_questions = True
        for q in questions:
            qid = q.get("id")
            text = q.get("q", "")
            if qid in seen_ids:
                issues.append(PeriScriptIssue(
                    stage, qid, "duplicate_id",
                    f"question id '{qid}' already used in stage '{seen_ids[qid]}' — "
                    "ids must be unique across the whole script",
                ))
            else:
                seen_ids[qid] = stage
            for problem in validate_question_text(text, leakage_runs=leakage_runs):
                issues.append(PeriScriptIssue(stage, qid, "question_text", problem))

    if not any_questions:
        issues.append(PeriScriptIssue(None, None, "no_questions", "script has no questions in any stage"))

    return issues


def is_valid(script: dict, *, location_description: str = "") -> bool:
    return len(validate_peri_script(script, location_description=location_description)) == 0
