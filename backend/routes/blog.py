# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Blog routes.

Two routers:
  router        -- public, prefix /api/v1/blog. Only ever returns
                    status='published' posts. No auth required.
  admin_router   -- prefix /api/v1/admin/blog. Sees drafts and published
                    posts, gated behind get_current_admin (UserRole.ADMIN).

Content is a lightweight markdown subset (see models/blog.py's docstring);
the frontend renders it itself rather than trusting/injecting raw HTML.
"""

import logging
import re
import unicodedata
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_admin
from models.blog import BlogPost, BlogPostStatus
from models.user import User
from schemas.blog import (
    BlogPostCreate,
    BlogPostUpdate,
    BlogPostOut,
    BlogPostSummary,
    BlogPostListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/blog", tags=["blog"])
admin_router = APIRouter(prefix="/admin/blog", tags=["admin-blog"])


# ============================================================================
# Helpers
# ============================================================================

_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")


def _slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = _SLUG_STRIP_RE.sub("-", text.lower()).strip("-")
    return text[:200] or "post"


_MD_STRIP_RE = re.compile(r"^#{1,6}\s+|^>\s?|^[-*]\s+", re.MULTILINE)
_MD_INLINE_RE = re.compile(r"\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\(.+?\)")


def _plain_excerpt(content: str, max_length: int = 180) -> str:
    """Mirrors frontend/src/utils/blogMarkdown.tsx's plainTextExcerpt() --
    used as the excerpt fallback when an admin leaves it blank, so list
    views and Seo meta descriptions never show up empty."""
    text = _MD_STRIP_RE.sub("", content or "")
    text = _MD_INLINE_RE.sub(lambda m: next(g for g in m.groups() if g is not None), text)
    text = " ".join(text.split())
    if len(text) <= max_length:
        return text
    return text[:max_length].rsplit(" ", 1)[0] + "…"


async def _unique_slug(db: AsyncSession, base: str, exclude_id: Optional[UUID] = None) -> str:
    """Appends -2, -3, ... until the slug is free. base is already slugified."""
    candidate = base
    n = 2
    while True:
        query = select(BlogPost.id).where(BlogPost.slug == candidate)
        if exclude_id is not None:
            query = query.where(BlogPost.id != exclude_id)
        result = await db.execute(query)
        if result.scalar() is None:
            return candidate
        candidate = f"{base}-{n}"
        n += 1


# ============================================================================
# Public routes
# ============================================================================

@router.get("/posts", response_model=BlogPostListResponse)
async def list_published_posts(
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    tag: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(BlogPost).where(BlogPost.status == BlogPostStatus.PUBLISHED)
    if tag:
        query = query.where(BlogPost.tags.any(tag))

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(BlogPost.published_at.desc()).offset((page - 1) * page_size).limit(page_size)
    posts = (await db.execute(query)).scalars().all()

    return BlogPostListResponse(
        items=[BlogPostSummary.model_validate(p) for p in posts],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/posts/{slug}", response_model=BlogPostOut)
async def get_published_post(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BlogPost).where(BlogPost.slug == slug, BlogPost.status == BlogPostStatus.PUBLISHED)
    )
    post = result.scalar_one_or_none()
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return post


# ============================================================================
# Admin routes
# ============================================================================

@admin_router.get("/posts", response_model=BlogPostListResponse)
async def admin_list_posts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(draft|published)$"),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    query = select(BlogPost)
    if status_filter:
        query = query.where(BlogPost.status == BlogPostStatus(status_filter))
    if search:
        like = f"%{search}%"
        query = query.where(or_(BlogPost.title.ilike(like), BlogPost.slug.ilike(like)))

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(BlogPost.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    posts = (await db.execute(query)).scalars().all()

    return BlogPostListResponse(
        items=[BlogPostSummary.model_validate(p) for p in posts],
        total=total,
        page=page,
        page_size=page_size,
    )


@admin_router.get("/posts/{post_id}", response_model=BlogPostOut)
async def admin_get_post(
    post_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    post = await db.get(BlogPost, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return post


@admin_router.post("/posts", response_model=BlogPostOut, status_code=status.HTTP_201_CREATED)
async def admin_create_post(
    body: BlogPostCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    base_slug = _slugify(body.slug or body.title)
    slug = await _unique_slug(db, base_slug)

    author_name = (
        admin.full_name
        or " ".join(n for n in [admin.first_name, admin.last_name] if n)
        or admin.username
        or None
    )
    post = BlogPost(
        slug=slug,
        title=body.title,
        excerpt=body.excerpt or _plain_excerpt(body.content),
        content=body.content,
        cover_image_url=body.cover_image_url,
        status=BlogPostStatus(body.status),
        tags=body.tags,
        author_id=admin.id,
        author_name=author_name,
    )
    if post.status == BlogPostStatus.PUBLISHED:
        post.published_at = datetime.now(timezone.utc)

    db.add(post)
    await db.commit()
    await db.refresh(post)
    return post


@admin_router.put("/posts/{post_id}", response_model=BlogPostOut)
async def admin_update_post(
    post_id: UUID,
    body: BlogPostUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    post = await db.get(BlogPost, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    data = body.model_dump(exclude_unset=True)

    if "slug" in data and data["slug"]:
        new_base = _slugify(data["slug"])
        if new_base != post.slug:
            data["slug"] = await _unique_slug(db, new_base, exclude_id=post.id)
        else:
            data.pop("slug")
    elif "title" in data and "slug" not in data:
        # Slug is stable once set -- only re-derive it from the title when
        # the post doesn't have one yet (shouldn't normally happen, since
        # create always assigns one, but keeps this endpoint safe either way).
        if not post.slug:
            data["slug"] = await _unique_slug(db, _slugify(data["title"]))

    if "status" in data and data["status"]:
        new_status = BlogPostStatus(data["status"])
        if new_status == BlogPostStatus.PUBLISHED and post.status != BlogPostStatus.PUBLISHED:
            post.published_at = datetime.now(timezone.utc)
        data["status"] = new_status

    # A blank excerpt always means "auto-generate from content" (matches the
    # editor's placeholder copy) -- so backfill whenever the effective
    # excerpt after this update would be empty, not just when the field was
    # left out of the request entirely.
    if not data.get("excerpt", post.excerpt):
        data["excerpt"] = _plain_excerpt(data.get("content", post.content))

    for field, value in data.items():
        setattr(post, field, value)

    await db.commit()
    await db.refresh(post)
    return post


@admin_router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_post(
    post_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    post = await db.get(BlogPost, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    await db.delete(post)
    await db.commit()
