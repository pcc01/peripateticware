#!/usr/bin/env python3
# frontend/scripts/model_registry.py
#
# Live model discovery + an interactive model chooser, shared by
# review_pipeline.py and translate_sync.py.
#
# Peripateticware has no web UI for the localization pipeline, so these
# choosers are its equivalent of content-provenance's provider -> live-model
# dropdowns (github.com/pcc01/content-provenance, app/api/models.py +
# app/core/llm_clients.py's list_* functions, and the Review Shell / Redrive
# Console pickers). Same principle: read which models are actually available
# rather than hardcoding a list that goes stale.
#
#   list_models(provider)                 -> [str]   (live; [] if none / unreachable)
#   choose_model(role, provider, ...)     -> str|None (interactive: live list -> custom)
#
# Fail-soft everywhere: a network error, missing key, or missing optional
# dependency degrades to the static FALLBACK_PRESETS + free-text entry — it
# never blocks a run.
#
#   python model_registry.py --selftest        # probe every provider, print results

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:                       # requests is a translate_sync dep; guard anyway
    requests = None                       # type: ignore

sys.path.insert(0, str(Path(__file__).parent))
from localization_provenance import PROVIDER_ORG  # noqa: E402  (single source for org names)

# ── config ───────────────────────────────────────────────────────────────────

OLLAMA_URL = (os.getenv("OLLAMA_URL") or os.getenv("TOWER_OLLAMA_URL")
              or "http://localhost:11434").rstrip("/")
LMSTUDIO_URL = os.getenv("LMSTUDIO_URL", "http://localhost:1234/v1").rstrip("/")
VLLM_URL = os.getenv("VLLM_URL", "http://localhost:8000/v1").rstrip("/")
TOWER_GGUF_REPO = os.getenv("TOWER_GGUF_REPO", "s3nh/Unbabel-TowerInstruct-7B-v0.1-GGUF")

_HTTP_TIMEOUT = float(os.getenv("MODEL_REGISTRY_TIMEOUT", "10"))

# Providers with exactly one fixed engine — nothing to pick.
NO_MODEL_PROVIDERS = {"DEEPL", "GOOGLE_TRANSLATE", "MICROSOFT"}

# Translation-side vs review/eval-side vocabulary sometimes disagrees on the
# vendor name (CP hits the same thing — "anthropic" vs "claude"); accept both.
_ALIASES = {"ANTHROPIC": "CLAUDE", "GOOGLE": "GEMINI", "MPROMETHEUS": "OLLAMA"}

# Starting menu for providers whose catalog can't be enumerated without a key
# / while offline. "Type a custom name…" is always offered alongside these.
FALLBACK_PRESETS: dict[str, list[str]] = {
    "CLAUDE": ["claude-opus-4-8", "claude-sonnet-5", "claude-sonnet-4-6",
              "claude-haiku-4-5-20251001", "claude-fable-5"],
    "GEMINI": ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite",
              "gemini-2.5-pro", "gemini-2.5-flash"],
    "OPENAI": ["gpt-4o", "gpt-4o-mini", "o3", "o3-mini"],
    "OLLAMA": ["mistral", "mistral-nemo:12b", "llama3.1:8b", "qwen2.5:7b"],
    "TOWER": ["<Q4_K_M .gguf auto-picked from the repo>"],
}

CUSTOM_LABEL = "Type a custom model name..."


def resolve_org(provider: Optional[str]) -> Optional[str]:
    if not provider:
        return None
    return PROVIDER_ORG.get(provider.upper())


def _canon(provider: str) -> str:
    p = (provider or "").upper()
    return _ALIASES.get(p, p)


# ── live discovery ───────────────────────────────────────────────────────────

def _get_json(url: str, *, headers: Optional[dict] = None, params: Optional[dict] = None):
    if requests is None:
        raise RuntimeError("the `requests` package is not installed")
    r = requests.get(url, headers=headers or {}, params=params or {}, timeout=_HTTP_TIMEOUT)
    r.raise_for_status()
    return r.json()


def _ollama_models(base_url: str) -> list[str]:
    data = _get_json(f"{base_url}/api/tags")
    return sorted(m["name"] for m in data.get("models", []) if m.get("name"))


def _openai_compatible_models(base_url: str, api_key: str = "not-needed") -> list[str]:
    data = _get_json(f"{base_url}/models", headers={"Authorization": f"Bearer {api_key}"})
    return sorted(m["id"] for m in data.get("data", []) if m.get("id"))


def _openai_models(api_key: str) -> list[str]:
    data = _get_json("https://api.openai.com/v1/models",
                     headers={"Authorization": f"Bearer {api_key}"})
    ids = [m["id"] for m in data.get("data", []) if m.get("id")]
    return sorted(i for i in ids if "gpt" in i or i.startswith(("o1", "o3", "o4")))


