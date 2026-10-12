# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.
"""
Stage `testset`: build the query set.

Known-item design. For each target, sample leaf standards stratified by
grade, and have the generator model write a realistic field-based
Peripateticware activity that would teach that standard WITHOUT quoting it.
The sampled standard is the gold answer for that activity.

Guards against an easy test:
  * the prompt forbids the code and any 4+ word run from the standard;
  * every activity is checked for a shared 4-gram with the standard and
    regenerated once with a stricter prompt if it leaks;
  * content-word Jaccard overlap is recorded per query, so the report can
    show results for low-overlap (hard) queries separately.

Optional human-written queries (manifest "human_queries") are added with
source="human"; the report breaks them out, since generated activities are
a proxy for real teacher/student text, not a substitute for it.
"""

from __future__ import annotations

import asyncio
import hashlib
from pathlib import Path

from eval.standards_eval.common import (
    append_jsonl, jaccard, llm_json, load_json, norm_code, read_jsonl, rng, shared_ngram,
)

_GEN_PROMPT = """[[EVAL:activity]]
You are writing a test case for a K-12 learning app where students learn outdoors and in their community
(parks, farms, shorelines, museums, neighborhoods).

Write ONE realistic activity description, 3 to 5 sentences, as a teacher would enter it into the app,
for grade {grade} {subject} students in {state_name}. The activity must genuinely teach and let students
demonstrate the skill below.

SKILL (do not quote it):
{statement}

Rules:
- Describe what students go do, observe, measure or make, and what they produce.
- Do NOT use the standard's code, and do NOT copy any run of 4 or more words from the skill text.
{extra}
Return JSON only: {{"activity": "..."}}"""

_STRICT = ("- Use your own everyday vocabulary. Avoid the skill's technical terms wherever a plain "
           "description works; a teacher would describe the task, not the standard.")


def _sample(items: list[dict], n: int, seed: int, key: str) -> list[dict]:
    r = rng(seed, key)
    by_grade: dict = {}
    for it in items:
        by_grade.setdefault(it["grade"], []).append(it)
    for g in by_grade:
        r.shuffle(by_grade[g])
    grades = sorted(by_grade, key=lambda g: (g is None, g))
    picked: list[dict] = []
    while len(picked) < n and any(by_grade[g] for g in grades):
        for g in grades:
            if by_grade[g] and len(picked) < n:
                picked.append(by_grade[g].pop())
    return picked


async def stage_testset(manifest: dict, targets: list[dict], out: Path, limit: int | None = None,
                        concurrency: int = 4) -> None:
    path = out / "testset.jsonl"
    done = {row["qid"] for row in read_jsonl(path)}
    n_per = limit or manifest["sample_per_target"]
    for t in targets:
        corpus = load_json(out / f"corpus_{t['state']}_{t['subject']}.json")
        if not corpus:
            print(f"{t['key']}: no corpus file -- run `corpus` first")
            continue
        # Only leaves that are actually retrievable; an unindexed gold would
        # measure the backfill, not retrieval.
        pool = [it for it in corpus["items"] if it["indexed"]] or corpus["items"]
        sample = _sample(pool, n_per, manifest["seed"], t["key"])
        sem = asyncio.Semaphore(max(1, concurrency))
        made = {"n": 0}

        async def gen(it: dict) -> None:
            qid = f"{t['state']}-{t['subject']}-{it['id'][:8]}"
            if qid in done:
                return
            activity, leaked, attempts = "", True, 0
            async with sem:
                for extra in ("", _STRICT):
                    attempts += 1
                    try:
                        reply = await llm_json(_GEN_PROMPT.format(
                            grade=it["grade"] if it["grade"] is not None else "middle school",
                            subject=t["subject"], state_name=t.get("state_name", t["state"]),
                            statement=it["statement"], extra=extra,
                        ), max_tokens=600)
                    except Exception as e:
                        print(f"  generation failed for {qid}: {e}")
                        return
                    activity = str(reply.get("activity", "")).strip() if isinstance(reply, dict) else ""
                    code_leak = bool(it["code"]) and bool(norm_code(it["code"])) and norm_code(it["code"]) in norm_code(activity)
                    leaked = shared_ngram(activity, it["statement"], 4) or code_leak
                    if activity and not leaked:
                        break
            if not activity:
                return
            append_jsonl(path, {
                "qid": qid, "source": "generated", "target": t["key"], "state": t["state"],
                "subject": t["subject"], "grade": it["grade"],
                "gold_ids": [it["id"]], "gold_code": it["code"], "gold_statement": it["statement"],
                "activity": activity, "leak_4gram": leaked, "attempts": attempts,
                "jaccard": round(jaccard(activity, it["statement"]), 3),
            })
            made["n"] += 1

        await asyncio.gather(*(gen(it) for it in sample))
        made = made["n"]
        print(f"{t['key']}: {made} new generated queries (sample size {len(sample)})")

    # Human-written queries: gold given as codes, resolved to leaf ids within the target corpus.
    for hq in manifest.get("human_queries", []):
        key = f"{hq['state']}:{hq['subject']}"
        corpus = load_json(out / f"corpus_{hq['state']}_{hq['subject']}.json")
        if not corpus:
            continue
        want = {norm_code(c) for c in hq.get("gold_codes", [])}
        gold = [it["id"] for it in corpus["items"] if norm_code(it["code"]) in want]
        qid = f"H-{hq['state']}-{hq['subject']}-" + hashlib.sha1(hq['activity'].encode()).hexdigest()[:8]
        if qid in done:
            continue
        if not gold:
            print(f"  human query skipped, codes not found in corpus: {hq.get('gold_codes')}")
            continue
        append_jsonl(path, {
            "qid": qid, "source": "human", "target": key, "state": hq["state"], "subject": hq["subject"],
            "grade": hq.get("grade"), "gold_ids": gold, "gold_code": ",".join(hq.get("gold_codes", [])),
            "gold_statement": "", "activity": hq["activity"], "leak_4gram": False, "attempts": 0,
            "jaccard": None,
        })
    rows = read_jsonl(path)
    print(f"testset.jsonl: {len(rows)} queries "
          f"({sum(1 for r in rows if r['leak_4gram'])} still leak a 4-gram and are flagged)")
