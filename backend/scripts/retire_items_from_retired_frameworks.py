#!/usr/bin/env python3
# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
retire_items_from_retired_frameworks.py
========================================
One-time backfill for data ingested before ingest_case_standards.py cascaded
framework retirement down to StandardsItem.is_retired. Without this, items
under a retired framework were embedded as live standards and kept
surfacing in rag-retrieve results forever -- see the "[RETIRED] Language
Arts: Henry Teaching & Learning Standards" leak found 2026-08-17 comparing
local vs prod GraphRAG retrieval (top-5 result for an unrelated query on
prod).

A framework counts as retired here if EITHER: adoption_status is literally
"retired" (exact, case-insensitive), OR its own title says so ("[RETIRED]",
"(Retired)", "REPEALED", etc.). Deliberately NOT "adoption_status =
deprecated" alone -- spot-checked 2026-08-17, GCPS sets that value across
its entire *current* 2025-2026 AKS catalog, so treating "Deprecated" as
"retired" would silently drop ~90k live items. See the docstring in
ingest_case_standards.py's _framework_is_retired() for the full story. Run
with --dry-run first; it prints exactly which frameworks and how many items
would be affected before anything changes.

What it does, in order:
  1. Sets standards_items.is_retired = true for every item under a
     title/status-confirmed retired framework, if not already flagged.
  2. Deletes their rows from rag_documents (node_type='standards_item') --
     backfill_standards_embeddings.py's skip-existing logic means a plain
     re-run would never touch already-embedded rows, so this is the only
     way to actually remove them from vector search.

Steps 2's deletions are the only irreversible part (re-populate by
un-retiring + re-running the backfill if this was ever a mistake); step 1 is
just flipping a boolean already meant to carry this meaning.

Safe to re-run: everything is a WHERE-guarded UPDATE/DELETE, a second run
finds nothing left to do.

Usage:
    cd backend && python scripts/retire_items_from_retired_frameworks.py [--dry-run]
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/ on sys.path

from core.database import get_session_factory  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("retire_items_from_retired_frameworks")

# Keep this WHERE fragment identical to _framework_is_retired() in
# ingest_case_standards.py -- both must agree on what "retired" means.
RETIRED_WHERE = "(lower(sf.adoption_status) = 'retired' OR sf.title ~* 'retired|repealed')"


async def main(dry_run: bool) -> None:
    session_factory = get_session_factory()
    async with session_factory() as db:
        preview = (await db.execute(text(f"""
            SELECT sf.id, sf.title, sf.adoption_status, count(si.id)
            FROM standards_frameworks sf
            JOIN standards_items si ON si.framework_id = sf.id
            WHERE {RETIRED_WHERE}
              AND si.is_retired = false
            GROUP BY sf.id, sf.title, sf.adoption_status
            ORDER BY count(si.id) DESC
        """))).fetchall()

        ambiguous = (await db.execute(text("""
            SELECT count(*), count(DISTINCT sf.id)
            FROM standards_frameworks sf
            JOIN standards_items si ON si.framework_id = sf.id
            WHERE lower(sf.adoption_status) = 'deprecated'
              AND sf.title !~* 'retired|repealed'
              AND si.is_retired = false
        """))).fetchone()

        if not preview:
            log.info("Nothing to do -- no non-retired items under a retired/deprecated framework.")
            return

        total_items = sum(row[3] for row in preview)
        log.info("Frameworks affected: %d, items to retire: %d", len(preview), total_items)
        for row in preview:
            log.info("  %-12s %5d items  [%s]  %s", row[2], row[3], str(row[0])[:8], row[1][:70])

        if ambiguous and ambiguous[0]:
            log.warning(
                "NOT touching %d items across %d framework(s) with adoption_status='Deprecated' "
                "and no title confirmation -- that value isn't a reliable retirement signal on its "
                "own (see module docstring). Review those separately if they need attention.",
                ambiguous[0], ambiguous[1],
            )

        if dry_run:
            log.info("--dry-run: no changes made.")
            return

        result = await db.execute(text(f"""
            UPDATE standards_items si
            SET is_retired = true
            FROM standards_frameworks sf
            WHERE si.framework_id = sf.id
              AND {RETIRED_WHERE}
              AND si.is_retired = false
        """))
        log.info("standards_items.is_retired set on %d rows", result.rowcount)

        result = await db.execute(text("""
            DELETE FROM rag_documents rd
            USING standards_items si
            WHERE rd.node_type = 'standards_item'
              AND rd.node_id = si.id
              AND si.is_retired = true
        """))
        log.info("rag_documents rows deleted: %d", result.rowcount)

        await db.commit()
        log.info("Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing")
    args = parser.parse_args()
    asyncio.run(main(args.dry_run))
