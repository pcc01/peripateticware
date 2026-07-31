# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Bulk-ingest a state's official academic standards document (PDF/CSV/XLSX)
into a global StandardsSet, reusing the exact same document_parser ->
standards_parser (AI extraction) pipeline the teacher-facing upload wizard
uses (routes/standards.py) -- no CASE API dependency, no Rosetta Exchange
fee. See PRD-standards-alignment-engine-2026-07-31_1.md #13/#3: CASE
deferred for Phase 1, direct state sources only.

Why this exists rather than just calling POST /api/v1/standards/upload
per state by hand: standards_parser.extract_criteria() truncates input to
max_chars (12000) per call -- a single call against a 100+ page official
PDF only ever sees the first slice (often front matter/TOC, not standards
content) and the LLM frequently can't produce clean structured JSON from
it. This script chunks the document by page batches sized to stay under
that limit, runs extraction per chunk, and merges the results -- the same
approach a human clicking "upload" repeatedly per section would take,
automated.

Usage:
  docker exec peripateticware-backend python scripts/ingest_state_standards.py \\
      --file /path/to/doc.pdf --state WA --subject math \\
      --name "Washington K-12 Math Learning Standards 2026" \\
      --owner-email teacher@example.com

  Add --dry-run to extract and print without saving to the database.

Idempotent: re-running with the same file (same SHA-256) is a no-op if a
StandardsSet with that checksum already exists.

Provenance note (matches scripts/seed_us_state_privacy_laws.py's own
disclaimer style): this script does NOT verify the source document is
current or authoritative -- that's the caller's job (confirm the URL and
version before running). It only automates parsing + AI extraction of
whatever document it's given.
"""

import argparse
import asyncio
import hashlib
import os
from datetime import date, datetime


def _default_valid_until() -> date:
    today = date.today()
    candidate = date(today.year, 7, 31)
    return candidate if candidate >= today else date(today.year + 1, 7, 31)


async def ingest(
    file_path: str,
    state: str,
    subject: str,
    name: str,
    owner_email: str,
    pages_per_chunk: int = 12,
    dry_run: bool = False,
    publish: bool = False,
) -> list[dict]:
    from services.document_parser import parse_document
    from services.standards_parser import extract_criteria

    with open(file_path, "rb") as f:
        file_bytes = f.read()
    checksum = hashlib.sha256(file_bytes).hexdigest()

    from core.database import get_session_factory
    from models.database import StandardsSet
    from models.user import User
    from sqlalchemy import select

    factory = get_session_factory()

    # Cache check up front — skip re-parsing/re-extracting entirely on a
    # repeat run of the same file, mirroring routes/standards.py's checksum gate.
    async with factory() as db:
        existing = (await db.execute(
            select(StandardsSet).where(StandardsSet.source_checksum == checksum)
        )).scalar_one_or_none()
        if existing and not dry_run:
            print(f"Already ingested (checksum match): StandardsSet {existing.id} "
                  f"({len(existing.criteria or [])} criteria). Skipping.")
            return existing.criteria or []

    filename = os.path.basename(file_path)
    parsed = await parse_document(file_bytes, filename, None)
    print(f"Parsed via {parsed.method}: {parsed.page_count} pages, {len(parsed.text)} chars")
    if parsed.warnings:
        for w in parsed.warnings:
            print(f"  warning: {w}")

    pages = parsed.pages if parsed.pages else [parsed.text]
    all_criteria: list[dict] = []
    seen_ids: set[str] = set()

    for i in range(0, len(pages), pages_per_chunk):
        chunk_pages = pages[i:i + pages_per_chunk]
        chunk_text = "\n\n".join(p for p in chunk_pages if p)
        chunk_label = f"pages {i + 1}-{i + len(chunk_pages)}"
        if not chunk_text.strip():
            print(f"  {chunk_label}: no extractable text, skipping")
            continue

        criteria, error = await extract_criteria(
            chunk_text, set_type="state_standards", name=f"{name} ({subject}, {chunk_label})"
        )
        if error:
            print(f"  {chunk_label}: {error}")
            continue

        added = 0
        for c in criteria:
            cid = c["id"]
            if cid in seen_ids:
                # De-dupe collisions from repeated generic IDs across chunks
                # (e.g. "state_standards-criterion-1") rather than dropping
                # real content the model just didn't give a unique code to.
                cid = f"{cid}-p{i + 1}"
                c["id"] = cid
            seen_ids.add(cid)
            all_criteria.append(c)
            added += 1
        print(f"  {chunk_label}: {added} criteria")

    print(f"\nTotal criteria extracted: {len(all_criteria)}")

    if dry_run:
        return all_criteria

    async with factory() as db:
        owner = (await db.execute(
            select(User).where(User.email == owner_email)
        )).scalar_one_or_none()
        if not owner:
            raise SystemExit(f"No user found with email {owner_email!r} — pass an existing account's email.")

        new_set = StandardsSet(
            name=name,
            description=f"AI-extracted from an official {state.upper()} {subject} standards document "
                         f"(source: {filename}). Not CASE-sourced — see ingest_state_standards.py. "
                         f"DRAFT: unreviewed AI extraction, not verified against the source document.",
            type="state_standards",
            owner_id=owner.id,
            state_code=state.upper(),
            # Saved private (is_global=False) by default — invisible to
            # teachers, same as any personal set — until a human reviews the
            # extracted criteria and explicitly publishes it (--publish).
            # AI extraction of normative compliance content can silently
            # produce garbage (confirmed: a degenerate repetition-loop chunk
            # on the WA pilot run) that only a human reading the output would
            # catch — never skip the review step for this data.
            is_global=publish,
            source_checksum=checksum,
            processing_status="complete" if all_criteria else "failed",
            last_processed_at=datetime.utcnow(),
            valid_until=_default_valid_until(),
            criteria=all_criteria,
        )
        db.add(new_set)
        await db.commit()
        await db.refresh(new_set)
        status = "PUBLISHED (is_global=true)" if publish else "DRAFT (is_global=false, pending review)"
        print(f"Saved StandardsSet {new_set.id} ({state.upper()}, {subject}, {len(all_criteria)} criteria) — {status}")

    return all_criteria


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", required=True, help="Path to the source PDF/CSV/XLSX (inside the container)")
    ap.add_argument("--state", required=True, help="Two-letter state postal code, e.g. WA")
    ap.add_argument("--subject", required=True, help="Subject label, e.g. math, ela, science")
    ap.add_argument("--name", required=True, help="StandardsSet display name")
    ap.add_argument("--owner-email", required=True, help="Existing user account to own the saved set")
    ap.add_argument("--pages-per-chunk", type=int, default=12,
                     help="PDF pages per extraction call (default 12, tuned to stay under extract_criteria's 12000-char cap)")
    ap.add_argument("--dry-run", action="store_true", help="Extract and print only; don't save")
    ap.add_argument("--publish", action="store_true",
                     help="Save as is_global=true (live/shared) instead of the default private draft. "
                          "Only use after a human has reviewed the extracted criteria.")
    args = ap.parse_args()

    criteria = asyncio.run(ingest(
        file_path=args.file,
        state=args.state,
        subject=args.subject,
        name=args.name,
        owner_email=args.owner_email,
        pages_per_chunk=args.pages_per_chunk,
        dry_run=args.dry_run,
        publish=args.publish,
    ))

    if args.dry_run:
        import json
        print(json.dumps(criteria, indent=2))


if __name__ == "__main__":
    main()
