# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.
"""
Stage `pdf-match`: score PDF-extracted criteria against the CASE framework for
the same state, subject and grades. CASE is the answer key.

For every CASE leaf standard in the corpus:
  1. embed CASE statements and extracted criteria with the configured
     embedding provider (document mode), take the 5 most similar criteria;
  2. the judge model decides whether one of those 5 captures the standard
     fully, partially (merged / split / lost a qualifier), or not at all.
Extracted criteria never chosen by any CASE standard are then classified by
the judge (real content standard, practice/process standard, or
non-standard text such as headings, definitions or examples).

Outputs, per target and variant:
  coverage      share of CASE standards captured full / partial / missing
  precision     share of extracted criteria that correspond to a CASE standard
  code_kept     share of full matches whose official code survived
  grade_kept    share of full matches whose grade is recoverable
  crit_to_case  the criterion -> CASE item map used by the alignment stage
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np

from eval.standards_eval.common import llm_json, load_json, norm_code, save_json

_COVER_PROMPT = """[[EVAL:coverage]]
You are checking whether a PDF import captured a state's official academic standards.

For each OFFICIAL standard below, look at its candidate EXTRACTED items and decide:
- "full": one extracted item states the same requirement, with no meaningful loss (wording may differ).
- "partial": an extracted item covers only part of it, merges it with other standards, or drops a
  qualifier that changes what students must do (a number range, a grade limit, a named method).
- "none": no candidate captures it.

{blocks}

Return JSON only:
{{"results": [{{"standard": "S1", "match": "E2 or null", "verdict": "full|partial|none"}}]}}"""

_UNMATCHED_PROMPT = """[[EVAL:unmatched]]
These items were extracted from a state academic standards PDF but did not match any official
grade-level content standard in the grades being tested. Classify each:
- "content_standard": a student performance expectation (what a student knows or can do)
- "practice_or_process": a practice/process standard that spans content (e.g. math practices)
- "non_standard": a heading, definition, example, introduction, note or other non-standard text

{items}

