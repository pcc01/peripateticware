# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
SQLAlchemy models for WYSIWYG-editable page content ("page blocks").

Design (see PRD discussion 2026-08-19): pages stay React components --
only individually-addressed copy fields (a hero headline, a CTA label,
a paragraph of body copy) become admin-editable. Each is identified by a
stable `block_key` the frontend hardcodes as a lookup id (e.g.
"landing.hero.homeschool.headline"), with the current hardcoded string
kept in the JSX as a fallback -- see frontend/src/hooks/usePageBlocks.ts.
So a block only needs a database row once someone actually edits it;
until then the page renders identically to before this system existed.

Two tables:
  page_blocks          -- current/live value per (block_key, locale).
  page_block_versions  -- immutable snapshot on every save, so edit
                           history is just a query, not a bolt-on feature.

`locale` is present from day one (default 'en') even though only 'en' is
populated for now -- see PRD-graphrag-migration-2026-08-16.md-style
forward planning: this is the same shape the future translation path
(either the existing i18n:sync pipeline pointed at this table, or the
content-provenance project's CMSIntegration pattern) will expect, so
adding real translations later is a data-population problem, not a
schema migration.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum as SAEnum, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from core.database import Base


class PageBlockStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


class PageBlockSource(str, enum.Enum):
    """Cheap authorship provenance on each version -- distinct from the
    content-provenance project's full W3C PROV-DM tracking (deliberately
    not wired to that system yet, see PRD discussion), but the same
    human/AI distinction it cares about, so a later integration has
    something to read rather than nothing."""
    HUMAN = "human"
    AI_ASSISTED = "ai_assisted"


class PageBlock(Base):
    """Current/live value. One row per (block_key, locale)."""
    __tablename__ = "page_blocks"
    __table_args__ = (
        UniqueConstraint("block_key", "locale", name="uq_page_blocks_block_key_locale"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Which page/route group this belongs to -- purely for grouping in the
    # admin UI (e.g. "landing"), not used for lookup.
    page_key = Column(String(100), nullable=False, index=True)
    # Stable id the frontend hardcodes, e.g. "landing.hero.homeschool.headline".
    block_key = Column(String(200), nullable=False, index=True)
    locale = Column(String(10), nullable=False, default="en", server_default="en")

    # "text" for a single short string (headline, button label); "markdown"
    # for a body-copy block rendered through utils/blogMarkdown.tsx's
    # renderBlogContent(), same as blog posts.
    format = Column(String(20), nullable=False, default="text", server_default="text")
    content = Column(Text, nullable=False)

    status = Column(
        SAEnum(PageBlockStatus, name="page_block_status", native_enum=False,
               values_callable=lambda e: [x.value for x in e]),
        nullable=False,
        default=PageBlockStatus.PUBLISHED,
        server_default=PageBlockStatus.PUBLISHED.value,
    )

    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    updated_by_name = Column(String(150), nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class PageBlockVersion(Base):
    """Immutable snapshot written on every save of a PageBlock."""
    __tablename__ = "page_block_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    block_id = Column(UUID(as_uuid=True), ForeignKey("page_blocks.id"), nullable=False, index=True)

    content = Column(Text, nullable=False)
    status = Column(String(20), nullable=False)  # status the block had AT this version
    source = Column(
        SAEnum(PageBlockSource, name="page_block_source", native_enum=False,
               values_callable=lambda e: [x.value for x in e]),
        nullable=False,
        default=PageBlockSource.HUMAN,
        server_default=PageBlockSource.HUMAN.value,
    )

    edited_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    edited_by_name = Column(String(150), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
