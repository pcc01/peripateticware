# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Shared writer for content_alignments — the activity<->standard edge used by
every path that connects an activity to a standard: the AI auto-suggest pass
on save (routes/activities.py::suggest-standards), a teacher's manual add,
and standards-first generation seeding an activity's alignments from the
standards it was drafted for. One place so these can't drift on the upsert
shape (see the analogous dual-write in routes/standards.py's /map endpoint,
which this mirrors but factors out for reuse).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import ContentAlignment


@dataclass
class AlignmentInput:
    item_id: UUID
    method: str                       # 'ai_suggested' | 'manual'
    status: str                       # 'suggested' | 'approved' | 'rejected'
    confidence: Optional[float] = None
    rationale: Optional[str] = None


async def apply_alignments(
    db: AsyncSession,
    *,
    content_id: UUID,
    content_type: str,
    alignments: List[AlignmentInput],
    reviewed_by: Optional[UUID] = None,
) -> List[ContentAlignment]:
    """
    Upsert content_alignments rows for one piece of content, keyed on the
    (content_id, item_id, alignment_type='teaches') unique constraint — a
    re-suggestion for the same standard updates the existing row in place
    rather than duplicating it.

    Does not commit (callers batch this with their own other writes) and does
    not delete rows the caller didn't mention — a caller that wants "replace
    the whole suggested set" is responsible for diffing/removing stale ones
    itself.
    """
    written: List[ContentAlignment] = []
    for a in alignments:
        existing = (await db.execute(
            select(ContentAlignment).where(
                ContentAlignment.content_id == content_id,
                ContentAlignment.item_id == a.item_id,
                ContentAlignment.alignment_type == "teaches",
            )
        )).scalar_one_or_none()

        reviewed_at = datetime.utcnow() if a.status == "approved" else None
        approver = reviewed_by if a.status == "approved" else None

        if existing:
            existing.method = a.method
            existing.status = a.status
            existing.confidence = a.confidence
            existing.rationale = a.rationale
            if approver:
                existing.reviewed_by = approver
                existing.reviewed_at = reviewed_at
            written.append(existing)
        else:
            row = ContentAlignment(
                content_id=content_id,
                content_type=content_type,
                item_id=a.item_id,
                alignment_type="teaches",
                method=a.method,
                status=a.status,
                confidence=a.confidence,
                rationale=a.rationale,
                reviewed_by=approver,
                reviewed_at=reviewed_at,
            )
            db.add(row)
            written.append(row)
    return written
