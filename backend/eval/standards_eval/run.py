# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.
"""
Command-line entry point.

    python -m eval.standards_eval.run <stage> --manifest PATH [--run-dir DIR] [--only TX:math,GA] [--limit N]

Stages, in order:
    frameworks   list matching CASE frameworks + graph edge counts (read-only)
    corpus       freeze grade-band leaf standards per target (read-only)
    testset      generate activities (LLM calls; no DB access)
    retrieval    run every retrieval arm (read-only DB)
    pdf-pages    (helper) print each PDF page's first line, to pick page ranges
    pdf-extract  PDF -> criteria, current and proposed pipeline (LLM; no DB writes)
    pdf-match    score criteria against CASE (LLM + embeddings)
    alignment    end-to-end classification per arm (LLM + embeddings)
    report       write report.md / metrics.json / spotcheck.csv
    all          everything above in order
    selftest     full pipeline on synthetic data with a fake LLM, against a
                 SCRATCH database only (refuses if real frameworks exist)
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

from eval.standards_eval.common import load_manifest, run_dir, save_json, select_targets

STAGES = ["frameworks", "corpus", "testset", "retrieval", "pdf-extract", "pdf-match", "alignment", "report"]


async def _run(stage: str, args) -> None:
    from core.database import get_session_factory
    out = run_dir(args.run_dir)
    manifest = load_manifest(args.manifest)
    targets = select_targets(manifest, args.only)
    sf = get_session_factory()
    # "--variants proposed,qwen=ollama:qwen3.5:9b" -> names [proposed, qwen], specs {qwen: ollama:qwen3.5:9b}
    variants, specs = [], {}
    for v in (x.strip() for x in args.variants.split(",")):
        if not v:
            continue
        name, _, spec = v.partition("=")
        variants.append(name.strip())
        if spec:
            specs[name.strip()] = spec.strip()

    if stage == "frameworks":
        from eval.standards_eval.corpus import stage_frameworks
        await stage_frameworks(manifest, targets, out, sf)
    elif stage == "corpus":
        from eval.standards_eval.corpus import stage_corpus
        await stage_corpus(manifest, targets, out, sf)
    elif stage == "testset":
        from eval.standards_eval.testset import stage_testset
        await stage_testset(manifest, targets, out, limit=args.limit, concurrency=args.concurrency)
    elif stage == "retrieval":
        from eval.standards_eval.retrieval import stage_retrieval
        from eval.standards_eval.retrieval import ALL_ARMS
        arms = ALL_ARMS if args.retrieval_arms == "all" else None
        await stage_retrieval(manifest, targets, out, sf, limit=args.limit, arms=arms)
    elif stage == "pdf-extract":
        from eval.standards_eval.pdf_extract import stage_pdf_extract
        await stage_pdf_extract(manifest, targets, out, variants, specs)
    elif stage == "pdf-match":
        from eval.standards_eval.pdf_match import stage_pdf_match
        await stage_pdf_match(manifest, targets, out, variants)
    elif stage == "alignment":
        from eval.standards_eval.alignment import ARMS, stage_alignment
        arms = [a.strip() for a in args.arms.split(",")] if args.arms else ARMS
        await stage_alignment(manifest, targets, out, arms, limit=args.limit, concurrency=args.concurrency)
    elif stage == "pdf-pages":
        from eval.standards_eval.pdf_extract import stage_pdf_pages
        await stage_pdf_pages(manifest, targets)
    elif stage == "report":
        from eval.standards_eval.report import stage_report
        stage_report(manifest, out)
    else:
        raise SystemExit(f"unknown stage {stage}")


async def _selftest(args) -> None:
    """Seed synthetic data into a scratch DB, embed it with the real backfill
    script, then run every stage with a fake LLM."""
    os.environ["EVAL_FAKE_LLM"] = "1"
    from eval.standards_eval.common import install_fake_llm
    install_fake_llm()
    from core.database import get_session_factory
    from eval.standards_eval import fixtures
    out = run_dir(args.run_dir)
    (out / "FAKE_MODE").write_text("self-test run\n", encoding="utf-8")
    sf = get_session_factory()
    await fixtures.seed_database(sf)

    # embed with the production backfill script, so the rag_documents rows
    # have exactly the shape and metadata the real pipeline writes
    from scripts import backfill_standards_embeddings as bf
    for ref in ("TX", "GA"):
        await bf.run(framework_id=None, jurisdiction_ref=ref, limit=None, dry_run=False)

    pdf_dir = out / "pdfs"
    pdf_dir.mkdir(exist_ok=True)
    fixtures.write_pdf("TX", pdf_dir / "tx_selftest.pdf")
    manifest = {
        "grade_band": ["06", "07", "08"], "sample_per_target": 12, "top_k": 5, "seed": 13,
        "targets": [
            {"state": "TX", "subject": "math", "state_name": "Texas", "framework_title_like": ["%Mathematics%"],
             "grade_from_code": [["^TX\\.6\\.", 6], ["^TX\\.7\\.", 7], ["^TX\\.8\\.", 8]],
             "pdf": {"path": str(pdf_dir / "tx_selftest.pdf"), "pages": None}},
            {"state": "GA", "subject": "math", "state_name": "Georgia", "framework_title_like": ["%Mathematics%"]},
        ],
        "human_queries": [
            {"state": "TX", "subject": "math", "grade": 7, "gold_codes": ["TX.7.RP.1"],
             "activity": "At the farmers market students compare the cost of berries per pound across three stands."}
        ],
    }
    mpath = out / "selftest_manifest.json"
    save_json(mpath, manifest)
    args.manifest = str(mpath)
    for stage in STAGES:
        print(f"\n######## {stage}")
        await _run(stage, args)
    print(f"\nSelf-test complete. See {out / 'report.md'}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("stage", choices=STAGES + ["all", "selftest", "pdf-pages"])
    ap.add_argument("--manifest", default="eval/standards_eval/manifest.json")
    ap.add_argument("--run-dir", default=None, help="default: $EVAL_RUN_DIR or /app/logs/standards_eval/run1")
    ap.add_argument("--only", default=None, help="comma list of targets (TX:math) or states (TX)")
    ap.add_argument("--limit", type=int, default=None, help="cap queries (testset: per target; others: total)")
    ap.add_argument("--variants", default="current,proposed",
                    help="PDF pipeline variants: current, proposed, or NAME=provider:model for the "
                         "standards pipeline extractor, e.g. qwen=ollama:qwen3.5:9b,haiku=claude:claude-haiku-4-5-20251001")
    ap.add_argument("--arms", default=None, help="alignment arms (default: all)")
    ap.add_argument("--retrieval-arms", default="default",
                    help="'default' skips the slow unfiltered hybrid arms; 'all' runs every arm")
    ap.add_argument("--concurrency", type=int, default=4, help="parallel LLM calls in testset/alignment")
    args = ap.parse_args()

    if args.stage == "selftest":
        asyncio.run(_selftest(args))
        return
    if os.getenv("EVAL_FAKE_LLM") == "1":
        from eval.standards_eval.common import install_fake_llm
        install_fake_llm()
    if not Path(args.manifest).exists():
        sys.exit(f"manifest not found: {args.manifest}")
    stages = STAGES if args.stage == "all" else [args.stage]

    async def go():
        for s in stages:
            print(f"\n######## {s}")
            await _run(s, args)

    asyncio.run(go())


if __name__ == "__main__":
    main()
