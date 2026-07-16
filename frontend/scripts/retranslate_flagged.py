#!/usr/bin/env python3
# frontend/scripts/retranslate_flagged.py
#
# Third stage of the localization QA loop:
#
#   Model 1 (translate_sync.py)         — translates en -> target locale
#   Model 2 (localization_qa_crawler.py) — crawls the live app and flags
#                                           subpar strings, writing a report
#                                           to frontend/qa/localization_qa_*.json
#   Model 3 (THIS SCRIPT)               — reads that report, resolves every
#                                           flagged/untranslated string back
#                                           to its i18next key, and sends
#                                           ONLY those keys to a third,
#                                           independently-configured model
#                                           for retranslation.
#
# "Subpar" = either bucket the QA crawler reports:
#   - likely_untranslated : target text is byte-identical to English (a real
#     string that never got translated, or a translation that regressed
#     back to English on a later run).
#   - evaluated[].flagged : a translation quality estimator model looked at
#     the (source, target) pair and found errors/mistranslation.
#
# WHY A SEPARATE SCRIPT RATHER THAN JUST RE-RUNNING translate_sync.py:
# translate_sync's incremental diff only retranslates keys that are missing
# or byte-equal to English — it has no concept of "translated, but bad,
# per an independent reviewer." This script is the bridge: it turns the QA
# report's judgments into a precise worklist of (locale, namespace, key)
# tuples, and routes JUST those through a model you choose independently of
# whichever model produced the original (possibly bad) translation —
# e.g. translate with OLLAMA, review with a QE model, fix with CLAUDE.
#
# USAGE:
#     python3 scripts/retranslate_flagged.py                     # latest report in frontend/qa/
#     python3 scripts/retranslate_flagged.py --report frontend/qa/localization_qa_123.json
#     python3 scripts/retranslate_flagged.py --provider CLAUDE --model claude-opus-4-6
#     python3 scripts/retranslate_flagged.py --locales de,es,it,pt-BR
#     python3 scripts/retranslate_flagged.py --dry-run            # resolve + report only, no API calls, no writes
#
# After this runs, re-crawl (scripts/localization_qa_crawler.py) to confirm
# the flagged strings are now clean — or just use scripts/review_pipeline.py,
# which chains review -> retranslate -> re-review interactively.

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from translate_sync import (  # reuse the exact same engine + routing logic model 1 uses
    UniversalOrchestrator,
    classify_key_and_get_config,
    flatten_json,
    unflatten_json,
    load_json,
    save_json,
    _resolve_language_name,
    parse_existing_xliff_with_prov,
    write_xliff_prov_file,
    build_or_update_prov_graph,
    get_timestamp,
)

FRONTEND_DIR = Path(__file__).parent.parent
LOCALES_DIR = FRONTEND_DIR / "public" / "locales"
QA_DIR = FRONTEND_DIR / "qa"

# Same namespace map sync_locales.py uses — the set of files a locale's
# translated content actually lives in.
NS_MAP: dict[str, str] = {
    "landing":    "landing.json",
    "common":     "common.json",
    "student":    "STUDENT.json",
    "teacher":    "TEACHER.json",
    "curriculum": "curriculum.json",
}

SKIP_LOCALES = {"en", "tu", "_tu_backup"}


# ─── Report loading ─────────────────────────────────────────────────────────

def find_latest_report() -> Path | None:
    reports = sorted(QA_DIR.glob("localization_qa_*.json"), key=lambda p: p.stat().st_mtime)
    return reports[-1] if reports else None


def iter_subpar_items(locale_data: dict):
    """Yields (source_text, target_text, reason, evaluator_note) for every
    subpar string across a locale's public + protected route results."""
    route_results = list(locale_data.get("public_routes", {}).values())
    for role_routes in locale_data.get("protected_routes", {}).values():
        route_results.extend(role_routes.values())

    for result in route_results:
        for src in result.get("likely_untranslated", []):
            yield src, src, "likely_untranslated", None
        for pair in result.get("evaluated", []):
            if pair.get("flagged"):
                yield pair["source"], pair["target"], "flagged_by_evaluator", pair.get("evaluator_response")


# ─── EN source -> (namespace, key) reverse index ───────────────────────────

