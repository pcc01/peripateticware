#!/usr/bin/env python3
# frontend/scripts/retranslate_mt.py
#
# MT-fallback retranslation driver — stage 2+3 of the improved QA loop:
#
#   Stage 1 (qa_review_llamacpp.py)  — REVIEW: scores every translated key
#                                       offline with TowerInstruct-7B and
#                                       writes a ranked report of ALL keys
#                                       (worst first) to
#                                       frontend/qa/retranslation_keys_<ts>.json
#   Stage 2 (THIS SCRIPT)            — TRANSLATE: picks the keys scoring
#                                       below --score-threshold and sends them
#                                       through the free-tier chain
#                                       (mt_fallback.py): Lara -> Microsoft by
#                                       default; add --use-deepl to insert
#                                       DeepL between them (its 500k allowance
#                                       is ONE-TIME and never resets, so it is
#                                       spent only on explicit request). Items
#                                       go in rank order so budget is always
#                                       spent on the worst strings first.
#   Stage 3 (THIS SCRIPT)            — WRITE BACK: overwrites the old values
#                                       in the locale JSON files and records
#                                       per-key engine provenance in the
#                                       locale's .xlf (root/landing AND the
#                                       per-namespace .xlf files).
#
# The review runs once and scores everything; the CUTOFF IS DECIDED HERE, at
# API time — so you can inspect the ranked report first, then run this script
# repeatedly with different thresholds without ever re-running the review:
#
#     python scripts/retranslate_mt.py --score-threshold 80 --dry-run
#     python scripts/retranslate_mt.py --score-threshold 80
#     python scripts/retranslate_mt.py --score-threshold 50 --locales ja,ar
#     python scripts/retranslate_mt.py --score-threshold 80 --max-chars 20000
#
# --dry-run prints a per-engine character-consumption forecast against the
# live usage ledger (frontend/qa/mt_usage_state.json) without a single API
# call, so you can see whether the work fits in Lara's budget or will spill
# into DeepL/Microsoft before committing.
#
# Credentials: see mt_fallback.py header (LARA_ACCESS_KEY_ID,
# LARA_ACCESS_KEY_SECRET, DEEPL_AUTH_KEY, MS_TRANSLATOR_KEY, ...).

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from translate_sync import (
    flatten_json,
    load_json,
    bad_reasons,
    is_do_not_translate,
    protect_emails,
    restore_emails,
    parse_existing_xliff_with_prov,
    write_xliff_prov_file,
    build_or_update_prov_graph,
    get_timestamp,
)
from retranslate_flagged import (
    NS_MAP,
    write_namespace_value,
    apply_xliff_overwrites,
    find_actor_for_version,
)
from mt_fallback import FallbackTranslator, UsageLedger, LOCALE_MAP
from qa_review_llamacpp import locked_value  # value-level DNT (i18n-do-not-translate.md)

# Locked terms that, when present in a source sentence, must survive machine
# translation verbatim (word-boundary match). An engine output that altered
# one is rejected and the item retried on the next engine — same treatment
# as a mangled email address. Mirrors i18n-do-not-translate.md §1/§2.
#
# NOTE on the boundary: Python's \w is Unicode-aware, so `(?<!\w)`/`(?!\w)`
# false-negatives whenever the term sits directly against a CJK character
# with no space — which is the NORMAL way ja/ko/zh output attaches a
# particle or punctuation straight onto an embedded Latin brand name (e.g.
# "...Peripateticwareの..."). Unicode treats that kana as a "word" character,
# so the lookaround silently reports the term MISSING even when the engine
# preserved it correctly. Use an ASCII-only boundary instead: what actually
# matters is that the term isn't glued to *other Latin letters/digits*
# (which would mean it's part of a different token), not whether it's
# adjacent to a non-Latin character.
_LOCKED_TERMS = ("Peripateticware", "FERPA", "COPPA", "GDPR",
                  "CCPA", "PIPEDA", "LGPD", "SOC 2")
