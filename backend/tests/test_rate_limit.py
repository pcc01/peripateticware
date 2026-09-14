# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for core/rate_limit.py -- the per-org sliding-window limiter
guarding every real, metered LLM call, including the two routes fixed
this session (routes/activities.py::classify_taxonomy,
routes/rubrics.py::generate_rubric_criteria, both newly given this
dependency) and the pre-existing routes/inference.py endpoints. Zero
automated coverage existed for this module before this file -- R10 in
STANDARDS_RUBRICS_TEST_PLAN.md flagged the threshold as only manually
checked (and not actually triggered in ~7 calls during that check).
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from core.rate_limit import (
    TIER_LIMITS,
    _UNAUTHENTICATED_LIMIT,
    check_ai_rate_limit,
    ai_rate_limit,
)


def _fake_redis_pipeline(count: int) -> MagicMock:
    """A MagicMock standing in for the object redis.pipeline() returns --
    check_ai_rate_limit() reads the zcard result at pipe.execute()[2]."""
    redis = MagicMock()
    pipe = MagicMock()
    pipe.zremrangebyscore = MagicMock()
    pipe.zadd = MagicMock()
    pipe.zcard = MagicMock()
    pipe.expire = MagicMock()
    pipe.execute = AsyncMock(return_value=[None, None, count, None])
    redis.pipeline = MagicMock(return_value=pipe)
    return redis


# ===========================================================================
# TIER_LIMITS sanity -- guards against an accidental edit silently changing
# a tier's allowance.
# ===========================================================================

def test_tier_limits_cover_every_documented_tier():
    expected = {
        "free": 5, "trial": 5, "starter": 10, "homeschool_family": 10,
        "homeschool_coop": 20, "school": 50, "school_byok": 50,
        "district": 200, "district_byok": 200, "enterprise": 1000,
    }
    assert TIER_LIMITS == expected


def test_unauthenticated_limit_is_generous_but_bounded():
    assert _UNAUTHENTICATED_LIMIT == 15


# ===========================================================================
# check_ai_rate_limit -- the sliding-window check itself
# ===========================================================================

@pytest.mark.asyncio
async def test_under_limit_does_not_raise():
    redis = _fake_redis_pipeline(count=4)
    await check_ai_rate_limit(redis, identity="org-1", limit=5)  # 4 <= 5, no exception


@pytest.mark.asyncio
async def test_at_exactly_the_limit_does_not_raise():
    """The check is count > limit, not count >= limit -- the Nth request
    in a window of N is still allowed."""
    redis = _fake_redis_pipeline(count=5)
    await check_ai_rate_limit(redis, identity="org-1", limit=5)


@pytest.mark.asyncio
async def test_over_limit_raises_429_with_a_specific_message():
    redis = _fake_redis_pipeline(count=6)
    with pytest.raises(HTTPException) as exc_info:
        await check_ai_rate_limit(redis, identity="org-1", limit=5)
    assert exc_info.value.status_code == 429
    assert "5 requests per 60s" in exc_info.value.detail


@pytest.mark.asyncio
async def test_different_identities_are_independent():
    """A different org/IP identity must key its own window -- confirmed by
    checking the Redis key each call builds from `identity`."""
    redis = _fake_redis_pipeline(count=1)
    await check_ai_rate_limit(redis, identity="org-a", limit=5)
    await check_ai_rate_limit(redis, identity="org-b", limit=5)
    calls = redis.pipeline.return_value.zremrangebyscore.call_args_list
    keys_touched = {c.args[0] for c in calls}
    assert keys_touched == {"ratelimit:ai:org-a", "ratelimit:ai:org-b"}


# ===========================================================================
# ai_rate_limit -- the FastAPI dependency: identity/limit resolution and
# fail-open behavior
# ===========================================================================

def _fake_request(auth_header: str | None = None, xff: str | None = None, client_host: str = "203.0.113.5"):
    req = MagicMock()
    headers = {}
    if auth_header:
        headers["authorization"] = auth_header
    if xff:
        headers["x-forwarded-for"] = xff
    req.headers = headers
    req.client = MagicMock(host=client_host)
    return req


