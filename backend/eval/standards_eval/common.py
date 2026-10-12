# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.
"""
Shared helpers for the standards evaluation harness.

Design rules:
  * READ-ONLY against the database. Nothing in this package INSERTs,
    UPDATEs or DELETEs. PDF extraction runs as a dry run (criteria are
    kept in the run directory, never written to standards_sets), and agent
    classification calls BaseAgent.run(db=None) so no agent_runs audit
    rows are written.
  * Every stage writes its output to the run directory and later stages
    read it back, so any stage can be re-run on its own and a crash
    resumes where it stopped.
  * The LLM used for GENERATING test activities and for JUDGING can be
    set separately from the system under test (EVAL_JUDGE_PROVIDER /
    EVAL_JUDGE_MODEL), so the judge does not have to be the same model
    that produced the answers it grades.
"""

from __future__ import annotations

import json
import os
import random
import re
from pathlib import Path
from typing import Any, Iterable, Optional

GRADE_ALIASES = {
    "K": ["K", "KG", "00"],
}


def grade_level_variants(grades: Iterable[str]) -> list[str]:
    """CASE educationLevel values appear as '06', '6', or 'K'/'KG'.
    Return every spelling so a SQL array-overlap test catches all of them."""
    out: set[str] = set()
    for g in grades:
        g = str(g).strip().upper()
        if g in GRADE_ALIASES:
            out.update(GRADE_ALIASES[g])
            continue
        try:
            n = int(g)
            out.update({str(n), f"{n:02d}"})
        except ValueError:
            out.add(g)
    return sorted(out)


def grade_of(levels: Optional[list[str]]) -> Optional[int]:
    """Lowest numeric grade in an education_levels array (K -> 0)."""
    best = None
    for lv in levels or []:
        s = str(lv).strip().upper()
        if s in ("K", "KG", "00"):
            n = 0
        else:
            try:
                n = int(s)
            except ValueError:
                continue
        best = n if best is None else min(best, n)
    return best


# ---------------------------------------------------------------------------
# Run directory + JSON io
# ---------------------------------------------------------------------------

def run_dir(path: Optional[str]) -> Path:
    p = Path(path or os.getenv("EVAL_RUN_DIR", "/app/logs/standards_eval/run1"))
    p.mkdir(parents=True, exist_ok=True)
    return p


def save_json(path: Path, obj: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, default=str, ensure_ascii=True), encoding="utf-8")
    tmp.replace(path)


def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def append_jsonl(path: Path, row: dict) -> None:
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, default=str, ensure_ascii=True) + "\n")


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def load_manifest(path: str) -> dict:
    m = json.loads(Path(path).read_text(encoding="utf-8"))
    m.setdefault("grade_band", ["06", "07", "08"])
    m.setdefault("sample_per_target", 40)
    m.setdefault("top_k", 5)
    m.setdefault("seed", 13)
    for t in m["targets"]:
        t["key"] = f"{t['state']}:{t['subject']}"
    return m


def select_targets(manifest: dict, only: Optional[str]) -> list[dict]:
    if not only:
        return manifest["targets"]
    keys = {k.strip() for k in only.split(",") if k.strip()}
    return [t for t in manifest["targets"] if t["key"] in keys or t["state"] in keys]


def rng(seed: int, *salt: Any) -> random.Random:
    return random.Random(f"{seed}:" + ":".join(str(s) for s in salt))


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

_WORD = re.compile(r"[a-z0-9]+")
_STOP = {
    "the", "and", "for", "with", "that", "this", "from", "into", "are", "was", "were",
    "been", "has", "have", "had", "not", "but", "can", "will", "its", "their", "they",
    "them", "use", "using", "students", "student", "a", "an", "of", "to", "in", "on",
    "or", "by", "as", "is", "be", "at", "it", "how", "what", "which", "including",
}


def content_words(text: str) -> list[str]:
    return [w for w in _WORD.findall((text or "").lower()) if w not in _STOP and len(w) > 2]


def jaccard(a: str, b: str) -> float:
    sa, sb = set(content_words(a)), set(content_words(b))
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def shared_ngram(a: str, b: str, n: int = 4) -> bool:
    wa = _WORD.findall((a or "").lower())
    wb = _WORD.findall((b or "").lower())
    grams = {tuple(wa[i:i + n]) for i in range(len(wa) - n + 1)}
    return any(tuple(wb[i:i + n]) in grams for i in range(len(wb) - n + 1))


def norm_code(code: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]", "", (code or "").lower())


