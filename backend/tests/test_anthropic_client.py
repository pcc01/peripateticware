# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Tests for services/anthropic_client.py::_system_block() — the prompt-
caching wrapper added so every instant-path system prompt (agents' system.txt
files, routes/inference.py's SYSTEM_PERI, routes/rubrics.py's
SYSTEM_STANDARDS_ANALYST) gets a cache_control breakpoint instead of being
resent uncached on every call."""

from services.anthropic_client import _system_block


def test_none_passthrough():
    assert _system_block(None) is None


def test_empty_string_passthrough():
    assert _system_block("") is None


def test_wraps_string_with_cache_control():
    result = _system_block("You are a helpful assistant.")
    assert result == [
        {
            "type": "text",
            "text": "You are a helpful assistant.",
            "cache_control": {"type": "ephemeral"},
        }
    ]


def test_preserves_full_text_unmodified():
    """Not truncated/altered — just wrapped."""
    long_prompt = "SYSTEM PROMPT: " + ("x" * 2000)
    result = _system_block(long_prompt)
    assert result[0]["text"] == long_prompt
