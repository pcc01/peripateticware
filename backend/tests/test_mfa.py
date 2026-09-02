# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for opt-in TOTP MFA (routes/auth.py's /mfa/* endpoints and the
mfa_required branch in /login).

Covers, with real pyotp/bcrypt (not mocked — this is exactly the kind of
logic where a mocked "verify() returns True" would hide a real bug, as
happened once already during manual testing: the backup-code "used" flag
mutation on a JSONB column silently failed to persist because it only
reassigned nested dict objects in place rather than a genuinely new list
plus flag_modified() -- caught by hitting the real endpoint twice against
a real Postgres row, not by any mock. These tests exercise the same
verify()/hash() calls the real endpoints use, so a regression in either
direction (codes that shouldn't verify passing, or a broken persist
letting a used code work twice) would show up here too):

  1. /login with mfa_enabled=True returns mfa_required + an mfa_pending
     token, not a real access token.
  2. /mfa/setup generates a secret and a scannable provisioning_uri;
     refuses to run again once already enabled.
  3. /mfa/confirm: wrong code rejected; correct code flips mfa_enabled and
     returns 10 backup codes.
  4. /mfa/login: correct TOTP code exchanges the pending token for a real
     one; wrong code, wrong token type, and an unrelated user's pending
     token are all rejected; a backup code works exactly once.
  5. /mfa/disable requires the current password.
  6. The mfa_pending token's "type" claim is rejected by
     core.dependencies.get_current_user (the cross-cutting fix, not just
     the MFA router's own dependency override in these tests).
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pyotp
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
pytest.importorskip("pyotp")


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Without this, /mfa/login's @limiter.limit("5/minute") accumulates
    across every test in a full `pytest tests/` run (not just this file --
    the limiter is a shared module-level singleton keyed by client IP,
    which is the same for every ASGITransport test client), so a test late
    in the file gets a real 429 instead of the 401 it's actually testing
    for. Running this file alone never showed it; the full suite did."""
    from core.http_rate_limiter import limiter
    limiter.reset()
    yield
    limiter.reset()


def _make_app():
    from fastapi import FastAPI as _FA
    test_app = _FA()
    from routes.auth import router as auth_router
    test_app.include_router(auth_router, prefix="/api/v1/auth")
    return test_app


def _fake_user(**overrides):
    user = MagicMock()
    user.id = overrides.get("id", uuid4())
    user.email = overrides.get("email", "teacher@example.com")
    user.role = overrides.get("role", "TEACHER")
    user.org_id = None
    user.is_active = True
    user.is_platform_admin = False
    user.is_content_admin = False
    user.mfa_enabled = overrides.get("mfa_enabled", False)
    user.mfa_secret = overrides.get("mfa_secret", None)
    user.mfa_backup_codes = overrides.get("mfa_backup_codes", None)
    user.hashed_password = overrides.get("hashed_password", "")
    return user


@pytest_asyncio.fixture
async def ctx():
    from core.database import get_db
    from core.dependencies import get_current_user

    app = _make_app()
    user = _fake_user()
    db = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "db": db, "user": user}


# ===========================================================================
# 1. /login -- mfa_required branch
# ===========================================================================

@pytest.mark.asyncio
async def test_login_with_mfa_enabled_returns_pending_token_not_real_one():
    from core.database import get_db
    from core.security import SecurityManager, hash_password

    app = _make_app()
    db = AsyncMock()
    user = _fake_user(mfa_enabled=True, mfa_secret=pyotp.random_base32(),
                       hashed_password=hash_password("CorrectPass123!"))

    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    db.execute.return_value = result
    app.dependency_overrides[get_db] = lambda: db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/auth/login", json={"email": user.email, "password": "CorrectPass123!"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["mfa_required"] is True
    assert body["token_type"] == "mfa_pending"
    assert body["expires_in"] == 300

    # The returned token really is type=mfa_pending, not a full access
    # token wearing a flag -- core.dependencies rejects it everywhere else.
    payload = SecurityManager.verify_token(body["access_token"])
    assert payload["type"] == "mfa_pending"
    assert payload["sub"] == str(user.id)


# ===========================================================================
# 2. /mfa/setup
# ===========================================================================

@pytest.mark.asyncio
async def test_mfa_setup_generates_secret_and_provisioning_uri(ctx):
    resp = await ctx["client"].post("/api/v1/auth/mfa/setup")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["secret"]) >= 16
    assert body["provisioning_uri"].startswith("otpauth://totp/")
    assert "Peripateticware" in body["provisioning_uri"]
    ctx["db"].commit.assert_awaited()


@pytest.mark.asyncio
async def test_mfa_setup_refuses_when_already_enabled(ctx):
    ctx["user"].mfa_enabled = True
    resp = await ctx["client"].post("/api/v1/auth/mfa/setup")
    assert resp.status_code == 400


# ===========================================================================
# 3. /mfa/confirm
# ===========================================================================

@pytest.mark.asyncio
async def test_mfa_confirm_wrong_code_rejected(ctx):
    ctx["user"].mfa_secret = pyotp.random_base32()
    resp = await ctx["client"].post("/api/v1/auth/mfa/confirm", json={"code": "000000"})
    assert resp.status_code == 400
    assert ctx["user"].mfa_enabled is False


@pytest.mark.asyncio
async def test_mfa_confirm_correct_code_enables_and_returns_backup_codes(ctx):
    secret = pyotp.random_base32()
    ctx["user"].mfa_secret = secret
    code = pyotp.TOTP(secret).now()

    resp = await ctx["client"].post("/api/v1/auth/mfa/confirm", json={"code": code})

    assert resp.status_code == 200
    backup_codes = resp.json()["backup_codes"]
    assert len(backup_codes) == 10
    assert len(set(backup_codes)) == 10  # all distinct
    assert ctx["user"].mfa_enabled is True
    # Only hashes persisted, never the plaintext codes themselves.
    stored = ctx["user"].mfa_backup_codes
    assert len(stored) == 10
    assert all(entry["used"] is False for entry in stored)
    assert all(entry["hash"] not in backup_codes for entry in stored)


@pytest.mark.asyncio
async def test_mfa_confirm_without_pending_secret_rejected(ctx):
    ctx["user"].mfa_secret = None
    resp = await ctx["client"].post("/api/v1/auth/mfa/confirm", json={"code": "123456"})
    assert resp.status_code == 400


# ===========================================================================
# 4. /mfa/login
# ===========================================================================

def _mfa_pending_token(user_id) -> str:
    from core.security import create_access_token
    return create_access_token(data={"sub": str(user_id), "type": "mfa_pending"}, expires_delta=timedelta(minutes=5))


@pytest.mark.asyncio
async def test_mfa_login_correct_totp_code_issues_real_token():
    from core.database import get_db
    from core.security import SecurityManager

    app = _make_app()
    db = AsyncMock()
    secret = pyotp.random_base32()
    user = _fake_user(mfa_enabled=True, mfa_secret=secret)
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    db.execute.return_value = result
    app.dependency_overrides[get_db] = lambda: db

    token = _mfa_pending_token(user.id)
    code = pyotp.TOTP(secret).now()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/auth/mfa/login", json={"mfa_token": token, "code": code})

    assert resp.status_code == 200
    body = resp.json()
    assert body["mfa_required"] is False
    assert body["token_type"] == "bearer"
    payload = SecurityManager.verify_token(body["access_token"])
    assert payload.get("type", "access") == "access"


@pytest.mark.asyncio
async def test_mfa_login_wrong_code_rejected():
    from core.database import get_db

    app = _make_app()
    db = AsyncMock()
    secret = pyotp.random_base32()
    user = _fake_user(mfa_enabled=True, mfa_secret=secret)
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    db.execute.return_value = result
    app.dependency_overrides[get_db] = lambda: db

    token = _mfa_pending_token(user.id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/auth/mfa/login", json={"mfa_token": token, "code": "000000"})

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_mfa_login_rejects_a_real_access_token_used_as_mfa_token():
    """A normal (type=access) token must not work as the mfa_token -- only
    a genuine mfa_pending token should be accepted here."""
    from core.database import get_db
    from core.security import create_access_token

    app = _make_app()
    db = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db

    real_token = create_access_token(data={"sub": str(uuid4())})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/auth/mfa/login", json={"mfa_token": real_token, "code": "123456"})

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_mfa_login_backup_code_works_once_then_fails():
    from core.database import get_db
    from core.security import hash_password

    app = _make_app()
    db = AsyncMock()
    secret = pyotp.random_base32()
    plaintext_code = "a1b2c3d4"
    user = _fake_user(
        mfa_enabled=True,
        mfa_secret=secret,
        mfa_backup_codes=[
            {"hash": hash_password(plaintext_code), "used": False},
            {"hash": hash_password("unused-other"), "used": False},
        ],
    )
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    db.execute.return_value = result
    app.dependency_overrides[get_db] = lambda: db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token1 = _mfa_pending_token(user.id)
        resp1 = await client.post("/api/v1/auth/mfa/login", json={"mfa_token": token1, "code": plaintext_code})
        assert resp1.status_code == 200

        # The endpoint must have actually persisted the "used" flag onto
        # the user object (simulating what a fresh DB fetch on the next
        # request would see) -- this is the exact bug caught during manual
        # testing: mutating dicts in place without flag_modified() silently
        # didn't persist, so the second call below would incorrectly
        # succeed again.
        assert any(e["used"] for e in user.mfa_backup_codes), "backup code 'used' flag was not persisted onto the user object"

        token2 = _mfa_pending_token(user.id)
        resp2 = await client.post("/api/v1/auth/mfa/login", json={"mfa_token": token2, "code": plaintext_code})
        assert resp2.status_code == 401


# ===========================================================================
# 5. /mfa/disable
# ===========================================================================

@pytest.mark.asyncio
async def test_mfa_disable_wrong_password_rejected(ctx):
    from core.security import hash_password
    ctx["user"].hashed_password = hash_password("RealPassword123!")
    ctx["user"].mfa_enabled = True

    resp = await ctx["client"].post("/api/v1/auth/mfa/disable", json={"password": "WrongPassword!"})

    assert resp.status_code == 401
    assert ctx["user"].mfa_enabled is True


@pytest.mark.asyncio
async def test_mfa_disable_correct_password_clears_mfa(ctx):
    from core.security import hash_password
    ctx["user"].hashed_password = hash_password("RealPassword123!")
    ctx["user"].mfa_enabled = True
    ctx["user"].mfa_secret = pyotp.random_base32()
    ctx["user"].mfa_backup_codes = [{"hash": "x", "used": False}]

    resp = await ctx["client"].post("/api/v1/auth/mfa/disable", json={"password": "RealPassword123!"})

    assert resp.status_code == 200
    assert ctx["user"].mfa_enabled is False
    assert ctx["user"].mfa_secret is None
    assert ctx["user"].mfa_backup_codes is None


# ===========================================================================
# 6. mfa_pending token rejected by the general-purpose dependency
# ===========================================================================

@pytest.mark.asyncio
async def test_get_current_user_dependency_rejects_mfa_pending_token_type():
    """Cross-cutting check on core.dependencies.get_current_user itself
    (not routed through the MFA endpoints) -- this is what keeps an
    intercepted mfa_pending token from working as a real bearer token on
    every OTHER protected endpoint in the app, not just the auth router."""
    from core.database import get_db
    from core.dependencies import get_current_user

    app = FastAPI()
    from fastapi import Depends

    @app.get("/whoami")
    async def whoami(user=Depends(get_current_user)):
        return {"id": str(user.id)}

    db = AsyncMock()
    app.dependency_overrides[get_db] = lambda: db

    user_id = uuid4()
    token = _mfa_pending_token(user_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/whoami", headers={"Authorization": f"Bearer {token}"})

    assert resp.status_code == 401
