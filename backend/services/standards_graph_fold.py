# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Fold teacher/homeschool-uploaded StandardsSet criteria into the CASE-shaped
standards graph (jurisdictions/standards_sources/standards_frameworks/
standards_items), per PRD-graphrag-migration-2026-08-16.md §4.2.

Why: StandardsSet.criteria is a flat JSONB list — no hierarchy, no
cross-references, invisible to graph-expansion retrieval (services/
graph_retrieval.py only walks standards_items). This module gives every
uploaded criterion a real standards_items row alongside CASE-ingested ones,
so a rubric a teacher uploaded and a CCSS standard ingested from a state
CASE server live in the same graph, are embedded and searched the same way,
and support the same ancestor/cross-reference expansion.

Design:
  - One standards_frameworks row per StandardsSet, **with the same id** —
    StandardsSet.id doubles as its own framework's PK. No separate mapping
    table needed; `standards_set.id` and `standards_frameworks.id` are the
    same UUID by construction. is_authoritative_over_uploads=False (an
    upload never outranks a real CASE framework for the same jurisdiction
    if one exists — mirrors the precedence flag the original
    PRD-standards-alignment-engine defined this column for).
  - One shared standards_sources row ("Teacher/Parent Upload", source_type
    'pdf', is_authoritative=False) reused across every StandardsSet — it's
    a registry of *upstream kinds*, not a per-user or per-set thing.
  - Criteria group under a synthetic per-category standards_items row
    (item_type='Category') the first time that category is seen for a set,
    giving uploaded criteria the hierarchy CASE data gets for free from its
    Domain/Cluster/Standard item_type nesting.
  - Deterministic ids (uuid5, namespaced by standards_set.id + criterion.id
    / category name) so re-running materialization on a refresh upserts in
    place instead of duplicating — no separate "already materialized" flag
    needed, the id itself is the idempotency key.

This is purely additive: StandardsSet.criteria (JSONB) is untouched and
stays the source of truth for the teacher-facing UI; this module gives the
same content a second, graph-shaped representation for retrieval. See the
plan doc §4.2 for the eventual (not-yet-done) direction of making the graph
the primary representation and this JSONB the legacy read path instead.

Authoritativeness policy (Paul, 2026-08-17): an uploaded framework is
authoritative (is_authoritative_over_uploads=True) for its jurisdiction
until a real CASE-ingested framework exists for that same jurisdiction —
determined here, on materialize/refresh, by resolving StandardsSet.state_code
to a jurisdictions row (matching scripts/ingest_case_standards.py's own
seeding convention: country_code='US', subdivision_code=f'US-{code}') and
checking whether any standards_frameworks row for that jurisdiction comes
from a non-upload source. The reverse direction — a CASE framework arriving
*after* an upload was already marked authoritative — is handled on the
ingest side instead (scripts/ingest_case_standards.py's
_demote_uploads_for_jurisdiction, called right after a CASE framework is
upserted), since that's the side where the state actually changes; waiting
for the upload to happen to get refreshed again isn't reliable.
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import (
    StandardsSet,
    StandardsSource,
    StandardsFramework,
    StandardsItem,
    Jurisdiction,
)

logger = logging.getLogger(__name__)

# Fixed namespace for all deterministic ids this module mints — arbitrary
# but must never change once anything's been materialized, or every
# existing row's id "changes" (i.e. a new row gets created alongside the
# orphaned old one).
_NAMESPACE = uuid.UUID("6f1a8e2e-6c2a-4f0e-9b3a-2b7a9d1c4e10")

_UPLOAD_SOURCE_NAME = "Teacher/Parent Upload"

# StandardsSet.type -> standards_frameworks.subject-ish label, just for
# display; the real subject field on CriterionIn is per-criterion, not
# per-set, so this is a coarse fallback only.
_SET_TYPE_LABEL = {
    "state_standards": "State Standards (Uploaded)",
    "state_reporting":  "State Reporting Requirements (Uploaded)",
    "rubric":           "Rubric",
    "custom":           "Custom Criteria",
}


def criterion_item_id(standards_set_id: "uuid.UUID | str", criterion_id: str) -> uuid.UUID:
    """Deterministic standards_items.id for a given (set, criterion)."""
    return uuid.uuid5(_NAMESPACE, f"criterion:{standards_set_id}:{criterion_id}")


def category_item_id(standards_set_id: "uuid.UUID | str", category: str) -> uuid.UUID:
    """Deterministic standards_items.id for a given (set, category) synthetic parent."""
    return uuid.uuid5(_NAMESPACE, f"category:{standards_set_id}:{category}")


async def _get_or_create_upload_source(db: AsyncSession) -> StandardsSource:
    existing = (await db.execute(
        select(StandardsSource).where(StandardsSource.name == _UPLOAD_SOURCE_NAME)
    )).scalar_one_or_none()
    if existing:
        return existing

    src = StandardsSource(
        id=uuid.uuid5(_NAMESPACE, "source:teacher_parent_upload"),
        name=_UPLOAD_SOURCE_NAME,
        source_type="pdf",
        base_url="internal://standards-set-upload",  # not a real pollable URL — uploads aren't polled
        is_authoritative=False,
        poll_frequency_days=0,
    )
    db.add(src)
    await db.flush()
    return src


