# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
One-time bulk loader: takes the parsed IAPP Global Privacy Directory JSON
(iapp_parsed_tmp.json, produced by a one-off Node parser against a Google-Docs
export the user supplied directly -- NOT an ongoing scrape of iapp.org) and
upserts rows into privacy_source_registry, keyed by ISO 3166-1 alpha-2
country_code (resolved via pycountry from the directory's country names).

Run once: docker exec peripateticware-backend python scripts/load_iapp_directory.py
Idempotent -- re-running updates existing rows (ON CONFLICT country_code DO UPDATE).
"""

import asyncio
import json
import sys
from datetime import datetime, timezone

import pycountry

sys.path.insert(0, '/app')

from core.database import get_session_factory
from sqlalchemy import text

INPUT_PATH = "/app/scripts/iapp_directory_2026-07-25.json"

# Manual overrides for names pycountry can't resolve directly (historical
# names, territories without their own ISO code, IAPP's own phrasing quirks).
NAME_OVERRIDES = {
    "Bolivia (Plurinational State of)": "BO",
    "Gambia (Republic of The)": "GM",
    "Democratic People's Republic of Korea": "KP",
    "Democratic Republic of the Congo": "CD",
    "Lao People's Democratic Republic": "LA",
    "Lao People’s Democratic Republic": "LA",
    "Eswatini (Swaziland)": "SZ",
    "Iran (Islamic Republic of)": "IR",
    "Russian Federation": "RU",
    "Republic of Korea": "KR",
    "South Korea": "KR",
    "Syrian Arab Republic": "SY",
    "United Republic of Tanzania": "TZ",
    "Venezuela (Bolivarian Republic of)": "VE",
    "Viet Nam": "VN",
    "Micronesia (Federated States of)": "FM",
    "Côte d’Ivoire": "CI",
    "Cote d'Ivoire": "CI",
    "Czechia": "CZ",
    "Cabo Verde": "CV",
    "Türkiye": "TR",
    "Turkiye": "TR",
    "Hong Kong": "HK",
    "Macao": "MO",
    "Macau": "MO",
    "Palestine, State of": "PS",
    "Brunei Darussalam": "BN",
    "Moldova (Republic of)": "MD",
    "European Union": None,   # not a country -- handled separately, not inserted here
    "Kosovo": "XK",           # user-assigned code, not formal ISO-3166 but widely used
    "Cook Islands": "CK",
    "Sint Maarten (Dutch part)": "SX",
    "Saint Martin (French part)": "MF",
    "Bonaire, Sint Eustatius and Saba": "BQ",
    "Netherlands (Kingdom of the)": "NL",
    "Palestinian Territories": "PS",
    "US Virgin Islands": "VI",
}

# Territories with no meaningful independent privacy law of their own --
# skip rather than force a guess (avoids a wrong/misleading ISO mapping).
SKIP_NAMES = {
    "Diego Garcia", "Heard Island and McDonald Islands", "French Southern Territories",
    "Åland Islands",  # part of Finland's jurisdiction; not its own ISO entry beyond AX which pycountry does have -- handled below if resolvable
}


def resolve_country_code(name: str) -> str | None:
    if name in SKIP_NAMES:
        return None
    if name in NAME_OVERRIDES:
        return NAME_OVERRIDES[name]
    try:
        match = pycountry.countries.search_fuzzy(name)
        return match[0].alpha_2
    except LookupError:
        return None


async def main():
    with open(INPUT_PATH, encoding="utf-8") as f:
        entries = json.load(f)

    resolved = []
    unresolved = []
    for e in entries:
        cc = resolve_country_code(e["country_name"])
        if cc:
            resolved.append((cc, e))
        elif e["country_name"] not in SKIP_NAMES:
            unresolved.append(e["country_name"])

    print(f"Resolved {len(resolved)} of {len(entries)} country names to ISO codes")
    if unresolved:
        print(f"Unresolved ({len(unresolved)}): {unresolved}")

    factory = get_session_factory()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    inserted, updated = 0, 0

    async with factory() as db:
        for cc, e in resolved:
            if e.get("has_no_known_legislation"):
                continue  # nothing useful to store -- Tier 3 recall-only will handle these
            source_url = e.get("law_url") or e.get("regulator_url")
            if not source_url:
                continue

            existing = (await db.execute(
                text("SELECT id FROM privacy_source_registry WHERE country_code = :cc"),
                {"cc": cc},
            )).first()

            params = {
                "cc": cc,
                "country_name": e["country_name"],
                "regulator_name": e.get("regulator_name"),
                "law_name": e.get("law_name"),
                "source_url": source_url,
                "iapp_detail_url": None,
                "framework_guess": None,
                "fetched_at": now,
                "notes": "Bulk-loaded from user-supplied IAPP Global Privacy Directory export (one-time, not an ongoing crawl).",
                "now": now,
            }

            if existing:
                await db.execute(text("""
                    UPDATE privacy_source_registry
                    SET country_name = :country_name, regulator_name = :regulator_name,
                        law_name = :law_name, source_url = :source_url,
                        fetched_at = :fetched_at, notes = :notes, updated_at = :now
                    WHERE country_code = :cc
                """), params)
                updated += 1
            else:
                await db.execute(text("""
                    INSERT INTO privacy_source_registry
                        (id, country_code, country_name, regulator_name, law_name,
                         source_url, iapp_detail_url, framework_guess, is_verified,
                         fetched_at, notes, created_at, updated_at)
                    VALUES
                        (gen_random_uuid(), :cc, :country_name, :regulator_name, :law_name,
                         :source_url, :iapp_detail_url, :framework_guess, FALSE,
                         :fetched_at, :notes, :now, :now)
                """), params)
                inserted += 1

        await db.commit()

    print(f"Inserted {inserted}, updated {updated} rows in privacy_source_registry")


if __name__ == "__main__":
    asyncio.run(main())