def build_en_reverse_index() -> dict[str, list[tuple[str, str]]]:
    """Maps an EN display string -> every (namespace, dot-key) it could have
    come from. Multiple keys can share the same English text (e.g. two
    different "Continue" buttons), which is why this returns a list —
    disambiguation against the locale's CURRENT value happens at resolve time."""
    en_dir = LOCALES_DIR / "en"
    index: dict[str, list[tuple[str, str]]] = {}
    for ns, fname in NS_MAP.items():
        path = en_dir / fname
        if not path.exists():
            continue
        flat = flatten_json(load_json(path))
        for key, text in flat.items():
            if not isinstance(text, str) or not text:
                continue
            index.setdefault(text, []).append((ns, key))
    return index


# ─── Resolve QA-report strings back to i18next keys ────────────────────────

def resolve_item(en_index: dict, locale_ns_cache: dict, locale: str,
                  source: str, target: str) -> list[tuple[str, str]]:
    """Returns the list of (namespace, key) candidates this (source, target)
    pair most likely corresponds to. Prefers the candidate whose CURRENT
    value in the locale's files matches `target` exactly (removes ambiguity
    when several keys share the same English source text); falls back to
    every candidate if none currently match (e.g. the file already changed
    since the crawl ran)."""
    candidates = en_index.get(source, [])
    if not candidates:
        return []
    if len(candidates) == 1:
        return candidates

    exact = []
    for ns, key in candidates:
        cache_key = (locale, ns)
        if cache_key not in locale_ns_cache:
            path = LOCALES_DIR / locale / NS_MAP[ns]
            locale_ns_cache[cache_key] = flatten_json(load_json(path)) if path.exists() else {}
        current_val = locale_ns_cache[cache_key].get(key)
        if current_val == target:
            exact.append((ns, key))
    return exact if exact else candidates


# ─── Writing results back ───────────────────────────────────────────────────

def write_namespace_value(locale: str, ns: str, key: str, value: str) -> None:
    ns_path = LOCALES_DIR / locale / NS_MAP[ns]
    ns_path.parent.mkdir(parents=True, exist_ok=True)
    data = load_json(ns_path) if ns_path.exists() else {}
    flat = flatten_json(data)
    flat[key] = value
    save_json(ns_path, unflatten_json(flat))

    if ns == "landing":
        # Mirror into the root flat file translate_sync.py reads/writes,
        # so its incremental diff and provenance stay consistent with what
        # actually shipped in the namespace file.
        root_path = LOCALES_DIR / f"{locale}.json"
        root_data = load_json(root_path) if root_path.exists() else {}
        root_landing_flat = flatten_json(root_data.get("landing", {}))
        root_landing_flat[key] = value
        root_data["landing"] = unflatten_json(root_landing_flat)
        save_json(root_path, root_data)


# ─── XLIFF provenance — record "translation by X overwritten by Y" ─────────
#
# translate_sync.py already writes a W3C-PROV graph into each locale's
# {code}.xlf (see build_or_update_prov_graph / write_xliff_prov_file). Every
# translated value's "generated_by" activity names the actor (provider+model
# string) that produced it. When this script overwrites a value, we want that
# history to say so explicitly — not just implicitly reconstructable by
# walking the graph — so a `git blame`-style question ("who produced this
# text, and who overwrote it, and why") is answerable by opening the .xlf.
# Only the "landing" namespace has a .xlf today (translate_sync.py's own
# scope), so this only applies to landing-namespace keys.

def find_actor_for_version(global_prov: dict, key: str, version: int) -> str | None:
    """Walks the existing PROV graph to find which model produced a key's
    CURRENT version, by following target-entity -> generated_by(activity) ->
    actor(agent) -> prov:label. Returns None if version 0 (never translated
    before) or the graph doesn't have the expected shape."""
    if version < 1:
        return None
    graph = global_prov.get("@graph", [])
    target_id = f"entity:target-{key}-v{version}"
    target_node = next((n for n in graph if n.get("@id") == target_id), None)
    if not target_node:
        return None
    activity_id = target_node.get("generated_by", {}).get("@id")
    activity_node = next((n for n in graph if n.get("@id") == activity_id), None)
    if not activity_node:
        return None
    agent_id = activity_node.get("actor", {}).get("@id")
    agent_node = next((n for n in graph if n.get("@id") == agent_id), None)
    if not agent_node:
        return None
    return agent_node.get("prov:label", "").replace("Translation Engine Profile: ", "") or None


