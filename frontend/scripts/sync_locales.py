#!/usr/bin/env python3
"""
Locale namespace sync — distributes root flat locale files into i18next namespace subdirectories.

Runs automatically after translate_sync.py completes. Can also be run standalone:
    python3 scripts/sync_locales.py

The pipeline (translate_sync.py) writes translations to root flat files:
    public/locales/ar.json, de.json, es.json, ...

This script distributes those keys into namespace subdirectories that i18next reads:
    public/locales/ar/landing.json, ar/common.json, ...

OVERRIDE PATTERN: only keys that differ from the English baseline are written.
Missing keys fall back to English via i18next's fallbackLng — no duplication needed.
"""
from __future__ import annotations
import json
import os
from pathlib import Path

# Resolve locales dir relative to this script file so it works
# regardless of the current working directory or how it's imported.
_SCRIPTS_DIR = Path(__file__).parent
_LOCALES_DIR = _SCRIPTS_DIR.parent / "public" / "locales"

# Root flat file top-level key → namespace filename in subdirectory
NS_MAP: dict[str, str] = {
    "landing":    "landing.json",
    "common":     "common.json",
    "student":    "STUDENT.json",
    "teacher":    "TEACHER.json",
    "curriculum": "curriculum.json",
}

# Never write these locales (source language + invalid stubs)
SKIP_LOCALES = {"en", "tu", "_tu_backup"}


def _load(path: Path) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"  WARN: Could not load {path.name}: {e}")
        return {}


def _save(path: Path, data: dict) -> None:
    # Atomic write (temp file + os.replace) — see translate_sync.save_json
    # for why: a plain open()+json.dump() leaves a truncated, unparseable
    # file on disk if interrupted mid-write, which is what corrupted 24 of
    # this project's locale JSON files (including en.json) before
    # scripts/repair_locale_json.py fixed them.
    tmp_path = path.with_suffix(path.suffix + f".tmp{os.getpid()}")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, path)


def _flatten(d: dict, prefix: str = "") -> dict:
    """Recursively flatten nested dict to dot-notation keys."""
    out: dict = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(_flatten(v, key))
        else:
            out[key] = v
    return out


def run(locales_dir: Path | None = None) -> None:
    """
    Main sync function. Called by translate_sync.py after translation completes,
    or directly when run as a standalone script.

    Args:
        locales_dir: override the locales directory path (used by translate_sync
                     which already has LOCALES_DIR resolved).
    """
    base = Path(locales_dir) if locales_dir else _LOCALES_DIR

    if not base.exists():
        print(f"  ERROR: Locales directory not found: {base}")
        return

    # Load English namespace baselines (source of truth for override comparison)
    en_dir = base / "en"
    en_baseline: dict[str, dict] = {}
    for ns_key, ns_file in NS_MAP.items():
        ns_path = en_dir / ns_file
        if ns_path.exists():
            en_baseline[ns_key] = _flatten(_load(ns_path))

    total_files = 0
    total_keys = 0

    # Process each locale that has a root flat file
    for flat_file in sorted(base.glob("*.json")):
        locale = flat_file.stem  # e.g. "ar" from "ar.json"

        if locale in SKIP_LOCALES:
            continue

        locale_dir = base / locale
        if not locale_dir.is_dir():
            print(f"  Skip {locale}: no subdirectory (create {locale_dir.name}/ to enable)")
            continue

        root_data = _load(flat_file)
        if not root_data:
            print(f"  Skip {locale}: root flat file is empty or invalid")
            continue

        locale_keys = 0

        for ns_key, ns_file in NS_MAP.items():
            # The pipeline currently writes everything under "landing" in the root file.
            # If dedicated ns keys exist (future), use them; otherwise fall back to
            # treating the whole root file as the "landing" namespace.
            if ns_key in root_data:
                ns_data = root_data[ns_key]
            elif ns_key == "landing":
                # Flat root file has all content at top level (current pipeline format)
                ns_data = root_data
            else:
                continue

            if not isinstance(ns_data, dict) or not ns_data:
                continue

            ns_path = locale_dir / ns_file
            existing = _load(ns_path) if ns_path.exists() else {}
            en_ns = en_baseline.get(ns_key, {})

            # Override pattern: only write keys whose translated value differs from English
            flat_ns = _flatten(ns_data)
            overrides: dict = {}
            for k, v in flat_ns.items():
                if v and v != en_ns.get(k, ""):
                    overrides[k] = v

            if not overrides:
                continue

            # Merge: translated pipeline output wins over stale existing content
            merged = {**existing, **overrides}
            _save(ns_path, merged)

            n = len(overrides)
            locale_keys += n
            total_files += 1
            print(f"  {locale}/{ns_file}: {n} override keys written")

        if locale_keys:
            total_keys += locale_keys
            print(f"  [{locale}] {locale_keys} total keys synced\n")

    print(f"Namespace sync complete — {total_keys} keys across {total_files} files.")


if __name__ == "__main__":
    print("Running namespace sync standalone...")
    run()
