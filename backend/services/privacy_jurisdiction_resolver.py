# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Shared jurisdiction-derivation and resolution logic.

Originally lived only inside privacy_seeder.py (signup-time-only, one-shot
seeding). Extracted here so the same derivation logic can also be called
on-demand from POST /privacy/jurisdictions/resolve (self-service picker),
the mobile Privacy Catalog's assign action, and the monthly auto-renew job —
privacy_seeder.py now imports from this module instead of duplicating it.

Two layers, merged by resolve_jurisdictions():
  1. Baseline floor — derive_jurisdiction_ids(): the small, hardcoded
     country -> federal/state jurisdiction map (FERPA/COPPA/CCPA-CA/GDPR/etc.),
     verified against backend/config/jurisdictions/*.json or compliance_rules.
  2. Catalog layer — privacy_catalog_service.find_catalog_matches(): anything
     ever discovered or admin-added for this country/subdivision/region,
     including state-specific laws and previously-auto-discovered countries.
     This is what makes "if it's in the DB, apply it automatically" true.
  3. Gap path — if neither layer has anything beyond an empty baseline,
     privacy_discovery_service.discover_and_store_jurisdiction() is invoked to
     synthesize a new entry (the "system finds it, teacher never authors legal
     content" design), which is then included and returned like any other match.
"""

from __future__ import annotations

import json
import logging
import os
from typing import List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ── EU country codes (ISO 3166-1 alpha-2) ─────────────────────────────────────
EU_COUNTRIES = frozenset([
    'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI',
    'FR','GR','HR','HU','IE','IT','LT','LU','LV','MT',
    'NL','PL','PT','RO','SE','SI','SK',
])

# ── Path to jurisdiction config files ─────────────────────────────────────────
_CONFIG_DIR = os.path.join(os.path.dirname(__file__), '..', 'config', 'jurisdictions')

# ── Minimal FERPA config (created on first import if absent) ──────────────────
_FERPA_CONFIG = {
    "jurisdiction_id":  "ferpa_us",
    "jurisdiction_name": "United States - Family Educational Rights and Privacy Act (FERPA)",
    "name":             "FERPA",
    "full_name":        "Family Educational Rights and Privacy Act",
    "country_code":     "US",
    "subdivision_code": None,
    "applies_to":       ["school", "district"],
    "framework":        "ferpa",
    "max_retention_days": 365,
    "encryption_required": True,
    "student_data_sharing_allowed": False,
    "description":      (
        "FERPA protects the privacy of student education records at "
        "institutions receiving federal funding. Grants parents/eligible "
        "students the right to access and correct records."
    ),
    "key_requirements": [
        "Annual notification of FERPA rights",
        "Written consent before disclosing PII from education records",
        "Right to review and request amendment of records",
        "Directory information policy",
    ],
    "data_categories_covered": ["education_records", "student_pii", "academic_performance"],
    "ai_student_permitted": True,
    "ai_teacher_permitted": True,
}


def _ensure_ferpa_config() -> None:
    """Create a minimal ferpa_us.json if it does not exist."""
    path = os.path.join(_CONFIG_DIR, 'ferpa_us.json')
    if not os.path.exists(path):
        try:
            os.makedirs(_CONFIG_DIR, exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(_FERPA_CONFIG, f, indent=2)
            logger.info("[privacy_jurisdiction_resolver] Created minimal ferpa_us.json")
        except OSError as e:
            logger.warning(f"[privacy_jurisdiction_resolver] Could not write ferpa_us.json: {e}")


_ensure_ferpa_config()


def config_exists(jurisdiction_id: str) -> bool:
    """Return True if a config JSON file exists for this jurisdiction_id."""
    path = os.path.join(_CONFIG_DIR, f'{jurisdiction_id}.json')
    return os.path.exists(path)


async def rule_exists(db: AsyncSession, jurisdiction_id: str) -> bool:
    """Return True if any compliance_rule references this jurisdiction_id."""
    try:
        row = (await db.execute(
            text("SELECT 1 FROM compliance_rules WHERE jurisdiction = :jid LIMIT 1"),
            {"jid": jurisdiction_id},
        )).first()
        return row is not None
    except Exception:
        return False


async def verify_jurisdictions(db: AsyncSession, ids: List[str]) -> List[str]:
    """
    Filter the list to only jurisdiction IDs that have a config file OR
    a compliance_rule row. Unknown IDs are logged and dropped.
    """
    verified = []
    for jid in ids:
        if config_exists(jid):
            verified.append(jid)
        elif await rule_exists(db, jid):
            verified.append(jid)
        else:
            logger.warning(
                f"[privacy_jurisdiction_resolver] Jurisdiction '{jid}' not found in "
                f"config files or compliance_rules — skipping"
            )
    return verified


def derive_jurisdiction_ids(
    country_code:      Optional[str],
    subdivision_code:  Optional[str],
    has_under_13:      bool,
    org_type_v2:       Optional[str],
) -> List[str]:
    """
    Pure function — returns the list of applicable jurisdiction IDs given
    organisation attributes. Does NOT check whether the configs exist.
    """
    cc   = (country_code or '').upper()
    sub  = (subdivision_code or '').upper()   # e.g. 'US-CA'
    is_school = org_type_v2 in ('school', 'district', 'enterprise')
    ids: List[str] = []

    if cc == 'US':
        is_california = sub in ('US-CA', 'CA')
        if has_under_13:
            ids.append('coppa_us')
        if is_school:
            ids.append('ferpa_us')
        if is_california:
            ids.append('ccpa_california')

    elif cc == 'GB':
        ids.append('gdpr_eu')

    elif cc == 'CA':
        ids.append('pipeda_canada')

    elif cc == 'BR':
        ids.append('lgpd_brazil')

    elif cc == 'AU':
        ids.append('privacy_act_au')

    elif cc == 'SG':
        ids.append('pdpa_singapore')

    elif cc == 'ZA':
        ids.append('popia_za')

    elif cc == 'MX':
        ids.append('lpdc_mx')

    elif cc == 'AR':
        ids.append('aepd_ar')

    elif cc in EU_COUNTRIES:
        ids.append('gdpr_eu')

    else:
        # No blanket default here — countries with a real known law (~147 of
        # the ~199 outside the explicit map above, per the IAPP data loaded
        # into privacy_source_registry) fall through to the catalog-match /
        # discovery pipeline in resolve_jurisdictions() so they resolve to
        # their ACTUAL law, not a generic label. The ~52 countries IAPP
        # confirmed have no privacy law at all are seeded directly into
        # privacy_regulation_catalog's gdpr_eu row (see
        # scripts/seed_no_legislation_countries_to_gdpr.py) so they're
        # caught by the catalog-match layer before ever reaching discovery.
        if has_under_13:
            ids.append('coppa_us')

    seen: set = set()
    return [x for x in ids if not (x in seen or seen.add(x))]  # type: ignore[func-returns-value]


async def is_org_owner(db: AsyncSession, org_id: str, user_id: str) -> bool:
    """Shared by routes/privacy.py and routes/privacy_catalog.py."""
    row = (await db.execute(
        text("SELECT 1 FROM organization_members WHERE org_id = :oid AND user_id = :uid AND role = 'owner'"),
        {"oid": org_id, "uid": user_id},
    )).first()
    return row is not None


async def get_org_type(db: AsyncSession, org_id: str) -> Optional[str]:
    """
    NOTE: returns None both when the org doesn't exist AND when it exists but
    org_type_v2 is NULL (a legitimate state for some orgs) -- callers that
    need to distinguish "not found" from "found, type unset" should use
    org_exists() instead, not treat this None as proof of non-existence.
    """
    row = (await db.execute(
        text("SELECT org_type_v2 FROM organizations WHERE id = :oid"), {"oid": org_id}
    )).first()
    return row[0] if row else None


async def org_exists(db: AsyncSession, org_id: str) -> bool:
    row = (await db.execute(text("SELECT 1 FROM organizations WHERE id = :oid"), {"oid": org_id})).first()
    return row is not None


async def is_institutional_org(db: AsyncSession, org_id: str) -> bool:
    org_type = await get_org_type(db, org_id)
    return (org_type or "") in ("school", "district", "enterprise")


async def merge_jurisdiction_ids(db: AsyncSession, org_id: str, new_ids: set[str]) -> List[str]:
    """Merge new_ids into organizations.privacy_jurisdiction_ids (never overwrites)."""
    import json as _json
    row = (await db.execute(
        text("SELECT privacy_jurisdiction_ids FROM organizations WHERE id = :oid"), {"oid": org_id}
    )).first()
    existing = set(row[0] or []) if row else set()
    merged = sorted(existing | new_ids)
    await db.execute(
        text("UPDATE organizations SET privacy_jurisdiction_ids = CAST(:ids AS JSONB), updated_at = NOW() WHERE id = :oid"),
        {"ids": _json.dumps(merged), "oid": org_id},
    )
    return merged


async def resolve_jurisdictions(
    db:               AsyncSession,
    country_code:     Optional[str],
    subdivision_code: Optional[str] = None,
    region:           Optional[str] = None,
    has_under_13:     bool = True,
    is_school:        bool = False,
) -> List[dict]:
    """
    Main on-demand resolution entry point (distinct from seed_privacy_jurisdictions(),
    which is the one-shot signup-time seeder in privacy_seeder.py).

    Returns a list of dicts: {jurisdiction_id, is_verified, discovery_method, source}
    where source is 'baseline' | 'catalog' | 'discovery'.
    """
    from services import privacy_catalog_service  # local import — avoid a cycle at module load

    org_type_v2 = 'school' if is_school else 'individual_teacher'
    baseline_ids = derive_jurisdiction_ids(country_code, subdivision_code, has_under_13, org_type_v2)
    verified_baseline = await verify_jurisdictions(db, baseline_ids)

    resolved: dict[str, dict] = {
        jid: {"jurisdiction_id": jid, "is_verified": True,
              "discovery_method": "seed", "source": "baseline"}
        for jid in verified_baseline
    }

    catalog_matches = await privacy_catalog_service.find_catalog_matches(
        db, country_code=country_code, subdivision_code=subdivision_code, region_text=region,
    )
    for m in catalog_matches:
        jid = m.get("jurisdiction_code")
        if not jid or jid in resolved:
            continue
        resolved[jid] = {
            "jurisdiction_id":   jid,
            "is_verified":       m.get("is_verified", True),
            "discovery_method":  m.get("discovery_method") or "admin_manual",
            "source":            "catalog",
            "short_name":        m.get("short_name"),
            "full_name":         m.get("full_name"),
        }

    if not resolved and country_code:
        from services import privacy_discovery_service
        discovered = await privacy_discovery_service.discover_and_store_jurisdiction(
            db, country_code=country_code, subdivision_code=subdivision_code, region=region,
        )
        if discovered:
            resolved[discovered["jurisdiction_id"]] = {**discovered, "source": "discovery"}

    return list(resolved.values())