def apply_xliff_overwrites(locale: str, updates: dict[str, dict], new_actor_label: str) -> None:
    """Rewrites {locale}.xlf so each overwritten key's history explicitly
    records: previous translation (and which model produced it), the new
    translation (and which model — this run's), and why it was overwritten
    (the QA reason/evaluator note). `updates` is {key: {"en", "new_value",
    "reason", "note"}} — only landing-namespace keys actually touched.

    Per-key actor: an update record may also carry an "actor" of its own,
    which then wins over `new_actor_label` for that key. A single
    retranslate_mt.py run can legitimately span multiple engines (the
    Lara -> DeepL -> Microsoft chain switches engines when a free-tier
    budget runs out mid-run), so one label per run can no longer describe
    every key. Callers that use one engine for the whole run (this script)
    are unaffected — omitting "actor" preserves the old behavior exactly."""
    if not updates:
        return

    xlf_path = LOCALES_DIR / f"{locale}.xlf"
    en_flat = flatten_json(load_json(LOCALES_DIR / "en" / "landing.json"))
    # Keys being created that have no EN counterpart (e.g. CLDR plural
    # categories the target language needs but English doesn't, like ar's
    # _few/_many) still get a trans-unit: seed their source from the update.
    for k, meta in updates.items():
        en_flat.setdefault(k, meta["en"])
    root_path = LOCALES_DIR / f"{locale}.json"
    target_flat = flatten_json(load_json(root_path).get("landing", {})) if root_path.exists() else {}

    xlf_data = parse_existing_xliff_with_prov(xlf_path)
    historical = xlf_data["strings"]
    global_prov = xlf_data["global_prov"]
    ts = get_timestamp()

    meta_tracking: dict[str, dict] = {}
    for k, en_src in en_flat.items():
        hist = historical.get(k, {})
        if k in updates:
            meta = updates[k]
            key_actor = meta.get("actor") or new_actor_label
            old_version = hist.get("version", 0)
            new_version = old_version + 1
            old_actor = find_actor_for_version(global_prov, k, old_version) or (
                "none (previously untranslated)" if old_version < 1 else "unknown model"
            )

            global_prov = build_or_update_prov_graph(
                k, meta["en"], meta["new_value"], key_actor, ts, new_version, global_prov
            )
            # Annotate the activity node build_or_update_prov_graph just added
            # with an explicit human-readable overwrite record.
            activity_id = f"activity:translation-{k}-{ts}"
            for node in global_prov["@graph"]:
                if node.get("@id") == activity_id:
                    node["prov:overwroteTranslationBy"] = old_actor
                    node["prov:overwriteReason"] = meta["reason"]
                    if meta.get("note"):
                        node["prov:qaEvaluatorNote"] = meta["note"]
                    break

            meta_tracking[k] = {
                "version": new_version,
                "status": f"overwritten: [{old_actor}] -> [{key_actor}] (reason: {meta['reason']})",
            }
        else:
            meta_tracking[k] = {
                "version": hist.get("version", 1),
                "status": "approved" if hist.get("approved") else "pending_review",
            }

    write_xliff_prov_file(xlf_path, locale, en_flat, target_flat, meta_tracking, global_prov)
    print(f"  XLIFF provenance updated: {xlf_path.name} ({len(updates)} key(s) marked as overwritten)")


