# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Page content ("page blocks") routes -- the WYSIWYG-lite copy-editing
system. See models/page_content.py's docstring for the design.

Two routers:
  router        -- public, prefix /api/v1/pages. Returns only published
                    blocks for a page/locale, as a flat {block_key:
                    content} map the frontend's usePageBlocks() hook
                    indexes directly. No auth required.
  admin_router   -- prefix /api/v1/admin/pages. Full CRUD + version
                    history, gated behind get_current_content_admin
                    (users.is_content_admin=True -- independent of role)
                    -- same gate as routes/blog.py's admin_router.
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_content_admin
from models.page_content import PageBlock, PageBlockVersion, PageBlockStatus, PageBlockSource
from models.user import User
from schemas.page_content import (
    PageBlockOut,
    PageBlockUpsert,
    PageBlockUpdate,
    PageBlockVersionOut,
    PageBlockWithHistory,
    PublicPageBlocksResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pages", tags=["page-content"])
admin_router = APIRouter(prefix="/admin/pages", tags=["admin-page-content"])


def _display_name(user: User) -> Optional[str]:
    return (
        user.full_name
        or " ".join(n for n in [user.first_name, user.last_name] if n)
        or user.username
        or None
    )


# ============================================================================
# Public routes
# ============================================================================

@router.get("/{page_key}/blocks", response_model=PublicPageBlocksResponse)
async def get_published_blocks(
    page_key: str,
    locale: str = Query("en"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PageBlock.block_key, PageBlock.content).where(
            PageBlock.page_key == page_key,
            PageBlock.locale == locale,
            PageBlock.status == PageBlockStatus.PUBLISHED,
        )
    )
    return PublicPageBlocksResponse(blocks={row[0]: row[1] for row in result.all()})


# ============================================================================
# Admin routes
# ============================================================================

@admin_router.get("/blocks", response_model=list[PageBlockOut])
async def admin_list_blocks(
    page_key: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_content_admin),
):
    query = select(PageBlock)
    if page_key:
        query = query.where(PageBlock.page_key == page_key)
    if search:
        like = f"%{search}%"
        query = query.where(or_(PageBlock.block_key.ilike(like), PageBlock.content.ilike(like)))
    query = query.order_by(PageBlock.page_key, PageBlock.block_key, PageBlock.locale)
    result = await db.execute(query)
    return result.scalars().all()


@admin_router.get("/page-keys", response_model=list[str])
async def admin_list_page_keys(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_content_admin),
):
    result = await db.execute(select(PageBlock.page_key).distinct().order_by(PageBlock.page_key))
    return [row[0] for row in result.all()]


@admin_router.get("/blocks/{block_id}", response_model=PageBlockWithHistory)
async def admin_get_block(
    block_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_content_admin),
):
    block = await db.get(PageBlock, block_id)
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")
    versions_result = await db.execute(
        select(PageBlockVersion)
        .where(PageBlockVersion.block_id == block_id)
        .order_by(PageBlockVersion.created_at.desc())
    )
    versions = versions_result.scalars().all()
    return PageBlockWithHistory(
        **PageBlockOut.model_validate(block).model_dump(),
        versions=[PageBlockVersionOut.model_validate(v) for v in versions],
    )


@admin_router.post("/blocks", response_model=PageBlockOut, status_code=status.HTTP_201_CREATED)
async def admin_create_block(
    body: PageBlockUpsert,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_content_admin),
):
    existing = await db.execute(
        select(PageBlock.id).where(PageBlock.block_key == body.block_key, PageBlock.locale == body.locale)
    )
    if existing.scalar() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A block with key '{body.block_key}' already exists for locale '{body.locale}'.",
        )

    block = PageBlock(
        page_key=body.page_key,
        block_key=body.block_key,
        locale=body.locale,
        format=body.format,
        content=body.content,
        status=PageBlockStatus(body.status),
        updated_by=admin.id,
        updated_by_name=_display_name(admin),
    )
    db.add(block)
    await db.flush()

    db.add(PageBlockVersion(
        block_id=block.id,
        content=block.content,
        status=block.status.value,
        source=PageBlockSource.HUMAN,
        edited_by=admin.id,
        edited_by_name=_display_name(admin),
    ))

    await db.commit()
    await db.refresh(block)
    return block


@admin_router.put("/blocks/{block_id}", response_model=PageBlockOut)
async def admin_update_block(
    block_id: UUID,
    body: PageBlockUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_content_admin),
):
    block = await db.get(PageBlock, block_id)
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")

    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"]:
        data["status"] = PageBlockStatus(data["status"])

    content_changed = "content" in data and data["content"] != block.content
    for field, value in data.items():
        setattr(block, field, value)
    block.updated_by = admin.id
    block.updated_by_name = _display_name(admin)

    # A version is a point-in-time snapshot -- only worth writing when the
    # content actually changed, not on every status-only toggle, so the
    # history stays a record of edits rather than every field touch.
    if content_changed:
        db.add(PageBlockVersion(
            block_id=block.id,
            content=block.content,
            status=block.status.value,
            source=PageBlockSource.HUMAN,
            edited_by=admin.id,
            edited_by_name=_display_name(admin),
        ))

    await db.commit()
    await db.refresh(block)
    return block


@admin_router.delete("/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_block(
    block_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_content_admin),
):
    block = await db.get(PageBlock, block_id)
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")
    # Reverting to the frontend's hardcoded fallback is just "delete the
    # row" -- versions cascade with it since they're only meaningful
    # relative to a block that still exists.
    await db.execute(PageBlockVersion.__table__.delete().where(PageBlockVersion.block_id == block_id))
    await db.delete(block)
    await db.commit()
