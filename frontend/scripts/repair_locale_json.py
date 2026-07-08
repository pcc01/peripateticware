#!/usr/bin/env python3
# frontend/scripts/repair_locale_json.py
#
# Repairs truncated/corrupted locale JSON files under public/locales/.
#
# WHY THIS EXISTS: an audit of the locale files found 24 of 75 JSON files
# (including en.json and en/landing.json — the SOURCE OF TRUTH) silently
# truncated mid-write: files just stop mid-string with no closing braces.
# Two flavors observed:
#   1. Mid-content cutoff, e.g. `"desc": "Peri fa da padrone...<EOF>` — a
#      save was interrupted (process killed, disk full, terminal closed)
#      partway through json.dump(). For CJK/Arabic/Hebrew locales this also
#      truncates mid multi-byte UTF-8 character, so even reading the file as
#      text fails before JSON parsing gets a chance to.
#   2. Stub cutoff, e.g. fr-CA.json / ko.json containing just "{\n " — the
#      write was interrupted essentially immediately after opening the file.
#
# This is almost certainly why "the footer is broken" in several locales:
# with the JSON invalid, i18next's HTTP backend fails to parse the
# namespace file, and (per locale/browser/cache state) you get anything from
# a full English fallback to stale/partial cached content — which is
# consistent with the garbled/mismatched footer text reported.
#
# THE FIX: this script never guesses at damaged content. It walks each file
# byte-by-byte (bracket/string-aware) and finds the LAST fully-written
# sibling key/value pair — at whatever nesting depth it happens to sit —
# then cuts there and closes whatever brackets were still open. Only the
# final, truly-incomplete trailing entry is dropped; everything before it
# (however deeply nested) is preserved untouched. A dropped key simply goes
# missing from the target locale's file, which means:
#   - For the EN source file: en.json's own incremental tooling should be
#     re-run / the key restored from version control.
#   - For a target locale: translate_sync.py's normal incremental diff
#     (`is_new = k not in target_json`) will treat it as a brand-new key
#     and translate it automatically on the next pipeline run — no special
#     handling required, though you can also route it through
#     retranslate_flagged.py if you want the fixed value to come from a
#     specific (e.g. third) model rather than whatever is configured as the
#     default translation provider.
#
# Every repaired file is backed up to "<name>.json.corrupt.bak" (once —
# won't overwrite an existing backup) before being overwritten, so the
# original broken bytes are never destroyed.
#
# USAGE:
#     python3 scripts/repair_locale_json.py            # scan + repair public/locales/**/*.json
#     python3 scripts/repair_locale_json.py --check     # scan only, exit 1 if anything is broken
#     python3 scripts/repair_locale_json.py --include-dist   # also scan dist/locales (build output;
#                                                              prefer just rebuilding instead)

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

FRONTEND_DIR = Path(__file__).parent.parent
LOCALES_DIR = FRONTEND_DIR / "public" / "locales"
DIST_LOCALES_DIR = FRONTEND_DIR / "dist" / "locales"

_CLOSERS = {"{": "}", "[": "]"}


def _decode_tolerant(raw: bytes) -> str:
    """Decodes UTF-8, tolerating a truncated multi-byte sequence at EOF by
    dropping only the incomplete trailing bytes (never touches valid content)."""
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as e:
        return raw[: e.start].decode("utf-8", errors="ignore")


def _find_last_safe_comma(text: str) -> tuple[int, list[str]] | tuple[None, None]:
    """Scans the whole text tracking open-bracket depth and string state.
    Returns (offset, stack_snapshot) for the LAST comma found outside a
    string at any depth — i.e. the boundary right after the last fully
    written sibling entry, with the bracket stack as it stood at that exact
    point (so we know exactly what still needs closing)."""
    stack: list[str] = []
    in_string = False
    escape = False
    last_comma_offset = None
    last_comma_stack: list[str] | None = None

    for i, ch in enumerate(text):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "{[":
            stack.append(ch)
        elif ch in "}]":
            if stack:
                stack.pop()
        elif ch == "," and stack:
            last_comma_offset = i
            last_comma_stack = list(stack)

    if last_comma_offset is None:
        return None, None
    return last_comma_offset, last_comma_stack


