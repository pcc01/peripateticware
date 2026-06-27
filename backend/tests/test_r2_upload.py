# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for the _save_file() function in routes/student_activities.py.

The function:
  1. Sanitises the filename (regex strip of dangerous chars).
  2. If CF_R2_ACCOUNT_ID is empty  → writes to /app/uploads/ and returns a
     local /uploads/... URL.
  3. If CF_R2_ACCOUNT_ID is set    → calls boto3.client("s3").put_object()
     and returns an r2:// or CF_R2_PUBLIC_URL-prefixed URL.
  4. If boto3 raises ClientError   → raises HTTPException(500).

All tests patch `core.config.settings` attributes in-place so the module
under test always reads the patched values.  boto3 is patched at import-time
via `unittest.mock.patch`.
"""

from __future__ import annotations

import io
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from starlette.datastructures import UploadFile as StarletteUploadFile


# ---------------------------------------------------------------------------
# Helper: build an UploadFile-like object without needing Starlette internals
# ---------------------------------------------------------------------------

def _upload(filename: str, content: bytes = b"fake-file-content",
            content_type: str = "image/jpeg") -> MagicMock:
    """Return a MagicMock that looks like a FastAPI UploadFile."""
    uf = MagicMock()
    uf.filename = filename
    uf.content_type = content_type
    # `await upload.read()` must return bytes
    uf.read = AsyncMock(return_value=content)
    return uf


# ---------------------------------------------------------------------------
# Import the function under test lazily so patches applied per-test take
# effect before the function runs (settings are read at call-time, not import).
# ---------------------------------------------------------------------------

async def _call_save_file(upload, session_id=None):
    from routes.student_activities import _save_file
    if session_id is None:
        session_id = uuid4()
    return await _save_file(upload, session_id)


# ===========================================================================
# 1. Local fallback — CF_R2_ACCOUNT_ID is empty
# ===========================================================================

@pytest.mark.asyncio
async def test_save_file_local_fallback(tmp_path):
    """When CF_R2_ACCOUNT_ID is unset, writes to local disk and returns /uploads/... URL."""
    session_id = uuid4()
    upload = _upload("photo.jpg", b"hello")

    with patch("core.config.settings") as mock_settings:
        mock_settings.CF_R2_ACCOUNT_ID = ""
        # Redirect writes to tmp_path so we don't touch /app
        with patch("os.makedirs") as mock_makedirs, \
             patch("builtins.open", create=True) as mock_open:

            mock_open.return_value.__enter__ = lambda s: s
            mock_open.return_value.__exit__ = MagicMock(return_value=False)
            mock_open.return_value.write = MagicMock()

            url, size = await _call_save_file(upload, session_id)

    assert url.startswith("/uploads/sessions/")
    assert "photo.jpg" in url
    assert size == len(b"hello")
    mock_makedirs.assert_called_once()


# ===========================================================================
# 2. R2 upload path — boto3.client.put_object is called
# ===========================================================================

@pytest.mark.asyncio
async def test_save_file_r2_upload():
    """When CF_R2_ACCOUNT_ID is set, calls boto3 put_object and returns r2:// URL."""
    session_id = uuid4()
    upload = _upload("evidence.mp4", b"video-bytes", content_type="video/mp4")

    mock_s3_client = MagicMock()
    mock_s3_client.put_object = MagicMock(return_value={})

    with patch("core.config.settings") as mock_settings:
        mock_settings.CF_R2_ACCOUNT_ID = "abc123"
        mock_settings.CF_R2_ACCESS_KEY_ID = "key_id"
        mock_settings.CF_R2_SECRET_ACCESS_KEY = "secret"
        mock_settings.CF_R2_BUCKET_NAME = "test-bucket"
        mock_settings.CF_R2_PUBLIC_URL = ""  # no public URL → r2:// scheme

        with patch("boto3.client", return_value=mock_s3_client) as mock_boto3:
            url, size = await _call_save_file(upload, session_id)

    mock_boto3.assert_called_once_with(
        "s3",
        endpoint_url=f"https://abc123.r2.cloudflarestorage.com",
        aws_access_key_id="key_id",
        aws_secret_access_key="secret",
        region_name="auto",
    )
    mock_s3_client.put_object.assert_called_once()
    call_kwargs = mock_s3_client.put_object.call_args[1]
    assert call_kwargs["Bucket"] == "test-bucket"
    assert b"video-bytes" in call_kwargs["Body"] or call_kwargs["Body"] == b"video-bytes"

    assert url.startswith("r2://test-bucket/")
    assert "evidence.mp4" in url
    assert size == len(b"video-bytes")


