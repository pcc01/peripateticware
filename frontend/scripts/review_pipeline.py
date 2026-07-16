#!/usr/bin/env python3
# frontend/scripts/review_pipeline.py
#
# Interactive orchestrator for the localization QA loop's last two stages:
#
#   Model 2 (localization_qa_crawler.py) — REVIEW: crawls the live app,
#            flags subpar strings, writes a report to frontend/qa/.
#   Model 3 (retranslate_flagged.py)     — RETRANSLATE: reads that report,
#            fixes flagged/untranslated strings with a model you choose,
#            and updates each locale's .xlf provenance to record which
#            model's translation was overwritten by which.
#
# This script does not reimplement either stage — it just asks which model(s)
# to use, runs them as subprocesses in the right order (review's report file
# becomes retranslate's --report input), and optionally puts the machine to
# sleep once everything finishes so you can kick off a long run and walk away.
#
# USAGE:
#     python3 scripts/review_pipeline.py
#
# Everything is interactive from here — there are no required flags. Run
# each stage on its own, or chain them, from the menu.

from __future__ import annotations

import platform
import re
import subprocess
import sys
import time
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
FRONTEND_DIR = SCRIPTS_DIR.parent
QA_DIR = FRONTEND_DIR / "qa"

CRAWLER = SCRIPTS_DIR / "localization_qa_crawler.py"
RETRANSLATOR = SCRIPTS_DIR / "retranslate_flagged.py"
OFFLINE_REVIEWER = SCRIPTS_DIR / "qa_review_llamacpp.py"
MT_RETRANSLATOR = SCRIPTS_DIR / "retranslate_mt.py"
MT_FALLBACK = SCRIPTS_DIR / "mt_fallback.py"

PROVIDERS = ["OLLAMA", "CLAUDE", "GEMINI", "DEEPL", "GOOGLE_TRANSLATE", "MICROSOFT"]

# Convenience presets for API providers we can't enumerate locally the way
# `ollama list` enumerates local models. These are just a starting menu —
# "Type a custom model name..." is always offered alongside them, since
# model availability depends on your own API access/account.
CLAUDE_MODEL_PRESETS = [
    "claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5-20251001", "claude-fable-5",
]
GEMINI_MODEL_PRESETS = [
    "gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite",
    "gemini-2.5-pro", "gemini-2.5-flash",
]
CUSTOM_MODEL_LABEL = "Type a custom model name..."

# Providers translate_sync.py hardcodes a single fixed engine string for,
# regardless of what --model is passed (see UniversalOrchestrator.__init__).
# There is nothing meaningful to choose for these, so we skip the prompt.
NO_MODEL_CHOICE_PROVIDERS = {"DEEPL", "GOOGLE_TRANSLATE", "MICROSOFT"}


# ─── Small interactive helpers ──────────────────────────────────────────────

def ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    val = input(f"{prompt}{suffix}: ").strip()
    return val or default


def ask_yes_no(prompt: str, default: bool = False) -> bool:
    d = "Y/n" if default else "y/N"
    val = input(f"{prompt} [{d}]: ").strip().lower()
    if not val:
        return default
    return val.startswith("y")


def choose_from_list(prompt: str, options: list[str], default_index: int = 0) -> str:
    for i, opt in enumerate(options, 1):
        marker = " (default)" if i - 1 == default_index else ""
        print(f"  [{i}] {opt}{marker}")
    raw = input(f"{prompt} [1-{len(options)}] (default: {default_index + 1}): ").strip()
    if raw.isdigit() and 1 <= int(raw) <= len(options):
        return options[int(raw) - 1]
    return options[default_index]


# ─── Model selection ────────────────────────────────────────────────────────

def list_ollama_models() -> list[str]:
    try:
        result = subprocess.run(["ollama", "list"], capture_output=True, text=True, timeout=10)
        lines = result.stdout.splitlines()[1:]  # skip header row
        return [line.split()[0] for line in lines if line.strip()]
    except Exception:
        return []


