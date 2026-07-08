#!/usr/bin/env python3
"""
Locale sync script — run after the OLLAMA localization pipeline.
Takes root flat locale files (ar.json, de.json, etc.) and distributes
keys into namespace subdirectory files (ar/landing.json, etc.).
Only writes keys that differ from the English baseline (override pattern).
Usage: python3 scripts/sync-locales.py
"""
import json, os, sys

BASE = "frontend/public/locales"

# Map from root flat file top-level key → namespace filename
# Adjust this mapping to match your actual root file structure
NS_MAP = {
    "landing": "landing.json",
    "common": "common.json",
    "student": "STUDENT.json",
    "teacher": "TEACHER.json",
    "curriculum": "curriculum.json",
}

def load_json_safe(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"  WARN: Could not load {path}: {e}")
        return {}

def flatten(d, prefix=''):
    """Flatten nested dict to dot-notation keys."""
    result = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            result.update(flatten(v, key))
        else:
            result[key] = v
    return result

def main():
    locales_dir = BASE
    en_root_path = f"{locales_dir}/en"

    # Load English baseline for each namespace
    en_baseline = {}
    for ns_key, ns_file in NS_MAP.items():
        ns_path = f"{en_root_path}/{ns_file}"
        if os.path.exists(ns_path):
            en_baseline[ns_key] = flatten(load_json_safe(ns_path))

    # Process each locale that has a root flat file
    processed = 0
    for fname in os.listdir(locales_dir):
        if not fname.endswith('.json') or fname == 'en.json':
            continue
        locale = fname[:-5]  # strip .json
        locale_dir = f"{locales_dir}/{locale}"
        if not os.path.isdir(locale_dir):
            print(f"  Skip {locale}: no directory")
            continue

        print(f"Processing {locale}...")
        root_data = load_json_safe(f"{locales_dir}/{fname}")
        if not root_data:
            continue

        for ns_key, ns_file in NS_MAP.items():
            # Check if root flat file has content for this namespace
            ns_data = root_data.get(ns_key, root_data if ns_key == 'landing' else {})
            if not ns_data:
                continue

            # Load existing namespace file
            ns_path = f"{locale_dir}/{ns_file}"
            existing = load_json_safe(ns_path) if os.path.exists(ns_path) else {}

            # Only write keys that differ from English baseline
            en_ns = en_baseline.get(ns_key, {})
            overrides = {}
            flat_ns = flatten(ns_data)
            for k, v in flat_ns.items():
                en_v = en_ns.get(k, '')
                if v and v != en_v:
                    overrides[k] = v

            if overrides:
                # Merge with existing (don't overwrite manually added content)
                merged = {**existing, **overrides}
                with open(ns_path, 'w', encoding='utf-8') as f:
                    json.dump(merged, f, ensure_ascii=False, indent=2)
                print(f"  {locale}/{ns_file}: wrote {len(overrides)} override keys")
                processed += 1

    print(f"Done. Processed {processed} namespace files.")

if __name__ == '__main__':
    main()
