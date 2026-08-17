#!/usr/bin/env python3
# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
ingest_case_standards.py
=========================
One-time (re-runnable) pull of CASE-format academic standards from Satchel
Rosetta Exchange member agencies that publish their own CASE server -- see
backend/config/case_standards_sources.json for the source registry and how it
was compiled.

Seeds `jurisdictions` and `standards_sources`, then for every source with
status "open" walks the standard CASE 1.0/1.1 REST binding:
    GET {base_url}/ims/case/v1p1/CFDocuments           (paginated, ?limit=&offset=)
    GET {base_url}/ims/case/v1p1/CFPackages/{doc_id}   (full framework: document + items + associations)
and upserts into standards_frameworks / standards_items / standards_associations,
keyed on the CASE GUID (never re-minted -- see model docstrings in
backend/models/database.py). Re-running is safe: unchanged upstream rows are
left alone; changed ones are updated in place (a lightweight version of the
diff described in PRD-standards-alignment-engine-2026-07-31_1.md §8 -- full
standards_item_revisions change-log writing is not implemented here).

Sources with status "pending_registration" or "rosetta_managed" are skipped
(logged, not fetched) -- they need registration with Common Good Learning
Tools (support@commongoodlt.com) before any bulk pull is possible; this
script only exercises the free, no-registration path.

