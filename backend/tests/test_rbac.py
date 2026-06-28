# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for RBAC ownership helpers and auth-gated curriculum endpoints.
Covers: require_owns_resource, require_same_org, and curriculum route auth.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from uuid import uuid4


# ── require_owns_resource ─────────────────────────────────────────────────────

def test_require_owns_resource_same_user_passes():
    from core.dependencies import require_owns_resource
    from models.database import UserRole
    user = MagicMock()
    user.id = "abc"
    user.role = UserRole.TEACHER
    require_owns_resource("abc", user)  # should not raise


def test_require_owns_resource_different_user_raises_403():
    from core.dependencies import require_owns_resource
    from models.database import UserRole
    user = MagicMock()
    user.id = "abc"
    user.role = UserRole.TEACHER
    with pytest.raises(HTTPException) as exc:
        require_owns_resource("xyz", user)
    assert exc.value.status_code == 403


def test_require_owns_resource_admin_bypasses():
    from core.dependencies import require_owns_resource
    from models.database import UserRole
    user = MagicMock()
    user.id = "abc"
    user.role = UserRole.ADMIN
    require_owns_resource("xyz", user)  # admin passes even for different owner


def test_require_owns_resource_admin_blocked_when_allow_admin_false():
    from core.dependencies import require_owns_resource
    from models.database import UserRole
    user = MagicMock()
    user.id = "abc"
    user.role = UserRole.ADMIN
    with pytest.raises(HTTPException) as exc:
        require_owns_resource("xyz", user, allow_admin=False)
    assert exc.value.status_code == 403


def test_require_owns_resource_uuid_string_coercion():
    """UUIDs and strings with same value should be considered equal."""
    from core.dependencies import require_owns_resource
    from models.database import UserRole
    uid = uuid4()
    user = MagicMock()
    user.id = uid
    user.role = UserRole.TEACHER
    require_owns_resource(str(uid), user)  # should not raise


def test_require_owns_resource_custom_resource_name_in_detail():
    from core.dependencies import require_owns_resource
    from models.database import UserRole
    user = MagicMock()
    user.id = "abc"
    user.role = UserRole.TEACHER
    with pytest.raises(HTTPException) as exc:
        require_owns_resource("xyz", user, resource_name="activity")
    assert "activity" in exc.value.detail


# ── require_same_org ──────────────────────────────────────────────────────────

def test_require_same_org_same_org_passes():
    from core.dependencies import require_same_org
    from models.database import UserRole
    user = MagicMock()
    user.org_id = "org1"
    user.role = UserRole.TEACHER
    require_same_org("org1", user)  # should not raise


def test_require_same_org_different_org_raises_403():
    from core.dependencies import require_same_org
    from models.database import UserRole
    user = MagicMock()
    user.org_id = "org1"
    user.role = UserRole.TEACHER
    with pytest.raises(HTTPException) as exc:
        require_same_org("org2", user)
    assert exc.value.status_code == 403


def test_require_same_org_none_user_org_passes():
    from core.dependencies import require_same_org
    from models.database import UserRole
    user = MagicMock()
    user.org_id = None
    user.role = UserRole.TEACHER
    require_same_org("org1", user)  # None org_id = personal resource, pass


def test_require_same_org_none_resource_org_passes():
    from core.dependencies import require_same_org
    from models.database import UserRole
    user = MagicMock()
    user.org_id = "org1"
    user.role = UserRole.TEACHER
    require_same_org(None, user)  # resource has no org, pass


def test_require_same_org_admin_bypasses():
    from core.dependencies import require_same_org
    from models.database import UserRole
    user = MagicMock()
    user.org_id = "org1"
    user.role = UserRole.ADMIN
    require_same_org("org2", user)  # admin passes even for different org


def test_require_same_org_admin_blocked_when_allow_admin_false():
    from core.dependencies import require_same_org
    from models.database import UserRole
    user = MagicMock()
    user.org_id = "org1"
    user.role = UserRole.ADMIN
    with pytest.raises(HTTPException) as exc:
        require_same_org("org2", user, allow_admin=False)
    assert exc.value.status_code == 403


# ── Integration: curriculum endpoints require auth ────────────────────────────

@pytest.mark.asyncio
async def test_curriculum_get_requires_auth():
    """GET /curriculum/{id} must return 401/403 without a valid auth token."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from routes.curriculum import router
    from core.database import get_db

    app = FastAPI()
    app.include_router(router, prefix="/curriculum")

    client = TestClient(app, raise_server_exceptions=False)
    r = client.get(f"/curriculum/{uuid4()}")
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


@pytest.mark.asyncio
async def test_curriculum_list_requires_auth():
    """GET /curriculum/ must return 401/403 without a valid auth token."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from routes.curriculum import router

    app = FastAPI()
    app.include_router(router, prefix="/curriculum")

    client = TestClient(app, raise_server_exceptions=False)
    r = client.get("/curriculum/")
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


@pytest.mark.asyncio
async def test_curriculum_create_requires_teacher():
    """POST /curriculum/ must return 401/403 without a valid teacher token."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from routes.curriculum import router

    app = FastAPI()
    app.include_router(router, prefix="/curriculum")

    client = TestClient(app, raise_server_exceptions=False)
    r = client.post("/curriculum/", json={
        "title": "Test", "description": "Test", "subject": "Science",
        "grade_level": 5, "content": {}
    })
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"
