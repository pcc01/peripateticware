# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Privacy Jurisdiction Discovery Service
========================================
The "system finds it, the teacher never authors legal content" pipeline.

Called by privacy_jurisdiction_resolver.resolve_jurisdictions() whenever a
country/subdivision/region has no match in the federal-level baseline map
nor in privacy_regulation_catalog. Also re-invoked by the monthly auto-renew
job (backend/startup.py) for previously-discovered, non-adapter-backed entries.

Resolution order (normally never left empty-handed — returns *something*,
even a conservative placeholder, rather than leaving an org with no
protections at all -- except when the country-consistency guard below
rejects a result, where "nothing" is safer than confidently wrong content):

  1. iapp_privacy_crawler's existing ~24 curated PrivacySource adapters
     (rich, hand-maintained baseline_rule content) — reused as-is via
     run_jurisdiction_crawl(). Result is mirrored into the catalog as
     discovery_method='crawler_adapter', is_verified=True.
  2. backend/config/privacy_source_directory.json — a hand-curated,
     one-time reference of official regulator URLs (see that file's header
     for provenance). If the country has an entry, fetch that page directly
     (never IAPP itself) and feed it to the AI-synthesis prompt.
  3. General recall-only synthesis — no source page fetched, the model
     answers from its own training knowledge. Always the weakest tier.

Tiers 2 and 3 both produce discovery_method='ai_search_synthesis',
is_verified=False unconditionally — pending human/legal review, per design.
Nothing here ever raises; any failure returns None and the resolver simply
falls back to whatever the federal baseline already produced.

Country-consistency guard: tier-3 recall-only synthesis (fires whenever the
official source page is unreachable, which is common — many government
sites 403 automated fetches) can drift onto the wrong country entirely.
Observed in testing: a Nigeria lookup came back describing US federal
student-privacy law (FERPA/COPPA) with no mention of Nigeria at all. That's
worse than "no data" -- it's confidently wrong content that would otherwise
land in compliance_rules with auto_load=True. _country_name_matches() checks
the model's self-reported "country_name" against the requested country_code
via pycountry; a mismatch is a hard rejection (nothing is stored, not even
as an unverified placeholder) plus an immediate one-off email to the admin
via _flag_country_mismatch(), separate from the monthly report, so a human
can fix the source link or investigate promptly.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Optional

import pycountry
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_REQUIRED_AI_KEYS = (
    "country_name", "law_exists", "confidence", "framework", "short_name", "full_name", "summary",
    "max_retention_days", "encryption_required",
)


def _country_name_matches(country_code: str, claimed_name: str) -> bool:
    """
    True if claimed_name (the model's self-reported "which country is this
    about") plausibly refers to country_code. Uses pycountry's fuzzy search
    rather than exact string match since models phrase names loosely
    ("South Korea" vs "Korea, Republic of").
    """
    if not claimed_name:
        return False
    try:
        matches = pycountry.countries.search_fuzzy(claimed_name)
    except LookupError:
        return False
    return any(m.alpha_2 == country_code.upper() for m in matches)


async def _flag_country_mismatch(
    country_code: str, location_desc: str, ai_json: Dict[str, Any],
) -> None:
    """
    Immediate one-off admin email for a rejected AI discovery result --
    distinct from the monthly auto-renew report, since this is a same-run
    "something is actively broken, look now" signal (usually a dead/blocked
    source_url pushing the model onto recall-only, where it then drifted to
    a different country) rather than a routine monthly summary item.
    Never raises -- a notification failure shouldn't break discovery.
    """
    try:
        from core.config import settings
        from services.email_service import send_notification

        primary = getattr(settings, "ADMIN_EMAIL", "") or getattr(settings, "EMAIL_FROM", "")
        cc_list = [c.strip() for c in getattr(settings, "PRIVACY_REPORT_CC_EMAIL", "").split(",") if c.strip()]
        recipients = [r for r in [primary, *cc_list] if r]
        if not recipients:
            return

        subject = f"Privacy discovery rejected — country mismatch for {country_code}"
        body_html = f"""
            <h2>AI discovery rejected — country mismatch</h2>
            <p>Requested: <strong>{location_desc}</strong> (expected country: {country_code})</p>
            <p>The model's response claimed to be about: <strong>{ai_json.get('country_name', '(none given)')}</strong></p>
            <p>Nothing was stored -- this org still has no jurisdiction on file for this location.
               This usually means the official source URL for {country_code} is unreachable
               (many government sites block automated fetches), pushing the model onto
               recall-only synthesis, where it drifted onto a different country's law instead
               of honestly reporting it doesn't know {country_code}'s.</p>
            <p><strong>Suggested next step:</strong> find and add a working official source URL
               for {country_code} to privacy_source_registry (or a curated PrivacySource adapter
               in iapp_privacy_crawler.py) so future lookups have real source text to work from
               instead of falling back to recall-only.</p>
            <p>Raw model response: <code>{json.dumps(ai_json)}</code></p>
        """
        await send_notification(", ".join(recipients), subject, body_html)
    except Exception as exc:
        logger.error(f"[privacy_discovery] Failed to send country-mismatch flag for {country_code}: {exc}", exc_info=True)


