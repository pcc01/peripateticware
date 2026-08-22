# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Blog routes.

Two routers:
  router        -- public, prefix /api/v1/blog. Only ever returns
                    status='published' posts. No auth required.
  admin_router   -- prefix /api/v1/admin/blog. Sees drafts and published
                    posts, gated behind get_current_content_admin
                    (users.is_content_admin=True -- independent of role).

Content is a lightweight markdown subset (see models/blog.py's docstring);
the frontend renders it itself rather than trusting/injecting raw HTML.
"""

import logging
import re
import unicodedata
import uuid as _uuid
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_content_admin
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
# Image caption/attribution tag line -- see blogMarkdown.tsx's _SOLO_IMAGE_RE.
_MD_CAPTION_LINE_RE = re.compile(r"^\^.*$", re.MULTILINE)


def _plain_excerpt(content: str, max_length: int = 180) -> str:
    """Mirrors frontend/src/utils/blogMarkdown.tsx's plainTextExcerpt() --
    used as the excerpt fallback when an admin leaves it blank, so list
    views and Seo meta descriptions never show up empty."""
    text = _MD_CAPTION_LINE_RE.sub("", content or "")
    text = _MD_STRIP_RE.sub("", text)
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


_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB
# Cap on the longer side, in pixels. Anything bigger gets downscaled before
# storage -- keeps oversized phone-camera photos from bloating storage/
# bandwidth and, combined with the width/height returned alongside the URL,
# lets the frontend size the cover-image box to the real aspect ratio
# instead of a fixed-crop object-fit: cover that was cutting off portrait
# and unusually-tall/wide covers.
_MAX_IMAGE_DIMENSION = 2000
_PIL_FORMAT_BY_CONTENT_TYPE = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
    # GIF deliberately excluded -- Pillow's resize only touches the first
    # frame of an animated GIF, which would silently kill the animation.
    # Dimensions are still read (see below), just not re-encoded/resized.
}


def _read_and_resize_image(file_bytes: bytes, content_type: str) -> tuple[bytes, int, int]:
    """Returns (possibly-downscaled bytes, width, height). Runs Pillow
    synchronously -- called via asyncio.to_thread by callers so it doesn't
    block the event loop. Falls back to the original bytes with dimensions
    read best-effort if Pillow can't decode the file for any reason
    (corrupt upload, format it doesn't support) rather than failing the
    whole upload over a metadata nicety."""
    from PIL import Image
    import io

    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            width, height = img.size
            pil_format = _PIL_FORMAT_BY_CONTENT_TYPE.get(content_type)
            if pil_format and max(width, height) > _MAX_IMAGE_DIMENSION:
                scale = _MAX_IMAGE_DIMENSION / max(width, height)
                new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
                resized = img.resize(new_size, Image.Resampling.LANCZOS)
                if pil_format == "JPEG" and resized.mode in ("RGBA", "LA", "P"):
                    # JPEG has no alpha channel -- flatten onto white first
                    # (same pattern as input_normalization_service.py's image
                    # normalization) instead of a bare .convert("RGB"), which
                    # would render transparent areas black instead of white.
                    rgb = Image.new("RGB", resized.size, (255, 255, 255))
                    source = resized.convert("RGBA") if resized.mode == "P" else resized
                    rgb.paste(source, mask=source.split()[-1] if source.mode in ("RGBA", "LA") else None)
                    resized = rgb
                save_kwargs = {"quality": 88} if pil_format == "JPEG" else {}
                out = io.BytesIO()
                resized.save(out, format=pil_format, **save_kwargs)
                return out.getvalue(), new_size[0], new_size[1]
            return file_bytes, width, height
    except Exception as exc:  # noqa: BLE001 -- best-effort metadata, never fatal
        logger.warning(f"Could not read blog image dimensions: {exc}")
        return file_bytes, 0, 0


async def _save_blog_image(upload: UploadFile) -> dict:
    """
    Persist an uploaded image (blog cover or in-body) and return
    {"url", "width", "height"}. Same storage backend as
    routes/student_activities.py's _save_file() (Cloudflare R2 in prod,
    local UPLOAD_DIR fallback in dev, now served via main.py's /uploads
    static mount) -- duplicated here rather than imported since that
    function is keyed on session_id, not a generic key prefix; not worth a
    shared-module refactor for one more caller.
    """
    import core.config as _cfg
    settings = _cfg.settings

    if upload.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type '{upload.content_type}'. Use JPEG, PNG, WEBP, or GIF.",
        )

    file_bytes = await upload.read()
    if len(file_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 5 MB).")

    import asyncio
    file_bytes, width, height = await asyncio.to_thread(_read_and_resize_image, file_bytes, upload.content_type)

    # Sanitise filename -- same rules as _save_file() (blocks path traversal).
    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", upload.filename or "image")
    safe_name = safe_name.lstrip(".")
    safe_name = re.sub(r"\.\.", "_", safe_name)
    safe_name = (safe_name or "image")[:200]
    key = f"blog-covers/{_uuid.uuid4()}/{safe_name}"

    if not settings.CF_R2_ACCOUNT_ID:
        import os
        dest_dir = f"{settings.UPLOAD_DIR}/blog-covers"
        os.makedirs(dest_dir, exist_ok=True)
        dest = f"{settings.UPLOAD_DIR}/{key}"
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as fh:
            fh.write(file_bytes)
        return {"url": f"/uploads/{key}", "width": width, "height": height}

    import boto3
    from botocore.exceptions import BotoCoreError, ClientError

    endpoint_url = f"https://{settings.CF_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

    def _upload():
        client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=settings.CF_R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.CF_R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
        client.put_object(
            Bucket=settings.CF_R2_BUCKET_NAME,
            Key=key,
            Body=file_bytes,
            ContentType=upload.content_type,
        )

    try:
        await asyncio.to_thread(_upload)
    except (BotoCoreError, ClientError) as exc:
        logger.error(f"R2 blog image upload failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Image upload failed: {exc}")

    url = (
        f"{settings.CF_R2_PUBLIC_URL.rstrip('/')}/{key}"
        if settings.CF_R2_PUBLIC_URL
        else f"r2://{settings.CF_R2_BUCKET_NAME}/{key}"
    )
    return {"url": url, "width": width, "height": height}


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

@admin_router.post("/upload-image")
async def admin_upload_blog_image(
    file: UploadFile = File(...),
    _admin: User = Depends(get_current_content_admin),
):
    """Uploads an image (used for both the Cover Image field and images
    inserted into the post body) and returns its URL plus natural pixel
    dimensions -- see _save_blog_image() for storage/resize details."""
    return await _save_blog_image(file)


@admin_router.get("/posts", response_model=BlogPostListResponse)
async def admin_list_posts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(draft|published)$"),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_content_admin),
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
    _admin: User = Depends(get_current_content_admin),
):
    post = await db.get(BlogPost, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return post


@admin_router.post("/posts", response_model=BlogPostOut, status_code=status.HTTP_201_CREATED)
async def admin_create_post(
    body: BlogPostCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_content_admin),
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
        cover_image_caption=body.cover_image_caption,
        cover_image_attribution=body.cover_image_attribution,
        cover_image_width=body.cover_image_width,
        cover_image_height=body.cover_image_height,
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
    _admin: User = Depends(get_current_content_admin),
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
    _admin: User = Depends(get_current_content_admin),
):
    post = await db.get(BlogPost, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    await db.delete(post)
    await db.commit()
