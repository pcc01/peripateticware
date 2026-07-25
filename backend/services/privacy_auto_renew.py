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

import json
import logging
from datetime import datetime
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


async def _remove_country_from_gdpr_default(db: AsyncSession, country_code: str) -> None:
    """Un-defaults a country once it's been promoted to its own real jurisdiction."""
    from sqlalchemy import text

    row = (await db.execute(text(
        "SELECT id, country_codes FROM privacy_regulation_catalog "
        "WHERE jurisdiction_code = 'gdpr_eu' AND framework = 'gdpr'"
    ))).first()
    if not row:
        return
    remaining = [c for c in (row[1] or []) if c != country_code]
    await db.execute(text(
        "UPDATE privacy_regulation_catalog SET country_codes = CAST(:codes AS JSONB), "
        "updated_at = NOW() WHERE id = :id"
    ), {"codes": json.dumps(remaining), "id": row[0]})


async def check_no_legislation_countries_for_updates(db: AsyncSession) -> Dict[str, Any]:
    """
    Monthly re-check of the ~51 countries seeded by
    scripts/seed_no_legislation_countries_to_gdpr.py as having no privacy law
    at all (currently defaulted to gdpr_eu). If one has since enacted a real
    law, "promotes" it: runs full discovery to create a proper catalog/
    ComplianceRule entry for that country specifically, removes it from the
    shared gdpr_eu row's country_codes (so it stops silently defaulting to
    GDPR), and flips has_no_known_legislation off. Countries where nothing's
    changed just get fetched_at touched, same "last checked" honesty as
    run_catalog_auto_renew() above.
    """
    from sqlalchemy import select
    from models.compliance import PrivacySourceRegistry
    from services.privacy_discovery_service import _call_ai_synthesis, _location_desc, discover_and_store_jurisdiction

    rows = (await db.execute(
        select(PrivacySourceRegistry).where(PrivacySourceRegistry.has_no_known_legislation == True)  # noqa: E712
    )).scalars().all()

    summary = {"checked": 0, "promoted": 0, "still_no_law": 0, "check_failed": 0}

    for row in rows:
        summary["checked"] += 1
        try:
            location_desc = _location_desc(row.country_code, None, None)
            ai_json = await _call_ai_synthesis(db, location_desc, row.country_code, source_text="")

            promoted = False
            # Strict `is True`, not truthy: local/Ollama models don't always
            # honor "return a JSON boolean" and can emit a stray string
            # (observed in testing: "law_exists": "low" instead of a real
            # boolean) -- a plain truthy check would treat any such non-empty
            # string as "yes, promote," which is exactly backwards.
            if ai_json and ai_json.get("law_exists") is True and ai_json.get("confidence") == "high":
                # Re-run through the real pipeline (its own AI call re-validates
                # against the canonical schema) rather than trusting this
                # lighter check's JSON directly for what gets stored.
                result = await discover_and_store_jurisdiction(db, country_code=row.country_code)
                if result:
                    await _remove_country_from_gdpr_default(db, row.country_code)
                    row.has_no_known_legislation = False
                    promoted = True
                    summary["promoted"] += 1
                    logger.info(
                        f"[privacy_auto_renew] Promoted {row.country_code} out of the GDPR "
                        f"default -- real law found: {result.get('jurisdiction_id')}"
                    )

            if not promoted:
                summary["still_no_law"] += 1

            row.fetched_at = datetime.utcnow()
            await db.commit()

        except Exception as exc:
            summary["check_failed"] += 1
            logger.error(
                f"[privacy_auto_renew] No-law recheck failed for {row.country_code}: {exc}",
                exc_info=True,
            )

    logger.info(f"[privacy_auto_renew] No-law country recheck complete: {summary}")
    return summary