def parse_json_loose(raw: str) -> Any:
    """Parse the first JSON object/array in an LLM reply (tolerates fences/prose)."""
    if raw is None:
        raise ValueError("empty reply")
    s = raw.strip()
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass
    for open_c, close_c in (("{", "}"), ("[", "]")):
        i, j = s.find(open_c), s.rfind(close_c)
        if i != -1 and j > i:
            try:
                return json.loads(s[i:j + 1])
            except json.JSONDecodeError:
                continue
    raise ValueError(f"no JSON found in reply: {s[:200]!r}")


# ---------------------------------------------------------------------------
# LLM access for harness-owned prompts (activity generation + judging)
# ---------------------------------------------------------------------------

def judge_provider_and_model() -> tuple[str, Optional[str]]:
    """Default to Ollama for the generator/judge roles (no human in the loop here) so a
    harness run doesn't spend Anthropic credits unless EVAL_JUDGE_PROVIDER explicitly asks
    for claude/openai. The model-under-test's own provider is unaffected by this default."""
    from agents import provider as _provider
    prov = (os.getenv("EVAL_JUDGE_PROVIDER") or "").strip().lower()
    if prov not in ("ollama", "claude", "openai"):
        prov = _provider.resolve_provider("EVAL_JUDGE_PROVIDER", "ollama")
    model = (os.getenv("EVAL_JUDGE_MODEL") or "").strip() or _provider.resolve_model(prov) or _provider.default_model(prov)
    return prov, model


async def _claude_text(prompt: str, model: str, max_tokens: int) -> str:
    """Direct Messages API call for the judge/generator. agents.provider.call_claude
    reads only content[0]["text"]; newer models can return a non-text block first
    (e.g. thinking), which raises KeyError there. This joins every text block."""
    import httpx
    from core.config import settings
    api_key = settings.CLAUDE_API_KEY or settings.ANTHROPIC_API_KEY
    async with httpx.AsyncClient(timeout=180) as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": model, "max_tokens": max_tokens,
                  "messages": [{"role": "user", "content": prompt}]},
        )
    if r.status_code != 200:
        raise RuntimeError(f"Claude API error {r.status_code}: {r.text[:300]}")
    blocks = r.json().get("content") or []
    return "".join(b.get("text", "") for b in blocks if b.get("type") == "text")


async def llm_json(prompt: str, *, max_tokens: int = 1500, retries: int = 2) -> Any:
    """Call the judge/generator model and parse a JSON reply. Retries on bad JSON."""
    from agents import provider as _provider
    prov, model = judge_provider_and_model()
    last_err: Optional[Exception] = None
    for attempt in range(retries + 1):
        if prov == "claude" and not fake_mode():
            # extra headroom: thinking (if the model uses it) counts against max_tokens
            raw = await _claude_text(prompt, model, max_tokens + 4000)
        else:
            raw = await _provider.dispatch(
                prov, messages=[{"role": "user", "content": prompt}], model=model,
                max_tokens=max_tokens, timeout=120, temperature=None,
            )
        try:
            return parse_json_loose(raw)
        except ValueError as e:
            last_err = e
    raise RuntimeError(f"judge/generator returned unparseable JSON after {retries + 1} tries: {last_err}")


# ---------------------------------------------------------------------------
# Fake mode (self-test only): deterministic stand-ins for every LLM call
# ---------------------------------------------------------------------------

def fake_mode() -> bool:
    return os.getenv("EVAL_FAKE_LLM", "") == "1"


def install_fake_llm() -> None:
    """Replace agents.provider.dispatch with a deterministic fake. Used only by
    selftest.py to prove the pipeline runs end to end; numbers from a fake run
    are meaningless and the report says so."""
    from agents import provider as _provider
    from eval.standards_eval import fixtures
    _provider.dispatch = fixtures.fake_dispatch  # type: ignore[assignment]


def salvage_json_array(raw: str) -> tuple[list, bool]:
    """Parse a JSON array reply; if it was cut off mid-way (reply hit max_tokens),
    return every element that was complete. Returns (items, was_truncated)."""
    s = (raw or "").strip()
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    try:
        v = json.loads(s)
        return (v if isinstance(v, list) else []), False
    except json.JSONDecodeError:
        pass
    i = s.find("[")
    if i == -1:
        return [], True
    dec = json.JSONDecoder()
    pos, items = i + 1, []
    while True:
        while pos < len(s) and s[pos] in " \t\r\n,":
            pos += 1
        if pos >= len(s) or s[pos] == "]":
            break
        try:
            obj, pos = dec.raw_decode(s, pos)
        except json.JSONDecodeError:
            return items, True
        items.append(obj)
    return items, False
