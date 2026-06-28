#!/usr/bin/env python3
import re
import sys
from pathlib import Path

SRC_DIR = Path(__file__).parent.parent / "src"

def parse_warnings_from_input(raw_log_text: str) -> set[str]:
    """Extracts raw key names, peeling away any previous file prefixes."""
    conflicting_keys = set()
    pattern = re.compile(r"Found (?:same keys with different values|translation key already mapped.*?):\s+([a-zA-Z0-9_\-\.]+)")
    
    for line in raw_log_text.splitlines():
        match = pattern.search(line)
        if match:
            raw_key = match.group(1)
            # If the key already has a dot (e.g., 'selfprojectview.my_projects'), grab the real key part
            real_key = raw_key.split('.')[-1]
            conflicting_keys.add(real_key)
    return conflicting_keys

def safety_refactor_components(conflicting_keys: set[str]):
    if not conflicting_keys:
        print("ℹ️ No conflicting base keys detected from the log input.")
        return

    print(f"🛠️ Deep-cleaning and re-scoping {len(conflicting_keys)} unique problem keys...")
    file_targets = list(SRC_DIR.glob("**/*.tsx")) + list(SRC_DIR.glob("**/*.ts"))
    modified_count = 0

    for file_path in file_targets:
        if "node_modules" in file_path.parts or "public" in file_path.parts:
            continue
            
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        original_content = content
        file_scope = file_path.stem.lower()

        for key in conflicting_keys:
            # FLEXIBLE REGEX: Matches 'key', 'prefixed.key', or 'double.prefixed.key' safely inside quotes!
            pattern = re.compile(r"(\bt\(\s*['\"])landing:(?:[a-zA-Z0-9_\-]+\.)*" + re.escape(key) + r"(['\"].*?\))")
            replacement = r"\1landing:" + f"{file_scope}.{key}" + r"\2"
            content = pattern.sub(replacement, content)

        if content != original_content:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"✅ Re-scoped & completely isolated: src/{file_path.relative_to(SRC_DIR)}")
            modified_count += 1

    print(f"\n🏁 Complete! Safely adjusted and updated {modified_count} source component files.")

if __name__ == "__main__":
    print("📋 Paste your raw i18next terminal warnings below.")
    print("👉 Press Enter, then Ctrl+Z, then Enter to execute:")
    print("-" * 70)
    user_input = sys.stdin.read()
    print("-" * 70)
    
    extracted_keys = parse_warnings_from_input(user_input)
    safety_refactor_components(extracted_keys)