_LOCKED_TERM_RES = [re.compile(rf"(?<![A-Za-z0-9]){re.escape(t)}(?![A-Za-z0-9])")
                    for t in _LOCKED_TERMS]


def locked_terms_preserved(src: str, out: str) -> bool:
    if not isinstance(out, str):
        return False
    return all(rx.search(out) for rx in _LOCKED_TERM_RES if rx.search(src))


def protect_locked_terms(text: str) -> tuple[str, dict[str, str]]:
    """Swaps locked terms (product name, legal acronyms) for a {term_N}
    placeholder before the text is sent to an MT engine — same technique
    protect_emails already uses for email addresses — so the engine never
    sees the real term and can't transliterate/localize it (CJK engines in
    particular routinely localize an embedded Latin brand name into the
    target script). Restore the exact original substring afterward. This
    replaces "detect the corruption after the fact" with "make the
    corruption impossible", which is the same reasoning protect_emails'
    docstring gives."""
    if not isinstance(text, str):
        return text, {}
    term_map: dict[str, str] = {}
    protected = text
    for rx in _LOCKED_TERM_RES:
        def _sub(m: re.Match) -> str:
            placeholder = f"{{term_{len(term_map) + 1}}}"
            term_map[placeholder] = m.group(0)
            return placeholder
        protected = rx.sub(_sub, protected)
    return protected, term_map


def restore_locked_terms(text, term_map: dict[str, str]):
    if not isinstance(text, str) or not term_map:
        return text
    for placeholder, term in term_map.items():
        text = text.replace(placeholder, term)
    return text

FRONTEND_DIR = Path(__file__).parent.parent
LOCALES_DIR = FRONTEND_DIR / "public" / "locales"
QA_DIR = FRONTEND_DIR / "qa"

# Default chain: Microsoft only. Lara (10k/month free tier) joins the front
# with --use-lara; DeepL (ONE-TIME 500k, never resets) joins the middle with
# --use-deepl.
def engine_order(use_lara: bool, use_deepl: bool) -> tuple[str, ...]:
    order = []
    if use_lara:
        order.append("lara")
    if use_deepl:
        order.append("deepl")
    order.append("microsoft")
    return tuple(order)


# ─── Report loading ─────────────────────────────────────────────────────────

def find_latest_report() -> Path | None:
    reports = sorted(QA_DIR.glob("retranslation_keys_*.json"), key=lambda p: p.stat().st_mtime)
    return reports[-1] if reports else None


def select_items(report: dict, threshold: float, locales: set[str] | None,
                 include_unscored: bool, max_chars: int | None) -> list[dict]:
    """Filters the ranked report down to this run's worklist. Report order is
    preserved (it's already globally ranked worst-first), so a --max-chars cap
    trims the LEAST important tail, never the worst strings."""
    picked: list[dict] = []
    running_chars = 0
    for item in report.get("items", []):
        if locales and item["locale"] not in locales:
            continue
        score = item.get("score")
        if score is None:
            if not include_unscored:
                continue
        elif score >= threshold:
            continue
        reasons = item.get("reasons") or []
        # Dead plural keys (categories the locale never uses) are report-only:
        # the fix is deleting the key, not translating it.
        if "cldr_plural_extra" in reasons:
            continue
        # DNT items are excluded from MT — EXCEPT dnt_violation items, which
        # are handled by restoring the English value directly (no API call).
        if "dnt_violation" not in reasons and (
                is_do_not_translate(item["key"], item["source_en"])
                or locked_value(item["source_en"])):
            continue
        if max_chars is not None and running_chars + len(item["source_en"]) > max_chars:
            break
        running_chars += len(item["source_en"])
        picked.append(item)
    return picked


# ─── Dry-run forecast ────────────────────────────────────────────────────────

