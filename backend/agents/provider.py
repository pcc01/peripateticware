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


class ProviderUnavailableError(RuntimeError):
    """Raised when a provider (Ollama/Claude) cannot be reached at all —
    connection refused/timed out — as distinct from a reachable provider
    that returned a non-200 error response. Callers should surface this
    distinctly (e.g. HTTP 503) rather than treating it like a generic
    generation failure."""
    pass


# ---------------------------------------------------------------------------
# Public adapters
# ---------------------------------------------------------------------------

async def call_claude(
    messages: list,
    model: Optional[str] = None,
    max_tokens: int = 2048,
    timeout: int = 120,
    images: Optional[list[str]] = None,
    temperature: Optional[float] = None,
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
        images: optional list of base64-encoded PNG images, attached as
                content blocks to the last user turn (vision calls — e.g.
                scanned-PDF OCR). Requires a vision-capable model; the
                configured ANTHROPIC_MODEL/CLAUDE_MODEL default is.
        temperature: optional override (0-1). Omitted -> API default (~1.0).
                     Pass low (e.g. 0.1) for structured/extraction output.

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
    if images:
        api_messages = _apply_images_to_last_user_message(
            api_messages, images, _b64_images_to_claude_blocks
        )

    payload: dict = {
        "model": resolved_model,
        "max_tokens": max_tokens,
        "messages": api_messages,
    }
    if system_content:
        # Content-block form with a caching breakpoint, not a bare string.
        # Every one of this codebase's 5 agents (activity_review,
        # rubric_scoring, standards_ingestion, standards_mapping,
        # compliance_report) loads a fully static system.txt per call —
        # ~250-1400 chars each — and re-sends it uncached every single time.
        # Same caveat as services/anthropic_client.py's _system_block(): a
        # block only actually gets cached above a minimum length (~2048
        # tokens for Haiku, ~1024 for Sonnet/Opus); cache_control is a no-op
        # below that, not an error.
        payload["system"] = [
            {"type": "text", "text": system_content, "cache_control": {"type": "ephemeral"}}
        ]
    if temperature is not None:
        payload["temperature"] = temperature

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
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as exc:
        logger.error("Claude provider unreachable: %s", exc)
        raise ProviderUnavailableError(f"Claude provider unreachable: {exc}") from exc
    except Exception as exc:
        logger.error("Claude HTTP error: %s", exc)
        raise RuntimeError(f"Claude HTTP error: {exc}") from exc


def _b64_images_to_claude_blocks(text: str, images: list[str]) -> list[dict]:
    """Turn a plain-text user message + base64 PNGs into Claude content blocks."""
    blocks: list[dict] = [
        {
            "type": "image",
            "source": {"type": "base64", "media_type": "image/png", "data": img},
        }
        for img in images
    ]
    if text:
        blocks.append({"type": "text", "text": text})
    return blocks


def _b64_images_to_openai_blocks(text: str, images: list[str]) -> list[dict]:
    """Turn a plain-text user message + base64 PNGs into OpenAI content blocks."""
    blocks: list[dict] = [{"type": "text", "text": text}] if text else []
    blocks.extend(
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img}"}}
        for img in images
    )
    return blocks


def _apply_images_to_last_user_message(
    messages: list, images: list[str], to_blocks
) -> list:
    """Return a copy of `messages` with `images` attached to the last user turn.

    `to_blocks(text, images) -> list[dict]` builds the provider-specific
    content-block shape. Leaves `messages` untouched if there's no user turn
    to attach to (shouldn't happen in practice, but fails safe rather than
    raising on a malformed message list).
    """
    out = [dict(m) for m in messages]
    for i in range(len(out) - 1, -1, -1):
        if out[i].get("role") == "user":
            text = out[i].get("content", "")
            if not isinstance(text, str):
                # Already block-shaped (caller built it themselves) — leave as-is.
                return out
            out[i] = {**out[i], "content": to_blocks(text, images)}
            return out
    return out


