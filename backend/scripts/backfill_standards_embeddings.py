# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Backfill embeddings for standards_items into rag_documents.

scripts/ingest_case_standards.py populates jurisdictions/standards_frameworks/
standards_items/standards_associations, but never touches rag_documents — the
CASE-ingested graph has real data (hundreds of thousands of rows, once
multiple states/subjects are ingested) but none of it is embedded, so
/rag-retrieve's vector search has nothing to find for any CASE-sourced
standard. This script closes that gap.

Per PRD-graphrag-migration-2026-08-16.md §7.5 / §4.3: embeds
`human_coding_scheme + full_statement + ancestor path` (the parent chain
gives terse standards crucial context — a bare "A.1" means nothing alone)
and links each chunk to its exact standards_items row via
node_type='standards_item' / node_id=item.id, so graph-expansion retrieval
can walk from a vector-search hit to its parents/associations/aligned
content afterward.

Resumable: skips items already indexed (by node_id) at each run. Commits in
batches, so a crash partway through only loses the current in-flight batch,
not the whole run. Safe to re-run — re-indexing an already-embedded item is
avoided, not just harmless.

Usage:
    python scripts/backfill_standards_embeddings.py --framework-id <uuid>
    python scripts/backfill_standards_embeddings.py --jurisdiction GA --limit 500
    python scripts/backfill_standards_embeddings.py --all              # full backfill — slow/costly, see plan doc §9

