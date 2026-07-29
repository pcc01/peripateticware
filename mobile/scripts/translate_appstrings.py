#!/usr/bin/env python3
"""
Mobile app-string localization — translates mobile/src/i18n/locales/en.json
into every other locale in SUPPORTED_LOCALES, writing the result straight
into backend/locale_packs/ (where the mobile app downloads it from at
runtime — see backend/routes/locale_packs.py).

English is the only locale bundled into the app binary. Every other locale
is produced here, offline, and hosted for on-demand download so the app
payload never carries translations nobody asked for.

PIPELINE (per locale):
  1. Flatten en.json to dot-notation keys.
  2. Diff against mobile/scripts/i18n_meta/{code}.meta.json (a lightweight
     sidecar recording {key: {sourceHash, translatedAt, provider,
     needsManualTranslation}}) to find keys that are new, or whose English
     source has changed since last translated (sourceHash mismatch), or
     that were never actually translated (no meta entry at all — this is
     the state of every existing locale today, since none has a sidecar
     yet; their current placeholder English content is therefore never
     read as translation input).
  3. Translate each such key: local Ollama first (free, default model
     "mistral" via OLLAMA_MODEL_TEXT, matching frontend/scripts/
     translate_sync.py's default), then frontend/scripts/mt_fallback.py's
     budget-tracked classic MT chain (Microsoft primary; Lara/DeepL
     opt-in), then — if both fail or produce invalid output — fall back to
     the English string and flag needsManualTranslation.
  4. Write the locale pack + meta sidecar atomically (temp file + os.replace
     — the same lesson translate_sync.py and mt_fallback.py already learned
     the hard way: a corrupted 24 locale files once from a non-atomic write).
  5. Rebuild backend/locale_packs/manifest.json (content-hash version per
     locale) so the mobile app's cache can detect when a pack actually
     changed.

USAGE:
  python mobile/scripts/translate_appstrings.py                        # refresh all missing/stale keys, all SUPPORTED_LOCALES
  python mobile/scripts/translate_appstrings.py --locale de            # one locale only (new or existing)
  python mobile/scripts/translate_appstrings.py --provider ollama|mt   # force one tier only
  python mobile/scripts/translate_appstrings.py --dry-run              # report missing/stale counts only, no calls, no writes
  python mobile/scripts/translate_appstrings.py --report               # print needsManualTranslation-flagged keys from sidecars
  python mobile/scripts/translate_appstrings.py --use-lara --use-deepl # opt into the frontend MT chain's reserved-budget engines

ADDING A NEW LOCALE: add one entry to SUPPORTED_LOCALES in
mobile/src/i18n/locales.ts, then run this script with --locale <code>.
No other config needs to change — this script parses SUPPORTED_LOCALES
directly out of that file.

CREDENTIALS (all optional — Ollama-only works with zero configuration):
  OLLAMA_HOST            default http://localhost:11434
  OLLAMA_MODEL_TEXT      default "mistral" (same variable + default as
                         frontend/scripts/translate_sync.py)
  MS_TRANSLATOR_KEY / MS_TRANSLATOR_REGION, LARA_ACCESS_KEY_ID / _SECRET,
  DEEPL_AUTH_KEY         same variables frontend/scripts/mt_fallback.py
                         already reads — this script reuses that module
                         directly rather than reimplementing it.

NOTE: this script deliberately uses its OWN usage ledger
(mobile/scripts/i18n_meta/mt_usage_state.json), not the frontend
pipeline's shared one, so a mobile locale refresh can never compete with
(or exhaust) the web pipeline's free-tier MT budget.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
MOBILE_DIR = SCRIPT_DIR.parent
REPO_ROOT = MOBILE_DIR.parent
EN_JSON_PATH = MOBILE_DIR / "src" / "i18n" / "locales" / "en.json"
LOCALES_TS_PATH = MOBILE_DIR / "src" / "i18n" / "locales.ts"
META_DIR = SCRIPT_DIR / "i18n_meta"
BACKEND_PACKS_DIR = REPO_ROOT / "backend" / "locale_packs"
MANIFEST_PATH = BACKEND_PACKS_DIR / "manifest.json"

# Reuse the frontend's MT infra (sibling scripts dir, same monorepo) rather
# than reimplementing budget-ledger / provider-quirk handling. Deliberately
# NOT importing UniversalOrchestrator — it's coupled to XLIFF/PROV writing
# and category-based prompting this script doesn't need.
FRONTEND_SCRIPTS_DIR = REPO_ROOT / "frontend" / "scripts"
sys.path.insert(0, str(FRONTEND_SCRIPTS_DIR))
try:
    from mt_fallback import FallbackTranslator, UsageLedger  # type: ignore
    from translate_sync import looks_like_garbage, has_expected_script  # type: ignore
except ImportError as e:
    FallbackTranslator = None
    UsageLedger = None
    looks_like_garbage = None
    has_expected_script = None
    print(f"NOTE: could not import frontend MT infra ({e}) — MT fallback tier disabled, Ollama-only this run.")

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL_TEXT", "mistral")

# Prompt-only display names (not a source of truth — locales.ts's `name`
# field is that; this just needs to read naturally in a translation prompt).
DISPLAY_NAMES = {
    "es": "Spanish",
    "fr": "French",
    "fr-CA": "Canadian French",
    "ar": "Arabic",
    "he": "Hebrew",
    "ja": "Japanese",
    "ko": "Korean",
    "pt-BR": "Brazilian Portuguese",
    "de": "German",
    "it": "Italian",
    "tr": "Turkish",
    "zh": "Simplified Chinese",
}

PLACEHOLDER_RE = re.compile(r"\{\{[^}]+\}\}")


# ── flatten / unflatten ──────────────────────────────────────────────────────

def flatten(d: dict, prefix: str = "") -> dict:
    out: dict = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, key))
        else:
            out[key] = v
    return out


def unflatten(flat: dict) -> dict:
    out: dict = {}
    for key, value in flat.items():
        parts = key.split(".")
        node = out
        for p in parts[:-1]:
            node = node.setdefault(p, {})
        node[parts[-1]] = value
    return out


# ── atomic I/O ────────────────────────────────────────────────────────────────
# Same temp-file + os.replace pattern as translate_sync.save_json /
# mt_fallback._atomic_write_json — a plain open()+dump() once corrupted 24
# locale files on the web pipeline when a run was interrupted mid-write.

def atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".tmp{os.getpid()}")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"  WARN: could not parse {path.name}: {e}")
        return {}


def source_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def get_supported_locales() -> list[str]:
    """Parses SUPPORTED_LOCALES straight out of locales.ts so 'add one
    entry there, run this script' is the entire add-a-locale workflow —
    no second list to keep in sync."""
    src = LOCALES_TS_PATH.read_text(encoding="utf-8")
    codes = re.findall(r"code:\s*'([^']+)'", src)
    assert codes, f"Found zero locale codes in {LOCALES_TS_PATH} — did its format change?"
    return [c for c in codes if c != "en"]


# ── translation ──────────────────────────────────────────────────────────────

def translate_via_ollama(text: str, target_lang_name: str) -> str | None:
    prompt = (
        f"Translate the following mobile app UI string from English to {target_lang_name}. "
        "Output ONLY the translation, nothing else — no quotes, no explanation, no notes. "
        "Preserve any {{placeholder}} tokens exactly as written, unchanged. "
        "If the string is a proper noun or already fits the target language, return it unchanged.\n\n"
        f"String: {text}"
    )
    try:
        resp = requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False, "options": {"temperature": 0.2}},
            timeout=60,
        )
        resp.raise_for_status()
        raw = resp.json().get("response", "").strip()
        # Mistral sometimes appends an explanatory "Note: ..." paragraph
        # despite being told to output only the translation — the actual
        # translation is always the first non-empty line, so take that
        # instead of trusting the whole response verbatim.
        first_line = next((line.strip() for line in raw.splitlines() if line.strip()), "")
        return first_line.strip('"').strip() or None
    except Exception as e:
        print(f"    Ollama error: {e}")
        return None


def placeholders_preserved(source: str, translated: str) -> bool:
    return set(PLACEHOLDER_RE.findall(source)) <= set(PLACEHOLDER_RE.findall(translated))


def validate(translated: str, source: str, locale: str) -> bool:
    if looks_like_garbage is not None and looks_like_garbage(translated, source):
        return False
    if has_expected_script is not None and not has_expected_script(translated, locale):
        return False
    if not placeholders_preserved(source, translated):
        return False
    return True


def translate_key(text: str, locale: str, mt, use_ollama: bool) -> tuple[str, str, bool]:
    """Returns (translated_text, provider_label, needs_manual_translation)."""
    target_name = DISPLAY_NAMES.get(locale, locale)

    if use_ollama:
        out = translate_via_ollama(text, target_name)
        if out and validate(out, text, locale):
            return out, f"ollama:{OLLAMA_MODEL}", False

    if mt is not None:
        result = mt.translate_one(text, locale)
        if result and validate(result["translation"], text, locale):
            return result["translation"], result["engine"], False

    return text, "none", True


# ── per-locale pipeline ──────────────────────────────────────────────────────

def process_locale(code: str, en_flat: dict, mt, use_ollama: bool, dry_run: bool) -> dict:
    meta_path = META_DIR / f"{code}.meta.json"
    pack_path = BACKEND_PACKS_DIR / f"{code}.json"
    meta = load_json(meta_path)
    existing_pack_flat = flatten(load_json(pack_path)) if pack_path.exists() else {}

    todo = []
    for key, en_value in en_flat.items():
        if not isinstance(en_value, str):
            continue
        h = source_hash(en_value)
        entry = meta.get(key)
        if key not in existing_pack_flat or entry is None or entry.get("sourceHash") != h:
            todo.append(key)

    print(f"  [{code}] {len(todo)} of {len(en_flat)} keys need (re)translation")
    if dry_run or not todo:
        return {"locale": code, "todo": len(todo), "translated": 0}

    new_pack_flat = dict(existing_pack_flat)
    now = datetime.now(timezone.utc).isoformat()
    manual_count = 0

    for key in todo:
        en_value = en_flat[key]
        translated, provider, needs_manual = translate_key(en_value, code, mt, use_ollama)
        new_pack_flat[key] = translated
        meta[key] = {
            "sourceHash": source_hash(en_value),
            "translatedAt": now,
            "provider": provider,
            "needsManualTranslation": needs_manual,
        }
        if needs_manual:
            manual_count += 1
        flag = " [NEEDS MANUAL REVIEW]" if needs_manual else ""
        print(f"    {key} -> {provider}{flag}")

    atomic_write_json(pack_path, unflatten(new_pack_flat))
    atomic_write_json(meta_path, meta)
    return {"locale": code, "todo": len(todo), "translated": len(todo) - manual_count, "flagged": manual_count}


def rebuild_manifest() -> None:
    manifest = {}
    if BACKEND_PACKS_DIR.exists():
        for pack_path in sorted(BACKEND_PACKS_DIR.glob("*.json")):
            if pack_path.name == "manifest.json":
                continue
            code = pack_path.stem
            content = pack_path.read_bytes()
            manifest[code] = {
                "version": hashlib.sha256(content).hexdigest()[:12],
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            }
    atomic_write_json(MANIFEST_PATH, manifest)
    print(f"  manifest.json updated — {len(manifest)} locale(s) published")


def print_report() -> None:
    if not META_DIR.exists():
        print("No i18n_meta/ directory yet — nothing has been translated.")
        return
    any_flagged = False
    for meta_path in sorted(META_DIR.glob("*.meta.json")):
        code = meta_path.stem.replace(".meta", "")
        meta = load_json(meta_path)
        flagged = [k for k, v in meta.items() if v.get("needsManualTranslation")]
        if flagged:
            any_flagged = True
            print(f"[{code}] {len(flagged)} keys need manual review:")
            for k in flagged:
                print(f"    {k}")
    if not any_flagged:
        print("No keys currently flagged for manual review.")


# ── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--locale", help="Translate only this locale code (default: all SUPPORTED_LOCALES).")
    parser.add_argument("--provider", choices=["ollama", "mt"], help="Force a single tier instead of the Ollama -> MT chain.")
    parser.add_argument("--dry-run", action="store_true", help="Report missing/stale key counts only; no API calls, no writes.")
    parser.add_argument("--report", action="store_true", help="Print all needsManualTranslation-flagged keys and exit.")
    parser.add_argument("--use-lara", action="store_true", help="Include Lara (10k free chars/month) in the MT chain.")
    parser.add_argument("--use-deepl", action="store_true", help="Include DeepL (500k lifetime chars) in the MT chain.")
    args = parser.parse_args()

    if args.report:
        print_report()
        return

    en = load_json(EN_JSON_PATH)
    assert en, f"Could not load {EN_JSON_PATH}"
    en_flat = flatten(en)

    locales = [args.locale] if args.locale else get_supported_locales()

    use_ollama = args.provider != "mt"
    mt = None
    if args.provider != "ollama" and FallbackTranslator is not None:
        ledger = UsageLedger(path=META_DIR / "mt_usage_state.json")
        mt = FallbackTranslator(ledger=ledger, use_lara=args.use_lara, use_deepl=args.use_deepl)

    BACKEND_PACKS_DIR.mkdir(parents=True, exist_ok=True)
    META_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Translating {len(en_flat)} source keys into {len(locales)} locale(s): {', '.join(locales)}")
    results = [process_locale(code, en_flat, mt, use_ollama, args.dry_run) for code in locales]

    if not args.dry_run:
        rebuild_manifest()

    print("\nSummary:")
    for r in results:
        print(f"  {r}")


if __name__ == "__main__":
    main()
