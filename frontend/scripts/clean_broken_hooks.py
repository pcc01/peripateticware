#!/usr/bin/env python3
import re
from pathlib import Path

SRC_DIR = Path(__file__).parent.parent / "src"

def clean_broken_hooks():
    print("🧹 Initializing Multi-Line Structural Hook Cleaner...")
    
    file_targets = list(SRC_DIR.glob("**/*.tsx")) + list(SRC_DIR.glob("**/*.ts"))
    fixed_count = 0

    # Flexible multi-line pattern matching the broken declaration anywhere at the module level
    bad_global_pattern = re.compile(r"const\s+\{\s*t\s*\}\s*=\s*useTranslation\(\s*['\"]landing['\"]\s*\);?.*?\n")
    
    # Matches the opening body of arrow function or standard function components
    component_body_pattern = re.compile(r"(\b(?:const|function|export\s+const|export\s+function)\s+[A-Z][A-Za-z0-9_]*\s*(?:=\s*(?:\([^)]*\))?\s*=>\s*)?\{\s*)")

    for file_path in file_targets:
        if "node_modules" in file_path.parts or "public" in file_path.parts:
            continue
            
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Isolate if a bad hook declaration exists outside the component space
        # We check if it exists before any component declaration starts
        first_comp_match = component_body_pattern.search(content)
        if not first_comp_match:
            continue
            
        module_level_zone = content[:first_comp_match.start()]
        component_level_zone = content[first_comp_match.start():]

        if bad_global_pattern.search(module_level_zone):
            # Clean the global declaration out of the top zone only
            clean_module_zone = bad_global_pattern.sub("", module_level_zone)
            
            # Ensure it's safely inside the component body zone
            if "const { t } = useTranslation" not in component_level_zone:
                component_level_zone = component_body_pattern.sub(
                    r"\1\n  const { t } = useTranslation('landing');\n", 
                    component_level_zone, 
                    count=1
                )
            
            # Stitch the pristine file back together
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(clean_module_zone + component_level_zone)
                
            print(f"✨ Successfully cleaned and inline-scoped: src/{file_path.relative_to(SRC_DIR)}")
            fixed_count += 1

    print(f"\n🏁 Finished cleaning cycle. Cleaned and saved {fixed_count} components.")

if __name__ == "__main__":
    clean_broken_hooks()