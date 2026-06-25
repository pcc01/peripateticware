# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Anthropic API client — instant and batch paths.

Instant:  POST /v1/messages  (direct, synchronous response)
Batch:    POST /v1/messages/batches  (async, submit + poll)

Uses httpx directly so it works with anthropic==0.28.0 regardless of
whether that SDK version exposes the Batch API.
"""

import asyncio
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

ANTHROPIC_API_BASE = "https://api.anthropic.com/v1"
ANTHROPIC_VERSION  = "2023-06-01"
DEFAULT_MODEL      = "claude-haiku-4-5-20251001"
DEFAULT_MAX_TOKENS = 1024


def _headers(api_key: str) -> dict:
    return {
        "x-api-key": api_key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
        "anthropic-beta": "message-batches-2024-09-24",  # required for Batch API
    }


# ── Instant path ───────────────────────────────────────────────────────────────

async def complete_instant(
    prompt: str,
    api_key: str,
    model: str = DEFAULT_MODEL,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    system: str | None = None,
) -> str:
    """
    Single synchronous Haiku call. Returns the text response or raises on error.
    Caller (ai_router) handles fallback.
    """
    messages = [{"role": "user", "content": prompt}]
    body: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if system:
        body["system"] = system

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{ANTHROPIC_API_BASE}/messages",
            headers=_headers(api_key),
            json=body,
        )

    if resp.status_code == 200:
        data = resp.json()
        return data["content"][0]["text"]

    raise RuntimeError(
        f"Anthropic instant call failed: HTTP {resp.status_code} — {resp.text[:300]}"
    )

async def complete_instant_with_usage(
    prompt: str,
    api_key: str,
    model: str = DEFAULT_MODEL,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    system: str | None = None,
) -> tuple[str, int, int]:
    """
    Like complete_instant but also returns actual token counts from the API response.
    Returns (text, tokens_in, tokens_out).
    Used by ai_router to write accurate cost entries to platform_ai_ledger.
    complete_instant() is kept unchanged for backward-compat with other callers.
    """
    messages = [{"role": "user", "content": prompt}]
    body: dict = {
        "model":      model,
        "max_tokens": max_tokens,
        "messages":   messages,
    }
    if system:
        body["system"] = system

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{ANTHROPIC_API_BASE}/messages",
            headers=_headers(api_key),
            json=body,
        )

    if resp.status_code == 200:
        data       = resp.json()
        usage      = data.get("usage", {})
        text       = data["content"][0]["text"]
        tokens_in  = usage.get("input_tokens", 0)
        tokens_out = usage.get("output_tokens", 0)
        return text, tokens_in, tokens_out

    raise RuntimeError(
        f"Anthropic instant call failed: HTTP {resp.status_code} — {resp.text[:300]}"
    )


# ── Batch path ─────────────────────────────────────────────────────────────────

async def submit_batch(
    requests: list[dict],   # list of {custom_id, prompt, model, max_tokens, system}
    api_key: str,
    model: str = DEFAULT_MODEL,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> str:
    """
    Submit a batch to Anthropic. Returns the Anthropic batch_id.

    Each request dict should have:
        custom_id   — your internal ID (we use ai_batch_queue.id as string)
        prompt      — user message text
        model       — optional per-request model override
        max_tokens  — optional override
        system      — optional system prompt
    """
    batch_requests = []
    for req in requests:
        msg_body: dict[str, Any] = {
            "model":      req.get("model", model),
            "max_tokens": req.get("max_tokens", max_tokens),
            "messages":   [{"role": "user", "content": req["prompt"]}],
        }
        if req.get("system"):
            msg_body["system"] = req["system"]

        batch_requests.append({
            "custom_id": str(req["custom_id"]),
            "params":    msg_body,
        })

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{ANTHROPIC_API_BASE}/messages/batches",
            headers=_headers(api_key),
            json={"requests": batch_requests},
        )

    if resp.status_code in (200, 201):
        return resp.json()["id"]  # Anthropic batch_id

    raise RuntimeError(
        f"Anthropic batch submit failed: HTTP {resp.status_code} — {resp.text[:300]}"
    )


async def poll_batch(batch_id: str, api_key: str) -> dict:
    """
    Poll a batch for status. Returns the full Anthropic batch object.
    processing_status: "in_progress" | "ended"
    """
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{ANTHROPIC_API_BASE}/messages/batches/{batch_id}",
            headers=_headers(api_key),
        )
    if resp.status_code == 200:
        return resp.json()
    raise RuntimeError(
        f"Anthropic batch poll failed: HTTP {resp.status_code} — {resp.text[:300]}"
    )


async def fetch_batch_results(batch_id: str, api_key: str) -> list[dict]:
    """
    Fetch results for a completed batch.
    Returns list of {custom_id, result_text, error}.
    Results stream as JSONL — we collect them all.
    """
    import json as _json

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.get(
            f"{ANTHROPIC_API_BASE}/messages/batches/{batch_id}/results",
            headers=_headers(api_key),
        )

    if resp.status_code != 200:
        raise RuntimeError(
            f"Anthropic batch results fetch failed: HTTP {resp.status_code}"
        )

    results = []
    for line in resp.text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            item = _json.loads(line)
            custom_id = item.get("custom_id", "")
            if item.get("result", {}).get("type") == "succeeded":
                text = item["result"]["message"]["content"][0]["text"]
                results.append({"custom_id": custom_id, "result_text": text, "error": None})
            else:
                err = item.get("result", {}).get("error", {}).get("error", {}).get("message", "unknown")
                results.append({"custom_id": custom_id, "result_text": None, "error": err})
        except Exception as e:
            logger.warning(f"Could not parse batch result line: {e}")

    return results
