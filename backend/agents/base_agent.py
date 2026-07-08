# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
BaseAgent — abstract base for all Peripateticware AI agents.

Subclass contract:
    class MyAgent(BaseAgent):
        name = "my_agent"
        default_provider = "ollama"
        InputModel = MyInput
        OutputModel = MyOutput
        _provider_env_var = "AGENT_MY_PROVIDER"

        def build_messages(self, payload: MyInput) -> list[dict]:
            ...
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional, Type

from pydantic import BaseModel, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from agents import provider as _provider
from agents.schemas import AgentResult
from core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_CODE_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```", re.IGNORECASE)


def _strip_fences(text: str) -> str:
    """Remove markdown code fences so json.loads works."""
    match = _CODE_FENCE.search(text)
    if match:
        return match.group(1).strip()
    return text.strip()


# ---------------------------------------------------------------------------
# BaseAgent
# ---------------------------------------------------------------------------

class BaseAgent(ABC):
    """Abstract base — every agent extends this class."""

    # ---- subclass declares these ----
    name: str = "base"
    default_provider: str = "ollama"
    _provider_env_var: str = "LLM_PROVIDER"  # settings attribute name for per-agent override

    InputModel: Type[BaseModel]
    OutputModel: Type[BaseModel]

    # ---- prompt loading ----
    _system_prompt: Optional[str] = None

    def __init__(self) -> None:
        self._load_prompts()

    def _prompt_dir(self) -> Path:
        return Path(__file__).parent / "prompts" / self.name.replace("_agent", "")

    def _load_prompts(self) -> None:
        prompt_path = self._prompt_dir() / "system.txt"
        if prompt_path.exists():
            self._system_prompt = prompt_path.read_text(encoding="utf-8").strip()
        else:
            logger.warning("Agent %s: no system prompt at %s", self.name, prompt_path)
            self._system_prompt = ""

    # ---- provider resolution ----
    def _resolved_provider(self) -> str:
        return _provider.resolve_provider(self._provider_env_var, self.default_provider)

    def _resolved_model(self, prov: str) -> Optional[str]:
        return _provider.resolve_model(prov)

    # ---- abstract interface ----

    @abstractmethod
    def build_messages(self, payload: BaseModel) -> list[dict]:
        """Compose the messages list (system + user) from the loaded prompt + payload."""

    # ---- run ----

    async def run(
        self,
        payload: BaseModel,
        *,
        user_id: Optional[uuid.UUID] = None,
        db: Optional[AsyncSession] = None,
    ) -> AgentResult:
        """
        Orchestrate: resolve provider -> call LLM -> validate output -> audit -> return.
        """
        prov = self._resolved_provider()
        model_override = self._resolved_model(prov)
        model_used = model_override or (
            settings.CLAUDE_MODEL if prov == "claude" else settings.OLLAMA_MODEL_TEXT
        )
        run_id = uuid.uuid4()
        start = time.monotonic()

        raw_text = ""
        status = "success"
        error_msg: Optional[str] = None
        output = None
        token_usage: Optional[dict] = None

        max_retries = settings.AGENT_MAX_RETRIES
        timeout = settings.AGENT_TIMEOUT_SECONDS

        for attempt in range(max_retries + 1):
            try:
                messages = self.build_messages(payload)
                raw_text = await asyncio.wait_for(
                    _provider.dispatch(
                        prov,
                        messages,
                        model=model_override,
                        max_tokens=4096,
                        timeout=timeout,
                    ),
                    timeout=timeout,
                )
                output = self._parse_output(raw_text)
                break  # success
            except (ValidationError, json.JSONDecodeError) as parse_err:
                if attempt < max_retries:
                    logger.warning("Agent %s parse error (attempt %d), retrying: %s",
                                   self.name, attempt + 1, parse_err)
                    continue
                status = "error"
                error_msg = f"Output parse failed after {max_retries + 1} attempts: {parse_err}"
                logger.error("Agent %s: %s", self.name, error_msg)
            except asyncio.TimeoutError:
                status = "error"
                error_msg = f"Timed out after {timeout}s"
                logger.error("Agent %s: %s", self.name, error_msg)
                break
            except Exception as exc:
                status = "error"
                error_msg = str(exc)
                logger.error("Agent %s error (attempt %d): %s", self.name, attempt + 1, exc)
                if attempt >= max_retries:
                    break

        latency_ms = int((time.monotonic() - start) * 1000)

        result = AgentResult(
            run_id=run_id,
            agent_name=self.name,
            provider=prov,
            model=model_used,
            output=output,
            latency_ms=latency_ms,
            token_usage=token_usage,
            status=status,
            error=error_msg,
        )

        if settings.AGENT_AUDIT_ENABLED and db is not None:
            await self._audit(result, user_id=user_id, db=db)

        return result

    def _parse_output(self, raw: str) -> BaseModel:
        """
        Strip code fences, parse JSON, validate against OutputModel.
        Subclasses may override for non-JSON responses.
        """
        cleaned = _strip_fences(raw)
        data = json.loads(cleaned)
        return self.OutputModel.model_validate(data)

    # ---- audit ----

    async def _audit(
        self,
        result: AgentResult,
        *,
        user_id: Optional[uuid.UUID],
        db: AsyncSession,
    ) -> None:
        """Write one row to agent_runs. Non-fatal — never raises."""
        try:
            from models.agent_run import AgentRun
            run = AgentRun(
                id=result.run_id,
                agent_name=result.agent_name,
                provider=result.provider,
                model=result.model,
                user_id=user_id,
                confidence=result.confidence,
                latency_ms=result.latency_ms,
                token_usage=result.token_usage,
                status=result.status,
                error=result.error,
            )
            db.add(run)
            await db.commit()
        except Exception as exc:
            logger.warning("Agent audit write failed (non-fatal): %s", exc)