async def call_ollama(
    messages: list,
    model: Optional[str] = None,
    timeout: int = 120,
    temperature: Optional[float] = None,
    num_predict: Optional[int] = None,
    images: Optional[list[str]] = None,
) -> str:
    """
    Call Ollama /api/chat (messages format, not /api/generate).

    Args:
        messages: list of {"role": "system"|"user"|"assistant", "content": str}
        model: override model; defaults to settings.OLLAMA_MODEL_TEXT
        timeout: HTTP timeout seconds
        temperature: override the default 0.2 (low-variance agent default)
        num_predict: override the default 4096-token cap
        images: optional list of base64-encoded PNG images, attached to the
                last user turn's "images" field (Ollama's native vision
                format — requires a vision model, e.g. OLLAMA_MODEL_VISION).

    Returns:
        Generated text string.

    Raises:
        RuntimeError on non-200 responses or network errors.
    """
    resolved_model = model or settings.OLLAMA_MODEL_TEXT
    base_url = settings.OLLAMA_BASE_URL
    api_messages = messages
    if images:
        api_messages = [dict(m) for m in messages]
        for i in range(len(api_messages) - 1, -1, -1):
            if api_messages[i].get("role") == "user":
                api_messages[i]["images"] = images
                break

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{base_url}/api/chat",
                json={
                    "model": resolved_model,
                    "messages": api_messages,
                    "stream": False,
                    "options": {
                        "temperature": temperature if temperature is not None else 0.2,  # agents prefer low variance
                        "num_predict": num_predict if num_predict is not None else 4096,
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
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as exc:
        logger.error("Ollama provider unreachable: %s", exc)
        raise ProviderUnavailableError(f"Ollama provider unreachable: {exc}") from exc
    except Exception as exc:
        logger.error("Ollama HTTP error: %s", exc)
        raise RuntimeError(f"Ollama HTTP error: {exc}") from exc


async def call_openai(
    messages: list,
    model: Optional[str] = None,
    max_tokens: int = 2048,
    timeout: int = 120,
    images: Optional[list[str]] = None,
    temperature: Optional[float] = None,
) -> str:
    """
    Call an OpenAI-shaped Chat Completions API.

    Targets settings.OPENAI_BASE_URL, which defaults to real OpenAI but can
    point at anything that speaks the same wire format — Azure OpenAI, vLLM,
    LiteLLM proxy, LM Studio, etc. This is what lets a server with no local
    Ollama and no Anthropic key still run the agent/RAG pipeline entirely
    against a hosted or self-hosted API.

    Args:
        messages: list of {"role": "system"|"user"|"assistant", "content": str}
        model: override model string; defaults to settings.OPENAI_MODEL
        max_tokens: maximum tokens in the response
        timeout: HTTP timeout seconds
        images: optional list of base64-encoded PNG images, attached as
                image_url content parts to the last user turn (vision calls).
                Requires a vision-capable model; the configured OPENAI_MODEL
                default (gpt-4o-mini) is.
        temperature: optional override (0-2). Omitted -> API default (1.0).
                     Pass low (e.g. 0.1) for structured/extraction output.

    Returns:
        Generated text string.

    Raises:
        RuntimeError on non-200 responses or network errors.
    """
    resolved_model = model or settings.OPENAI_MODEL
    api_key = settings.OPENAI_API_KEY
    base_url = settings.OPENAI_BASE_URL.rstrip("/")

    api_messages = messages
    if images:
        api_messages = _apply_images_to_last_user_message(
            messages, images, _b64_images_to_openai_blocks
        )

    payload: dict = {
        "model": resolved_model,
        "messages": api_messages,
        "max_tokens": max_tokens,
    }
    if temperature is not None:
        payload["temperature"] = temperature

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "content-type": "application/json",
                },
                json=payload,
            )

        if response.status_code == 200:
            data = response.json()
            choices = data.get("choices") or []
            text = choices[0]["message"]["content"] if choices else ""
            logger.info("OpenAI call OK model=%s", resolved_model)
            return text or ""
        else:
            detail = response.text[:300]
            logger.error("OpenAI API %s: %s", response.status_code, detail)
            raise RuntimeError(f"OpenAI API error {response.status_code}: {detail}")

    except RuntimeError:
        raise
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as exc:
        logger.error("OpenAI provider unreachable: %s", exc)
        raise ProviderUnavailableError(f"OpenAI provider unreachable: {exc}") from exc
    except Exception as exc:
        logger.error("OpenAI HTTP error: %s", exc)
        raise RuntimeError(f"OpenAI HTTP error: {exc}") from exc


# ---------------------------------------------------------------------------
# Provider resolution
# ---------------------------------------------------------------------------

_VALID_PROVIDERS = {"ollama", "claude", "openai"}


def resolve_provider(
    agent_env_var: str,
    default_provider: str,
) -> str:
    """
    Resolution order:
      1. Per-agent env var (e.g. AGENT_COMPLIANCE_PROVIDER)
      2. Global LLM_PROVIDER
      3. Agent's declared default_provider

    Returns "ollama", "claude", or "openai". An unrecognized value at any
    step falls through to the next step rather than being passed on silently
    — a typo'd env var used to resolve straight to Ollama via dispatch()'s
    catch-all else branch with no indication anything was wrong.
    """
    per_agent = getattr(settings, agent_env_var, "").strip().lower()
    if per_agent in _VALID_PROVIDERS:
        return per_agent
    elif per_agent:
        logger.warning("Unrecognized provider %r in %s — ignoring", per_agent, agent_env_var)

    global_provider = settings.LLM_PROVIDER.strip().lower()
    if global_provider in _VALID_PROVIDERS:
        return global_provider
    elif global_provider:
        logger.warning("Unrecognized provider %r in LLM_PROVIDER — ignoring", global_provider)

    return default_provider.lower()


def resolve_model(provider: str) -> Optional[str]:
    """Return the per-agent model override for the given provider, or None (use default)."""
    if provider == "claude":
        override = settings.AGENT_CLAUDE_MODEL.strip()
    elif provider == "openai":
        override = settings.AGENT_OPENAI_MODEL.strip()
    else:
        override = settings.AGENT_OLLAMA_MODEL.strip()
    return override if override else None


def default_model(provider: str) -> str:
    """Return the settings-level default model name for the given provider
    (used for logging/audit rows when there's no per-agent override)."""
    if provider == "claude":
        return settings.CLAUDE_MODEL
    elif provider == "openai":
        return settings.OPENAI_MODEL
    return settings.OLLAMA_MODEL_TEXT


async def dispatch(
    provider: str,
    messages: list,
    model: Optional[str] = None,
    max_tokens: int = 2048,
    timeout: int = 120,
    images: Optional[list[str]] = None,
    temperature: Optional[float] = None,
) -> str:
    """Route to the correct provider and return generated text.

    `provider` should already be one of "ollama" | "claude" | "openai" (see
    resolve_provider) — anything else falls back to Ollama, same as before
    this function grew an explicit openai branch.
    """
    if provider == "claude":
        return await call_claude(messages, model=model, max_tokens=max_tokens, timeout=timeout, images=images, temperature=temperature)
    elif provider == "openai":
        return await call_openai(messages, model=model, max_tokens=max_tokens, timeout=timeout, images=images, temperature=temperature)
    else:
        return await call_ollama(messages, model=model, timeout=timeout, images=images, temperature=temperature)
