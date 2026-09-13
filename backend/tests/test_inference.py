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
from contextlib import asynccontextmanager
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


def _fake_user(
    uid: UUID | None = None,
    age_group: str | None = None,
    requires_parental_consent: bool = False,
) -> MagicMock:
    user = MagicMock()
    user.id = uid or uuid4()
    user.email = "student@example.com"
    user.full_name = "Test Student"
    user.role = "STUDENT"
    user.is_active = True
    user.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    # Explicit, not left to MagicMock's auto-attribute default: an unset
    # MagicMock attribute is itself a truthy MagicMock, which would make
    # _is_third_party_ai_sharing_permitted() (routes/inference.py) wrongly
    # read requires_parental_consent as True for every test using this
    # fixture, silently diverting the real-LLM-call tests above into the new
    # age-gated fallback branch instead. None/False here matches the real
    # User model's actual defaults (age_group nullable, requires_parental_consent
    # default=False) for a student with no age on file.
    user.age_group = age_group
    user.requires_parental_consent = requires_parental_consent
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


@asynccontextmanager
async def _client_for(user: MagicMock):
    """Like the `ctx` fixture above, but parameterized on the fake user --
    needed for the age-gate tests below, which must vary age_group/
    requires_parental_consent per test rather than use ctx's fixed default
    student."""
    from core.database import get_db
    from core.dependencies import get_current_user
    from core.rate_limit import ai_rate_limit

    app = _make_app()
    db = AsyncMock()

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
    app.dependency_overrides[ai_rate_limit] = lambda: None

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, db


def _chat_payload(**overrides) -> dict:
    payload = {"message": "What is this plant called?", "history": []}
    payload.update(overrides)
    return payload


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


# ===========================================================================
# 3. Third-party AI sharing age gate (routes/inference.py::
#    _is_third_party_ai_sharing_permitted) -- POST /inference/chat and
#    POST /inference/inquiry's real-student-text branch.
# ===========================================================================

@pytest.mark.asyncio
async def test_chat_blocks_llm_for_under_13_student():
    """An under-13 student's chat message never reaches the LLM -- graceful
    curated-bank fallback returned instead, as a normal 200."""
    user = _fake_user(age_group="under_13")
    async with _client_for(user) as (client, db):
        with patch("routes.inference._call_llm_inference", new=AsyncMock()) as mock_llm:
            resp = await client.post("/api/v1/inference/chat", json=_chat_payload())

    assert resp.status_code == 200
    mock_llm.assert_not_called()
    body = resp.json()
    assert body["response"]
    assert "curated" in body["response"].lower() or "question bank" in body["response"].lower()


@pytest.mark.asyncio
async def test_chat_blocks_llm_for_requires_parental_consent_student():
    """requires_parental_consent=True alone (age_group unset/None) also
    triggers the fallback -- the predicate is an OR, matching
    services/wayfinding_consent.py::age_floor_rung's `minor = (age_group ==
    "under_13") or rpc`."""
    user = _fake_user(age_group=None, requires_parental_consent=True)
    async with _client_for(user) as (client, db):
        with patch("routes.inference._call_llm_inference", new=AsyncMock()) as mock_llm:
            resp = await client.post("/api/v1/inference/chat", json=_chat_payload())

    assert resp.status_code == 200
    mock_llm.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("age_group", ["under_16", "under_18", "adult", None])
async def test_chat_calls_llm_for_non_under_13_students(age_group):
    """13+, adult, and unknown/null age_group students are unaffected -- the
    chat call proceeds to the LLM exactly as before."""
    user = _fake_user(age_group=age_group, requires_parental_consent=False)
    async with _client_for(user) as (client, db):
        with patch(
            "routes.inference._call_llm_inference",
            new=AsyncMock(return_value={"question": "Real LLM reply", "resources": [], "confidence": 0.9}),
        ) as mock_llm:
            resp = await client.post("/api/v1/inference/chat", json=_chat_payload())

    assert resp.status_code == 200
    mock_llm.assert_called_once()
    assert resp.json()["response"] == "Real LLM reply"


@pytest.mark.asyncio
async def test_chat_curated_only_activity_still_blocks_everyone_regardless_of_age():
    """The existing ai_interaction_mode=='curated_only' behaviour is an
    independent, orthogonal control -- unaffected by the age gate, and still
    forces curated for a 13+/adult student too (via the pre-existing 403),
    not just under-13 students."""
    user = _fake_user(age_group="adult")
    async with _client_for(user) as (client, db):
        # Simulate the activity lookup finding ai_interaction_mode='curated_only'.
        db.execute.return_value.fetchone.return_value = ("curated_only",)
        with patch("routes.inference._call_llm_inference", new=AsyncMock()) as mock_llm:
            resp = await client.post(
                "/api/v1/inference/chat",
                json=_chat_payload(activity_id=str(uuid4())),
            )

    assert resp.status_code == 403
    mock_llm.assert_not_called()


@pytest.mark.asyncio
async def test_inquiry_blocks_llm_for_under_13_student_real_observation_text():
    """process_inquiry's real-student-observation branch (payload carries
    `text`, not `input_text` -- InquiryInterface.tsx's shape) skips the LLM
    for an under-13 student and returns the same graceful curated fallback,
    not an error."""
    user = _fake_user(age_group="under_13")
    async with _client_for(user) as (client, db):
        with patch("routes.inference._call_llm_inference", new=AsyncMock()) as mock_llm:
            resp = await client.post(
                "/api/v1/inference/inquiry",
                json=_inquiry_payload(),
            )

    assert resp.status_code == 200
    mock_llm.assert_not_called()
    body = resp.json()
    assert body["next_question"]
    assert "curated" in body["next_question"].lower() or "question bank" in body["next_question"].lower()


@pytest.mark.asyncio
async def test_inquiry_calls_llm_for_13_plus_student_real_observation_text():
    """A 13+ student's real observation text still reaches the LLM exactly
    as before."""
    user = _fake_user(age_group="under_16")
    async with _client_for(user) as (client, db):
        with patch(
            "routes.inference._call_llm_inference",
            new=AsyncMock(return_value={"question": "What color are the leaves?", "resources": [], "confidence": 0.85}),
        ) as mock_llm:
            resp = await client.post(
                "/api/v1/inference/inquiry",
                json=_inquiry_payload(),
            )

    assert resp.status_code == 200
    mock_llm.assert_called_once()
    assert resp.json()["next_question"] == "What color are the leaves?"


@pytest.mark.asyncio
async def test_inquiry_teacher_authored_input_text_bypasses_age_gate():
    """The `input_text` branch (activity-builder's teacher-authored prompt,
    e.g. OllamaLessonSuggestions.tsx) carries no real student content, so it
    is NOT subject to the age gate -- even a nominally under-13 account
    (e.g. a teacher account with a stale/irrelevant age_group) still reaches
    the LLM for this branch."""
    user = _fake_user(age_group="under_13")
    async with _client_for(user) as (client, db):
        with patch(
            "routes.inference._call_llm_inference",
            new=AsyncMock(return_value={"question": "Suggested activity text", "resources": [], "confidence": 0.9}),
        ) as mock_llm:
            resp = await client.post(
                "/api/v1/inference/inquiry",
                json=_inquiry_payload(input_text="Generate 3 activity ideas for a 5th grade biology unit"),
            )

    assert resp.status_code == 200
    mock_llm.assert_called_once()
    assert resp.json()["next_question"] == "Suggested activity text"