Run (mirrors apply_ai_routing_tables.py's convention):
    docker cp backend/scripts/ingest_case_standards.py peripateticware-backend:/app/ingest_case_standards.py
    docker cp backend/config/case_standards_sources.json peripateticware-backend:/app/case_standards_sources.json
    docker exec peripateticware-backend python /app/ingest_case_standards.py

Or locally with DATABASE_URL pointed at a reachable Postgres:
    cd backend && python scripts/ingest_case_standards.py [--source-file PATH] [--only KEY,KEY,...]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/ on sys.path, matches other backend/scripts/*.py

from core.database import get_session_factory  # noqa: E402
from models.database import (  # noqa: E402
    Jurisdiction,
    StandardsSource,
    StandardsFramework,
    StandardsItem,
    StandardsAssociation,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("ingest_case_standards")

DEFAULT_SOURCE_FILE = Path(__file__).resolve().parent.parent / "config" / "case_standards_sources.json"
CASE_API_VERSIONS = ("ims/case/v1p1", "ims/case/v1p0")  # try v1.1 first, fall back to v1.0 (e.g. case.nd.gov only serves v1p0)
PAGE_SIZE = 100
HTTP_TIMEOUT = 30.0


# ── seed registry loading ───────────────────────────────────────────────────

def load_registry(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


async def seed_jurisdictions(db, registry: dict) -> dict[str, Jurisdiction]:
    """Upsert jurisdictions rows keyed by the registry's local 'key'. Returns key -> ORM row."""
    by_key: dict[str, Jurisdiction] = {}
    rows = registry["jurisdictions"]
    # two passes: rows first (so parent_id FK resolves), then wire up parent_id
    for row in rows:
        existing = (
            await db.execute(
                select(Jurisdiction).where(
                    Jurisdiction.country_code == row["country_code"],
                    Jurisdiction.external_ref == row["external_ref"],
                )
            )
        ).scalar_one_or_none()
        if existing:
            j = existing
        else:
            j = Jurisdiction(
                country_code=row["country_code"],
                subdivision_code=row["subdivision_code"],
                level=row["level"],
                name=row["name"],
                name_local=row.get("name_local") or row["name"],
                is_issuing_agency=row.get("is_issuing_agency", False),
                external_ref=row["external_ref"],
            )
            db.add(j)
            await db.flush()  # get j.id without a full commit
        by_key[row["key"]] = j

    for row in rows:
        if row["parent_key"]:
            by_key[row["key"]].parent_id = by_key[row["parent_key"]].id

    await db.commit()
    log.info("Seeded %d jurisdictions", len(by_key))
    return by_key


async def seed_sources(db, registry: dict, jurisdictions: dict[str, Jurisdiction]) -> list[StandardsSource]:
    sources: list[StandardsSource] = []
    for row in registry["sources"]:
        existing = (
            await db.execute(select(StandardsSource).where(StandardsSource.name == row["name"]))
        ).scalar_one_or_none()
        if existing:
            src = existing
            src.base_url = row["base_url"]
            # "pending_registration"/"rosetta_managed" are static classifications from
            # the registry -- always resync those. "open" is just "eligible to try";
            # don't clobber an existing row's real last-run outcome (ok/error/open)
            # with the registry default every time the script reseeds.
            if row["status"] != "open":
                src.last_status = row["status"]
        else:
            src = StandardsSource(
                name=row["name"],
                source_type="case_api",
                base_url=row["base_url"],
                jurisdiction_id=jurisdictions[row["jurisdiction_key"]].id,
                is_authoritative=row.get("is_authoritative", True),
                last_status=row["status"],
            )
            db.add(src)
        sources.append(src)
    await db.commit()
    log.info("Seeded %d standards_sources", len(sources))
    return sources


# ── CASE REST client ─────────────────────────────────────────────────────────

async def _detect_api_version(client: httpx.AsyncClient, base_url: str) -> str:
    """Most agencies serve CASE v1.1; some (e.g. case.nd.gov) only serve v1.0.
    Probe once per source and use whichever responds."""
    for api_path in CASE_API_VERSIONS:
        url = f"{base_url.rstrip('/')}/{api_path}/CFDocuments"
        r = await client.get(url, params={"limit": 1}, timeout=HTTP_TIMEOUT)
        if r.status_code != 404:
            return api_path
    raise RuntimeError(f"No working CASE API version found at {base_url} (tried {CASE_API_VERSIONS})")


async def fetch_cf_documents(client: httpx.AsyncClient, base_url: str, api_path: str) -> list[dict]:
    """GET {base_url}/{api_path}/CFDocuments, paginated via limit/offset."""
    docs: list[dict] = []
    offset = 0
    while True:
        url = f"{base_url.rstrip('/')}/{api_path}/CFDocuments"
        r = await client.get(url, params={"limit": PAGE_SIZE, "offset": offset}, timeout=HTTP_TIMEOUT)
        r.raise_for_status()
        body = r.json()
        # most agencies wrap the list as {"CFDocuments": [...]}; at least one
        # (Texas TEKS) returns a bare JSON array instead
        page = body if isinstance(body, list) else body.get("CFDocuments", [])
        docs.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return docs


async def fetch_cf_package(client: httpx.AsyncClient, base_url: str, api_path: str, doc_id: str) -> Optional[dict]:
    url = f"{base_url.rstrip('/')}/{api_path}/CFPackages/{doc_id}"
    r = await client.get(url, timeout=HTTP_TIMEOUT)
    if r.status_code == 404:
        log.warning("  CFPackage 404 for %s (skipping)", doc_id)
        return None
    r.raise_for_status()
    return r.json()


# ── upsert ────────────────────────────────────────────────────────────────

def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    """CASE JSON carries timestamps as ISO-8601 strings (with UTC offset);
    DateTime columns here are naive (TIMESTAMP WITHOUT TIME ZONE, matching the
    rest of this codebase's datetime.utcnow() convention) -- asyncpg rejects a
    tz-aware value against a naive column, so normalize to UTC and drop tzinfo."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            from datetime import timezone
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except ValueError:
        log.warning("  unparseable timestamp %r, storing as null", value)
        return None


async def upsert_framework(db, source: StandardsSource, jurisdiction_id, cf_doc: dict, package: dict) -> StandardsFramework:
    # CASE GUIDs come back as plain strings; the PK columns are typed UUID, and
    # mixing str with real uuid.UUID objects in the same flush breaks
    # SQLAlchemy's unit-of-work sort ("not supported between str and UUID").
    # Convert once, at the boundary, and use UUID objects everywhere after.
    doc_id = uuid.UUID(cf_doc["identifier"])
    existing = await db.get(StandardsFramework, doc_id)
    subject = cf_doc.get("subject")
    if isinstance(subject, list):
        subject = subject[0] if subject else None

    if existing:
        fw = existing
    else:
        fw = StandardsFramework(id=doc_id, source_id=source.id)
        db.add(fw)

    fw.jurisdiction_id = jurisdiction_id
    fw.title = cf_doc.get("title", "")[:500]
    fw.subject = subject
    fw.version = cf_doc.get("version")  # not present in every agency's CFDocument; fine to be null
    fw.adoption_status = cf_doc.get("adoptionStatus")
    fw.official_source_url = cf_doc.get("officialSourceURL") or cf_doc.get("uri", "")
    fw.case_uri = cf_doc.get("uri")
    fw.last_change_datetime = _parse_dt(cf_doc.get("lastChangeDateTime"))
    fw.raw = cf_doc
    await db.flush()

    cf_items = package.get("CFItems", [])
    id_map: dict[str, uuid.UUID] = {}
    for item in cf_items:
        item_id = uuid.UUID(item["identifier"])
        id_map[item["identifier"]] = item_id
        existing_item = await db.get(StandardsItem, item_id)
        if existing_item:
            it = existing_item
        else:
            it = StandardsItem(id=item_id, framework_id=fw.id)
            db.add(it)
        it.framework_id = fw.id
        it.human_coding_scheme = item.get("humanCodingScheme")
        it.full_statement = item.get("fullStatement", "")
        levels = item.get("educationLevel")
        it.education_levels = levels if isinstance(levels, list) else ([levels] if levels else None)
        it.item_type = item.get("CFItemType")
        it.list_enumeration = item.get("listEnumeration")
        it.last_change_datetime = _parse_dt(item.get("lastChangeDateTime"))
        it.raw = item
    await db.flush()

    # associations: use isChildOf to set parent_id (denormalized), keep the rest as rows
    assocs = package.get("CFAssociations", [])
    for assoc in assocs:
        origin_str = assoc.get("originNodeURI", {}).get("identifier") if isinstance(assoc.get("originNodeURI"), dict) else assoc.get("originNodeURI")
        dest_str = assoc.get("destinationNodeURI", {}).get("identifier") if isinstance(assoc.get("destinationNodeURI"), dict) else assoc.get("destinationNodeURI")
        assoc_type = assoc.get("associationType", "")
        if not origin_str or not dest_str:
            continue
        origin = uuid.UUID(origin_str)
        dest = uuid.UUID(dest_str)
        if assoc_type == "isChildOf" and origin_str in id_map and dest_str in id_map:
            child = await db.get(StandardsItem, origin)
            if child:
                child.parent_id = dest

        existing_assoc = (
            await db.execute(
                select(StandardsAssociation).where(
                    StandardsAssociation.framework_id == fw.id,
                    StandardsAssociation.origin_item_id == origin,
                    StandardsAssociation.destination_item_id == dest,
                    StandardsAssociation.association_type == assoc_type,
                )
            )
        ).scalar_one_or_none()
        if not existing_assoc:
            db.add(StandardsAssociation(
                framework_id=fw.id,
                origin_item_id=origin,
                destination_item_id=dest,
                association_type=assoc_type,
                raw=assoc,
            ))

    return fw


# ── driver ────────────────────────────────────────────────────────────────

async def ingest_source(session_factory, client: httpx.AsyncClient, source_id, source_name: str,
                         base_url: str, jurisdiction_id, only_titles: Optional[set[str]]) -> None:
    """
    Each framework gets its own short-lived session. A bad record (e.g. a data
    shape variant that trips an upsert) only rolls back its own transaction --
    it can't leave a shared session's connection in a broken state and cascade
    into every framework after it (that's what happened before this was split
    out: one DataError mid-flush poisoned the rest of the run).
    """
    log.info("Fetching CFDocuments from %s (%s)", source_name, base_url)
    try:
        api_path = await _detect_api_version(client, base_url)
        if api_path != CASE_API_VERSIONS[0]:
            log.info("  %s only serves %s (not %s)", source_name, api_path, CASE_API_VERSIONS[0])
        docs = await fetch_cf_documents(client, base_url, api_path)
    except Exception as e:
        log.error("  FAILED listing CFDocuments for %s: %s", source_name, e)
        async with session_factory() as db:
            src = await db.get(StandardsSource, source_id)
            src.last_status = f"error: {e}"
            await db.commit()
        return

    log.info("  %d CFDocuments listed", len(docs))
    n_ok = 0
    for cf_doc in docs:
        title = cf_doc.get("title", "")
        if only_titles and not any(t.lower() in title.lower() for t in only_titles):
            continue
        doc_id = cf_doc["identifier"]
        try:
            package = await fetch_cf_package(client, base_url, api_path, doc_id)
            if package is None:
                continue
            cf_document = package.get("CFDocument", cf_doc)
            async with session_factory() as db:
                source = await db.get(StandardsSource, source_id)
                await upsert_framework(db, source, jurisdiction_id, cf_document, package)
                await db.commit()
            n_ok += 1
            log.info("  + %s (%d items)", title, len(package.get("CFItems", [])))
        except Exception as e:
            log.error("  FAILED %s: %s", title, e)

    async with session_factory() as db:
        src = await db.get(StandardsSource, source_id)
        src.last_status = "ok"
        await db.commit()
    log.info("  done: %d/%d frameworks ingested from %s", n_ok, len(docs), source_name)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-file", type=Path, default=DEFAULT_SOURCE_FILE)
    parser.add_argument("--only", type=str, default=None,
                         help="Comma-separated jurisdiction/source external_ref codes to limit to, e.g. ID,GA,TX")
    parser.add_argument("--subject-contains", type=str, default=None,
                         help="Only ingest frameworks whose title contains this substring (case-insensitive), e.g. Math")
    args = parser.parse_args()

    registry = load_registry(args.source_file)
    only_codes = set(c.strip().upper() for c in args.only.split(",")) if args.only else None
    only_titles = {args.subject_contains} if args.subject_contains else None
    session_factory = get_session_factory()

    async with session_factory() as db:
        jurisdictions = await seed_jurisdictions(db, registry)
        sources = await seed_sources(db, registry, jurisdictions)

        # "open"/"pending_registration"/"rosetta_managed" is the registry's static
        # classification (does this source have a free, direct CASE endpoint at
        # all?) -- distinct from src.last_status, which now tracks the actual
        # outcome of the last ingest attempt (ok/error/open-not-yet-tried) and
        # must not be used to decide eligibility, or a source that errored once
        # would be silently excluded from every future run.
        registry_status = {row["name"]: row["status"] for row in registry["sources"]}
        openable = [s for s in sources if registry_status.get(s.name) == "open"]
        skipped = [s for s in sources if registry_status.get(s.name) != "open"]
        for s in skipped:
            log.info("SKIP (%s): %s -- see notes in %s", registry_status.get(s.name), s.name, args.source_file.name)

        if only_codes:
            # keep sources whose jurisdiction's external_ref is in only_codes
            code_by_jid = {j.id: j.external_ref for j in jurisdictions.values()}
            openable = [s for s in openable if code_by_jid.get(s.jurisdiction_id) in only_codes]

        log.info("Ingesting %d open sources%s", len(openable),
                 f" (filtered to {sorted(only_codes)})" if only_codes else "")

        # pull out plain values before the seeding session closes (ORM objects
        # would otherwise be detached once we leave this `async with` block)
        to_ingest = [(s.id, s.name, s.base_url, s.jurisdiction_id) for s in openable]

    async with httpx.AsyncClient(headers={"Accept": "application/json"}) as client:
        for source_id, name, base_url, jurisdiction_id in to_ingest:
            await ingest_source(session_factory, client, source_id, name, base_url, jurisdiction_id, only_titles)

    log.info("Done.")


if __name__ == "__main__":
    asyncio.run(main())