def forecast(items: list[dict], ledger: UsageLedger, use_lara: bool, use_deepl: bool) -> None:
    """Simulates the chain's budget decisions (same order, same pre-call
    check, same locale-support rules) without instantiating engines or
    touching the network, then prints who would translate what."""
    order = engine_order(use_lara, use_deepl)
    sim_remaining = {e: ledger.remaining(e) for e in order}
    assigned: dict[str, dict] = {e: {"keys": 0, "chars": 0} for e in order}
    deferred = {"keys": 0, "chars": 0}
    api_key_of = {"lara": "lara", "deepl": "deepl", "microsoft": "ms"}

    for item in items:
        n = len(item["source_en"])
        placed = False
        for engine in order:
            if LOCALE_MAP.get(item["locale"], {}).get(api_key_of[engine]) is None:
                continue
            if sim_remaining[engine] >= n:
                sim_remaining[engine] -= n
                assigned[engine]["keys"] += 1
                assigned[engine]["chars"] += n
                placed = True
                break
        if not placed:
            deferred["keys"] += 1
            deferred["chars"] += n

    print("\nDry-run forecast (no API calls made, ledger untouched):")
    for engine in order:
        a = assigned[engine]
        print(f"  {engine:<10} would receive {a['keys']:>5} key(s), {a['chars']:>8,} chars "
              f"(then {sim_remaining[engine]:,} chars would remain spendable)")
    if not use_lara:
        print("  lara       held back (10k/month free tier) — add --use-lara to include it")
    if not use_deepl:
        print("  deepl      held in reserve (one-time 500k budget) — add --use-deepl to include it")
    if deferred["keys"]:
        print(f"  DEFERRED   {deferred['keys']} key(s), {deferred['chars']:,} chars — no engine has room; "
              f"they'd be written to retranslation_deferred_<ts>.json")
    print("\nNote: forecast assumes the listed engines have credentials configured. An")
    print("engine with missing credentials is skipped at run time, shifting load right.")


# ─── Namespace-scoped XLIFF provenance (extension beyond root/landing) ──────

def apply_ns_xliff_overwrites(locale: str, ns: str, updates: dict[str, dict]) -> None:
    """Per-namespace equivalent of retranslate_flagged.apply_xliff_overwrites:
    records engine provenance for retranslated keys in {locale}/{ns}.xlf,
    CREATING the file when it doesn't exist yet (today only root/landing has
    .xlf — decision, plan Part 7 #4, was to extend coverage to every
    namespace). Each update record carries its own "actor" since a single run
    can span engines."""
    if not updates:
        return

    xlf_path = LOCALES_DIR / locale / f"{Path(NS_MAP[ns]).stem}.xlf"
    en_flat = flatten_json(load_json(LOCALES_DIR / "en" / NS_MAP[ns]))
    # CLDR plural keys created for the target locale (e.g. ar _few/_many)
    # have no EN counterpart — seed their trans-unit source from the update.
    for k, meta in updates.items():
        en_flat.setdefault(k, meta["en"])
    ns_path = LOCALES_DIR / locale / NS_MAP[ns]
    target_flat = flatten_json(load_json(ns_path)) if ns_path.exists() else {}

    xlf_data = parse_existing_xliff_with_prov(xlf_path)
    historical = xlf_data["strings"]
    global_prov = xlf_data["global_prov"]
    ts = get_timestamp()

    meta_tracking: dict[str, dict] = {}
    for k, en_src in en_flat.items():
        hist = historical.get(k, {})
        if k in updates:
            meta = updates[k]
            key_actor = meta["actor"]
            old_version = hist.get("version", 0)
            new_version = old_version + 1
            old_actor = find_actor_for_version(global_prov, k, old_version) or (
                "none (previously untranslated)" if old_version < 1 else "unknown model"
            )
            global_prov = build_or_update_prov_graph(
                k, meta["en"], meta["new_value"], key_actor, ts, new_version, global_prov
            )
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
    print(f"  XLIFF provenance updated: {locale}/{xlf_path.name} ({len(updates)} key(s) marked as overwritten)")


_WORD_RE = re.compile(r"[^\W\d_]+", re.UNICODE)