Return JSON only: {{"results": [{{"item": "U1", "class": "content_standard|practice_or_process|non_standard"}}]}}"""


def _crit_text(c: dict) -> str:
    return " ".join(x for x in (c.get("name", ""), c.get("description", "")) if x).strip()


async def _embed(texts: list[str]) -> np.ndarray:
    from services.embedding_service import embed_texts
    res = await embed_texts(texts, input_type="document")
    vecs = [r.get("embedding") or [] for r in res]
    dim = max((len(v) for v in vecs), default=0)
    m = np.array([v if len(v) == dim else [0.0] * dim for v in vecs], dtype=np.float32)
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return m / norms


def _grade_tokens(text: str) -> set[int]:
    out = set()
    for a, b in re.findall("\\b(\\d{1,2})\\s*[-\u2013]\\s*(\\d{1,2})\\b", text or ""):
        out.update(range(int(a), int(b) + 1))
    for g in re.findall(r"(?:grade|gr\.?|kl\.?)\s*(\d{1,2})\b", (text or "").lower()):
        out.add(int(g))
    return out


async def match_target(target: dict, variant: str, out: Path, batch: int = 6) -> dict | None:
    corpus = load_json(out / f"corpus_{target['state']}_{target['subject']}.json")
    ext = load_json(out / f"pdf_{target['state']}_{target['subject']}_{variant}.json")
    if not corpus or not ext:
        return None
    leaves = corpus["items"]
    crits = ext["criteria"]
    if not leaves:
        return None
    if not crits:
        res = {"target": target["key"], "variant": variant, "n_case": len(leaves), "n_criteria": 0,
               "coverage": {"full": 0, "partial": 0, "none": len(leaves)}, "n_criteria_matched": 0,
               "full_with_code_kept": 0, "full_with_grade_recoverable": 0, "n_full": 0,
               "verdicts": {l["id"]: {"verdict": "none", "criterion": None} for l in leaves},
               "unmatched_classes": {}, "unmatched": {}, "crit_to_case": {}}
        save_json(out / f"pdfmatch_{target['state']}_{target['subject']}_{variant}.json", res)
        return res

    case_vecs = await _embed([f"{l['code']} {l['statement']}".strip() for l in leaves])
    crit_vecs = await _embed([_crit_text(c) for c in crits])
    sims = case_vecs @ crit_vecs.T
    top3 = np.argsort(-sims, axis=1)[:, :5]  # candidate pool for the judge

    verdicts: dict[str, dict] = {}
    for start in range(0, len(leaves), batch):
        idxs = list(range(start, min(start + batch, len(leaves))))
        blocks = []
        for n, li in enumerate(idxs, start=1):
            cand = "\n".join(
                f"    E{k + 1}: {_crit_text(crits[ci])[:400]}" for k, ci in enumerate(top3[li])
            )
            blocks.append(f"S{n} OFFICIAL: {leaves[li]['statement'][:500]}\n  candidates:\n{cand}")
        reply = await llm_json(_COVER_PROMPT.format(blocks="\n\n".join(blocks)), max_tokens=900)
        results = reply.get("results", []) if isinstance(reply, dict) else []
        by_s = {str(r.get("standard", "")).strip().upper(): r for r in results if isinstance(r, dict)}
        for n, li in enumerate(idxs, start=1):
            r = by_s.get(f"S{n}", {})
            v = str(r.get("verdict", "none")).lower()
            v = v if v in ("full", "partial", "none") else "none"
            m = str(r.get("match") or "").strip().upper()
            crit_i = None
            if v != "none" and re.fullmatch(r"E[1-5]", m) and int(m[1]) <= len(top3[li]):
                crit_i = int(top3[li][int(m[1]) - 1])
            elif v != "none":
                v = "none"  # a verdict without a usable pointer cannot be scored
            verdicts[leaves[li]["id"]] = {
                "verdict": v, "criterion": crits[crit_i]["id"] if crit_i is not None else None,
                "sim_top1": float(sims[li][top3[li][0]]),
            }

    # criterion -> CASE items it was judged to capture
    crit_to_case: dict[str, list[dict]] = {}
    for leaf_id, v in verdicts.items():
        if v["criterion"]:
            crit_to_case.setdefault(v["criterion"], []).append({"case_id": leaf_id, "verdict": v["verdict"]})

    unmatched = [c for c in crits if c["id"] not in crit_to_case]
    classes: dict[str, str] = {}
    for start in range(0, len(unmatched), 10):
        chunk = unmatched[start:start + 10]
        items = "\n".join(f"U{k + 1}: {_crit_text(c)[:300]}" for k, c in enumerate(chunk))
        reply = await llm_json(_UNMATCHED_PROMPT.format(items=items), max_tokens=700)
        results = reply.get("results", []) if isinstance(reply, dict) else []
        by_u = {str(r.get("item", "")).strip().upper(): r for r in results if isinstance(r, dict)}
        for k, c in enumerate(chunk, start=1):
            cls = str(by_u.get(f"U{k}", {}).get("class", "unclassified"))
            classes[c["id"]] = cls

    leaf_by_id = {l["id"]: l for l in leaves}
    crit_by_id = {c["id"]: c for c in crits}
    full = [(lid, v) for lid, v in verdicts.items() if v["verdict"] == "full"]
    code_kept = sum(
        1 for lid, v in full
        if leaf_by_id[lid]["code"] and norm_code(leaf_by_id[lid]["code"]) and (
            norm_code(leaf_by_id[lid]["code"]) in norm_code(crit_by_id[v["criterion"]].get("code", ""))
            or norm_code(leaf_by_id[lid]["code"]) in norm_code(crit_by_id[v["criterion"]].get("id", ""))
            or norm_code(leaf_by_id[lid]["code"]) in norm_code(crit_by_id[v["criterion"]].get("name", ""))
        )
    )
    grade_kept = 0
    for lid, v in full:
        g = leaf_by_id[lid]["grade"]
        c = crit_by_id[v["criterion"]]
        text = " ".join([c.get("grade_band", ""), c.get("category", ""), c.get("name", ""), c.get("id", "")])
        bare = re.fullmatch(r"\s*(?:grade\s*)?(\d{1,2})\s*", c.get("grade_band", "") or "", flags=re.I)
        tokens = _grade_tokens(text) | ({int(bare.group(1))} if bare else set())
        if g is not None and g in tokens:
            grade_kept += 1

    res = {
        "target": target["key"], "variant": variant,
        "n_case": len(leaves), "n_criteria": len(crits),
        "coverage": {k: sum(1 for v in verdicts.values() if v["verdict"] == k) for k in ("full", "partial", "none")},
        "n_criteria_matched": len(crit_to_case),
        "unmatched_classes": {k: sum(1 for c in classes.values() if c == k) for k in set(classes.values())},
        "full_with_code_kept": code_kept, "full_with_grade_recoverable": grade_kept, "n_full": len(full),
        "verdicts": verdicts, "crit_to_case": crit_to_case, "unmatched": classes,
    }
    save_json(out / f"pdfmatch_{target['state']}_{target['subject']}_{variant}.json", res)
    return res


async def stage_pdf_match(manifest: dict, targets: list[dict], out: Path, variants: list[str]) -> None:
    for t in targets:
        for v in variants:
            res = await match_target(t, v, out)
            if res is None:
                print(f"{t['key']} [{v}]: missing corpus or extraction file, skipped")
                continue
            cov = res.get("coverage", {})
            n = res["n_case"] or 1
            print(f"{t['key']} [{v}]: CASE={res['n_case']} criteria={res['n_criteria']}  "
                  f"full={cov.get('full', 0) / n:.0%} partial={cov.get('partial', 0) / n:.0%} "
                  f"missing={cov.get('none', 0) / n:.0%}  unmatched={res.get('unmatched_classes')}")