def repair_text(text: str) -> tuple[str, bool]:
    """Returns (repaired_text, was_already_valid). Raises ValueError if no
    safe repair could be constructed (caller should treat the file as a
    hard failure requiring manual attention, e.g. restore from git)."""
    try:
        json.loads(text)
        return text, True
    except json.JSONDecodeError:
        pass

    offset, stack = _find_last_safe_comma(text)
    if offset is None:
        # No complete sibling entry anywhere recoverable — safest valid
        # fallback is an empty object (matches how a brand-new locale seed
        # file starts; see translate_sync.get_target_languages()).
        candidate = "{}\n"
        json.loads(candidate)  # sanity check; never fails for "{}"
        return candidate, False

    prefix = text[:offset]
    tail = "".join(_CLOSERS[c] for c in reversed(stack))
    candidate = prefix + "\n" + tail + "\n"
    try:
        json.loads(candidate)
    except json.JSONDecodeError as e:
        raise ValueError(f"Could not construct a valid repair: {e}")
    return candidate, False


def discover_target_files(include_dist: bool) -> list[Path]:
    files = sorted(LOCALES_DIR.glob("**/*.json"))
    if include_dist and DIST_LOCALES_DIR.exists():
        files += sorted(DIST_LOCALES_DIR.glob("**/*.json"))
    return files


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true",
                     help="Only report broken files (exit 1 if any found); don't modify anything.")
    ap.add_argument("--include-dist", action="store_true",
                     help="Also scan dist/locales (build output). Prefer `npm run build` instead — "
                          "this is a stopgap if you can't rebuild right now.")
    args = ap.parse_args()

    files = discover_target_files(args.include_dist)
    if not files:
        print(f"No JSON files found under {LOCALES_DIR}")
        sys.exit(1)

    broken_found = False
    repaired_count = 0
    unrepairable: list[Path] = []

    for path in files:
        raw = path.read_bytes()
        text = _decode_tolerant(raw)
        had_decode_loss = len(text.encode("utf-8")) != len(raw)

        try:
            json.loads(text)
            if had_decode_loss:
                # Text decoded losing trailing bytes but somehow still valid
                # JSON overall is very unlikely; treat conservatively as broken.
                raise json.JSONDecodeError("trailing bytes dropped", text, len(text))
            continue  # already valid, nothing to do
        except json.JSONDecodeError as e:
            broken_found = True
            print(f"BROKEN: {path.relative_to(FRONTEND_DIR)} — {e}")
            if args.check:
                continue

        try:
            repaired, was_valid = repair_text(text)
        except ValueError as e:
            print(f"  UNREPAIRABLE: {e} — restore {path.name} from version control.")
            unrepairable.append(path)
            continue

        if args.check:
            continue

        backup_path = path.with_suffix(path.suffix + ".corrupt.bak")
        if not backup_path.exists():
            backup_path.write_bytes(raw)

        path.write_text(repaired, encoding="utf-8")
        dropped_bytes = len(raw) - len(repaired.encode("utf-8"))
        print(f"  REPAIRED: kept {len(repaired):,} chars, dropped ~{max(dropped_bytes, 0):,} "
              f"trailing corrupted bytes. Backup: {backup_path.name}")
        repaired_count += 1

    print("\n" + "=" * 60)
    if args.check:
        if broken_found:
            print("Result: one or more locale JSON files are broken. Run without --check to repair.")
            sys.exit(1)
        print("Result: all locale JSON files parse cleanly.")
        return

    print(f"Repaired {repaired_count} file(s). Unrepairable: {len(unrepairable)}.")
    if unrepairable:
        for p in unrepairable:
            print(f"  - {p.relative_to(FRONTEND_DIR)}")
        sys.exit(1)
    if repaired_count:
        print("\nNext steps:")
        print("  1. Re-run the pipeline so dropped/missing keys get retranslated:")
        print("       npm run i18n:sync   (or python scripts/translate_sync.py)")
        print("  2. Rebuild so dist/locales picks up the fix: npm run build")
        print("  3. Re-run the QA crawler to confirm the footer (and everything else) renders correctly.")


if __name__ == "__main__":
    main()