def choose_review_model() -> str:
    """The QA crawler's evaluator model — a local Ollama QE model by default
    (see localization_qa_crawler.py DEFAULT_MODEL)."""
    default = "hf.co/s3nh/Unbabel-TowerInstruct-7B-v0.1-GGUF:Q4_K_M"
    print("\nWhich model should REVIEW existing translations (the QA evaluator)?")
    models = list_ollama_models()
    if models:
        options = models + ["Type a custom model tag..."]
        choice = choose_from_list("Evaluator model", options, default_index=0)
        if choice != "Type a custom model tag...":
            return choice
    typed = ask("Ollama model tag for the evaluator", default)
    return typed


def choose_retranslate_provider_and_model() -> tuple[str, str | None]:
    """The RETRANSLATE model — deliberately asked independently of the review
    model above, and independently of whatever translate_sync.py used
    originally, so this can be a genuinely different (often stronger) model
    for fixing what the reviewer flagged.

    Same list-then-custom pattern as choose_review_model(): pick from known
    options, with a "type a custom one" escape hatch, instead of always
    free-typing a model name from scratch."""
    print("\nWhich model should RETRANSLATE the flagged/subpar strings?")
    provider = choose_from_list("Provider", PROVIDERS, default_index=PROVIDERS.index("CLAUDE"))

    if provider == "OLLAMA":
        models = list_ollama_models()
        if models:
            options = models + [CUSTOM_MODEL_LABEL]
            choice = choose_from_list("Ollama model for retranslation", options, default_index=0)
            if choice != CUSTOM_MODEL_LABEL:
                return provider, choice
        typed = ask("Ollama model tag for retranslation (blank = script default 'mistral')")
        return provider, (typed or None)

    if provider == "CLAUDE":
        options = CLAUDE_MODEL_PRESETS + [CUSTOM_MODEL_LABEL]
        choice = choose_from_list("Claude model", options, default_index=0)
        if choice != CUSTOM_MODEL_LABEL:
            return provider, choice
        typed = ask("Claude model name (blank = script default)")
        return provider, (typed or None)

    if provider == "GEMINI":
        options = GEMINI_MODEL_PRESETS + [CUSTOM_MODEL_LABEL]
        choice = choose_from_list("Gemini model", options, default_index=0)
        if choice != CUSTOM_MODEL_LABEL:
            return provider, choice
        typed = ask("Gemini model name (blank = script default)")
        return provider, (typed or None)

    # DEEPL / GOOGLE_TRANSLATE / MICROSOFT: translate_sync.py's
    # UniversalOrchestrator hardcodes a single fixed engine string for these
    # regardless of --model (e.g. "DeepL-API"), so there's nothing real to
    # pick — asking would just collect a value that gets silently ignored.
    print(f"({provider} has no selectable model — it always uses its one fixed engine.)")
    return provider, None


# ─── Review stage ───────────────────────────────────────────────────────────

def configure_review_args() -> list[str]:
    model = choose_review_model()
    args = ["--model", model]

    locales = ask("Locales to review (comma-separated, blank = every locale found)")
    if locales:
        args += ["--locales", locales]

    if ask_yes_no("Skip pages behind login (public pages only, faster)?", default=False):
        args += ["--skip-protected"]
    else:
        roles = ask("Roles to review (comma-separated: teacher,student,parent,admin,homeschool; blank = all)")
        if roles:
            args += ["--roles", roles]

    max_pairs = ask("Cap on evaluator calls per locale (blank = evaluate everything; use e.g. 15 for a quick smoke test)")
    if max_pairs:
        args += ["--max-pairs", max_pairs]

    base_url = ask("Frontend URL to crawl", "http://localhost:3000")
    if base_url != "http://localhost:3000":
        args += ["--base-url", base_url]

    preflight_timeout = ask(
        "Preflight timeout in seconds — raise this if Ollama needs a while to load the model "
        "into memory on a cold start (a 'Read timed out' preflight failure usually means this "
        "was too short, not that anything's actually broken)",
        "120",
    )
    if preflight_timeout != "120":
        args += ["--preflight-timeout", preflight_timeout]

    return args


