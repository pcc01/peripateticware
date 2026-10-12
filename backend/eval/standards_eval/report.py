# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.
"""
Stage `report`: turn the run directory into report.md, metrics.json and a
human spot-check sheet (spotcheck.csv).

All intervals are 95% bootstrap intervals over queries (2000 resamples).
Paired comparisons resample the same queries for both arms, so the
interval is on the difference itself.
"""

from __future__ import annotations

import csv
import os
import statistics
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from eval.standards_eval.common import load_json, read_jsonl, rng, save_json

B = 2000


def _ci(values: list[float], seed: int = 7) -> tuple[float, float, float]:
    if not values:
        return (float("nan"),) * 3
    a = np.asarray(values, dtype=float)
    r = np.random.default_rng(seed)
    boots = a[r.integers(0, len(a), size=(B, len(a)))].mean(axis=1)
    return float(a.mean()), float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))


def _paired(a: list[float], b: list[float], seed: int = 11) -> tuple[float, float, float, int, int]:
    x, y = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    if len(x) == 0:
        return (float("nan"),) * 3 + (0, 0)
    d = x - y
    r = np.random.default_rng(seed)
    boots = d[r.integers(0, len(d), size=(B, len(d)))].mean(axis=1)
    return (float(d.mean()), float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5)),
            int((d > 0).sum()), int((d < 0).sum()))


def _pct(x: float) -> str:
    return "n/a" if x != x else f"{100 * x:.1f}%"


def _fmt_ci(t: tuple) -> str:
    m, lo, hi = t[:3]
    return "n/a" if m != m else f"{100 * m:.1f}% [{100 * lo:.1f}, {100 * hi:.1f}]"


def _retrieval_metrics(out: Path, queries: dict, jids: dict, node_info: dict) -> tuple[dict, dict]:
    per_arm: dict = defaultdict(dict)  # (arm, jfilter) -> qid -> metrics
    for r in read_jsonl(out / "retrieval.jsonl"):
        q = queries.get(r["qid"])
        if not q:
            continue
        gold = set(q["gold_ids"])
        ids = [x["node_id"] for x in r["results"]]
        rank = next((i + 1 for i, n in enumerate(ids) if n in gold), None)
        via = next((x["relation"] for x in r["results"] if x["node_id"] in gold), None)
        jid = jids.get(q["target"])
        known = [node_info.get(n) for n in ids if node_info.get(n)]
        per_arm[(r["arm"], r["jfilter"])][r["qid"]] = {
            "r1": float(rank is not None and rank <= 1), "r5": float(rank is not None and rank <= 5),
            "r10": float(rank is not None and rank <= 10), "r15": float(rank is not None),
            "mrr": 1.0 / rank if rank else 0.0,
            "wrong_jur": (sum(1 for k in known if k["jurisdiction_id"] != jid) / len(known)) if known else 0.0,
            "leaf_share": (sum(1 for k in known if k["is_leaf"]) / len(known)) if known else 0.0,
            "via": via, "ms": r["ms"], "error": r.get("error"), "n": len(ids),
        }
    return per_arm, {}


def _align_hit(row: dict, q: dict, pdfmaps: dict, node_info: dict, jid: str | None) -> dict:
    gold = set(q["gold_ids"])
    arm = row["arm"]
    target_key = q["target"]

    def maps_to_gold(underlying_id: str, lenient: bool) -> bool:
        if not arm.startswith("pdf_"):
            return underlying_id in gold
        m = pdfmaps.get((target_key, arm.split("_", 1)[1]), {})
        for link in m.get(underlying_id, []):
            if link["case_id"] in gold and (link["verdict"] == "full" or lenient):
                return True
        return False

    backing = row.get("backing", {})
    cand_ids = row.get("candidate_ids", [])
    in_cands_strict = any(maps_to_gold(c, False) for c in cand_ids)
    in_cands_lenient = any(maps_to_gold(c, True) for c in cand_ids)
    applies = [m for m in row.get("mappings", []) if m.get("decision") == "applies"]
    partly = [m for m in row.get("mappings", []) if m.get("decision") == "partially"]

    def hit(ms, lenient):
        return any(maps_to_gold(u, lenient) for m in ms for u in backing.get(m["code"], []))

    top = max(applies, key=lambda m: m.get("confidence", 0), default=None)
    wrong_jur = 0
    if not arm.startswith("pdf_") and arm != "case_scope_vector":
        for m in applies:
            for u in backing.get(m["code"], []):
                ni = node_info.get(u)
                if ni and ni["jurisdiction_id"] != jid:
                    wrong_jur += 1
                    break
    return {
        "gold_in_candidates": float(in_cands_strict),
        "gold_in_candidates_lenient": float(in_cands_lenient),
        "hit_applies": float(hit(applies, False)),
        "hit_applies_or_partially_lenient": float(hit(applies + partly, True)),
        "top1": float(top is not None and any(maps_to_gold(u, False) for u in backing.get(top["code"], []))),
        "n_applies": len(applies),
        "wrong_jur_applies": wrong_jur,
        "empty": float(not applies),
        "error": float(row.get("status") != "success"),
        "ambiguous_codes": row.get("ambiguous_codes", 0),
    }


