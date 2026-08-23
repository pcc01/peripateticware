# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Pydantic schemas for the marketing blog (routes/blog.py)."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class BlogPostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    # Optional -- routes/blog.py slugifies the title when omitted.
    slug: Optional[str] = Field(None, max_length=220)
    excerpt: Optional[str] = Field(None, max_length=2000)
    content: str = Field(..., min_length=1)
    cover_image_url: Optional[str] = Field(None, max_length=500)
    cover_image_caption: Optional[str] = Field(None, max_length=2000)
    cover_image_attribution: Optional[str] = Field(None, max_length=300)
    cover_image_width: Optional[int] = Field(None, ge=1)
    cover_image_height: Optional[int] = Field(None, ge=1)
    status: str = Field("draft", pattern="^(draft|published)$")
    tags: List[str] = Field(default_factory=list)

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, v: List[str]) -> List[str]:
        return [t.strip() for t in v if t and t.strip()][:20]


class BlogPostUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=300)
    slug: Optional[str] = Field(None, max_length=220)
    excerpt: Optional[str] = Field(None, max_length=2000)
    content: Optional[str] = Field(None, min_length=1)
    cover_image_url: Optional[str] = Field(None, max_length=500)
    cover_image_caption: Optional[str] = Field(None, max_length=2000)
    cover_image_attribution: Optional[str] = Field(None, max_length=300)
    cover_image_width: Optional[int] = Field(None, ge=1)
    cover_image_height: Optional[int] = Field(None, ge=1)
    status: Optional[str] = Field(None, pattern="^(draft|published)$")
    tags: Optional[List[str]] = None

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        return [t.strip() for t in v if t and t.strip()][:20]


class BlogPostOut(BaseModel):
    """Full post -- used by the admin editor and the public detail page."""
    id: UUID
    slug: str
    title: str
    excerpt: Optional[str] = None
    content: str
    cover_image_url: Optional[str] = None
    cover_image_caption: Optional[str] = None
    cover_image_attribution: Optional[str] = None
    cover_image_width: Optional[int] = None
    cover_image_height: Optional[int] = None
    status: str
    author_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    published_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BlogPostSummary(BaseModel):
    """Trimmed post -- used by list views (no full content body). Cover
    dimensions are included (unlike caption/attribution, not needed for a
    thumbnail) so list cards can size the cover box to its real aspect
    ratio without a crop, same as the full post view."""
    id: UUID
    slug: str
    title: str
    excerpt: Optional[str] = None
    cover_image_url: Optional[str] = None
    cover_image_width: Optional[int] = None
    cover_image_height: Optional[int] = None
    status: str
    author_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    published_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BlogPostListResponse(BaseModel):
    items: List[BlogPostSummary]
    total: int
    page: int
    page_size: int
