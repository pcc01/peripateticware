#!/usr/bin/env python3
# frontend/scripts/reset_sync.py
import json
import os
import sys
from pathlib import Path

LOCALES_DIR = Path(__file__).parent.parent / "public" / "locales"
SOURCE_LANG = "en"

def get_target_languages() -> list[tuple[str, str]]:
    """Scans the locales folder for translation directories (excluding 'en')."""
    languages = []
    if not LOCALES_DIR.exists():
        return languages
    
    lang_map = {
        "es": "Spanish", "fr": "French", "de": "German",
        "ja": "Japanese", "ar": "Arabic", "he": "Hebrew",
        "it": "Italian", "zh": "Chinese", "tr": "Turkish",
        "pt-br": "Portuguese"
    }
    
    for f in LOCALES_DIR.iterdir():
        # Flat merged files: fr.json, de.json … (skip en.json = source)
        if f.is_file() and f.suffix == '.json' and f.stem.lower() != SOURCE_LANG:
            code = f.stem.lower()
            name = lang_map.get(code, code.upper())
            languages.append((f.stem, name))
    return sorted(languages, key=lambda x: x[1])

def wipe_locale_files(folder_name: str, lang_name: str, keep_provenance: bool):
    """
    Resets the 'landing' namespace inside the merged locale file to {}
    and optionally removes the XLIFF provenance file.

    NOTE: This REMOVES translated text from the build for this locale until
    translate_sync is run again. Non-English users will see English fallbacks.
    """
    lang_code = folder_name.lower()
    json_path = LOCALES_DIR / f"{lang_code}.json"
    xlf_path  = LOCALES_DIR / f"{lang_code}.xlf"

    # 1. Reset only the 'landing' namespace; preserve other namespace sections
    if json_path.exists():
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                merged = json.load(f)
        except json.JSONDecodeError:
            merged = {}
        merged["landing"] = {}
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(merged, f, ensure_ascii=False, indent=2)
        print(f"  ⚠️  WARNING: Cleared landing translations for [{folder_name.upper()}].")
        print(f"      Users of this locale will see English fallback text until translate_sync is run.")
            
    # 2. Delete or preserve XLIFF based on chosen reset type
    if not keep_provenance and xlf_path.exists():
        try:
            os.remove(xlf_path)
            print(f"🧹 [Hard Reset] Cleared translations and deleted provenance graph for [{folder_name.upper()}] ({lang_name}).")
        except OSError as e:
            print(f"   ⚠️  Could not remove XLIFF file {xlf_path.name}: {e}")
    else:
        print(f"✨ [Soft Reset] Wiped active translations but preserved W3C Provenance History for [{folder_name.upper()}] ({lang_name}).")

def run_reset_wizard():
    print("=" * 60)
    print("🧹  Peripateticware Translation Reset Wizard")
    print("=" * 60)
    print("This script prepares your workspaces for a fresh translation pass.")
    print("-" * 60)

    targets = get_target_languages()
    if not targets:
        print("❌ Error: No target locale directories found in public/locales/.")
        sys.exit(1)

    print("🗺️  Detected target workspaces:")
    for idx, (code, name) in enumerate(targets, start=1):
        print(f"  [{idx}] {name} ({code.upper()})")
    print(f"  [{len(targets) + 1}] ALL Target Workspaces")
    print(f"  [{len(targets) + 2}] Cancel Reset Operations")
    print("-" * 60)

    choice_input = input(f"👉 Enter option number (1-{len(targets) + 2}) [default: cancel]: ").strip()
    
    if not choice_input or choice_input == str(len(targets) + 2):
        print("❌ Reset cancelled. No files were modified.")
        sys.exit(0)

    # Ask the user how to handle the provenance logs
    print("\n❓ How would you like to handle your W3C Provenance Graph / Version History?")
    print("  [1] Soft Reset (Preserve Provenance Chain) [Recommended]")
    print("      - Clears active translations in landing.json to trigger a re-translate.")
    print("      - Keeps landing.xlf. Next run increments string versions (e.g., v1 -> v2) and appends activities.")
    print("  [2] Hard Reset (Wipe Everything)")
    print("      - Clears active translations and deletes landing.xlf.")
    print("      - Next run starts completely from scratch at Version 1.")
    
    prov_choice = input("👉 Enter reset style (1-2) [default: 1]: ").strip()
    keep_provenance = False if prov_choice == "2" else True
    print("-" * 60)
        
    # Option: Reset ALL
    if choice_input == str(len(targets) + 1):
        confirm = input("⚠️  Are you sure you want to reset ALL translation targets? (y/N): ").strip().lower()
        if confirm == 'y':
            print("\n🚀 Wiping selected workspaces...")
            for code, name in targets:
                wipe_locale_files(code, name, keep_provenance)
            print("\n🏁 Target workspaces successfully prepared for fresh translations.")
        else:
            print("❌ Reset cancelled.")
            sys.exit(0)
            
    # Option: Reset specific target language
    elif choice_input.isdigit() and 1 <= int(choice_input) <= len(targets):
        selected_idx = int(choice_input) - 1
        code, name = targets[selected_idx]
        
        confirm = input(f"⚠️  Are you sure you want to reset [{code.upper()}] ({name})? (y/N): ").strip().lower()
        if confirm == 'y':
            wipe_locale_files(code, name, keep_provenance)
            print(f"\n🏁 Workspace [{code.upper()}] preparation complete.")
        else:
            print("❌ Reset cancelled.")
            sys.exit(0)
    else:
        print("❌ Invalid selection. Reset cancelled.")

if __name__ == "__main__":
    try:
        run_reset_wizard()
    except KeyboardInterrupt:
        print("\n❌ Process interrupted by user. Safe exit.")
        sys.exit(0)