@pytest.mark.asyncio
async def test_redis_unavailable_fails_open_not_closed():
    """A rate limiter that fails CLOSED when its backing store is down
    would take down every AI feature at once over an unrelated Redis
    outage -- confirm it degrades to "allow" instead."""
    with patch("core.rate_limit._get_redis", new=AsyncMock(return_value=None)):
        result = await ai_rate_limit(request=_fake_request(), db=AsyncMock())
    assert result is None  # no org resolved, no exception raised -- request proceeds


@pytest.mark.asyncio
async def test_no_bearer_token_falls_back_to_hashed_ip_with_unauthenticated_limit():
    redis = _fake_redis_pipeline(count=1)
    with patch("core.rate_limit._get_redis", new=AsyncMock(return_value=redis)):
        result = await ai_rate_limit(request=_fake_request(auth_header=None), db=AsyncMock())
    assert result is None  # no authenticated org
    # Identity is a hashed IP, not the raw address (privacy-preserving) --
    # confirm the key used isn't literally "ratelimit:ai:203.0.113.5".
    key_arg = redis.pipeline.return_value.zremrangebyscore.call_args.args[0]
    assert key_arg.startswith("ratelimit:ai:ip:")
    assert "203.0.113.5" not in key_arg


@pytest.mark.asyncio
async def test_invalid_bearer_token_treated_as_unauthenticated_not_fatal():
    """A malformed/expired token shouldn't crash the rate limiter itself --
    core.security.SecurityManager.extract_user_id_from_token raising must
    degrade to the same IP-based fallback, not propagate."""
    redis = _fake_redis_pipeline(count=1)
    with patch("core.rate_limit._get_redis", new=AsyncMock(return_value=redis)), \
         patch("core.security.SecurityManager.extract_user_id_from_token", side_effect=ValueError("bad token")):
        result = await ai_rate_limit(request=_fake_request(auth_header="Bearer garbage"), db=AsyncMock())
    assert result is None


@pytest.mark.asyncio
async def test_authenticated_user_with_org_uses_org_tier_limit():
    import uuid as _uuid
    redis = _fake_redis_pipeline(count=1)
    org_id = _uuid.uuid4()
    user_id = _uuid.uuid4()

    db = AsyncMock()
    row_result = MagicMock()
    row_result.fetchone.return_value = (str(org_id), "school")  # (org_id, license_tier)
    db.execute = AsyncMock(return_value=row_result)

    with patch("core.rate_limit._get_redis", new=AsyncMock(return_value=redis)), \
         patch("core.security.SecurityManager.extract_user_id_from_token", return_value=user_id):
        result = await ai_rate_limit(request=_fake_request(auth_header="Bearer valid-token"), db=db)

    assert result == str(org_id)
    key_arg = redis.pipeline.return_value.zremrangebyscore.call_args.args[0]
    assert key_arg == f"ratelimit:ai:{org_id}"


@pytest.mark.asyncio
async def test_free_tier_org_hits_429_on_the_sixth_call_in_a_window():
    """The concrete case R10 asked for: confirm the actual threshold for a
    free/trial org (5/min per TIER_LIMITS) actually fires -- this session's
    earlier manual check on the live stack didn't trigger it in ~7 calls
    because that test account wasn't on the free tier; this reproduces the
    free-tier case directly against the rate-limit logic itself."""
    import uuid as _uuid
    org_id = _uuid.uuid4()
    redis = _fake_redis_pipeline(count=6)  # the 6th call in the window

    db = AsyncMock()
    row_result = MagicMock()
    row_result.fetchone.return_value = (str(org_id), "free")
    db.execute = AsyncMock(return_value=row_result)

    with patch("core.rate_limit._get_redis", new=AsyncMock(return_value=redis)), \
         patch("core.security.SecurityManager.extract_user_id_from_token", return_value=_uuid.uuid4()):
        with pytest.raises(HTTPException) as exc_info:
            await ai_rate_limit(request=_fake_request(auth_header="Bearer valid-token"), db=db)

    assert exc_info.value.status_code == 429
    assert "5 requests per 60s" in exc_info.value.detail