def run_review(extra_args: list[str]) -> Path | None:
    cmd = [sys.executable, str(CRAWLER)] + extra_args
    print(f"\n$ {' '.join(cmd)}\n")
    report_path: Path | None = None
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, bufsize=1)
    for line in proc.stdout:
        print(line, end="")
        m = re.search(r"Full report written to (.+)$", line.strip())
        if m:
            report_path = Path(m.group(1).strip())
    proc.wait()
    if proc.returncode != 0:
        print(f"\nReview stage exited with code {proc.returncode}.")
        return None
    if not report_path:
        # Fallback: newest report file, in case the "Full report written to"
        # line was ever reworded upstream.
        reports = sorted(QA_DIR.glob("localization_qa_*.json"), key=lambda p: p.stat().st_mtime)
        report_path = reports[-1] if reports else None
    return report_path


# ─── Retranslate stage ──────────────────────────────────────────────────────

def choose_existing_report() -> Path | None:
    reports = sorted(QA_DIR.glob("localization_qa_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not reports:
        print("No QA reports found under frontend/qa/. Run a review first.")
        return None
    print("\nExisting QA reports (newest first):")
    labels = [f"{p.name}  ({time.strftime('%Y-%m-%d %H:%M', time.localtime(p.stat().st_mtime))})" for p in reports]
    choice = choose_from_list("Report to retranslate from", labels, default_index=0)
    return reports[labels.index(choice)]


def configure_retranslate_args(report_path: Path) -> list[str]:
    provider, model = choose_retranslate_provider_and_model()
    args = ["--report", str(report_path), "--provider", provider]
    if model:
        args += ["--model", model]

    locales = ask("Restrict to specific locales (comma-separated, blank = every locale the report flagged)")
    if locales:
        args += ["--locales", locales]

    if ask_yes_no("Skip updating .xlf provenance history (not recommended)?", default=False):
        args += ["--no-xliff"]

    return args


def run_retranslate(args: list[str], preview_first: bool = True) -> bool:
    if preview_first and ask_yes_no("Preview with --dry-run first (no writes, no API calls)?", default=True):
        cmd = [sys.executable, str(RETRANSLATOR)] + args + ["--dry-run"]
        print(f"\n$ {' '.join(cmd)}\n")
        subprocess.run(cmd)
        if not ask_yes_no("\nProceed with the real retranslation now?", default=False):
            print("Skipped — no files were changed.")
            return False

    cmd = [sys.executable, str(RETRANSLATOR)] + args
    print(f"\n$ {' '.join(cmd)}\n")
    result = subprocess.run(cmd)
    return result.returncode == 0


# ─── Sleep-on-completion ────────────────────────────────────────────────────

def sleep_windows_now(succeeded: bool = True) -> None:
    """Only sleeps unconditionally when the run actually succeeded. If it
    failed (or you declined a confirmation prompt along the way), sleeping
    silently just burns the rest of your time away from the machine without
    the job having actually done anything — so this asks first instead."""
    if not succeeded:
        print("\nThe process didn't finish successfully (see the output above for why).")
        if not ask_yes_no("Sleep the computer anyway?", default=False):
            print("Not sleeping — fix the issue above and re-run when ready.")
            return
    if platform.system() != "Windows":
        print(f"\n(Sleep trigger is Windows-only — detected {platform.system()}, skipping.)")
        return
    print("\nPutting the computer to sleep in 10 seconds — press Ctrl+C now to cancel...")
    try:
        for remaining in range(10, 0, -1):
            print(f"  {remaining}...", end="\r")
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nSleep cancelled.")
        return
    print("\nSleeping now.")
    # Standard Windows sleep trigger (Suspend, no force, no disable-wake).
    # If this is blocked by a group policy or the system prefers hibernate,
    # the machine may hibernate instead — that's controlled by Windows power
    # settings, not this script.
    subprocess.run(["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"])


# ─── Menu flows ─────────────────────────────────────────────────────────────

def flow_review_only() -> None:
    review_args = configure_review_args()
    sleep_after = ask_yes_no("Put this computer to sleep automatically when the review finishes?", default=False)

    report_path = run_review(review_args)
    print(f"\nReview complete. Report: {report_path}" if report_path else "\nReview finished, but no report path was found.")

    if sleep_after:
        sleep_windows_now(succeeded=report_path is not None)


def flow_retranslate_only() -> None:
    report_path = choose_existing_report()
    if not report_path:
        return
    retranslate_args = configure_retranslate_args(report_path)
    sleep_after = ask_yes_no("Put this computer to sleep automatically when retranslation finishes?", default=False)

    ok = run_retranslate(retranslate_args, preview_first=True)

    if sleep_after:
        sleep_windows_now(succeeded=ok)


def flow_full_pipeline() -> None:
    print("\n=== Stage 1/2: REVIEW ===")
    review_args = configure_review_args()

    print("\n=== Stage 2/2: RETRANSLATE ===")
    print("(Retranslation targets whatever the review above flags — configure it now, it'll run right after.)")
    provider, model = choose_retranslate_provider_and_model()
    locales = ask("Restrict retranslation to specific locales (comma-separated, blank = everything flagged)")
    skip_xliff = ask_yes_no("Skip updating .xlf provenance history (not recommended)?", default=False)

    re_review_after = ask_yes_no("\nAfter retranslating, re-run the review to confirm the fix?", default=True)
    sleep_after = ask_yes_no("Put this computer to sleep automatically once the whole pipeline finishes?", default=False)

    print("\nAll set — running unattended from here. This may take a while for large batches.\n")

    print("--- Running review ---")
    report_path = run_review(review_args)
    if not report_path:
        print("Review didn't produce a usable report — stopping before retranslation.")
        if sleep_after:
            sleep_windows_now(succeeded=False)
        return

    print(f"\n--- Running retranslation against {report_path.name} ---")
    retranslate_args = ["--report", str(report_path), "--provider", provider]
    if model:
        retranslate_args += ["--model", model]
    if locales:
        retranslate_args += ["--locales", locales]
    if skip_xliff:
        retranslate_args += ["--no-xliff"]
    retranslate_ok = run_retranslate(retranslate_args, preview_first=False)

    confirm_ok = True
    if re_review_after:
        print("\n--- Re-running review to confirm the fix ---")
        confirm_report = run_review(review_args)
        confirm_ok = confirm_report is not None
        print(f"\nConfirmation report: {confirm_report}" if confirm_report else "\nRe-review finished, but no report path was found.")

    print("\nPipeline complete.")
    if sleep_after:
        sleep_windows_now(succeeded=retranslate_ok and confirm_ok)


# ─── Offline (file-based) review + MT-fallback retranslate flows ───────────

def flow_offline_review() -> None:
    """Stage 1 of the improved loop: no live app, no Playwright, no Ollama —
    reads locale files directly and scores everything with TowerInstruct via
    llama-cpp-python. Writes a ranked retranslation_keys_<ts>.json with NO
    cutoff (the cutoff is chosen later in the MT retranslate flow)."""
    args: list[str] = []
    locales = ask("Restrict to specific locales (comma-separated, blank = all)")
    if locales:
        args += ["--locales", locales]
    namespaces = ask("Restrict to specific namespaces (comma-separated, blank = all)")
    if namespaces:
        args += ["--namespaces", namespaces]
    max_keys = ask("Max model evaluations per locale (blank = no limit; use ~20 for a smoke test)")
    if max_keys:
        args += ["--max-keys", max_keys]
    if ask_yes_no("Deterministic checks only (--no-llm, instant, no model needed)?", default=False):
        args += ["--no-llm"]
    sleep_after = ask_yes_no("Put this computer to sleep automatically when the review finishes?", default=False)

    cmd = [sys.executable, str(OFFLINE_REVIEWER)] + args
    print(f"\n$ {' '.join(cmd)}\n")
    result = subprocess.run(cmd)

    if sleep_after:
        sleep_windows_now(succeeded=result.returncode == 0)


def choose_ranked_report() -> Path | None:
    reports = sorted(QA_DIR.glob("retranslation_keys_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not reports:
        print("No ranked review reports found under frontend/qa/. Run the offline review first (menu option 4).")
        return None
    labels = [f"{p.name}  ({time.strftime('%Y-%m-%d %H:%M', time.localtime(p.stat().st_mtime))})" for p in reports]
    choice = choose_from_list("Ranked report to retranslate from", labels, default_index=0)
    return reports[labels.index(choice)]


def flow_mt_retranslate() -> None:
    """Stage 2+3: send keys below a score cutoff through the free-tier
    Lara -> DeepL -> Microsoft chain and write back JSON + .xlf provenance.
    The cutoff is chosen HERE — run this as many times as you like against
    the same review report with different thresholds."""
    # Show the free-tier ledger first so the threshold choice is informed.
    subprocess.run([sys.executable, str(MT_FALLBACK), "--status"])

    report_path = choose_ranked_report()
    if not report_path:
        return
    threshold = ask("Score threshold — keys scoring BELOW this get retranslated", "80")
    args = ["--report", str(report_path), "--score-threshold", threshold]

    locales = ask("Restrict to specific locales (comma-separated, blank = all in report)")
    if locales:
        args += ["--locales", locales]
    max_chars = ask("Cap this run's total source characters (blank = no cap)")
    if max_chars:
        args += ["--max-chars", max_chars]
    if ask_yes_no("Include Lara? Its free tier is only 10,000 chars/month — best saved "
                  "for small runs (Microsoft alone handles 2M/month)", default=False):
        args += ["--use-lara"]
    if ask_yes_no("Include DeepL in the chain? Its 500k allowance is ONE-TIME and never "
                  "resets — it's held in reserve unless you say yes here", default=False):
        args += ["--use-deepl"]
    if ask_yes_no("Include keys the reviewer couldn't score (needs_review)?", default=False):
        args += ["--include-unscored"]
    if ask_yes_no("Skip updating .xlf provenance history (not recommended)?", default=False):
        args += ["--no-xliff"]

    if ask_yes_no("Preview with --dry-run first (budget forecast, no API calls, no writes)?", default=True):
        cmd = [sys.executable, str(MT_RETRANSLATOR)] + args + ["--dry-run"]
        print(f"\n$ {' '.join(cmd)}\n")
        subprocess.run(cmd)
        if not ask_yes_no("\nProceed with the real retranslation now?", default=False):
            print("Skipped — no files were changed, no budget was spent.")
            return

    sleep_after = ask_yes_no("Put this computer to sleep automatically when retranslation finishes?", default=False)
    cmd = [sys.executable, str(MT_RETRANSLATOR)] + args
    print(f"\n$ {' '.join(cmd)}\n")
    result = subprocess.run(cmd)

    if sleep_after:
        sleep_windows_now(succeeded=result.returncode == 0)


# ─── Setup check ────────────────────────────────────────────────────────────

def flow_check_setup() -> None:
    """Answers 'is everything in place to run the new pipeline?' — which API
    keys are set, which Python packages import, and the ledger state."""
    import importlib.util
    import os

    print(f"\nPython being used for all stages: {sys.executable}")
    print(f"  (llama-cpp-python was compiled for Python 3.12 — launch this menu with that interpreter)")

    print("\nAPI credentials (environment variables):")
    creds = [
        ("LARA_ACCESS_KEY_ID", "Lara"), ("LARA_ACCESS_KEY_SECRET", "Lara"),
        ("DEEPL_AUTH_KEY", "DeepL (opt-in only)"), ("MS_TRANSLATOR_KEY", "Microsoft"),
        ("MS_TRANSLATOR_REGION", "Microsoft (defaults to 'global')"),
    ]
    for var, who in creds:
        val = os.getenv(var)
        shown = f"set ({val[:4]}...{val[-2:]})" if val and len(val) > 8 else ("set" if val else "NOT SET")
        print(f"  {var:<24} {shown:<20} [{who}]")

    print("\nPython packages:")
    for pkg, pip_name, why in [("llama_cpp", "llama-cpp-python", "offline reviewer"),
                               ("huggingface_hub", "huggingface_hub", "model download"),
                               ("lara_sdk", "lara-sdk", "Lara engine"),
                               ("deepl", "deepl", "DeepL engine"),
                               ("requests", "requests", "Microsoft engine"),
                               ("babel", "babel", "locale name resolution")]:
        ok = importlib.util.find_spec(pkg) is not None
        print(f"  {pkg:<18} {'OK' if ok else 'MISSING  (pip install ' + pip_name + ')':<45} [{why}]")

    print("\nFree-tier usage ledger:")
    subprocess.run([sys.executable, str(MT_FALLBACK), "--status"])
    print("\nMissing credentials aren't fatal — that engine is skipped and the chain")
    print("moves to the next one. Missing llama_cpp only blocks the offline review.")


# ─── Full offline pipeline (chained) ────────────────────────────────────────

def run_offline_review_capture(args: list[str]) -> Path | None:
    """Runs the offline reviewer, echoing output live, and captures the
    ranked-report path from its final 'Full ranked report written to' line."""
    cmd = [sys.executable, str(OFFLINE_REVIEWER)] + args
    print(f"\n$ {' '.join(cmd)}\n")
    report_path: Path | None = None
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, bufsize=1)
    for line in proc.stdout:
        print(line, end="")
        m = re.search(r"report written to (.+)$", line.strip())
        if m:
            report_path = Path(m.group(1).strip())
    proc.wait()
    if proc.returncode != 0:
        print(f"\nOffline review exited with code {proc.returncode}.")
    if not report_path or not report_path.exists():
        reports = sorted(QA_DIR.glob("retranslation_keys_*.json"), key=lambda p: p.stat().st_mtime)
        report_path = reports[-1] if reports else None
    return report_path


def show_report_summary(report_path: Path) -> None:
    """Prints the ranked report's worst rows + per-locale totals so the
    threshold choice right after is an informed one."""
    import json
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"(couldn't summarize report: {e})")
        return
    items = report.get("items", [])
    print(f"\nReviewed {len(items)} key(s). Worst 15:")
    print(f"  {'score':>5}  {'locale':<6} {'ns':<10} key / reasons")
    for it in items[:15]:
        score = it["score"] if it["score"] is not None else "n/a"
        print(f"  {score!s:>5}  {it['locale']:<6} {it['namespace']:<10} {it['key']}  "
              f"({','.join(it['reasons']) or 'evaluator'})")
    print("\nHow many keys each cutoff would send to translation:")
    for cutoff in (30, 50, 80, 95):
        picked = [i for i in items if i["score"] is not None and i["score"] < cutoff]
        chars = sum(len(i["source_en"]) for i in picked)
        print(f"  --score-threshold {cutoff:>3}  ->  {len(picked):>5} key(s), {chars:>8,} source chars")
    print(f"\nFull ranking: {report_path.with_suffix('.md')}")


def flow_full_offline_pipeline() -> None:
    """The whole improved loop, chained: offline review -> inspect ranking ->
    choose cutoff -> budget forecast -> translate via the free-tier chain ->
    sync locale files -> optional re-review of what changed."""
    print("\n=== Stage 1/3: OFFLINE REVIEW (scores every key, no cutoff) ===")
    review_args: list[str] = []
    locales = ask("Restrict to specific locales (comma-separated, blank = all)")
    if locales:
        review_args += ["--locales", locales]
    max_keys = ask("Max model evaluations per locale (blank = no limit; ~20 for a smoke test)")
    if max_keys:
        review_args += ["--max-keys", max_keys]
    if ask_yes_no("Deterministic checks only (--no-llm, instant, no model)?", default=False):
        review_args += ["--no-llm"]

    reuse = None
    reports = sorted(QA_DIR.glob("retranslation_keys_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if reports and ask_yes_no(f"A ranked report already exists ({reports[0].name}). "
                              f"Skip the review and reuse it?", default=False):
        reuse = reports[0]

    report_path = reuse or run_offline_review_capture(review_args)
    if not report_path:
        print("No ranked report produced — stopping.")
        return

    print("\n=== Stage 2/3: CHOOSE CUTOFF & TRANSLATE (Lara -> Microsoft; DeepL opt-in) ===")
    show_report_summary(report_path)
    subprocess.run([sys.executable, str(MT_FALLBACK), "--status"])

    threshold = ask("\nScore threshold — keys scoring BELOW this get retranslated", "80")
    mt_args = ["--report", str(report_path), "--score-threshold", threshold]
    if locales:
        mt_args += ["--locales", locales]
    if ask_yes_no("Include Lara? (only 10,000 free chars/month — Microsoft alone handles 2M)", default=False):
        mt_args += ["--use-lara"]
    if ask_yes_no("Include DeepL? Its 500k allowance is ONE-TIME and never resets", default=False):
        mt_args += ["--use-deepl"]

    print("\n--- Budget forecast (dry run, no API calls) ---")
    subprocess.run([sys.executable, str(MT_RETRANSLATOR)] + mt_args + ["--dry-run"])
    if not ask_yes_no("\nProceed with the real translation now?", default=False):
        print("Stopped — no files changed, no budget spent. Re-run option 1 and reuse "
              "the same report to try a different cutoff.")
        return
    result = subprocess.run([sys.executable, str(MT_RETRANSLATOR)] + mt_args)
    if result.returncode != 0:
        print("Translation stage failed — stopping before sync/re-review.")
        return

    print("\n=== Stage 3/3: SYNC & CONFIRM ===")
    subprocess.run([sys.executable, str(SCRIPTS_DIR / "sync_locales.py")])
    if ask_yes_no("Re-run the offline review on the same scope to confirm scores improved?", default=True):
        run_offline_review_capture(review_args)
    print("\nPipeline complete.")


# ─── Main menu ──────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 60)
    print("Peripateticware Localization Review Pipeline")
    print("=" * 60)
    print("Review (model 2) and Retranslate (model 3) — run separately or chained.")

    while True:
        print("\n" + "-" * 60)
        print("  NEW PIPELINE (offline review + free-tier MT chain) — start here:")
        print("  [1] FULL PIPELINE: review -> pick cutoff -> forecast -> translate -> sync -> confirm  [RECOMMENDED]")
        print("  [2] Offline REVIEW only (scores every key, writes the ranked report)")
        print("  [3] MT TRANSLATE only (uses an existing ranked report; cutoff chosen here)")
        print("  [4] Show free-tier usage ledger")
        print("  [5] Check setup (API keys, packages, ledger)")
        print("  LEGACY (crawler-based, needs the live app + Ollama):")
        print("  [6] Crawler REVIEW only")
        print("  [7] Single-provider RETRANSLATE (from a crawler report)")
        print("  [8] Crawler FULL PIPELINE (crawl -> retranslate -> re-crawl)")
        print("  [9] Exit")
        choice = input("Choose an option [1-9]: ").strip()

        if choice == "1":
            flow_full_offline_pipeline()
        elif choice == "2":
            flow_offline_review()
        elif choice == "3":
            flow_mt_retranslate()
        elif choice == "4":
            subprocess.run([sys.executable, str(MT_FALLBACK), "--status"])
        elif choice == "5":
            flow_check_setup()
        elif choice == "6":
            flow_review_only()
        elif choice == "7":
            flow_retranslate_only()
        elif choice == "8":
            flow_full_pipeline()
        elif choice == "9" or choice.lower() in ("q", "quit", "exit"):
            print("Bye.")
            return
        else:
            print("Not a valid choice, try again.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted — no further steps run.")
