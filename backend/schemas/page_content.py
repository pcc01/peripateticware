# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Pydantic schemas for editable page content (routes/page_content.py)."""

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PageBlockOut(BaseModel):
    id: UUID
    page_key: str
    block_key: str
    locale: str
    format: str
    content: str
    status: str
    updated_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PublicPageBlocksResponse(BaseModel):
    """Keyed by block_key -> content, for the frontend's usePageBlocks()
    hook to index directly. Only ever includes status='published' rows."""
    blocks: Dict[str, str]


class PageBlockUpsert(BaseModel):
    page_key: str = Field(..., min_length=1, max_length=100)
    block_key: str = Field(..., min_length=1, max_length=200)
    locale: str = Field("en", min_length=2, max_length=10)
    format: str = Field("text", pattern="^(text|markdown)$")
    content: str = Field(..., min_length=1)
    status: str = Field("published", pattern="^(draft|published)$")


class PageBlockUpdate(BaseModel):
    content: Optional[str] = Field(None, min_length=1)
    format: Optional[str] = Field(None, pattern="^(text|markdown)$")
    status: Optional[str] = Field(None, pattern="^(draft|published)$")


class PageBlockVersionOut(BaseModel):
    id: UUID
    content: str
    status: str
    source: str
    edited_by_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PageBlockWithHistory(PageBlockOut):
    versions: List[PageBlockVersionOut] = Field(default_factory=list)