async def _lookup_source_registry(db: AsyncSession, country_code: str) -> Optional[Dict[str, Any]]:
    """
    Tier-2 lookup against privacy_source_registry — a DB table populated by a
    one-time bulk pull (see backend/config/privacy_source_directory.json for
    the original 22-country seed; grown over time via batched curation, not
    an ongoing crawl against IAPP or any other source).
    """
    from models.compliance import PrivacySourceRegistry

    result = await db.execute(
        select(PrivacySourceRegistry).where(
            PrivacySourceRegistry.country_code == (country_code or "").upper()
        )
    )
    row = result.scalars().first()
    if not row or not row.source_url:
        return None
    return {"source_url": row.source_url, "framework_guess": row.framework_guess}


def _slugify(text: str) -> str:
    slug = re.sub(r'[^a-z0-9]+', '_', (text or '').lower()).strip('_')
    return slug or 'custom'


def _build_jurisdiction_id(framework: str, country_code: str, subdivision_code: Optional[str]) -> str:
    base = f"{_slugify(framework)}_{(country_code or 'xx').lower()}"
    if subdivision_code:
        sub_part = subdivision_code.split('-')[-1].lower()
        base = f"{base}_{sub_part}"
    return base


def _location_desc(country_code: str, subdivision_code: Optional[str], region: Optional[str]) -> str:
    parts = []
    if region:
        parts.append(region)
    if subdivision_code:
        parts.append(subdivision_code)
    parts.append(country_code)
    return ", ".join(parts)


def _strip_json_fences(raw: str) -> str:
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
    raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE)
    return raw


async def _call_ai_synthesis(
    db: AsyncSession, location_desc: str, country_code: str,
    source_text: str, validation_errors: str = "",
) -> Optional[Dict[str, Any]]:
    """One AI call + JSON parse. Returns the parsed dict, or None on failure."""
    from services.prompt_library import build_privacy_jurisdiction_discovery_prompt
    from services.ai_router import AIRouter

    prompt = build_privacy_jurisdiction_discovery_prompt(
        location_desc=location_desc, country_code=country_code,
        source_text=source_text, validation_errors=validation_errors,
    )
    result = await AIRouter().complete(
        task_type="privacy_jurisdiction_discovery", prompt=prompt, db=db, org_id=None,
    )
    if not result or not result.text or result.error:
        logger.warning(f"[privacy_discovery] AI call failed for {location_desc}: "
                        f"{result.error if result else 'no result'}")
        return None
    try:
        parsed = json.loads(_strip_json_fences(result.text))
    except json.JSONDecodeError as exc:
        logger.warning(f"[privacy_discovery] AI returned invalid JSON for {location_desc}: {exc}")
        return None
    if not isinstance(parsed, dict) or not all(k in parsed for k in _REQUIRED_AI_KEYS):
        logger.warning(f"[privacy_discovery] AI JSON missing required keys for {location_desc}")
        return None
    return parsed