# ─── Main ───────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--report", default=None, help="Path to a QA report JSON (default: latest in frontend/qa/)")
    ap.add_argument("--locales", default=None, help="Comma-separated locales to process (default: every locale in the report)")
    ap.add_argument("--provider", default="CLAUDE",
                     choices=["OLLAMA", "CLAUDE", "GEMINI", "DEEPL", "GOOGLE_TRANSLATE", "MICROSOFT"],
                     help="Third-model provider for retranslation — deliberately a separate flag from "
                          "translate_sync.py's --provider, so this can be a genuinely different model.")
    ap.add_argument("--model", default=None, help="Override the model name (e.g. --provider CLAUDE --model claude-opus-4-6)")
    ap.add_argument("--dry-run", action="store_true", help="Resolve + report only. No API calls, no file writes.")
    ap.add_argument("--out-log", default=None, help="Audit log path (default: frontend/qa/retranslation_log_<ts>.json)")
    ap.add_argument("--no-xliff", action="store_true",
                     help="Skip updating {locale}.xlf provenance history (landing namespace only). "
                          "On by default so the .xlf can show which model overwrote which.")
    args = ap.parse_args()

    report_path = Path(args.report) if args.report else find_latest_report()
    if not report_path or not report_path.exists():
        print("No QA report found. Run scripts/localization_qa_crawler.py first.")
        sys.exit(1)
    print(f"Loading QA report: {report_path}")
    report = json.loads(report_path.read_text(encoding="utf-8"))

    wanted_locales = {l.strip() for l in args.locales.split(",")} if args.locales else None
    en_index = build_en_reverse_index()
    locale_ns_cache: dict = {}

    if args.model:
        import os
        os.environ.setdefault("CLAUDE_MODEL", args.model)
        os.environ.setdefault("GEMINI_MODEL", args.model)
        os.environ.setdefault("OLLAMA_MODEL_TEXT", args.model)

    engine = None
    if not args.dry_run:
        try:
            engine = UniversalOrchestrator(args.provider, "Dynamic Routing", "Dynamic Pacing")
        except Exception as e:
            print(f"Could not initialize third-model engine ({args.provider}): {e}")
            sys.exit(1)
        print(f"Retranslation engine: {engine.get_method_string()}")

    audit_entries = []
    unresolved: list[tuple[str, str, str]] = []
    total_resolved = 0

    all_locales = list(report.get("locales", {}).items())
    total_locales_in_report = len(all_locales)

    for locale_idx, (locale, locale_data) in enumerate(all_locales, start=1):
        progress = f"[{locale_idx}/{total_locales_in_report}]"

        if locale in SKIP_LOCALES:
            print(f"{progress} Locale '{locale}': skipping (source/backup locale, not a translation target)")
            continue
        if wanted_locales and locale not in wanted_locales:
            print(f"{progress} Locale '{locale}': skipping (not in --locales filter)")
            continue

        # (namespace, key) -> {"en": ..., "reason": ..., "note": ...}
        worklist: dict[tuple[str, str], dict] = {}

        for source, target, reason, note in iter_subpar_items(locale_data):
            candidates = resolve_item(en_index, locale_ns_cache, locale, source, target)
            if not candidates:
                unresolved.append((locale, source, reason))
                continue
            for ns, key in candidates:
                # flagged_by_evaluator beats likely_untranslated if both hit the same key
                existing = worklist.get((ns, key))
                if existing and existing["reason"] == "flagged_by_evaluator":
                    continue
                worklist[(ns, key)] = {"en": source, "reason": reason, "note": note}

        if not worklist:
            print(f"{progress} Locale '{locale}': nothing flagged — already clean, skipping.")
            continue

        print(f"\n{progress} Locale '{locale}': {len(worklist)} key(s) need retranslation "
              f"({sum(1 for v in worklist.values() if v['reason']=='flagged_by_evaluator')} flagged, "
              f"{sum(1 for v in worklist.values() if v['reason']=='likely_untranslated')} untranslated)")

        if args.dry_run:
            for (ns, key), meta in list(worklist.items())[:10]:
                print(f"    would retranslate [{ns}] {key}  (\"{meta['en'][:60]}\")  reason={meta['reason']}")
            if len(worklist) > 10:
                print(f"    ... and {len(worklist) - 10} more")
            total_resolved += len(worklist)
            continue

        lang_name = _resolve_language_name(locale)
        xliff_updates: dict[str, dict] = {}  # landing-namespace key -> overwrite record for this locale
        keys_done_in_locale = 0
        total_keys_in_locale = len(worklist)

        # Group like translate_sync.py does, so retranslation gets the same
        # content-aware temperature/style routing as the original pass.
        grouped: dict[tuple, list[tuple[str, str, str]]] = {}
        for (ns, key), meta in worklist.items():
            cat, inst, temp = classify_key_and_get_config(key, meta["en"])
            grouped.setdefault((cat, inst, temp), []).append((ns, key, meta["en"]))

        for (cat, inst, temp), items in grouped.items():
            print(f"  {progress} Retranslating {len(items)} key(s) — category '{cat}' (temp {temp})...")
            engine.set_dynamic_override(cat, inst, temp)
            texts = [t for _, _, t in items]
            batch_size = 5 if engine.provider == "OLLAMA" else (10 if engine.provider in ["CLAUDE", "GEMINI"] else 50)
            total_batches = (len(items) + batch_size - 1) // batch_size
            for batch_num, i in enumerate(range(0, len(items), batch_size), start=1):
                batch = items[i:i + batch_size]
                batch_texts = [t for _, _, t in batch]
                print(f"    {progress} batch {batch_num}/{total_batches} ({len(batch_texts)} key(s))... ",
                      end="", flush=True)
                try:
                    translated = engine.translate_batch(batch_texts, lang_name, locale)
                except Exception as e:
                    print(f"FAILED: {e}")
                    continue
                written_this_batch = 0
                for (ns, key, en_text), new_val in zip(batch, translated):
                    if not new_val or new_val == en_text:
                        print(f"\n    WARNING: [{ns}] {key} — model returned empty/unchanged text, skipping write")
                        continue
                    old_val_path = LOCALES_DIR / locale / NS_MAP[ns]
                    old_flat = flatten_json(load_json(old_val_path)) if old_val_path.exists() else {}
                    old_val = old_flat.get(key, "")
                    write_namespace_value(locale, ns, key, new_val)
                    audit_entries.append({
                        "locale": locale, "namespace": ns, "key": key,
                        "en_source": en_text, "previous_value": old_val, "new_value": new_val,
                        "reason": worklist[(ns, key)]["reason"],
                        "evaluator_note": worklist[(ns, key)]["note"],
                        "model": engine.get_method_string(),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                    if ns == "landing":
                        xliff_updates[key] = {
                            "en": en_text, "new_value": new_val,
                            "reason": worklist[(ns, key)]["reason"],
                            "note": worklist[(ns, key)]["note"],
                        }
                    total_resolved += 1
                    keys_done_in_locale += 1
                    written_this_batch += 1
                remaining_in_locale = total_keys_in_locale - keys_done_in_locale
                print(f"done ({written_this_batch} written) — "
                      f"{keys_done_in_locale}/{total_keys_in_locale} keys done in '{locale}', "
                      f"{remaining_in_locale} remaining")

        if not args.no_xliff and xliff_updates:
            apply_xliff_overwrites(locale, xliff_updates, engine.get_method_string())

        print(f"{progress} Locale '{locale}' complete. "
              f"{total_locales_in_report - locale_idx} locale(s) remaining overall.")

    print("\n" + "=" * 60)
    print(f"{'Would retranslate' if args.dry_run else 'Retranslated'}: {total_resolved} key(s)")
    print(f"Unresolved (couldn't map back to an i18next key): {len(unresolved)}")
    if unresolved:
        for locale, source, reason in unresolved[:15]:
            print(f"    [{locale}] ({reason}) \"{source[:70]}\"")
        if len(unresolved) > 15:
            print(f"    ... and {len(unresolved) - 15} more")
        print("  These are likely interpolated strings ({{count}} etc.) or text that changed "
              "since the report was generated — investigate manually.")

    if not args.dry_run and audit_entries:
        out_log = Path(args.out_log) if args.out_log else QA_DIR / f"retranslation_log_{int(datetime.now().timestamp())}.json"
        out_log.parent.mkdir(parents=True, exist_ok=True)
        out_log.write_text(json.dumps({
            "source_report": str(report_path),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "entries": audit_entries,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nAudit log written to {out_log}")
        print("\nNext steps:")
        print("  1. python scripts/sync_locales.py   # keep namespace files + any future root-diff in sync")
        print("  2. Re-run scripts/localization_qa_crawler.py to confirm these strings are now clean.")


if __name__ == "__main__":
    main()