def _unexpected_unchanged(src: str) -> bool:
    """An MT engine returning its input verbatim is not automatically wrong.
    Unlike a cheap heuristic, Microsoft/DeepL/Lara are commercial MT engines
    that return identical output exactly when that IS the correct
    translation: cognates/loanwords ("Video" in Italian, "Status"/"Radius"/
    "Name" in German, "Page"/"Actions"/"Longitude" in French), numbers,
    and proper nouns (place names, product/framework names). The blanket
    "val == src -> reject" rule was rejecting exactly these cases forever —
    with only Microsoft in the default chain there's no other engine to
    fall through to, so they piled up in "failed on every engine" on every
    single run, burning retries on strings that could never pass.

    Two shapes are still genuinely suspicious and stay flagged:
      - a single capitalized/short word or a proper-noun-shaped phrase
        (every word Title-Cased, e.g. "San Francisco, CA") is EXEMPTED —
        very likely a legitimate loanword or place/brand name.
      - real multi-word prose where at least one word is NOT capitalized
        (e.g. "Field work {{date}}") still trips this check — a whole
        untranslated phrase/sentence is a real miss, not a cognate.
    Non-Latin-script targets are separately covered by has_expected_script/
    wrong_script (bad_reasons already runs it above), so this check doesn't
    need to special-case script itself.
    """
    words = _WORD_RE.findall(src)
    if len(words) <= 1:
        return False  # single word/label — plausible cognate, proper noun, or code
    if all(w[:1].isupper() for w in words):
        return False  # "San Francisco, CA" / "New York, NY" shaped — proper noun
    return True