def stage_report(manifest: dict, out: Path) -> None:
    fake = os.getenv("EVAL_FAKE_LLM") == "1" or (out / "FAKE_MODE").exists()
    queries = {q["qid"]: q for q in read_jsonl(out / "testset.jsonl")}
    node_info = load_json(out / "node_info.json", {}) or {}
    jids, corpora = {}, {}
    for t in manifest["targets"]:
        c = load_json(out / f"corpus_{t['state']}_{t['subject']}.json")
        if c:
            jids[t["key"]] = c.get("jurisdiction_id")
            corpora[t["key"]] = c
    lines: list[str] = []
    metrics: dict = {"fake_mode": fake}
    w = lines.append

    w("# Standards retrieval and alignment evaluation")
    w("")
    if fake:
        w("> **FAKE MODE (self-test).** Every LLM call and embedding in this run was a deterministic stand-in. "
          "These numbers only show that the pipeline runs; they say nothing about accuracy.")
        w("")
    from eval.standards_eval.common import judge_provider_and_model
    try:
        jp, jm = judge_provider_and_model()
    except Exception:
        jp, jm = "?", "?"
    w(f"Queries: {len(queries)} ({sum(1 for q in queries.values() if q['source'] == 'human')} human-written). "
      f"Judge/generator: {jp} {jm}. Embeddings: {os.getenv('EMBEDDING_PROVIDER') or os.getenv('LLM_PROVIDER') or 'default'}.")
    w("")

    # ---- corpus ----
    w("## 1. What the graph contains (grade band leaves)")
    w("")
    w("| Target | Leaves | Embedded | With `precedes` | With cross-framework edge | Any non-parent edge | Stored grade missing/wrong |")
    w("|---|---|---|---|---|---|---|")
    for k, c in corpora.items():
        s = c["summary"]
        n = s["n_leaves"] or 1
        w(f"| {k} | {s['n_leaves']} | {_pct(s['n_indexed'] / n)} | {_pct(s['leaves_with_precedes'] / n)} | "
          f"{_pct(s['leaves_with_cross_framework_edge'] / n)} | {_pct(s['leaves_with_any_non_child_edge'] / n)} | "
          f"{_pct(s.get('stored_grade_disagrees', 0) / n) if s.get('grade_from_code_rules') else 'not checked'} |")
    metrics["corpus"] = {k: c["summary"] for k, c in corpora.items()}
    w("")
    w("`Stored grade missing/wrong` = leaves whose `education_levels` do not contain the grade their "
      "code encodes (grade assigned from the code via the manifest's `grade_from_code`). Any "
      "grade filter built on `education_levels` silently fails for those items.")
    w("")
    w("Graph expansion can only add what these edges point to. Where the non-parent edge share is low, "
      "expect `hybrid_graph` to add ancestors (context) and little else.")
    w("")

    # ---- retrieval ----
    per_arm, _ = _retrieval_metrics(out, queries, jids, node_info)
    if per_arm:
        w("## 2. Retrieval (known-item: is the gold standard in the returned list?)")
        w("")
        w("List length 15 for every arm. `j` = filtered to the target state's jurisdiction. "
          "`vector_scoped` = the same production index restricted to this subject's grade-band "
          "standards (what a subject + grade filter would give).")
        w("")
        w("| Arm | R@1 | R@5 [95% CI] | R@15 [95% CI] | MRR | Other-state share | Leaf share | p50 ms | p95 ms | Errors |")
        w("|---|---|---|---|---|---|---|---|---|---|")
        metrics["retrieval"] = {}
        order = [("vector_scoped", True), ("vector", True), ("hybrid", True), ("hybrid_graph", True),
                 ("vector", False), ("hybrid", False), ("hybrid_graph", False), ("agent_current", False)]
        for arm, jf in order:
            d = per_arm.get((arm, jf))
            if not d:
                continue
            vals = list(d.values())
            col = lambda k: [v[k] for v in vals]  # noqa: E731
            ms = sorted(v["ms"] for v in vals if v["ms"])
            p50 = statistics.median(ms) if ms else 0
            p95 = ms[min(len(ms) - 1, int(0.95 * len(ms)))] if ms else 0
            name = f"{arm}{' (j)' if jf else ''}"
            row = {
                "n": len(vals), "r1": _ci(col("r1")), "r5": _ci(col("r5")), "r15": _ci(col("r15")),
                "mrr": float(np.mean(col("mrr"))), "other_state": float(np.mean(col("wrong_jur"))),
                "leaf_share": float(np.mean(col("leaf_share"))), "p50_ms": p50, "p95_ms": p95,
                "errors": sum(1 for v in vals if v["error"]),
            }
            metrics["retrieval"][name] = row
            w(f"| {name} | {_pct(row['r1'][0])} | {_fmt_ci(row['r5'])} | {_fmt_ci(row['r15'])} | "
              f"{row['mrr']:.3f} | {_pct(row['other_state'])} | {_pct(row['leaf_share'])} | {p50:.0f} | {p95:.0f} | {row['errors']} |")
        w("")

        w("### Paired differences (same queries)")
        w("")
        w("| Comparison | Metric | Difference [95% CI] | A wins | B wins |")
        w("|---|---|---|---|---|")
        pairs = [
            (("vector_scoped", True), ("vector", True), "scope to subject + grade (same index) vs state only"),
            (("hybrid_graph", True), ("hybrid", True), "graph expansion, filtered"),
            (("hybrid", True), ("vector", True), "lexical channel (hybrid vs vector), filtered"),
            (("hybrid_graph", True), ("agent_current", False), "route (filtered) vs agent's retrieval today"),
            (("hybrid_graph", True), ("hybrid_graph", False), "jurisdiction filter on vs off"),
        ]
        metrics["paired"] = {}
        for a, b, label in pairs:
            da, db_ = per_arm.get(a), per_arm.get(b)
            if not da or not db_:
                continue
            common = sorted(set(da) & set(db_))
            for mk in ("r5", "r15"):
                res = _paired([da[qid][mk] for qid in common], [db_[qid][mk] for qid in common])
                metrics["paired"][f"{label}:{mk}"] = res
                w(f"| {label} | {mk.upper()} | {res[0] * 100:+.1f} pts [{res[1] * 100:+.1f}, {res[2] * 100:+.1f}] | {res[3]} | {res[4]} |")
        w("")

        g = per_arm.get(("hybrid_graph", True), {})
        via = Counter(v["via"] for v in g.values() if v["via"])
        w(f"How the gold was reached in `hybrid_graph (j)`: {dict(via)} "
          "(anything other than `match` is a find only the graph made).")
        w("")

        # hard subset + human subset
        hard_cut = statistics.median([q["jaccard"] for q in queries.values() if q.get("jaccard") is not None] or [0])
        for label, pred in (("Low word-overlap half (harder)", lambda q: q.get("jaccard") is not None and q["jaccard"] <= hard_cut),
                            ("Human-written queries", lambda q: q["source"] == "human")):
            sub = {qid for qid, q in queries.items() if pred(q)}
            if not sub:
                continue
            w(f"**{label}** (n={len(sub)}): " + ", ".join(
                f"{arm}{'(j)' if jf else ''} R@5 {_pct(np.mean([d[qid]['r5'] for qid in sub if qid in d]) if any(qid in d for qid in sub) else float('nan'))}"
                for (arm, jf), d in per_arm.items() if (arm, jf) in [("vector", True), ("hybrid", True), ("hybrid_graph", True), ("agent_current", False)]
            ))
            w("")

        by_t = defaultdict(list)
        for qid, v in per_arm.get(("hybrid_graph", True), {}).items():
            by_t[queries[qid]["target"]].append(v["r5"])
        if by_t:
            w("R@5 for `hybrid_graph (j)` by target: " + ", ".join(f"{k} {_pct(np.mean(v))} (n={len(v)})" for k, v in sorted(by_t.items())))
            w("")

    # ---- PDF extraction ----
    pdf_rows = []
    pdfmaps: dict = {}
    for t in manifest["targets"]:
        prefix = f"pdf_{t['state']}_{t['subject']}_"
        found = sorted(p.stem[len(prefix):] for p in out.glob(prefix + "*.json"))
        order = {"current": 0, "proposed": 1}
        for v in sorted(found, key=lambda x: (order.get(x, 2), x)):
            ext = load_json(out / f"pdf_{t['state']}_{t['subject']}_{v}.json")
            mt = load_json(out / f"pdfmatch_{t['state']}_{t['subject']}_{v}.json")
            if not ext:
                continue
            if mt:
                pdfmaps[(t["key"], v)] = mt.get("crit_to_case", {})
            chunks = ext["chunks"]
            total = sum(c.get("chars", 0) for c in chunks) or 1
            dropped = sum(c.get("chars_dropped_by_truncation", 0) for c in chunks) if v == "current" else 0
            raw_items = sum(c.get("raw_items", 0) for c in chunks)
            pdf_rows.append({
                "target": t["key"], "variant": v, "chunks": len(chunks),
                "chunks_failed": sum(1 for c in chunks if c.get("error")),
                "chars_cut_share": dropped / total,
                "criteria": len(ext["criteria"]),
                "raw_with_code": sum(c.get("raw_items_with_code", 0) for c in chunks),
                "raw_with_grade": sum(c.get("raw_items_with_grade_band", 0) for c in chunks),
                "raw_items": raw_items,
                "cut_off": sum(1 for c in chunks if c.get("reply_cut_off")),
                "model": (f"{ext['pipeline']['provider']}:{ext['pipeline']['model']}" if ext.get("pipeline") else None),
                "model_seconds": sum(c.get("seconds", 0) or 0 for c in chunks if not c.get("cached")),
                "tokens_in": sum(int((c.get("usage") or {}).get("input_tokens") or 0) for c in chunks),
                "tokens_out": sum(int((c.get("usage") or {}).get("output_tokens") or 0) for c in chunks),
                "cached_chunks": sum(1 for c in chunks if c.get("cached")),
                "match": mt,
            })
    if pdf_rows:
        w("## 3. State PDF import vs CASE (CASE is the answer key)")
        w("")
        w("| Target | Variant | Chunks (with problems) | Text cut by 12k limit | Criteria | CASE full | partial | missing | Criteria matching a CASE standard | Code kept (full) | Grade kept (full) |")
        w("|---|---|---|---|---|---|---|---|---|---|---|")
        metrics["pdf"] = []
        for r in pdf_rows:
            m = r["match"] or {}
            n = m.get("n_case") or 0
            cov = m.get("coverage", {})
            nf = m.get("n_full") or 0
            row = {k: v for k, v in r.items() if k != "match"}
            row.update({"n_case": n, "coverage": cov, "criteria_matched": m.get("n_criteria_matched"),
                        "code_kept": m.get("full_with_code_kept"), "grade_kept": m.get("full_with_grade_recoverable"),
                        "n_full": nf, "unmatched_classes": m.get("unmatched_classes")})
            metrics["pdf"].append(row)
            w(f"| {r['target']} | {r['variant']} | {r['chunks']} ({r['chunks_failed']}) | {_pct(r['chars_cut_share'])} | "
              f"{r['criteria']} | {_pct(cov.get('full', 0) / n) if n else 'n/a'} | {_pct(cov.get('partial', 0) / n) if n else 'n/a'} | "
              f"{_pct(cov.get('none', 0) / n) if n else 'n/a'} | "
              f"{_pct((m.get('n_criteria_matched') or 0) / r['criteria']) if r['criteria'] and m else 'n/a'} | "
              f"{_pct((m.get('full_with_code_kept') or 0) / nf) if nf else 'n/a'} | "
              f"{_pct((m.get('full_with_grade_recoverable') or 0) / nf) if nf else 'n/a'} |")
        w("")
        if any(r.get("model") for r in pdf_rows):
            w("Extraction cost per variant (model seconds exclude cached chunks; tokens are as reported by the "
              "API or Ollama):")
            w("")
            w("| Target | Variant | Model | Model seconds | Tokens in | Tokens out | Cached chunks |")
            w("|---|---|---|---|---|---|---|")
            for r in pdf_rows:
                w(f"| {r['target']} | {r['variant']} | {r.get('model') or 'app default'} | {r['model_seconds']:.0f} | "
                  f"{r['tokens_in']:,} | {r['tokens_out']:,} | {r['cached_chunks']}/{r['chunks']} |")
            w("")
        w("Raw LLM replies vs what was kept: " + "; ".join(
            f"{r['target']} {r['variant']}: {r['raw_with_code']}/{r['raw_items']} replies had a code, "
            f"{r['raw_with_grade']} had a grade band, {r['cut_off']} chunk replies cut off at the token limit"
            for r in pdf_rows))
        w("")
        w("Unmatched criteria by type: " + "; ".join(
            f"{r['target']} {r['variant']}: {(r['match'] or {}).get('unmatched_classes')}" for r in pdf_rows))
        w("")

    # ---- alignment ----
    arows = read_jsonl(out / "alignment.jsonl")
    if arows:
        per = defaultdict(dict)
        for row in arows:
            q = queries.get(row["qid"])
            if q:
                per[row["arm"]][row["qid"]] = _align_hit(row, q, pdfmaps, node_info, jids.get(q["target"]))
        w("## 4. End-to-end alignment (real StandardsMappingAgent classifier)")
        w("")
        w("| Arm | Gold in candidates | Gold marked \"applies\" [95% CI] | Top \"applies\" is gold | Lenient hit | Avg \"applies\" | \"applies\" from another state | No \"applies\" | Errors |")
        w("|---|---|---|---|---|---|---|---|---|")
        metrics["alignment"] = {}
        base_arms = ["case_agent_current", "case_hybrid_j", "case_hybrid_graph_j", "case_scope_vector", "pdf_current", "pdf_proposed"]
        extra_arms = sorted(a for a in per if a.startswith("pdf_") and a not in base_arms)
        for arm in base_arms + extra_arms:
            d = per.get(arm)
            if not d:
                continue
            vals = list(d.values())
            col = lambda k: [v[k] for v in vals]  # noqa: E731
            row = {"n": len(vals), "gold_in_candidates": float(np.mean(col("gold_in_candidates"))),
                   "hit_applies": _ci(col("hit_applies")), "top1": float(np.mean(col("top1"))),
                   "lenient": float(np.mean(col("hit_applies_or_partially_lenient"))),
                   "avg_applies": float(np.mean(col("n_applies"))),
                   "wrong_state_applies_rate": float(np.mean([1.0 if v["wrong_jur_applies"] else 0.0 for v in vals])),
                   "empty": float(np.mean(col("empty"))), "errors": int(sum(col("error")))}
            metrics["alignment"][arm] = row
            w(f"| {arm} | {_pct(row['gold_in_candidates'])} | {_fmt_ci(row['hit_applies'])} | {_pct(row['top1'])} | "
              f"{_pct(row['lenient'])} | {row['avg_applies']:.2f} | {_pct(row['wrong_state_applies_rate'])} | "
              f"{_pct(row['empty'])} | {row['errors']} |")
        w("")
        w("### Paired differences")
        w("")
        w("| Comparison | Difference in \"gold marked applies\" [95% CI] | A wins | B wins |")
        w("|---|---|---|---|")
        pairs = [("case_hybrid_graph_j", "case_hybrid_j", "graph expansion"),
                            ("case_hybrid_graph_j", "case_agent_current", "filtered route vs agent today"),
                            ("case_scope_vector", "pdf_current", "CASE vs PDF (current pipeline)"),
                            ("case_scope_vector", "pdf_proposed", "CASE vs PDF (proposed pipeline)"),
                            ("pdf_proposed", "pdf_current", "proposed vs current PDF pipeline")]
        pairs += [("case_scope_vector", a, f"CASE vs PDF ({a[4:]})") for a in extra_arms]
        pairs += [(a, "pdf_proposed", f"{a[4:]} vs proposed") for a in extra_arms]
        for a, b, label in pairs:
            da, db_ = per.get(a), per.get(b)
            if not da or not db_:
                continue
            common = sorted(set(da) & set(db_))
            res = _paired([da[qid]["hit_applies"] for qid in common], [db_[qid]["hit_applies"] for qid in common])
            metrics.setdefault("alignment_paired", {})[label] = res
            w(f"| {label} | {res[0] * 100:+.1f} pts [{res[1] * 100:+.1f}, {res[2] * 100:+.1f}] | {res[3]} | {res[4]} |")
        w("")

    # ---- caveats ----
    w("## 5. How to read this")
    w("")
    w("- Queries are generated activities with one known gold standard. A different standard the classifier "
      "marks \"applies\" is not necessarily wrong, so \"gold marked applies\" is a recall measure and the "
      "other-state column is the clearest error signal. Check the human-written rows before generalizing.")
    w("- PDF coverage and the CASE-vs-PDF alignment scores depend on the judge model; `spotcheck.csv` holds a "
      "random sample for a person to verify. Fill the `human` column and re-run `report` to get agreement.")
    w("- The PDF and the CASE framework must be the same version of the standards. Check section 1 of "
      "frameworks.json against the PDF's adoption date before trusting section 3.")
    w("- Numbers are for the embedding provider and models configured in this container. Local dev "
      "(Ollama, 384-d) and prod (Voyage, 512-d) will differ.")
    w("")

    _spotcheck(manifest, out, queries, pdf_rows, arows, node_info, lines, metrics)
    (out / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    save_json(out / "metrics.json", metrics)
    print(f"Wrote {out / 'report.md'} and {out / 'metrics.json'}")


def _spotcheck(manifest, out, queries, pdf_rows, arows, node_info, lines, metrics) -> None:
    path = out / "spotcheck.csv"
    if path.exists():
        rows = list(csv.DictReader(path.open(encoding="utf-8")))
        filled = [r for r in rows if (r.get("human") or "").strip()]
        if filled:
            agree = sum(1 for r in filled if r["human"].strip().lower() == r["judge"].strip().lower())
            lines.append(f"**Human spot-check:** {agree}/{len(filled)} judge decisions confirmed "
                         f"({100 * agree / len(filled):.0f}%).")
            metrics["spotcheck_agreement"] = {"agree": agree, "n": len(filled)}
        return
    r = rng(manifest["seed"], "spotcheck")
    out_rows = []
    for pr in pdf_rows:
        m = pr["match"] or {}
        corpus = load_json(out / f"corpus_{pr['target'].replace(':', '_')}.json") or {"items": []}
        ext = load_json(out / f"pdf_{pr['target'].replace(':', '_')}_{pr['variant']}.json") or {"criteria": []}
        leaf = {i["id"]: i for i in corpus["items"]}
        crit = {c["id"]: c for c in ext["criteria"]}
        verdicts = list((m.get("verdicts") or {}).items())
        r.shuffle(verdicts)
        for lid, v in verdicts[:10]:
            c = crit.get(v.get("criterion") or "", {})
            out_rows.append({"kind": "pdf_match", "target": pr["target"], "variant": pr["variant"],
                             "official": leaf.get(lid, {}).get("statement", ""),
                             "extracted": (c.get("name", "") + " - " + c.get("description", "")).strip(" -"),
                             "judge": v["verdict"], "human": ""})
    applies = [(row, m) for row in arows for m in row.get("mappings", []) if m.get("decision") == "applies"]
    r.shuffle(applies)
    for row, m in applies[:30]:
        q = queries.get(row["qid"], {})
        out_rows.append({"kind": "alignment", "target": row["target"], "variant": row["arm"],
                         "official": f"{m['code']}: {m.get('title', '')}", "extracted": q.get("activity", ""),
                         "judge": "applies", "human": ""})
    if out_rows:
        with path.open("w", encoding="utf-8", newline="") as f:
            wtr = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
            wtr.writeheader()
            wtr.writerows(out_rows)
        lines.append(f"Spot-check sheet written: spotcheck.csv ({len(out_rows)} rows). For pdf_match rows put "
                     "full/partial/none in `human`; for alignment rows put applies/no.")
