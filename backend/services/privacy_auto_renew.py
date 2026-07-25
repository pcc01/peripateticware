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
    unchanged jurisdiction is a safe no-op, not a spurious rewrite. Whether
    a real change happened is surfaced back up (discover_and_store_
    jurisdiction()'s "content_changed" key) and collected into this run's
    "changed_jurisdictions" list, not just counted -- the monthly report
    needs to name which jurisdictions actually changed, not just how many.
  - discovery_method in ('seed', 'admin_manual', 'crawler_adapter') (human-
    vetted or already covered by the weekly crawler): just verify source_url
    is still reachable and log a warning if not; content isn't re-synthesized
    since a human already authored/approved it -- so "url_reachable" here is
    a weaker claim than "content_changed" above, not an equivalent no-op.

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
    summary = {"checked": 0, "rechecked_no_change": 0, "content_changed": 0,
               "url_reachable": 0, "unreachable": 0, "skipped": 0}
    # Per-jurisdiction detail for anything discover_and_store_jurisdiction()
    # reports as a real content change (fingerprint mismatch against the
    # previous ComplianceRule version, not just "we re-ran the pipeline") --
    # this is what the monthly report surfaces, distinct from the no-op
    # re-checks that also happen every run.
    changed: List[Dict[str, Any]] = []

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
                result = await discover_and_store_jurisdiction(
                    db,
                    country_code=country_codes[0],
                    subdivision_code=row.get("subdivision_code"),
                    region=row.get("region"),
                )
                if result and result.get("content_changed"):
                    summary["content_changed"] += 1
                    changed.append({
                        "jurisdiction_code": row.get("jurisdiction_code"),
                        "country_codes":     country_codes,
                        "short_name":        result.get("short_name") or row.get("short_name"),
                        "full_name":         result.get("full_name") or row.get("full_name"),
                        "discovery_method":  discovery_method,
                    })
                else:
                    summary["rechecked_no_change"] += 1
            elif row.get("source_url"):
                # Reachability only -- these rows are seed/admin_manual/crawler_adapter
                # content a human already authored or the separate weekly
                # IAPP crawler already diffs, so we don't re-synthesize over it here;
                # "url_reachable" is not the same claim as "content unchanged".
                page = await _fetch_page(row["source_url"])
                if page is None:
                    summary["unreachable"] += 1
                    logger.warning(
                        f"[privacy_auto_renew] {row.get('jurisdiction_code')}'s source_url "
                        f"is no longer reachable: {row['source_url']}"
                    )
                else:
                    summary["url_reachable"] += 1
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
    return {**summary, "changed_jurisdictions": changed}


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
    at all (currently defaulted to gdpr_eu).

    Does NOT write to compliance_rules/privacy_regulation_catalog/the shared
    gdpr_eu row directly -- an AI finding "yes, a law now exists" only ever
    creates a PrivacyPromotionProposal (status='proposed'). Nothing takes
    effect until an admin reviews the monthly report and explicitly approves
    via scripts/apply_promotion.py. This replaces an earlier design that
    auto-applied on a strict is-True/high-confidence check; a human review
    is a stronger safety net than any confidence threshold, especially given
    local/Ollama models don't always return law_exists as a real JSON
    boolean (observed "law_exists": "low" in testing).

    Returns a summary dict PLUS "proposals": the list of newly created
    proposals this run, for the caller to build the monthly report email
    from -- see send_monthly_no_legislation_report() below.
    """
    from sqlalchemy import select
    from models.compliance import PrivacySourceRegistry, PrivacyPromotionProposal

    rows = (await db.execute(
        select(PrivacySourceRegistry).where(PrivacySourceRegistry.has_no_known_legislation == True)  # noqa: E712
    )).scalars().all()

    summary = {"checked": 0, "proposed": 0, "still_no_law": 0, "check_failed": 0}
    proposals: List[Dict[str, Any]] = []

    for row in rows:
        summary["checked"] += 1
        try:
            from services.privacy_discovery_service import _call_ai_synthesis, _location_desc

            location_desc = _location_desc(row.country_code, None, None)
            ai_json = await _call_ai_synthesis(db, location_desc, row.country_code, source_text="")

            found_candidate = bool(
                ai_json and ai_json.get("law_exists") is True and ai_json.get("confidence") == "high"
            )

            if found_candidate:
                proposal = PrivacyPromotionProposal(
                    country_code=row.country_code,
                    country_name=row.country_name,
                    ai_findings=ai_json,
                    status="proposed",
                )
                db.add(proposal)
                summary["proposed"] += 1
                proposals.append({
                    "country_code": row.country_code,
                    "country_name": row.country_name,
                    "short_name": ai_json.get("short_name"),
                    "full_name": ai_json.get("full_name"),
                    "summary": ai_json.get("summary"),
                })
                logger.info(
                    f"[privacy_auto_renew] Proposal created for {row.country_code} -- "
                    f"AI found a possible law: {ai_json.get('short_name')}"
                )
            else:
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
    return {**summary, "proposals": proposals}


async def send_monthly_no_legislation_report(
    catalog_summary: Dict[str, Any],
    no_law_summary: Dict[str, Any],
) -> None:
    """
    Emails (or, with EMAIL_DRY_RUN=true, just logs) a summary of this month's
    auto-renew run to ADMIN_EMAIL -- the catalog re-check (including any
    jurisdiction whose legal content was actually re-synthesized differently
    from what's on file, not just "we re-checked it"), and the
    no-legislation-country re-check, including any new proposals awaiting
    approval. Never raises; a report-send failure shouldn't affect the
    scheduled job's own success/failure state.
    """
    from core.config import settings
    from services.email_service import send_notification

    proposals = no_law_summary.get("proposals", [])
    proposals_html = "".join(
        f"<li><strong>{p['country_code']}</strong> ({p['country_name']}): "
        f"{p.get('short_name') or 'unnamed law'} — {p.get('summary') or 'no summary'}</li>"
        for p in proposals
    ) or "<li>None this month.</li>"

    changed = catalog_summary.get("changed_jurisdictions", [])
    changed_html = "".join(
        f"<li><strong>{', '.join(c.get('country_codes') or [])}</strong> "
        f"({c.get('jurisdiction_code')}): {c.get('short_name') or 'unnamed'} — "
        f"content changed on re-check and a new version was stored and applied.</li>"
        for c in changed
    ) or "<li>None this month.</li>"

    subject_bits = []
    if proposals:
        subject_bits.append(f"{len(proposals)} new proposal(s)")
    if changed:
        subject_bits.append(f"{len(changed)} jurisdiction(s) with legal changes")
    subject = (
        f"Privacy auto-renew report — {' + '.join(subject_bits)}"
        if subject_bits else "Privacy auto-renew report — no changes"
    )
    body_html = f"""
        <h2>Monthly privacy jurisdiction auto-renew</h2>
        <h3>Catalog re-check</h3>
        <p>Checked: {catalog_summary.get('checked', 0)},
           re-checked no change: {catalog_summary.get('rechecked_no_change', 0)},
           <strong>content changed: {catalog_summary.get('content_changed', 0)}</strong>,
           source URL unreachable: {catalog_summary.get('unreachable', 0)},
           skipped: {catalog_summary.get('skipped', 0)}</p>
        <h3>Jurisdictions with detected legal changes</h3>
        <p>These are AI-discovered/synthesized jurisdictions (<code>discovery_method=ai_search_synthesis</code>)
           where this month's re-check produced content that actually differs from the version on
           file — a new <code>compliance_rules</code> version was already stored and applied
           (these entries stay flagged <code>is_verified=false</code> pending your review; this
           isn't gated behind an approval step the way no-legislation promotions are, so review
           promptly if anything looks off):</p>
        <ul>{changed_html}</ul>
        <h3>No-legislation country re-check</h3>
        <p>Checked: {no_law_summary.get('checked', 0)},
           still no law: {no_law_summary.get('still_no_law', 0)},
           check failed: {no_law_summary.get('check_failed', 0)},
           <strong>new proposals: {len(proposals)}</strong></p>
        <h3>Proposals awaiting approval</h3>
        <p>Nothing has been changed automatically. Review each proposal and, if it looks
           correct, approve it with:<br>
           <code>docker exec peripateticware-backend python scripts/apply_promotion.py &lt;country_code&gt;</code></p>
        <ul>{proposals_html}</ul>
    """

    try:
        primary = getattr(settings, "ADMIN_EMAIL", "") or getattr(settings, "EMAIL_FROM", "")
        # Comma-separated -- confirmed pcerda@outlook.com receives this
        # reliably; ADMIN_EMAIL itself is confirmed to arrive too, just with
        # a delay (Gmail-side dedup/threading, not a hard drop), so it stays
        # as primary rather than needing a same-provider "+" alias workaround.
        cc_list = [c.strip() for c in getattr(settings, "PRIVACY_REPORT_CC_EMAIL", "").split(",") if c.strip()]
        recipients = [r for r in [primary, *cc_list] if r]
        if recipients:
            await send_notification(", ".join(recipients), subject, body_html)
        else:
            logger.warning("[privacy_auto_renew] No ADMIN_EMAIL/EMAIL_FROM/PRIVACY_REPORT_CC_EMAIL configured — report not sent")
    except Exception as exc:
        logger.error(f"[privacy_auto_renew] Failed to send monthly report: {exc}", exc_info=True)
