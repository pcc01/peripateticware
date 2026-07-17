# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for AI inference provider-unavailable handling (routes/inference.py)
and the call_ollama() temperature/num_predict kwargs regression
(agents/provider.py).

Strategy
--------
- Mirrors tests/test_parent_portal.py's no-real-DB pattern: minimal FastAPI
  app with just the inference router, AsyncMock for get_db, MagicMock fake
  user overriding get_current_user, and the ai_rate_limit dependency
  overridden to a no-op so no Redis connection is required.
"""

from __future__ import annotations

import httpx
import pytest
import pytest_asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

pytest.importorskip("fastapi")
pytest.importorskip("httpx")


# ---------------------------------------------------------------------------
# Build a minimal test app with only the inference router registered.
# ---------------------------------------------------------------------------

def _make_app() -> FastAPI:
    from fastapi import FastAPI as _FA
    test_app = _FA()
    from routes.inference import router as inference_router
    test_app.include_router(inference_router, prefix="/api/v1/inference")
    return test_app


def _fake_user(uid: UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = uid or uuid4()
    user.email = "student@example.com"
    user.full_name = "Test Student"
    user.role = "STUDENT"
    user.is_active = True
    user.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    return user


@pytest_asyncio.fixture
async def ctx():
    """
    Yields a dict with:
      client – AsyncClient aimed at the test app
      db     – AsyncMock for the DB session
      user   – the fake User object
    """
    from core.database import get_db
    from core.dependencies import get_current_user
    from core.rate_limit import ai_rate_limit

    app = _make_app()
    user = _fake_user()
    db = AsyncMock()

    # Default execute() chain: no session-ownership row, no cache hit.
    execute_result = MagicMock()
    execute_result.fetchone.return_value = None
    execute_result.scalar_one_or_none.return_value = None
    execute_result.mappings.return_value.all.return_value = []
    execute_result.mappings.return_value.fetchone.return_value = None
    execute_result.scalar.return_value = None
    db.execute.return_value = execute_result
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    # Bypass Redis-backed rate limiting entirely for these tests.
    app.dependency_overrides[ai_rate_limit] = lambda: None

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield {"client": client, "db": db, "user": user}


def _inquiry_payload(**overrides) -> dict:
    payload = {
        "session_id": str(uuid4()),
        "input_type": "text",
        "text": "I see a tall tree with red leaves.",
        "location_name": "Forest Park",
        "curriculum_context": {"subject": "Biology", "grade_level": 5},
        "persona_context": {},
    }
    payload.update(overrides)
    return payload


# ===========================================================================
# 1. POST /inference/inquiry — 503 when the LLM provider is unreachable
# ===========================================================================

@pytest.mark.asyncio
async def test_process_inquiry_returns_503_on_provider_unavailable(ctx):
    """process_inquiry surfaces ProviderUnavailableError as HTTP 503, not a
    generic 500."""
    client = ctx["client"]

    from agents.provider import ProviderUnavailableError

    with patch(
        "routes.inference._call_llm_inference",
        new=AsyncMock(side_effect=ProviderUnavailableError("Ollama provider unreachable: connection refused")),
    ):
        resp = await client.post(
            "/api/v1/inference/inquiry",
            json=_inquiry_payload(),
        )

    assert resp.status_code == 503
    assert "unavailable" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_process_inquiry_returns_503_when_ollama_connect_error_propagates(ctx):
    """If the lower-level HTTP call itself raises ProviderUnavailableError
    (as agents/provider.py::call_ollama does on httpx.ConnectError), that
    still surfaces as a 503 through the full _call_llm_inference chain."""
    client = ctx["client"]

    from agents.provider import ProviderUnavailableError

    async def _raise_unavailable(*args, **kwargs):
        raise ProviderUnavailableError("Ollama provider unreachable: connection refused")

    with patch("routes.inference._call_ollama_inference", new=AsyncMock(side_effect=_raise_unavailable)):
        with patch("core.config.settings.LLM_PROVIDER", "ollama"):
            resp = await client.post(
                "/api/v1/inference/inquiry",
                json=_inquiry_payload(input_text="pre-built prompt from client"),
            )

    assert resp.status_code == 503
    assert "unavailable" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_process_inquiry_returns_500_on_generic_error(ctx):
    """Non-provider errors still surface as a generic 500 (sanity check that
    the 503 branch is specific to ProviderUnavailableError)."""
    client = ctx["client"]

    with patch(
        "routes.inference._call_llm_inference",
        new=AsyncMock(side_effect=RuntimeError("boom")),
    ):
        resp = await client.post(
            "/api/v1/inference/inquiry",
            json=_inquiry_payload(),
        )

    assert resp.status_code == 500


# ===========================================================================
# 2. call_ollama() accepts temperature/num_predict kwargs without TypeError
# ===========================================================================

@pytest.mark.asyncio
async def test_call_ollama_accepts_temperature_and_num_predict_kwargs():
    """Regression test: call_ollama() previously crashed with a TypeError
    when invoked with temperature=/num_predict= kwargs (as routes/inference.py
    ::_call_ollama_inference does for the Peri-prompt branch). It must accept
    and forward them without raising."""
    from agents.provider import call_ollama

    fake_response = MagicMock()
    fake_response.status_code = 200
    fake_response.json.return_value = {"message": {"content": "What do you notice about the leaves?"}}

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=fake_response)
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = False

    with patch("httpx.AsyncClient", return_value=mock_client):
        result = await call_ollama(
            messages=[{"role": "user", "content": "Hello"}],
            model="llama3",
            temperature=0.65,
            num_predict=180,
        )

    assert result == "What do you notice about the leaves?"

    # Confirm the kwargs were actually forwarded into the request payload,
    # not just silently accepted and dropped.
    _, call_kwargs = mock_client.post.call_args
    sent_options = call_kwargs["json"]["options"]
    assert sent_options["temperature"] == 0.65
    assert sent_options["num_predict"] == 180


@pytest.mark.asyncio
async def test_call_ollama_raises_provider_unavailable_on_connect_error():
    """call_ollama() converts httpx connection failures into
    ProviderUnavailableError so routes/inference.py can map them to 503."""
    from agents.provider import call_ollama, ProviderUnavailableError

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = False

    with patch("httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(ProviderUnavailableError):
            await call_ollama(
                messages=[{"role": "user", "content": "Hello"}],
                temperature=0.2,
                num_predict=4096,
            )
