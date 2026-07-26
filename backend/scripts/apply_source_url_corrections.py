# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Bulk-apply corrected source URLs from a CSV file into privacy_source_registry.

Companion to check_source_link_health.py: that script finds dead/blocked
links and can emit a starter CSV (--template) pre-filled with every broken
country's code, name, and current (broken) URL, with an empty new_url column
for you to fill in. Run this script against the filled-in CSV to apply the
fixes in bulk.

CSV columns (header row required):
  country_code   ISO 3166-1 alpha-2, e.g. "NP" -- authoritative match key.
  new_url        the corrected, working source URL for that country.
  (country_name, old_url, detail columns are accepted but ignored -- they're
   only there for your own reference if you started from --template output.)

Only privacy_source_registry.source_url is touched (the table that actually
drives Tier-2 discovery lookups in privacy_discovery_service.py). Catalog
rows (privacy_regulation_catalog) and the curated PrivacySource adapters in
iapp_privacy_crawler.py are hand-maintained and out of scope for this bulk
tool -- edit those directly if one of their links is broken.

Rows with a working new_url mark that country is_verified=True (a human
supplied and presumably checked this link), separate from is_verified on
privacy_regulation_catalog (which tracks the synthesized RULE content, not
the source link).

Usage:
  docker exec peripateticware-backend python scripts/apply_source_url_corrections.py /app/scripts/source_url_corrections.csv
Idempotent -- re-running with the same CSV just re-applies the same values.
"""

import asyncio
import csv
import sys
from datetime import datetime

from core.database import get_session_factory
from sqlalchemy import text


async def main(csv_path: str) -> None:
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or "country_code" not in reader.fieldnames or "new_url" not in reader.fieldnames:
            print(f"CSV must have 'country_code' and 'new_url' columns. Found: {reader.fieldnames}")
            sys.exit(1)
        rows = [
            {"country_code": (r.get("country_code") or "").strip().upper(),
             "new_url": (r.get("new_url") or "").strip()}
            for r in reader
        ]

    rows = [r for r in rows if r["country_code"] and r["new_url"]]
    if not rows:
        print("No rows with both country_code and new_url filled in -- nothing to apply.")
        return

    now = datetime.utcnow()
    factory = get_session_factory()
    updated, not_found = 0, []

    async with factory() as db:
        for r in rows:
            result = await db.execute(text("""
                UPDATE privacy_source_registry
                SET source_url = :url, is_verified = TRUE, updated_at = :now
                WHERE country_code = :cc
            """), {"url": r["new_url"], "cc": r["country_code"], "now": now})
            if result.rowcount:
                updated += 1
            else:
                not_found.append(r["country_code"])
        await db.commit()

    print(f"Updated source_url for {updated} of {len(rows)} row(s).")
    if not_found:
        print(f"No privacy_source_registry row found for: {', '.join(not_found)} "
              f"(check the country_code matches an existing row -- this script only updates, never inserts).")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
