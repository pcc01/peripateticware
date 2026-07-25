# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
One-time seed: the ~52 countries the user-supplied IAPP directory export
confirmed have NO privacy legislation at all get a real privacy_regulation_
catalog entry pointing at gdpr_eu (GDPR as the most comprehensive available
baseline, applied because there's nothing more specific to apply -- not a
guess). This is deliberately narrower than defaulting every unmapped country
to GDPR: countries with a REAL known law (the other ~147 outside
JURISDICTION_MAP) still resolve to their actual law via the catalog-match /
discovery pipeline, since this script only touches the confirmed-no-law set.

Mechanism: find_catalog_matches() (privacy_catalog_service.py) matches on
country_codes containment, so one gdpr_eu catalog row listing all 52 codes
is enough -- privacy_regulation_catalog's UniqueConstraint(jurisdiction_code,
framework) means we can't have 52 separate gdpr_eu rows, only one with a
broad country_codes array.

Run once: docker exec peripateticware-backend python scripts/seed_no_legislation_countries_to_gdpr.py
Idempotent -- re-running recomputes and overwrites the same row's country_codes.
"""

import asyncio
import json
from datetime import datetime, timezone

import pycountry

from core.database import get_session_factory
from sqlalchemy import text

IAPP_DATA_PATH = "/app/scripts/iapp_directory_2026-07-25.json"

# Same overrides as load_iapp_directory.py, for the subset of these 52 names
# pycountry can't resolve directly.
NAME_OVERRIDES = {
    "Bolivia (Plurinational State of)": "BO",
    "Democratic People's Republic of Korea": "KP",
    "Iran (Islamic Republic of)": "IR",
    "Micronesia (Federated States of)": "FM",
    "Venezuela, Bolivarian Republic of": "VE",
    "Palestinian Territories": "PS",
    "US Virgin Islands": "VI",
    "Diego Garcia": None,                      # part of British Indian Ocean Territory, no own ISO code in scope
    "Heard Island and McDonald Islands": "HM",
    "South Georgia and the South Sandwich Islands": "GS",
    "Svalbard and Jan Mayen": "SJ",
    "Northern Mariana Islands": "MP",
}


def resolve_country_code(name: str) -> str | None:
    if name in NAME_OVERRIDES:
        return NAME_OVERRIDES[name]
    try:
        match = pycountry.countries.search_fuzzy(name)
        return match[0].alpha_2
    except LookupError:
        return None


async def main():
    with open(IAPP_DATA_PATH, encoding="utf-8") as f:
        entries = json.load(f)

    no_law = [e for e in entries if e.get("has_no_known_legislation")]

    codes: list[str] = []
    resolved_entries: list[dict] = []
    unresolved: list[str] = []
    for e in no_law:
        cc = resolve_country_code(e["country_name"])
        if cc:
            codes.append(cc)
            resolved_entries.append({**e, "country_code": cc})
        else:
            unresolved.append(e["country_name"])

    print(f"Resolved {len(codes)} of {len(no_law)} confirmed no-law countries to ISO codes")
    if unresolved:
        print(f"Unresolved (skipped): {unresolved}")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    factory = get_session_factory()

    async with factory() as db:
        # Fix a real, separate bug found while verifying this seed: the two
        # legacy catalog rows (US-COPPA, US/FERPA, seeded long before
        # country_codes existed as a column) have country_codes=NULL.
        # find_catalog_matches() treats a NULL country_codes as "matches any
        # country" (a reasonable default for a genuinely global framework),
        # which meant these two US-only rows were silently satisfying
        # resolve_jurisdictions()'s "did we find anything" check for EVERY
        # country -- discovery (and this GDPR seed) would never have been
        # reachable for ANY country without this fix.
        fixed = await db.execute(text("""
            UPDATE privacy_regulation_catalog
            SET country_codes = CAST('["US"]' AS JSONB)
            WHERE jurisdiction_code IN ('US-COPPA', 'US') AND country_codes IS NULL
        """))
        if fixed.rowcount:
            print(f"Fixed {fixed.rowcount} legacy catalog row(s) with NULL country_codes "
                  f"(were matching every country instead of just the US)")
        await db.commit()

        existing = (await db.execute(
            text("SELECT id, country_codes FROM privacy_regulation_catalog "
                 "WHERE jurisdiction_code = 'gdpr_eu' AND framework = 'gdpr'")
        )).first()

        if existing:
            existing_codes = set(existing[1] or [])
            merged_codes = sorted(existing_codes | set(codes))
            await db.execute(text("""
                UPDATE privacy_regulation_catalog
                SET country_codes = CAST(:codes AS JSONB), updated_at = :now
                WHERE id = :id
            """), {"codes": json.dumps(merged_codes), "now": now, "id": existing[0]})
            print(f"Updated existing gdpr_eu catalog row: {len(merged_codes)} total country codes")
        else:
            await db.execute(text("""
                INSERT INTO privacy_regulation_catalog
                    (id, short_name, full_name, jurisdiction_code, framework,
                     region, country_codes, summary, is_child_safety, is_featured,
                     is_active, is_verified, discovery_method, added_by_role,
                     created_at, updated_at)
                VALUES
                    (gen_random_uuid(), 'GDPR', 'EU General Data Protection Regulation',
                     'gdpr_eu', 'gdpr', NULL, CAST(:codes AS JSONB),
                     'Applied as the most comprehensive available privacy baseline for '
                     'countries with no privacy legislation of their own on record.',
                     FALSE, FALSE, TRUE, TRUE, 'seed', 'system_seed', :now, :now)
            """), {"codes": json.dumps(codes), "now": now})
            print(f"Created gdpr_eu catalog row with {len(codes)} country codes")

        await db.commit()

        # ── Per-country tracking rows in privacy_source_registry ────────────────
        # Distinct from the shared gdpr_eu catalog row above (which is what
        # actually drives resolution): these give the monthly auto-renew job
        # something to re-check per country, so a country that later enacts a
        # real law gets "promoted" out of the GDPR default instead of silently
        # defaulting to GDPR forever. source_url stays NULL -- there's no
        # official source to fetch since none exists yet, and a NULL
        # source_url is already correctly treated as "nothing here" by
        # privacy_discovery_service._lookup_source_registry, so these rows
        # don't affect normal resolution at all.
        inserted, updated = 0, 0
        for e in resolved_entries:
            cc = e["country_code"]
            existing_row = (await db.execute(
                text("SELECT id FROM privacy_source_registry WHERE country_code = :cc"),
                {"cc": cc},
            )).first()
            if existing_row:
                await db.execute(text("""
                    UPDATE privacy_source_registry
                    SET has_no_known_legislation = TRUE, fetched_at = :now, updated_at = :now
                    WHERE country_code = :cc
                """), {"cc": cc, "now": now})
                updated += 1
            else:
                await db.execute(text("""
                    INSERT INTO privacy_source_registry
                        (id, country_code, country_name, has_no_known_legislation,
                         is_verified, fetched_at, notes, created_at, updated_at)
                    VALUES
                        (gen_random_uuid(), :cc, :name, TRUE,
                         TRUE, :now, 'No known legislation per user-supplied IAPP directory export, 2026-07-25',
                         :now, :now)
                """), {"cc": cc, "name": e["country_name"], "now": now})
                inserted += 1
        await db.commit()
        print(f"privacy_source_registry tracking rows: {inserted} inserted, {updated} updated")


if __name__ == "__main__":
    asyncio.run(main())