async def _resolve_or_create_jurisdiction(db: AsyncSession, state_code: Optional[str]) -> Optional[Jurisdiction]:
    """
    Resolve a StandardsSet.state_code (e.g. 'TX') to its jurisdictions row,
    matching scripts/ingest_case_standards.py's own seeding convention
    (country_code='US', subdivision_code=f'US-{code}', level='state',
    external_ref=code) so the two paths land on the same row.

    Creates the row if this state has no CASE presence yet (e.g. a
    homeschool state-reporting upload for a state nobody's CASE-ingested).
    Deterministic id is safe here even though ingest_case_standards.py mints
    random uuid4 ids for jurisdictions it creates — that script looks rows
    up by (country_code, external_ref) before creating, not by id, so
    whichever path gets there first just gets reused by the other; no
    duplicate-jurisdiction risk either way.
    """
    if not state_code or not state_code.strip():
        return None
    code = state_code.strip().upper()

    existing = (await db.execute(
        select(Jurisdiction).where(
            Jurisdiction.country_code == "US",
            Jurisdiction.subdivision_code == f"US-{code}",
        )
    )).scalar_one_or_none()
    if existing:
        return existing

    j = Jurisdiction(
        id=uuid.uuid5(_NAMESPACE, f"jurisdiction:US-{code}"),
        country_code="US",
        subdivision_code=f"US-{code}",
        level="state",
        name=code,   # best-effort fallback name; a subsequent CASE ingest's own registry entry has the real one
        external_ref=code,
    )
    db.add(j)
    await db.flush()
    return j


async def _is_authoritative(db: AsyncSession, jurisdiction_id: "uuid.UUID | None", upload_source_id: uuid.UUID) -> bool:
    """True unless a non-upload (i.e. real CASE-ingested) framework already
    exists for this jurisdiction. No jurisdiction resolved (state_code blank
    or unrecognized) -> can't check for conflicts, defaults to authoritative
    rather than silently downgrading content nobody can point to a
    superseding source for."""
    if jurisdiction_id is None:
        return True
    existing = (await db.execute(
        select(StandardsFramework.id).where(
            StandardsFramework.jurisdiction_id == jurisdiction_id,
            StandardsFramework.source_id != upload_source_id,
        ).limit(1)
    )).first()
    return existing is None


async def _get_or_create_framework(db: AsyncSession, standards_set: StandardsSet, source: StandardsSource) -> StandardsFramework:
    jurisdiction = await _resolve_or_create_jurisdiction(db, standards_set.state_code)
    jurisdiction_id = jurisdiction.id if jurisdiction else None
    is_authoritative = await _is_authoritative(db, jurisdiction_id, source.id)

    fw = await db.get(StandardsFramework, standards_set.id)
    if fw:
        fw.title = standards_set.name
        fw.subject = _SET_TYPE_LABEL.get(standards_set.type, standards_set.type)
        fw.jurisdiction_id = jurisdiction_id
        fw.is_authoritative_over_uploads = is_authoritative
        return fw

    fw = StandardsFramework(
        id=standards_set.id,   # same id as the StandardsSet it represents — see module docstring
        source_id=source.id,
        jurisdiction_id=jurisdiction_id,
        title=standards_set.name,
        subject=_SET_TYPE_LABEL.get(standards_set.type, standards_set.type),
        official_source_url=f"internal://standards-sets/{standards_set.id}",
        is_authoritative_over_uploads=is_authoritative,
        raw={"standards_set_id": str(standards_set.id), "type": standards_set.type, "state_code": standards_set.state_code},
    )
    db.add(fw)
    await db.flush()
    return fw


async def materialize_standards_set(
    db: AsyncSession,
    standards_set: StandardsSet,
) -> dict[str, uuid.UUID]:
    """
    Ensure a standards_frameworks row + one standards_items row per criterion
    (grouped under synthetic per-category parents) exist for this set.

    Returns {criterion_id: standards_items.id} for every criterion in
    standards_set.criteria — callers (RAG indexing, activity-mapping) use
    this to link into the graph without re-deriving ids themselves.

    Does not commit — caller controls the transaction, same convention as
    services/rag_store.py.
    """
    criteria = standards_set.criteria or []
    if not criteria:
        return {}

    source = await _get_or_create_upload_source(db)
    framework = await _get_or_create_framework(db, standards_set, source)

    category_ids: dict[str, uuid.UUID] = {}
    result: dict[str, uuid.UUID] = {}

    for criterion in criteria:
        crit_id = str(criterion.get("id") or criterion.get("code") or "")
        if not crit_id:
            continue
        category = str(criterion.get("category") or "General")

        if category not in category_ids:
            cat_item_id = category_item_id(standards_set.id, category)
            cat_item = await db.get(StandardsItem, cat_item_id)
            if not cat_item:
                cat_item = StandardsItem(
                    id=cat_item_id,
                    framework_id=framework.id,
                    human_coding_scheme=None,
                    full_statement=category,
                    item_type="Category",
                    raw={"synthetic": True, "category": category},
                )
                db.add(cat_item)
                await db.flush()
            category_ids[category] = cat_item_id

        item_id = criterion_item_id(standards_set.id, crit_id)
        item = await db.get(StandardsItem, item_id)
        name = str(criterion.get("name") or "")
        description = str(criterion.get("description") or "")
        full_statement = " — ".join(p for p in (name, description) if p) or name or crit_id

        if item:
            item.framework_id = framework.id
            item.human_coding_scheme = criterion.get("code") or None
            item.full_statement = full_statement
            item.item_type = "Standard"
            item.parent_id = category_ids[category]
            item.raw = criterion
        else:
            item = StandardsItem(
                id=item_id,
                framework_id=framework.id,
                human_coding_scheme=criterion.get("code") or None,
                full_statement=full_statement,
                item_type="Standard",
                parent_id=category_ids[category],
                raw=criterion,
            )
            db.add(item)

        result[crit_id] = item_id

    await db.flush()
    logger.info(
        "Materialized %d criteria (%d categories) from StandardsSet '%s' (%s) into standards graph",
        len(result), len(category_ids), standards_set.name, str(standards_set.id)[:8],
    )
    return result
