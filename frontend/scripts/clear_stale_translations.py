#!/usr/bin/env python3
# frontend/scripts/clear_stale_translations.py
#
# One-off. Deletes specific known-stale keys from every non-English locale's
# translation files (both the flat root working file and the distributed
# per-namespace file), so the next sync (npm run i18n:sync / i18n:run-all /
# localize.ps1) treats them as brand new and actually retranslates them from
# the corrected English source.
#
# Why this is needed: translate_sync.py's incremental diff can only tell
# "target is empty" or "target equals the CURRENT English text" (untranslated
# copy) — it has no way to detect "the English source changed since this was
# translated." Once any translation exists for a key, it's treated as final
# forever, even if the English text is later corrected. These specific keys
# were originally synced from placeholder/garbage English text (auto-tagger
# de-slugified fallbacks like "team 1 bio"), which has since been fixed in
# en.json — but every other locale is still holding a translation of the OLD
# garbage. This script clears them so they get a real translation next run.
#
# Run: python3 scripts/clear_stale_translations.py

import json
from pathlib import Path

LOCALES_DIR = Path(__file__).parent.parent / "public" / "locales"

STALE_KEYS = [
    "field_journal_title", "field_journal_desc",
    "field_journal_feature_1", "field_journal_feature_2", "field_journal_feature_3",
    "team_1_name", "team_1_role", "team_1_bio",
]

# Every locale folder except English (source) and internal/backup dirs.
SKIP_DIRS = {"en", "tu", "_tu_backup"}


def load(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def save(p: Path, data: dict) -> None:
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def discover_locale_codes() -> list[str]:
    if not LOCALES_DIR.exists():
        return []
    return sorted(
        d.name for d in LOCALES_DIR.iterdir()
        if d.is_dir() and d.name.lower() not in SKIP_DIRS
    )


def main() -> None:
    codes = discover_locale_codes()
    if not codes:
        print(f"No locale directories found under {LOCALES_DIR}")
        return

    touched = 0
    for code in codes:
        # 1. Flat root working file: {code}.json -> data["landing"][key]
        flat_path = LOCALES_DIR / f"{code}.json"
        if flat_path.exists():
            data = load(flat_path)
            landing = data.get("landing", {})
            removed = [k for k in STALE_KEYS if k in landing]
            for k in removed:
                del landing[k]
            if removed:
                save(flat_path, data)
                touched += 1
                print(f"{code}.json: removed {removed}")

        # 2. Distributed namespace file: {code}/landing.json -> data[key] directly
        ns_path = LOCALES_DIR / code / "landing.json"
        if ns_path.exists():
            data = load(ns_path)
            removed = [k for k in STALE_KEYS if k in data]
            for k in removed:
                del data[k]
            if removed:
                save(ns_path, data)
                touched += 1
                print(f"{code}/landing.json: removed {removed}")

    print(f"\nDone — {touched} file(s) touched across {len(codes)} locale(s).")
    print("Now run the pipeline (npm run i18n:run-all, or localize.ps1) to")
    print("retranslate these 8 keys from the corrected English source.")


if __name__ == "__main__":
    main()