This embeds via whatever EMBEDDING_PROVIDER is configured (core/config.py) —
same provider-agnostic path as everything else in services/embedding_service.py.
"""

from __future__ import annotations

import argparse
import asyncio
import json as _json
import logging
import sys
import time
from pathlib import Path
from typing import Optional
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # noqa: E402

from sqlalchemy import select, text as _t  # noqa: E402

from core.database import get_session_factory  # noqa: E402
from models.database import StandardsItem, StandardsFramework, Jurisdiction  # noqa: E402
from services.embedding_service import embed_text  # noqa: E402
from services.rag_store import indexed_node_ids  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("backfill_standards_embeddings")

BATCH_SIZE = 50
NODE_TYPE = "standards_item"
DEFAULT_CONCURRENCY = 8


async def _ancestor_path(db, item: StandardsItem, cache: dict[UUID, Optional[StandardsItem]]) -> list[str]:
    """Walk parent_id up to the framework root, nearest-ancestor first.
    `cache` is shared across the whole run so a framework's shallow tree
    (most standards are 2-4 levels deep) only ever hits the DB once per
    node, not once per leaf that happens to share an ancestor."""
    path: list[str] = []
    current = item
    seen: set[UUID] = {item.id}
    while current.parent_id:
        if current.parent_id in cache:
            parent = cache[current.parent_id]
        else:
            parent = await db.get(StandardsItem, current.parent_id)
            cache[current.parent_id] = parent
        if not parent or parent.id in seen:
            break  # missing parent or a cycle — stop rather than loop forever
        label = parent.human_coding_scheme or parent.full_statement[:80]
        path.append(label)
        seen.add(parent.id)
        current = parent
    path.reverse()
    return path


def _chunk_text(item: StandardsItem, ancestors: list[str]) -> str:
    parts = []
    if ancestors:
        parts.append(" > ".join(ancestors))
    header = item.human_coding_scheme or ""
    body = item.full_statement or ""
    parts.append(f"{header} {body}".strip())
    return " — ".join(p for p in parts if p).strip()


async def _embed_one(sem: asyncio.Semaphore, item: StandardsItem, chunk_text: str) -> tuple[StandardsItem, str, Optional[list[float]], Optional[str]]:
    """Concurrency-gated embed call. Returns (item, chunk_text, embedding_or_None, error_or_None)."""
    async with sem:
        result = await embed_text(chunk_text)
        return item, chunk_text, result.get("embedding"), result.get("error")


async def run(
    *,
    framework_id: Optional[UUID],
    jurisdiction_ref: Optional[str],
    limit: Optional[int],
    dry_run: bool,
    concurrency: int,
) -> None:
    session_factory = get_session_factory()
    ancestor_cache: dict[UUID, Optional[StandardsItem]] = {}

    async with session_factory() as db:
        q = select(StandardsItem).where(StandardsItem.is_retired == False)  # noqa: E712
        if framework_id:
            q = q.where(StandardsItem.framework_id == framework_id)
        if jurisdiction_ref:
            j = (await db.execute(
                select(Jurisdiction).where(Jurisdiction.external_ref == jurisdiction_ref)
            )).scalar_one_or_none()
            if not j:
                log.error("No jurisdiction with external_ref=%r", jurisdiction_ref)
                return
            fw_ids = (await db.execute(
                select(StandardsFramework.id).where(StandardsFramework.jurisdiction_id == j.id)
            )).scalars().all()
            q = q.where(StandardsItem.framework_id.in_(fw_ids))
        if limit:
            q = q.limit(limit)

        items = (await db.execute(q)).scalars().all()
        log.info("Candidate items: %d", len(items))

        already = await indexed_node_ids(db, node_type=NODE_TYPE)
        todo = [it for it in items if str(it.id) not in already]
        log.info("Already indexed: %d, remaining: %d", len(items) - len(todo), len(todo))

        if dry_run:
            for it in todo[:10]:
                ancestors = await _ancestor_path(db, it, ancestor_cache)
                log.info("[dry-run] %s", _chunk_text(it, ancestors)[:160])
            log.info("[dry-run] would index %d items — no writes made", len(todo))
            return

        # Frameworks are reused across many items (a framework with N items
        # would otherwise cost N individual db.get() round-trips) — load
        # them all once. 683 frameworks total as of this script's writing;
        # cheap regardless of scope.
        frameworks = {f.id: f for f in (await db.execute(select(StandardsFramework))).scalars().all()}

        t0 = time.monotonic()
        indexed = 0
        failed = 0
        sem = asyncio.Semaphore(concurrency)

        for batch_start in range(0, len(todo), BATCH_SIZE):
            batch = todo[batch_start: batch_start + BATCH_SIZE]

            # Ancestor-path resolution is DB-bound but cached and cheap
            # (shallow trees) — stays sequential; only the embedding HTTP
            # calls (the actual bottleneck) run concurrently below.
            texts: list[str] = []
            for it in batch:
                ancestors = await _ancestor_path(db, it, ancestor_cache)
                texts.append(_chunk_text(it, ancestors))

            results = await asyncio.gather(*[
                _embed_one(sem, it, txt) for it, txt in zip(batch, texts)
            ])

            for it, chunk_text, embedding, error in results:
                if not embedding:
                    failed += 1
                    log.warning("Embed failed for standards_item %s (%s): %s", it.id, it.human_coding_scheme, error)
                    continue
                framework = frameworks.get(it.framework_id)
                await db.execute(_t("""
                    INSERT INTO rag_documents
                        (source_type, source_id, source_name, chunk_index,
                         content, metadata, embedding, node_type, node_id)
                    VALUES
                        (:stype, :sid, :sname, 0,
                         :content, CAST(:meta AS jsonb), CAST(:emb AS vector), :ntype, :nid)
                """), {
                    "stype":   "standards",
                    "sid":     str(it.framework_id),
                    "sname":   framework.title if framework else None,
                    "content": chunk_text,
                    "meta":    _json.dumps({
                        "human_coding_scheme": it.human_coding_scheme,
                        "item_type":           it.item_type,
                        "education_levels":    it.education_levels,
                        "subject":             framework.subject if framework else None,
                        "jurisdiction_id":     str(framework.jurisdiction_id) if framework and framework.jurisdiction_id else None,
                    }),
                    "emb":     "[" + ",".join(str(v) for v in embedding) + "]",
                    "ntype":   NODE_TYPE,
                    "nid":     str(it.id),
                })
                indexed += 1

            await db.commit()
            done = batch_start + len(batch)
            elapsed = time.monotonic() - t0
            rate = done / elapsed if elapsed else 0
            eta_s = (len(todo) - done) / rate if rate else 0
            log.info(
                "  %d/%d indexed=%d failed=%d (%.1f items/sec, ETA %.0fmin)",
                done, len(todo), indexed, failed, rate, eta_s / 60,
            )

        elapsed = time.monotonic() - t0
        log.info(
            "Done: %d indexed, %d failed, %d skipped (already present) in %.1fs",
            indexed, failed, len(items) - len(todo), elapsed,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--framework-id", type=str, help="Only this standards_frameworks.id")
    scope.add_argument("--jurisdiction", type=str, help="External ref of a jurisdiction, e.g. GA, WA, TX")
    scope.add_argument("--all", action="store_true", help="Every non-retired standards_item — slow/costly, confirm provider first")
    parser.add_argument("--limit", type=int, default=None, help="Cap the number of candidate items (applied before the already-indexed filter)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be indexed without writing/embedding")
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY,
                         help=f"Concurrent embedding requests in flight (default {DEFAULT_CONCURRENCY}). "
                              "DB writes stay sequential regardless — only the embedding HTTP calls parallelize.")
    args = parser.parse_args()

    fw_id = UUID(args.framework_id) if args.framework_id else None
    asyncio.run(run(
        framework_id=fw_id,
        jurisdiction_ref=args.jurisdiction,
        limit=args.limit,
        dry_run=args.dry_run,
        concurrency=args.concurrency,
    ))


if __name__ == "__main__":
    main()