# ===========================================================================
# 3. CF_R2_PUBLIC_URL is set — returned URL starts with that base
# ===========================================================================

@pytest.mark.asyncio
async def test_save_file_r2_public_url():
    """When CF_R2_PUBLIC_URL is set, returned URL starts with that base."""
    session_id = uuid4()
    upload = _upload("doc.pdf", b"pdf", content_type="application/pdf")
    public_base = "https://pub-deadbeef.r2.dev"

    mock_s3_client = MagicMock()
    mock_s3_client.put_object = MagicMock(return_value={})

    with patch("core.config.settings") as mock_settings:
        mock_settings.CF_R2_ACCOUNT_ID = "abc123"
        mock_settings.CF_R2_ACCESS_KEY_ID = "key_id"
        mock_settings.CF_R2_SECRET_ACCESS_KEY = "secret"
        mock_settings.CF_R2_BUCKET_NAME = "test-bucket"
        mock_settings.CF_R2_PUBLIC_URL = public_base

        with patch("boto3.client", return_value=mock_s3_client):
            url, _ = await _call_save_file(upload, session_id)

    assert url.startswith(public_base)
    assert "doc.pdf" in url


# ===========================================================================
# 4. boto3 raises ClientError → HTTPException(500)
# ===========================================================================

@pytest.mark.asyncio
async def test_save_file_r2_failure_raises_500():
    """When boto3.put_object raises ClientError, _save_file raises HTTPException(500)."""
    from botocore.exceptions import ClientError

    session_id = uuid4()
    upload = _upload("crash.jpg", b"crash")

    client_error = ClientError(
        {"Error": {"Code": "InternalError", "Message": "boom"}},
        "PutObject",
    )
    mock_s3_client = MagicMock()
    mock_s3_client.put_object = MagicMock(side_effect=client_error)

    with patch("core.config.settings") as mock_settings:
        mock_settings.CF_R2_ACCOUNT_ID = "abc123"
        mock_settings.CF_R2_ACCESS_KEY_ID = "key_id"
        mock_settings.CF_R2_SECRET_ACCESS_KEY = "secret"
        mock_settings.CF_R2_BUCKET_NAME = "test-bucket"
        mock_settings.CF_R2_PUBLIC_URL = ""

        with patch("boto3.client", return_value=mock_s3_client):
            with pytest.raises(HTTPException) as exc_info:
                await _call_save_file(upload, session_id)

    assert exc_info.value.status_code == 500
    assert "upload failed" in exc_info.value.detail.lower()


# ===========================================================================
# 5. Filename sanitisation — dangerous chars become underscores
# ===========================================================================

@pytest.mark.asyncio
async def test_save_file_sanitizes_filename():
    """Dangerous characters in the filename are replaced with underscores."""
    session_id = uuid4()
    # Path traversal + shell-special chars
    dangerous_name = "../../etc/passwd; rm -rf /"
    upload = _upload(dangerous_name, b"safe-content")

    with patch("core.config.settings") as mock_settings:
        mock_settings.CF_R2_ACCOUNT_ID = ""  # use local fallback

        with patch("os.makedirs"), patch("builtins.open", create=True) as mock_open:
            mock_open.return_value.__enter__ = lambda s: s
            mock_open.return_value.__exit__ = MagicMock(return_value=False)
            mock_open.return_value.write = MagicMock()

            url, _ = await _call_save_file(upload, session_id)

    # URL must not contain path-traversal or shell-dangerous chars
    assert ".." not in url
    assert ";" not in url
    assert " " not in url
    # Should have been collapsed to underscores
    assert "____etc_passwd__rm__rf__" in url or "__" in url
