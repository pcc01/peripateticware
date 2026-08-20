# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
SQLAlchemy model for the marketing blog.

One table, `blog_posts`: admin-authored posts with a draft/published
workflow. Public routes (routes/blog.py's `router`) only ever see rows
with status='published'; the admin CRUD routes (`admin_router`) see
everything so a draft can be written and previewed before it goes live.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, ARRAY

from core.database import Base


class BlogPostStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"


class BlogPost(Base):
    __tablename__ = "blog_posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    slug = Column(String(220), unique=True, nullable=False, index=True)
    title = Column(String(300), nullable=False)
    # Short summary shown on the /blog list and used as the meta description
    # for the post's Seo tags when set; falls back to a truncated content
    # excerpt on the frontend if left blank.
    excerpt = Column(Text, nullable=True)
    # Body copy. Stored as the lightweight markdown subset the frontend's
    # renderBlogContent() understands (headings, bold/italic/strikethrough,
    # inline code, fenced code blocks, links, images, ordered/unordered
    # lists, blockquotes, horizontal rules, paragraphs) -- not full
    # CommonMark (no tables/LaTeX), and never rendered as raw HTML on the
    # frontend.
    content = Column(Text, nullable=False)
    cover_image_url = Column(String(500), nullable=True)

    # native_enum=False + values_callable: avoids relying on a Postgres native
    # enum type (see ProjectStatus.status in models/database.py for the same
    # pattern) -- keeps `alembic upgrade`/`downgrade` simple since there's no
    # separate CREATE/DROP TYPE to manage alongside the column.
    status = Column(
        SAEnum(BlogPostStatus, name="blog_post_status", native_enum=False,
               values_callable=lambda e: [x.value for x in e]),
        nullable=False,
        default=BlogPostStatus.DRAFT,
        server_default=BlogPostStatus.DRAFT.value,
    )

    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    # Denormalized display name so a post still shows a byline if the
    # authoring admin account is later deleted.
    author_name = Column(String(150), nullable=True)

    tags = Column(ARRAY(String(60)), nullable=False, default=list)

    published_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