def _anthropic_models(api_key: str) -> list[str]:
    data = _get_json("https://api.anthropic.com/v1/models",
                     headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"})
    return sorted((m["id"] for m in data.get("data", []) if m.get("id")), reverse=True)


def _gemini_models(api_key: str) -> list[str]:
    data = _get_json("https://generativelanguage.googleapis.com/v1beta/models",
                     params={"key": api_key})
    out = []
    for m in data.get("models", []):
        if "generateContent" in (m.get("supportedGenerationMethods") or []):
            out.append(m["name"].removeprefix("models/"))
    return sorted(out)


def _tower_gguf_files(repo: str) -> list[str]:
    try:
        from huggingface_hub import list_repo_files
    except ImportError:
        return []
    files = [f for f in list_repo_files(repo) if f.lower().endswith(".gguf")]
    # Q4_K_M first (the pipeline default), then the rest
    files.sort(key=lambda f: (0 if "q4_k_m" in f.lower() else 1, f.lower()))
    return files


def list_models(provider: str, *, gguf_repo: Optional[str] = None) -> list[str]:
    """Models currently available for `provider`. Empty list on any failure
    (unreachable server, missing key, missing optional dep) or for the
    single-engine NMT providers — callers fall back to presets + free text.
    """
    p = _canon(provider)
    try:
        if p == "OLLAMA":
            return _ollama_models(OLLAMA_URL)
        if p == "LMSTUDIO":
            return _openai_compatible_models(LMSTUDIO_URL)
        if p == "VLLM":
            return _openai_compatible_models(VLLM_URL)
        if p == "OPENAI":
            key = os.getenv("OPENAI_API_KEY")
            return _openai_models(key) if key else []
        if p == "CLAUDE":
            key = os.getenv("ANTHROPIC_API_KEY")
            return _anthropic_models(key) if key else []
        if p == "GEMINI":
            key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            return _gemini_models(key) if key else []
        if p == "TOWER":
            return _tower_gguf_files(gguf_repo or TOWER_GGUF_REPO)
        if p in NO_MODEL_PROVIDERS:
            return []
    except Exception as e:
        print(f"  (couldn't list {p} models: {e}; using presets)")
        return []
    return []


def discovery_status(provider: str) -> str:
    """One-line human summary — for --selftest and the setup check flow."""
    p = _canon(provider)
    if p in NO_MODEL_PROVIDERS:
        return f"{p:<16} single fixed engine - nothing to pick"
    models = list_models(p)
    if models:
        head = ", ".join(models[:6])
        more = f"  (+{len(models) - 6} more)" if len(models) > 6 else ""
        return f"{p:<16} {len(models)} live: {head}{more}"
    preset = FALLBACK_PRESETS.get(p, [])
    return f"{p:<16} no live list - fallback presets: {', '.join(preset) or '(none)'}"


# ── interactive chooser ──────────────────────────────────────────────────────

def _menu(title: str, options: list[str], default_index: int = 0) -> str:
    print(f"\n{title}")
    for i, opt in enumerate(options, 1):
        mark = "  (default)" if i - 1 == default_index else ""
        print(f"  [{i}] {opt}{mark}")
    raw = input(f"Choose [1-{len(options)}] (default {default_index + 1}): ").strip()
    if raw.isdigit() and 1 <= int(raw) <= len(options):
        return options[int(raw) - 1]
    return options[default_index]


def choose_model(role: str, provider: str, *, default: Optional[str] = None,
                 allow_custom: bool = True, gguf_repo: Optional[str] = None) -> Optional[str]:
    """Pick a model id for `provider` in the context of `role`
    ('translation' / 'review' / 'redrive'). Returns None for the fixed-engine
    NMT providers (nothing to choose). Live list first, then presets, always
    with a free-text escape hatch.
    """
    p = _canon(provider)
    if p in NO_MODEL_PROVIDERS:
        print(f"  ({p} has one fixed engine - no model to choose for {role}.)")
        return None

    live = list_models(p, gguf_repo=gguf_repo)
    source = "live" if live else "presets"
    options = live or FALLBACK_PRESETS.get(p, [])
    default_index = 0
    if default and default in options:
        default_index = options.index(default)

    if options:
        if allow_custom:
            options = options + [CUSTOM_LABEL]
        picked = _menu(f"{role.capitalize()} model — {p} ({source}):", options, default_index)
        if picked != CUSTOM_LABEL:
            return picked

    typed = input(f"{role.capitalize()} model id for {p}"
                  f"{f' [{default}]' if default else ''}: ").strip()
    return typed or default


# ── self-test ────────────────────────────────────────────────────────────────

def _selftest() -> None:
    print(f"OLLAMA_URL     = {OLLAMA_URL}")
    print(f"TOWER_GGUF_REPO= {TOWER_GGUF_REPO}")
    print(f"keys: ANTHROPIC={'set' if os.getenv('ANTHROPIC_API_KEY') else '-'}  "
          f"GEMINI={'set' if (os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY')) else '-'}  "
          f"OPENAI={'set' if os.getenv('OPENAI_API_KEY') else '-'}")
    print()
    for prov in ["OLLAMA", "CLAUDE", "GEMINI", "OPENAI", "LMSTUDIO", "VLLM",
                 "TOWER", "DEEPL", "GOOGLE_TRANSLATE", "MICROSOFT"]:
        print("  " + discovery_status(prov))


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        print(__doc__)
