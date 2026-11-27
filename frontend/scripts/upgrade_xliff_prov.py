#!/usr/bin/env python3
# frontend/scripts/upgrade_xliff_prov.py
#
# One-off backfill (plan decision 3): walk every localization .xlf and upgrade
# its embedded W3C-PROV graph in place —
#
#   • backfill the JSON-LD @context so every term the graph uses is defined
#   • replace bare  {"@type":"prov:Agent","prov:label":"Translation Engine
#     Profile: OLLAMA-mistral [...]"}  nodes with structured SoftwareAgent
#     nodes (provider / model / organization / role)
#   • remap the activity/entity references onto the new agent @ids and add the
#     structured relation keys (prov:wasAssociatedWith / wasGeneratedBy /
#     wasRevisionOf) alongside the legacy short ones
#
# Only the <meta type="provenance-graph"> block is rewritten — every
# <trans-unit> (source / target / note / approved) is left byte-for-byte
# untouched. Idempotent: safe to run repeatedly, safe to skip (new writes
# self-heal the @context, but agent nodes only upgrade where a redrive
# touches them, so this pass is what upgrades the whole corpus at once).
#
#   python upgrade_xliff_prov.py --dry-run          # report what would change
#   python upgrade_xliff_prov.py                    # apply
#   python upgrade_xliff_prov.py --locales it,es    # limit scope

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from localization_provenance import upgrade_legacy_graph  # noqa: E402

FRONTEND_DIR = Path(__file__).parent.parent
LOCALES_DIR = FRONTEND_DIR / "public" / "locales"

_META_OPEN = '<meta type="provenance-graph">'
_META_CLOSE = "</meta>"


def _iter_xlf(locales: set[str] | None):
    for p in sorted(LOCALES_DIR.glob("*.xlf")):
        if locales and p.stem not in locales:
            continue
        yield p
    for p in sorted(LOCALES_DIR.glob("*/*.xlf")):
        if locales and p.parent.name not in locales:
            continue
        yield p


def _rewrite_graph_block(text: str) -> tuple[str, dict] | None:
    """Locate the provenance-graph <meta> payload, upgrade the JSON, splice it
    back. Returns (new_text, stats) or None if the file carries no graph."""
    start = text.find(_META_OPEN)
    if start == -1:
        return None
    body_start = start + len(_META_OPEN)
    body_end = text.find(_META_CLOSE, body_start)
    if body_end == -1:
        return None
    raw = text[body_start:body_end].strip()
    try:
        graph = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(graph, dict):
        return None

    before_agents = sum(1 for n in graph.get("@graph", [])
                        if isinstance(n, dict) and n.get("@type") == "prov:Agent")
    upgraded = upgrade_legacy_graph(json.loads(json.dumps(graph)))  # deep copy
    after_soft = sum(1 for n in upgraded.get("@graph", [])
                     if isinstance(n, dict) and n.get("@type") == "prov:SoftwareAgent")
    ctx_added = sorted(set(upgraded.get("@context", {})) - set(graph.get("@context", {})))

    new_json = json.dumps(upgraded, ensure_ascii=False, indent=2)
    # keep the original XML indentation of the payload's first line
    indent = text[text.rfind("\n", 0, start) + 1:start]
    new_json = new_json.replace("\n", "\n" + indent)
    new_text = text[:body_start] + new_json + text[body_end:]

    changed = new_text != text
    return new_text, {
        "changed": changed,
        "legacy_agents_upgraded": before_agents,
        "structured_agents": after_soft,
        "context_terms_added": ctx_added,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="Report only; write nothing.")
    ap.add_argument("--locales", default=None, help="Comma-separated locales to limit to (default: all).")
    args = ap.parse_args()

    locales = {s.strip() for s in args.locales.split(",")} if args.locales else None
    files = list(_iter_xlf(locales))
    if not files:
        print("No .xlf files found under public/locales/.")
        return

    total_changed = 0
    total_agents = 0
    for path in files:
        text = path.read_text(encoding="utf-8")
        result = _rewrite_graph_block(text)
        rel = path.relative_to(LOCALES_DIR)
        if result is None:
            print(f"  --  {rel}  (no provenance graph)")
            continue
        new_text, stats = result
        if not stats["changed"]:
            print(f"  ok  {rel}  (already up to date)")
            continue
        total_changed += 1
        total_agents += stats["legacy_agents_upgraded"]
        verb = "would upgrade" if args.dry_run else "upgraded"
        print(f"  ->  {rel}  {verb}: {stats['legacy_agents_upgraded']} legacy agent node(s) "
              f"-> {stats['structured_agents']} structured; "
              f"+{len(stats['context_terms_added'])} @context term(s)")
        if not args.dry_run:
            tmp = path.with_suffix(path.suffix + ".tmp")
            tmp.write_text(new_text, encoding="utf-8")
            tmp.replace(path)

    print("\n" + ("DRY RUN — nothing written. " if args.dry_run else "Done. ")
          + f"{total_changed}/{len(files)} file(s) "
          + ("would change" if args.dry_run else "changed")
          + f", {total_agents} legacy agent node(s) upgraded.")


if __name__ == "__main__":
    main()
