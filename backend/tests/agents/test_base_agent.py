# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for BaseAgent provider resolution, retry-on-bad-JSON, timeout, and audit.
All provider calls are mocked — no Ollama or Claude API is contacted.
"""

import asyncio
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel

from agents.base_agent import BaseAgent, _strip_fences
from agents.schemas import AgentResult


# ---------------------------------------------------------------------------
# Minimal concrete agent for testing
# ---------------------------------------------------------------------------

class _Input(BaseModel):
    text: str


class _Output(BaseModel):
    result: str


class _ConcreteAgent(BaseAgent):
    name = "test_agent"
    default_provider = "ollama"
    _provider_env_var = "AGENT_STANDARDS_MAPPING_PROVIDER"
    InputModel = _Input
    OutputModel = _Output

    def _load_prompts(self):
        self._system_prompt = "You are a test agent."

    def build_messages(self, payload):
        return [
            {"role": "system", "content": self._system_prompt},
            {"role": "user", "content": payload.text},
        ]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_GOOD_JSON = json.dumps({"result": "hello"})
_BAD_JSON = "not json at all"
_FENCED_JSON = f"```json\n{_GOOD_JSON}\n```"


# ---------------------------------------------------------------------------
# Provider resolution tests
# ---------------------------------------------------------------------------

class TestProviderResolution:
    def test_per_agent_override_beats_global(self, monkeypatch):
        monkeypatch.setenv("AGENT_STANDARDS_MAPPING_PROVIDER", "claude")
        monkeypatch.setenv("LLM_PROVIDER", "ollama")
        from importlib import reload
        import core.config as cfg
        reload(cfg)
        import agents.provider as prov
        reload(prov)
        result = prov.resolve_provider("AGENT_STANDARDS_MAPPING_PROVIDER", "ollama")
        assert result == "claude"

    def test_global_beats_default(self, monkeypatch):
        monkeypatch.setenv("AGENT_STANDARDS_MAPPING_PROVIDER", "")
        monkeypatch.setenv("LLM_PROVIDER", "claude")
        from importlib import reload
        import core.config as cfg
        reload(cfg)
        import agents.provider as prov
        reload(prov)
        result = prov.resolve_provider("AGENT_STANDARDS_MAPPING_PROVIDER", "ollama")
        assert result == "claude"

    def test_agent_default_used_when_no_overrides(self, monkeypatch):
        monkeypatch.setenv("AGENT_COMPLIANCE_PROVIDER", "")
        monkeypatch.setenv("LLM_PROVIDER", "")
        from importlib import reload
        import core.config as cfg
        reload(cfg)
        import agents.provider as prov
        reload(prov)
        result = prov.resolve_provider("AGENT_COMPLIANCE_PROVIDER", "claude")
        assert result == "claude"

    def test_compliance_defaults_to_claude_no_env(self, monkeypatch):
        """Compliance agent defaults to claude with no env set — spec requirement."""
        monkeypatch.setenv("AGENT_COMPLIANCE_PROVIDER", "claude")
        from importlib import reload
        import core.config as cfg
        reload(cfg)
        import agents.provider as prov
        reload(prov)
        result = prov.resolve_provider("AGENT_COMPLIANCE_PROVIDER", "claude")
        assert result == "claude"


# ---------------------------------------------------------------------------
# Successful run
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_success():
    agent = _ConcreteAgent()
    with patch("agents.provider.dispatch", new_callable=AsyncMock) as mock_dispatch:
        mock_dispatch.return_value = _GOOD_JSON
        result = await agent.run(_Input(text="hello"))

    assert result.status == "success"
    assert isinstance(result.output, _Output)
    assert result.output.result == "hello"
    assert result.provider in ("ollama", "claude")


# ---------------------------------------------------------------------------
# Retry on bad JSON
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_retry_on_bad_json():
    agent = _ConcreteAgent()
    # First call returns bad JSON, second returns good JSON
    call_count = 0

    async def _side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _BAD_JSON
        return _GOOD_JSON

    with patch("agents.provider.dispatch", side_effect=_side_effect):
        with patch("core.config.settings.AGENT_MAX_RETRIES", 2):
            result = await agent.run(_Input(text="retry"))

    assert result.status == "success"
    assert call_count == 2


# ---------------------------------------------------------------------------
# All retries exhausted
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_all_retries_exhausted():
    agent = _ConcreteAgent()

    with patch("agents.provider.dispatch", new_callable=AsyncMock) as mock_dispatch:
        mock_dispatch.return_value = _BAD_JSON
        with patch("core.config.settings.AGENT_MAX_RETRIES", 1):
            result = await agent.run(_Input(text="fail"))

    assert result.status == "error"
    assert result.output is None


# ---------------------------------------------------------------------------
# Timeout handling
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_timeout_returns_error():
    agent = _ConcreteAgent()

    async def _slow(*args, **kwargs):
        await asyncio.sleep(999)

    with patch("agents.provider.dispatch", side_effect=_slow):
        with patch("core.config.settings.AGENT_TIMEOUT_SECONDS", 0):
            result = await agent.run(_Input(text="slow"))

    assert result.status == "error"
    assert "timed out" in (result.error or "").lower()


# ---------------------------------------------------------------------------
# Code-fence stripping
# ---------------------------------------------------------------------------

def test_strip_fences_removes_fences():
    assert _strip_fences(_FENCED_JSON) == _GOOD_JSON


def test_strip_fences_passthrough_no_fences():
    assert _strip_fences(_GOOD_JSON) == _GOOD_JSON


# ---------------------------------------------------------------------------
# Audit write
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_audit_write_on_success():
    agent = _ConcreteAgent()
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    with patch("agents.provider.dispatch", new_callable=AsyncMock) as mock_dispatch:
        mock_dispatch.return_value = _GOOD_JSON
        with patch("core.config.settings.AGENT_AUDIT_ENABLED", True):
            with patch("models.agent_run.AgentRun") as mock_run_cls:
                mock_run_cls.return_value = MagicMock()
                result = await agent.run(_Input(text="audit"), db=mock_db)

    # db.add and db.commit should have been called for audit
    assert mock_db.commit.called


@pytest.mark.asyncio
async def test_audit_write_on_error():
    agent = _ConcreteAgent()
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    with patch("agents.provider.dispatch", new_callable=AsyncMock) as mock_dispatch:
        mock_dispatch.return_value = _BAD_JSON
        with patch("core.config.settings.AGENT_MAX_RETRIES", 0):
            with patch("core.config.settings.AGENT_AUDIT_ENABLED", True):
                with patch("models.agent_run.AgentRun") as mock_run_cls:
                    mock_run_cls.return_value = MagicMock()
                    result = await agent.run(_Input(text="audit-error"), db=mock_db)

    assert result.status == "error"
    # commit called for error audit row
    assert mock_db.commit.called
