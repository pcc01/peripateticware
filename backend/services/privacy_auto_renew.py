# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Monthly auto-renew job for the privacy jurisdiction catalog.

Distinct from iapp_privacy_crawler.py's existing (separately-scheduled)
weekly crawl, which only refreshes the ~24 curated PrivacySource adapters:
this job re-checks everything else in privacy_regulation_catalog so a
country/state whose law changed after it was first auto-discovered doesn't
go stale forever.

Two tiers of re-check, matched to how much trust each row already carries:
  - discovery_method == 'ai_search_synthesis' (lowest confidence, most likely
    to have been wrong or incomplete the first time): re-run the full
    discover_and_store_jurisdiction() pipeline. Its underlying _upsert_rule()
    fingerprint-compares against the current ComplianceRule and only bumps
    the version if the content genuinely changed -- calling this on an
    unchanged jurisdiction is a safe no-op, not a spurious rewrite.
  - discovery_method in ('seed', 'admin_manual', 'crawler_adapter') (human-
    vetted or already covered by the weekly crawler): just verify source_url
    is still reachable and log a warning if not; content isn't re-synthesized
    since a human already authored/approved it.

Every row gets last_synced_at touched regardless, so the catalog UI can show
"last checked" honestly.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def run_catalog_auto_renew(db: AsyncSession) -> Dict[str, Any]:
    from services.privacy_catalog_service import list_catalog, touch_last_synced
    from services.privacy_discovery_service import discover_and_store_jurisdiction
    from services.iapp_privacy_crawler import _fetch_page

    rows: List[dict] = await list_catalog(db)
    summary = {"checked": 0, "resynthesized": 0, "unreachable": 0, "skipped": 0}

    for row in rows:
        summary["checked"] += 1
        catalog_id = row.get("id")
        discovery_method = row.get("discovery_method")

        try:
            if discovery_method == "ai_search_synthesis":
                country_codes = row.get("country_codes") or []
                if not country_codes:
                    summary["skipped"] += 1
                    continue
                await discover_and_store_jurisdiction(
                    db,
                    country_code=country_codes[0],
                    subdivision_code=row.get("subdivision_code"),
                    region=row.get("region"),
                )
                summary["resynthesized"] += 1
            elif row.get("source_url"):
                page = await _fetch_page(row["source_url"])
                if page is None:
                    summary["unreachable"] += 1
                    logger.warning(
                        f"[privacy_auto_renew] {row.get('jurisdiction_code')}'s source_url "
                        f"is no longer reachable: {row['source_url']}"
                    )
            else:
                summary["skipped"] += 1

            if catalog_id:
                await touch_last_synced(db, catalog_id)

        except Exception as exc:
            logger.error(
                f"[privacy_auto_renew] Renew check failed for "
                f"{row.get('jurisdiction_code')}: {exc}", exc_info=True,
            )

    logger.info(f"[privacy_auto_renew] Monthly renew complete: {summary}")
    return summary
