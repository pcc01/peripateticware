# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Provider adapters for the agent layer.

call_claude(messages, model, max_tokens) -> str
call_ollama(messages, model) -> str

Both return the generated text string.
inference.py delegates its HTTP calls here so there is one canonical
implementation of the Anthropic and Ollama HTTP contracts.
"""

import httpx
import logging
from typing import Optional

from core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public adapters
# ---------------------------------------------------------------------------

async def call_claude(
    messages: list,
    model: Optional[str] = None,
    max_tokens: int = 2048,
    timeout: int = 120,
) -> str:
    """
    Call the Anthropic Messages API.

    Args:
        messages: list of {"role": "user"|"assistant"|"system", "content": str}
                  System messages should be passed as a leading "user" turn or
                  extracted and placed in the top-level 'system' field below.
        model: override model string; defaults to settings.CLAUDE_MODEL
        max_tokens: maximum tokens in the response
        timeout: HTTP timeout seconds

    Returns:
        Generated text string.

    Raises:
        RuntimeError on non-200 responses or network errors.
    """
    resolved_model = model or settings.CLAUDE_MODEL
    api_key = settings.CLAUDE_API_KEY or settings.ANTHROPIC_API_KEY

    # Separate system message if first message has role "system"
    system_content = None
    api_messages = list(messages)
    if api_messages and api_messages[0].get("role") == "system":
        system_content = api_messages[0]["content"]
        api_messages = api_messages[1:]

    payload: dict = {
        "model": resolved_model,
        "max_tokens": max_tokens,
        "messages": api_messages,
    }
    if system_content:
        payload["system"] = system_content

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=payload,
            )

        if response.status_code == 200:
            data = response.json()
            text = data["content"][0]["text"] if data.get("content") else ""
            logger.info("Claude call OK model=%s tokens_used=%s",
                        resolved_model, data.get("usage", {}).get("output_tokens"))
            return text
        else:
            detail = response.text[:300]
            logger.error("Claude API %s: %s", response.status_code, detail)
            raise RuntimeError(f"Claude API error {response.status_code}: {detail}")

    except RuntimeError:
        raise
    except Exception as exc:
        logger.error("Claude HTTP error: %s", exc)
        raise RuntimeError(f"Claude HTTP error: {exc}") from exc


async def call_ollama(
    messages: list,
    model: Optional[str] = None,
    timeout: int = 120,
) -> str:
    """
    Call Ollama /api/chat (messages format, not /api/generate).

    Args:
        messages: list of {"role": "system"|"user"|"assistant", "content": str}
        model: override model; defaults to settings.OLLAMA_MODEL_TEXT
        timeout: HTTP timeout seconds

    Returns:
        Generated text string.

    Raises:
        RuntimeError on non-200 responses or network errors.
    """
    resolved_model = model or settings.OLLAMA_MODEL_TEXT
    base_url = settings.OLLAMA_BASE_URL

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{base_url}/api/chat",
                json={
                    "model": resolved_model,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "temperature": 0.2,  # agents prefer low variance
                        "num_predict": 4096,
                    },
                },
            )

        if response.status_code == 200:
            data = response.json()
            text = data.get("message", {}).get("content", "")
            logger.info("Ollama call OK model=%s", resolved_model)
            return text
        else:
            detail = response.text[:300]
            logger.error("Ollama API %s: %s", response.status_code, detail)
            raise RuntimeError(f"Ollama API error {response.status_code}: {detail}")

    except RuntimeError:
        raise
    except Exception as exc:
        logger.error("Ollama HTTP error: %s", exc)
        raise RuntimeError(f"Ollama HTTP error: {exc}") from exc


# ---------------------------------------------------------------------------
# Provider resolution
# ---------------------------------------------------------------------------

def resolve_provider(
    agent_env_var: str,
    default_provider: str,
) -> str:
    """
    Resolution order:
      1. Per-agent env var (e.g. AGENT_COMPLIANCE_PROVIDER)
      2. Global LLM_PROVIDER
      3. Agent's declared default_provider

    Returns "ollama" or "claude".
    """
    per_agent = getattr(settings, agent_env_var, "").strip()
    if per_agent:
        return per_agent.lower()
    global_provider = settings.LLM_PROVIDER.strip()
    if global_provider:
        return global_provider.lower()
    return default_provider.lower()


def resolve_model(provider: str) -> Optional[str]:
    """Return the per-agent model override for the given provider, or None (use default)."""
    if provider == "claude":
        override = settings.AGENT_CLAUDE_MODEL.strip()
        return override if override else None
    else:
        override = settings.AGENT_OLLAMA_MODEL.strip()
        return override if override else None


async def dispatch(
    provider: str,
    messages: list,
    model: Optional[str] = None,
    max_tokens: int = 2048,
    timeout: int = 120,
) -> str:
    """Route to the correct provider and return generated text."""
    if provider == "claude":
        return await call_claude(messages, model=model, max_tokens=max_tokens, timeout=timeout)
    else:
        return await call_ollama(messages, model=model, timeout=timeout)