# ─── Main ───────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--report", default=None,
                     help="Path to a ranked review report (default: latest retranslation_keys_*.json in frontend/qa/)")
    ap.add_argument("--score-threshold", type=float, required=True,
                     help="Keys scoring BELOW this (0-100) are retranslated. Required on purpose: "
                          "the review scores everything and the cutoff is decided here, at API time, "
                          "so you can rerun with different thresholds without re-reviewing.")
    ap.add_argument("--locales", default=None, help="Comma-separated locales to process (default: all in report)")
    ap.add_argument("--include-unscored", action="store_true",
                     help="Also retranslate keys the reviewer couldn't score (score=null / needs_review)")
    ap.add_argument("--max-chars", type=int, default=None,
                     help="Cap this run's total SOURCE characters (trims the least-bad tail of the worklist)")
    ap.add_argument("--use-lara", action="store_true",
                     help="Include Lara at the front of the chain. OFF by default: its free tier "
                          "is only 10,000 chars/month — save it for small, targeted runs.")
    ap.add_argument("--use-deepl", action="store_true",
                     help="Include DeepL in the chain. OFF by default because the DeepL Free "
                          "allowance is a ONE-TIME 500k characters that never resets — it is "
                          "spent only when you explicitly ask.")
    ap.add_argument("--dry-run", action="store_true",
                     help="Print worklist + per-engine budget forecast. No API calls, no writes.")
    ap.add_argument("--no-xliff", action="store_true", help="Skip .xlf provenance updates (not recommended)")
    ap.add_argument("--out-log", default=None, help="Audit log path (default: frontend/qa/mt_retranslation_log_<ts>.json)")
    args = ap.parse_args()

    report_path = Path(args.report) if args.report else find_latest_report()
    if not report_path or not report_path.exists():
        print("No ranked review report found. Run scripts/qa_review_llamacpp.py first.")
        sys.exit(1)
    print(f"Loading ranked review report: {report_path}")
    report = json.loads(report_path.read_text(encoding="utf-8"))

    wanted_locales = {l.strip() for l in args.locales.split(",")} if args.locales else None
    items = select_items(report, args.score_threshold, wanted_locales,
                         args.include_unscored, args.max_chars)

    total_chars = sum(len(i["source_en"]) for i in items)
    by_locale: dict[str, int] = {}
    for i in items:
        by_locale[i["locale"]] = by_locale.get(i["locale"], 0) + 1
    print(f"\nWorklist: {len(items)} key(s) below threshold {args.score_threshold}, "
          f"{total_chars:,} source chars "
          f"({', '.join(f'{l}:{n}' for l, n in sorted(by_locale.items()))})")

    ledger = UsageLedger()
    print(f"\nCurrent free-tier ledger ({ledger.path}):")
    print(ledger.summary())

    if args.dry_run:
        for item in items[:10]:
            print(f"    would send [{item['locale']}/{item['namespace']}] {item['key']} "
                  f"(score={item.get('score')}, {len(item['source_en'])} chars)")
        if len(items) > 10:
            print(f"    ... and {len(items) - 10} more")
        forecast(items, ledger, args.use_lara, args.use_deepl)
        return

    if not items:
        print("Nothing to do.")
        return

    # Locked do-not-translate values that a past run corrupted are fixed by
    # writing the English value back verbatim — no API call, no budget spent.
    dnt_restores = [i for i in items if "dnt_violation" in (i.get("reasons") or [])]
    mt_items = [i for i in items if "dnt_violation" not in (i.get("reasons") or [])]
    if dnt_restores:
        print(f"\n{len(dnt_restores)} key(s) are locked DNT values that were altered — "
              f"restoring English values directly (no API, no budget).")

    ft = FallbackTranslator(ledger=ledger, use_deepl=args.use_deepl, use_lara=args.use_lara)

    # Protect embedded demo/contact emails exactly like translate_sync.py
    # does, and locked terms (product name / legal acronyms) the same way:
    # the engines never see the real address or term, so they can't
    # mistranslate/transliterate it (this is what was previously missing for
    # locked terms — they were only checked AFTER translation, by which
    # point a CJK engine had often already localized "Peripateticware" into
    # the target script with no way back).
    email_maps: list[dict] = []
    term_maps: list[dict] = []
    work = []
    for item in mt_items:
        protected, email_map = protect_emails(item["source_en"])
        protected, term_map = protect_locked_terms(protected)
        email_maps.append(email_map)
        term_maps.append(term_map)
        work.append({"text": protected, "locale": item["locale"]})

    if work:
        print(f"\nTranslating {len(work)} key(s) in rank order (worst first)...")
    results, _ = ft.translate_all(work) if work else ([], [])

    pairs = [(i, {"translation": i["source_en"], "engine": "DNT-RESTORE (locked value, no API)",
                  "engine_name": "dnt_restore", "restore": True}, {}, {}) for i in dnt_restores]
    pairs += list(zip(mt_items, results, email_maps, term_maps))

    audit_entries = []
    deferred_items = []
    failed_items = []
    # XLIFF update accumulators: (locale) -> {key: rec} for landing (root .xlf),
    # (locale, ns) -> {key: rec} for the per-namespace .xlf files.
    root_xliff: dict[str, dict[str, dict]] = {}
    ns_xliff: dict[tuple[str, str], dict[str, dict]] = {}
    written = 0

    def postcheck(src: str, val, locale: str) -> list[str]:
        """Everything that disqualifies an engine's output for this item."""
        problems = bad_reasons(val, src, locale)
        if not locked_terms_preserved(src, val):
            problems = problems + ["locked_term_altered"]
        if val == src and _unexpected_unchanged(src):
            problems = problems + ["unchanged"]
        return problems

    for item, result, email_map, term_map in pairs:
        locale, ns, key = item["locale"], item["namespace"], item["key"]
        reason = f"qa_score={item.get('score')}: {','.join(item.get('reasons') or []) or 'evaluator_flagged'}"
        note = item.get("evaluator_response")

        if result is None:
            deferred_items.append(item)
            continue

        new_val = restore_locked_terms(restore_emails(result["translation"], email_map), term_map)

        # Post-validation: reject garbage / wrong-script / altered-email /
        # altered-locked-term output and retry the item on the NEXT engine in
        # the chain (same budget rules). DNT restores bypass this — their
        # value is the English source verbatim, by design. locked_term_altered
        # should now be rare (terms are placeholder-protected before every
        # call above), but the check stays as a defense-in-depth safety net.
        tried = {result["engine_name"]}
        while not result.get("restore") and (problems := postcheck(item["source_en"], new_val, locale)):
            print(f"    [{locale}] {key}: {result['engine']} output failed checks "
                  f"({problems}) — trying next engine")
            protected, email_map = protect_emails(item["source_en"])
            protected, term_map = protect_locked_terms(protected)
            retry = ft.translate_one(protected, locale, exclude=tried)
            if retry is None:
                failed_items.append({**item, "failed_engines": sorted(tried)})
                new_val = None
                break
            result = retry
            tried.add(retry["engine_name"])
            new_val = restore_locked_terms(restore_emails(retry["translation"], email_map), term_map)
        if new_val is None:
            continue  # kept old value; logged in failed_items

        old_path = LOCALES_DIR / locale / NS_MAP[ns]
        old_flat = flatten_json(load_json(old_path)) if old_path.exists() else {}
        old_val = old_flat.get(key, "")
        write_namespace_value(locale, ns, key, new_val)
        written += 1

        audit_entries.append({
            "locale": locale, "namespace": ns, "key": key,
            "en_source": item["source_en"], "previous_value": old_val, "new_value": new_val,
            "reason": reason, "evaluator_note": note,
            "engine": result["engine"], "qa_score": item.get("score"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        rec = {"en": item["source_en"], "new_value": new_val, "reason": reason,
               "note": note, "actor": result["engine"]}
        if ns == "landing":
            root_xliff.setdefault(locale, {})[key] = rec
        ns_xliff.setdefault((locale, ns), {})[key] = rec

    # ── Provenance write-back ──
    if not args.no_xliff:
        for locale, updates in root_xliff.items():
            # Per-key "actor" wins inside apply_xliff_overwrites; label param is a fallback.
            apply_xliff_overwrites(locale, updates, "MT-fallback-chain")
        for (locale, ns), updates in ns_xliff.items():
            if ns == "landing":
                continue  # landing lives in the root {code}.xlf, handled above
            apply_ns_xliff_overwrites(locale, ns, updates)

    # ── Reporting ──
    restored = sum(1 for e in audit_entries if e["engine"].startswith("DNT-RESTORE"))
    print("\n" + "=" * 60)
    print(f"Retranslated and written: {written} key(s)"
          + (f" (of which {restored} DNT restore(s) — English value re-locked, no API)" if restored else ""))
    print(f"Deferred (no engine had budget/support): {len(deferred_items)}")
    print(f"Failed post-validation on every engine (old value kept): {len(failed_items)}")
    print("\nLedger after this run:")
    print(ledger.summary())

    ts_now = int(datetime.now().timestamp())
    if deferred_items:
        deferred_path = QA_DIR / f"retranslation_deferred_{ts_now}.json"
        deferred_path.write_text(json.dumps({
            "source_report": str(report_path),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "note": "No free-tier budget (or engine support) remained for these keys. "
                    "Re-run retranslate_mt.py against this file next month, or raise limits.",
            "items": deferred_items,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Deferred worklist written to {deferred_path}")

    if audit_entries or failed_items:
        out_log = Path(args.out_log) if args.out_log else QA_DIR / f"mt_retranslation_log_{ts_now}.json"
        out_log.parent.mkdir(parents=True, exist_ok=True)
        out_log.write_text(json.dumps({
            "source_report": str(report_path),
            "score_threshold": args.score_threshold,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "entries": audit_entries,
            "failed_all_engines": failed_items,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Audit log written to {out_log}")

    print("\nNext steps:")
    print("  1. python scripts/sync_locales.py            # keep namespace/root files in sync")
    print("  2. python scripts/qa_review_llamacpp.py --locales <changed>   # confirm scores improved")


if __name__ == "__main__":
    main()
