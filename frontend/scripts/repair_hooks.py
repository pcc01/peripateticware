"""
Peripateticware — repair_hooks.py
Adds `const { t } = useTranslation('landing');` inside every React component
that calls t() but is missing the hook declaration.

Handles both block-body  ( () => { ... } )  and
expression-body           ( () => <JSX />  )  arrow components.

Run from the web/ directory:
    python scripts/repair_hooks.py

Business Source License 1.1 — see LICENSE
"""

import re
import os
import sys
from pathlib import Path

# ── Regex constants ───────────────────────────────────────────────────────────

T_CALL_RE      = re.compile(r"\bt\(['\"]")
HOOK_PRESENT_RE = re.compile(r"const\s*\{[^}]*\bt\b[^}]*\}\s*=\s*useTranslation")
IMPORT_UT_RE   = re.compile(
    r"import\s*\{[^}]*useTranslation[^}]*\}\s*from\s*['\"]react-i18next['\"]"
)
IMPORT_LINE_RE = re.compile(r"^import\s+", re.MULTILINE)

# Matches block-body component signatures up to and including the opening {
BLOCK_COMPONENT_RE = re.compile(
    r"""
    (?:export\s+(?:default\s+)?)?
    (?:
        function\s+[A-Z][A-Za-z0-9_]*       # function Component
      | const\s+[A-Z][A-Za-z0-9_]*          # const Component
        (?:\s*:\s*
          (?:React\s*\.\s*)?
          (?:FC|VFC|ReactNode|ReactElement|FunctionComponent)
          (?:<[^>]*>)?
        )?
        \s*=\s*
        (?:\([^)]*\)|\w+)\s*=>              # (props) =>  or  props =>
    )
    [^{]*\{                                  # up to opening {
    """,
    re.VERBOSE | re.MULTILINE,
)

# Matches expression-body (JSX) component on a single line
# const Name = (...) => <...   (no { at the end)
EXPR_COMPONENT_RE = re.compile(
    r"""
    ^(                                      # capture: component declaration
        (?:export\s+(?:default\s+)?)?
        const\s+[A-Z][A-Za-z0-9_]*
        (?:\s*:\s*\S+)?
        \s*=\s*
        (?:\([^)]*\)|\w+)\s*=>             # (props) =>
    )
    \s*                                     # optional whitespace
    (<)                                     # starts with JSX
    """,
    re.VERBOSE | re.MULTILINE,
)

HOOK_LINE = "  const { t } = useTranslation('landing');\n"
UT_IMPORT  = "import { useTranslation } from 'react-i18next';\n"


# ── Helpers ───────────────────────────────────────────────────────────────────

def find_matching_close(s: str, open_pos: int) -> int:
    """Return index of the } matching the { at open_pos."""
    depth = 0
    i = open_pos
    while i < len(s):
        ch = s[i]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return len(s) - 1


def ensure_import(content: str) -> tuple[str, bool]:
    """Add useTranslation import if missing. Returns (new_content, changed)."""
    if IMPORT_UT_RE.search(content):
        return content, False
    positions = [m.start() for m in IMPORT_LINE_RE.finditer(content)]
    if positions:
        last_start = positions[-1]
        end = content.find('\n', last_start)
        insert_at = (end + 1) if end != -1 else len(content)
    else:
        insert_at = 0
    return content[:insert_at] + UT_IMPORT + content[insert_at:], True


def inject_into_block_components(content: str) -> tuple[str, int]:
    """Inject hook after { of every block-body component missing it. Returns (new_content, count)."""
    matches = list(BLOCK_COMPONENT_RE.finditer(content))
    injections: list[int] = []

    for m in matches:
        open_brace = m.end() - 1      # position of '{'
        close_brace = find_matching_close(content, open_brace)
        body = content[open_brace + 1: close_brace]

        if not T_CALL_RE.search(body):
            continue
        if HOOK_PRESENT_RE.search(body):
            continue

        # Inject position: right after the newline following '{'
        pos = open_brace + 1
        if pos < len(content) and content[pos] == '\n':
            pos += 1
        injections.append(pos)

    # Apply from last to first to keep positions valid
    for pos in sorted(set(injections), reverse=True):
        content = content[:pos] + HOOK_LINE + content[pos:]

    return content, len(injections)


def fix_expression_components(content: str) -> tuple[str, int]:
    """
    Convert one-liner arrow components to block form so the hook can be injected.
    const X = () => <div>...</div>;
    →
    const X = () => {
      const { t } = useTranslation('landing');
      return (<div>...</div>);
    };
    """
    count = 0
    lines = content.splitlines(keepends=True)
    new_lines = []

    for line in lines:
        m = EXPR_COMPONENT_RE.match(line)
        if m:
            decl = m.group(1)        # "const X = () =>"
            # Everything after the => and whitespace is the JSX expression
            rest = line[m.end(1):].strip()
            # Strip trailing semicolon if present
            if rest.endswith(';\n'):
                jsx = rest[:-2]
                semi = ';\n'
            elif rest.endswith(';'):
                jsx = rest[:-1]
                semi = ';'
            else:
                jsx = rest.rstrip('\n')
                semi = '\n'

            # Only convert if the line actually uses t()
            if T_CALL_RE.search(jsx) and not HOOK_PRESENT_RE.search(jsx):
                new_lines.append(f"{decl} {{\n")
                new_lines.append(HOOK_LINE)
                new_lines.append(f"  return ({jsx}){semi}\n")
                new_lines.append(f"}}{semi}\n")
                count += 1
                continue

        new_lines.append(line)

    return ''.join(new_lines), count


# ── Main fixer ────────────────────────────────────────────────────────────────

def fix_file(content: str, filepath: str) -> tuple[str, list[str]]:
    if not T_CALL_RE.search(content):
        return content, []

    changes: list[str] = []
    original = content

    content, imp_added = ensure_import(content)
    if imp_added:
        changes.append("added useTranslation import")

    content, expr_count = fix_expression_components(content)
    if expr_count:
        changes.append(f"converted {expr_count} expression-body component(s) to block form")

    content, block_count = inject_into_block_components(content)
    if block_count:
        changes.append(f"injected hook into {block_count} block-body component(s)")

    if content == original and not changes:
        return content, []

    return content, changes


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("src")
    if not root.exists():
        print(f"ERROR: {root!r} not found. Run from your web/ folder.")
        sys.exit(1)

    total_fixed = 0
    total_ok = 0

    for tsx_file in sorted(root.rglob("*.tsx")):
        original = tsx_file.read_text(encoding="utf-8")
        fixed, changes = fix_file(original, str(tsx_file))
        if changes:
            tsx_file.write_text(fixed, encoding="utf-8")
            rel = tsx_file.relative_to(root.parent)
            print(f"  FIXED  {rel}")
            for c in changes:
                print(f"         → {c}")
            total_fixed += 1
        else:
            total_ok += 1

    print(f"\nDone. Fixed {total_fixed} file(s). Already OK: {total_ok}.")


if __name__ == "__main__":
    main()