async def _synthesize_and_store(
    db: AsyncSession, country_code: str, subdivision_code: Optional[str],
    region: Optional[str], source_text: str, source_url: Optional[str],
) -> Optional[Dict[str, Any]]:
    from schemas.privacy_rule import validate_rule_definition
    from pydantic import ValidationError

    location_desc = _location_desc(country_code, subdivision_code, region)

    ai_json = await _call_ai_synthesis(db, location_desc, country_code, source_text)
    if ai_json is None:
        return None

    if not _country_name_matches(country_code, ai_json.get("country_name", "")):
        logger.warning(
            f"[privacy_discovery] Country mismatch for {location_desc}: model claimed "
            f"'{ai_json.get('country_name')}', expected {country_code}. Rejecting -- "
            f"nothing stored, admin flagged."
        )
        await _flag_country_mismatch(country_code, location_desc, ai_json)
        return None

    jurisdiction_id = _build_jurisdiction_id(ai_json["framework"], country_code, subdivision_code)
    rule_definition = {
        "jurisdiction_id":    jurisdiction_id,
        "jurisdiction_name":  ai_json.get("full_name") or ai_json.get("short_name") or jurisdiction_id,
        "country_code":       country_code,
        "subdivision_code":   subdivision_code,
        "framework":          ai_json.get("framework", "custom"),
        "version":            "1.0",
        "description":        ai_json.get("summary"),
        "max_retention_days": ai_json.get("max_retention_days", 365),
        "encryption_required": bool(ai_json.get("encryption_required", True)),
        "student_data_sharing_allowed": bool(ai_json.get("student_data_sharing_allowed", False)),
        "student_monitoring_allowed":   bool(ai_json.get("student_monitoring_allowed", False)),
        "student_profiling_allowed":    bool(ai_json.get("student_profiling_allowed", False)),
        "student_targeting_allowed":    bool(ai_json.get("student_targeting_allowed", False)),
        "requires_privacy_impact_assessment": bool(ai_json.get("requires_privacy_impact_assessment", False)),
        "requires_data_protection_officer":   bool(ai_json.get("requires_data_protection_officer", False)),
    }

    try:
        validate_rule_definition(rule_definition)
    except ValidationError as exc:
        logger.info(f"[privacy_discovery] First synthesis failed validation for "
                    f"{location_desc}, retrying once: {exc}")
        ai_json = await _call_ai_synthesis(
            db, location_desc, country_code, source_text, validation_errors=str(exc),
        )
        if ai_json is None:
            return None
        jurisdiction_id = _build_jurisdiction_id(ai_json["framework"], country_code, subdivision_code)
        rule_definition["jurisdiction_id"] = jurisdiction_id
        rule_definition["framework"] = ai_json.get("framework", "custom")
        rule_definition["max_retention_days"] = ai_json.get("max_retention_days", 365)
        try:
            validate_rule_definition(rule_definition)
        except ValidationError as exc2:
            logger.warning(f"[privacy_discovery] Synthesis failed validation twice for "
                           f"{location_desc}, giving up: {exc2}")
            return None

    # ── Write ComplianceRule via the crawler's existing versioned-upsert path ──
    from services.iapp_privacy_crawler import PrivacySource, _upsert_rule

    source = PrivacySource(
        source_id=f"discovery_{jurisdiction_id}",
        jurisdiction=jurisdiction_id,
        country_codes=[country_code],
        framework=rule_definition["framework"],
        url=source_url or "",
        version_xpath="",
        check_interval_days=30,
    )
    new_rule_id = await _upsert_rule(
        db, source, dict(rule_definition), version="1.0",
        change_log="AI-discovered — pending human/legal review", auto_load=True,
    )
    # _upsert_rule fingerprint-compares against the current active rule and
    # returns None when nothing actually changed -- this is the only reliable
    # signal for "did this jurisdiction's legal content change on re-check",
    # distinct from "did we successfully re-run the pipeline" (which is true
    # on every call, changed or not).
    content_changed = new_rule_id is not None

    # ── Mirror into the catalog (idempotent) ───────────────────────────────────
    from services.privacy_catalog_service import get_catalog_entry_by_code, add_catalog_entry

    existing = await get_catalog_entry_by_code(db, jurisdiction_id)
    if existing:
        return {
            "jurisdiction_id":  jurisdiction_id,
            "is_verified":      existing.get("is_verified", False),
            "discovery_method": existing.get("discovery_method", "ai_search_synthesis"),
            "short_name":       existing.get("short_name"),
            "full_name":        existing.get("full_name"),
            "content_changed":  content_changed,
        }

    catalog_row = await add_catalog_entry(
        db,
        data={
            "short_name":       ai_json.get("short_name") or jurisdiction_id,
            "full_name":        ai_json.get("full_name") or jurisdiction_id,
            "jurisdiction_code": jurisdiction_id,
            "subdivision_code": subdivision_code,
            "framework":        rule_definition["framework"],
            "region":           region,
            "country_codes":    [country_code],
            "summary":          ai_json.get("summary"),
            "key_requirements": ai_json.get("key_requirements"),
            "age_threshold":    ai_json.get("age_threshold"),
            "source_url":       source_url,
            "is_verified":      False,
            "discovery_method": "ai_search_synthesis",
        },
        added_by_user_id=None,
        added_by_role="system_discovery",
    )
    return {
        "jurisdiction_id":  jurisdiction_id,
        "is_verified":      False,
        "discovery_method": "ai_search_synthesis",
        "short_name":       catalog_row.get("short_name"),
        "full_name":        catalog_row.get("full_name"),
        "content_changed":  content_changed,
    }


async def discover_and_store_jurisdiction(
    db: AsyncSession,
    country_code: Optional[str],
    subdivision_code: Optional[str] = None,
    region: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Main entry point. Never raises — returns None on any failure so the caller
    (privacy_jurisdiction_resolver) can gracefully fall back to whatever the
    federal baseline already produced.
    """
    if not country_code:
        return None

    try:
        # ── Tier 1: existing curated crawler adapter ───────────────────────────
        from services.iapp_privacy_crawler import get_source_for_country, run_jurisdiction_crawl
        from services.privacy_catalog_service import get_catalog_entry_by_code, add_catalog_entry

        adapter = get_source_for_country(country_code)
        if adapter:
            crawl_result = await run_jurisdiction_crawl(db, country_code, force=True, auto_load=True)
            if crawl_result.get("status") != "not_supported":
                existing = await get_catalog_entry_by_code(db, adapter.jurisdiction)
                if not existing:
                    existing = await add_catalog_entry(
                        db,
                        data={
                            "short_name":       adapter.source_id.upper(),
                            "full_name":        adapter.jurisdiction,
                            "jurisdiction_code": adapter.jurisdiction,
                            "subdivision_code": subdivision_code,
                            "framework":        adapter.framework,
                            "region":           region,
                            "country_codes":    adapter.country_codes,
                            "source_url":       adapter.url,
                            "is_verified":      True,
                            "discovery_method": "crawler_adapter",
                        },
                        added_by_user_id=None,
                        added_by_role="system_discovery",
                    )
                return {
                    "jurisdiction_id":  adapter.jurisdiction,
                    "is_verified":      True,
                    "discovery_method": "crawler_adapter",
                    "short_name":       existing.get("short_name"),
                    "full_name":        existing.get("full_name"),
                    "content_changed":  crawl_result.get("status") == "updated",
                }

        # ── Tier 2: curated official-source registry (DB, grown via batch pulls) ──
        entry = await _lookup_source_registry(db, country_code)
        if entry:
            from services.iapp_privacy_crawler import _fetch_page
            page_text = await _fetch_page(entry["source_url"])
            if page_text:
                return await _synthesize_and_store(
                    db, country_code, subdivision_code, region,
                    source_text=page_text[:8000], source_url=entry["source_url"],
                )
            logger.info(f"[privacy_discovery] Directory URL for {country_code} unreachable, "
                        f"falling back to recall-only synthesis")

        # ── Tier 3: recall-only synthesis ───────────────────────────────────────
        return await _synthesize_and_store(
            db, country_code, subdivision_code, region, source_text="", source_url=None,
        )

    except Exception as exc:
        logger.error(f"[privacy_discovery] Discovery failed for {country_code}/"
                     f"{subdivision_code}/{region}: {exc}", exc_info=True)
        return None
