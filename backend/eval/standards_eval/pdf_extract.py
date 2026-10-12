# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.
"""
Stage `pdf-extract`: run a state's official PDF through the PDF import pipeline
(document_parser.parse_document -> standards_parser.extract_criteria), as a
dry run, and record exactly what survives.

Two variants, same PDF pages, same LLM:

  current   Byte-for-byte the loop in scripts/ingest_state_standards.py:
            12 pages per chunk, extract_criteria(set_type="state_standards")
            with its default max_chars=12000, its sanitizer, and its
            4096-token reply cap.

  proposed  What a fix would look like, to size the gap:
            chunks packed by CHARACTERS (<= 8000, so nothing is cut by the
            12000-char truncation), the standards-specific prompt instructions
            (the "state_standards" value the ingest script passes falls through
            to the generic instruction), a 16000-token reply budget instead of the
            hard-coded 4096 (a JSON list of ~40 standards overruns 4096 and the
            whole chunk is then lost), the `code` and `grade_band` fields the
            prompt asks for (the sanitizer in extract_criteria drops them), and
            every complete item kept if a reply is still cut off.

For both variants the raw LLM replies are captured (by wrapping
agents.provider.dispatch for the duration of the call) so the report can
count what the sanitizer threw away and which chunks failed JSON parsing.
Nothing is written to the database.
"""

from __future__ import annotations

import re
import time
from collections import Counter
from pathlib import Path

from eval.standards_eval.common import salvage_json_array, save_json

CURRENT_PAGES_PER_CHUNK = 12
CURRENT_MAX_CHARS = 12000
PROPOSED_CHUNK_CHARS = 8000
PROPOSED_MAX_TOKENS = 16000

# "Grade 6", "6th Grade", "Sixth Grade", "Kindergarten" -- used only by the pdf-pages helper
_GRADE_WORDS = {"kindergarten": "K", "first": "1", "second": "2", "third": "3", "fourth": "4",
                "fifth": "5", "sixth": "6", "seventh": "7", "eighth": "8"}
_GRADE_RX = re.compile(
    r"\bgrade\s+(\d{1,2})\b|\b(\d{1,2})(?:st|nd|rd|th)\s+grade\b|\b(kindergarten|first|second|third|fourth|fifth|sixth|seventh|eighth)\s+grade\b",
    re.I)


def _page_range(spec: str | None, n_pages: int) -> list[int]:
    """'1-40,55-60' -> zero-based page indexes. None -> all pages."""
    if not spec:
        return list(range(n_pages))
    out: list[int] = []
    for part in str(spec).split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            out.extend(range(int(a) - 1, min(int(b), n_pages)))
        elif part:
            out.append(int(part) - 1)
    return [p for p in out if 0 <= p < n_pages]


def _chunks_current(pages: list[str]) -> list[tuple[str, str]]:
    out = []
    for i in range(0, len(pages), CURRENT_PAGES_PER_CHUNK):
        chunk_pages = pages[i:i + CURRENT_PAGES_PER_CHUNK]
        text = "\n\n".join(p for p in chunk_pages if p)
        out.append((f"pages {i + 1}-{i + len(chunk_pages)}", text))
    return out


def _chunks_proposed(pages: list[str]) -> list[tuple[str, str]]:
    """Pack pages into chunks of at most PROPOSED_CHUNK_CHARS characters.
    A page longer than the budget is split on line boundaries first."""
    pieces: list[tuple[int, str]] = []
    for pno, p in enumerate(pages, start=1):
        p = p or ""
        while len(p) > PROPOSED_CHUNK_CHARS:
            cut = p.rfind("\n", 0, PROPOSED_CHUNK_CHARS)
            cut = cut if cut > 0 else PROPOSED_CHUNK_CHARS
            pieces.append((pno, p[:cut]))
            p = p[cut:]
        if p.strip():
            pieces.append((pno, p))
    out: list[tuple[str, str]] = []
    buf: list[tuple[int, str]] = []
    size = 0
    for pno, text in pieces:
        if buf and size + len(text) + 2 > PROPOSED_CHUNK_CHARS:
            out.append((f"pages {buf[0][0]}-{buf[-1][0]}", "\n\n".join(t for _, t in buf)))
            buf, size = [], 0
        buf.append((pno, text))
        size += len(text) + 2
    if buf:
        out.append((f"pages {buf[0][0]}-{buf[-1][0]}", "\n\n".join(t for _, t in buf)))
    return out


class _Recorder:
    """Wrap agents.provider.dispatch to keep the raw reply of each call."""

    def __init__(self):
        from agents import provider as _provider
        self._provider = _provider
        self._orig = None
        self.replies: list[str] = []

    def __enter__(self):
        self._orig = self._provider.dispatch
        orig = self._orig

        async def recording_dispatch(*args, **kwargs):
            raw = await orig(*args, **kwargs)
            self.replies.append(raw)
            return raw

        self._provider.dispatch = recording_dispatch
        return self

    def __exit__(self, *exc):
        self._provider.dispatch = self._orig
        return False


async def _proposed_extract(text: str, name: str) -> tuple[str, str | None]:
    """The proposed fix, called directly: same prompt builder and provider/model
    resolution as extract_criteria, but the standards-specific instructions and a
    reply budget large enough for a dense page of standards (extract_criteria hard-codes
    max_tokens=4096, which a JSON list of ~40 standards overruns)."""
    from agents import provider as _provider
    from services.prompt_library import build_standards_extraction_prompt
    prompt = build_standards_extraction_prompt(document_text=text, document_type="standards",
                                               subject=name, max_chars=PROPOSED_CHUNK_CHARS + 1000)
    prov = _provider.resolve_provider("AGENT_STANDARDS_EXTRACTION_PROVIDER", "ollama")
    model = _provider.resolve_model(prov) or _provider.default_model(prov)
    try:
        raw = await _provider.dispatch(prov, messages=[{"role": "user", "content": prompt}], model=model,
                                       max_tokens=PROPOSED_MAX_TOKENS, timeout=300, temperature=0.1)
        return raw, None
    except Exception as e:
        return "", f"{type(e).__name__}: {e}"


async def _run_pipeline_variant(variant: str, spec: str, pages: list[str], name: str, t: dict) -> dict:
    """A variant backed by services/standards_pipeline (spec 'provider:model', e.g. 'ollama:qwen3.5:9b').
    Uses and fills the pipeline's chunk cache when its tables exist, so a model benchmarked here costs
    nothing when the pipeline later runs it on the same document (the only DB write the harness makes)."""
    from services.standards_pipeline.runner import extract_pages
    provider, model = spec.split(":", 1)
    sf = None
    try:
        from core.database import get_session_factory
        from sqlalchemy import text
        f = get_session_factory()
        async with f() as db:
            if (await db.execute(text("SELECT to_regclass('std_pipeline_chunk_cache')"))).scalar():
                sf = f
    except Exception:
        sf = None
    res = await extract_pages(pages, provider=provider, model=model, cache_db_factory=sf,
                              jurisdiction=t.get("state", ""), subject=t.get("subject", ""), title=name,
                              concurrency=1 if provider == "ollama" else 3,
                              log=lambda m: print(f"    [{variant}] {m.strip()}"))
    criteria = [{"id": f"c{i + 1}", "code": c["code"], "name": "", "description": c["statement"],
                 "category": c.get("category") or "General", "grade_band": c.get("grade_band") or "",
                 "chunk": c["chunk_label"]} for i, c in enumerate(res["criteria"])]
    chunk_log = [{"chunk": c["label"], "chars": c["chars"], "chars_dropped_by_truncation": 0,
                  "criteria_kept": c["items"], "raw_items": c["items"], "reply_cut_off": c["truncated"],
                  "raw_items_with_code": sum(1 for x in res["criteria"] if x["chunk_label"] == c["label"] and x["code"]),
                  "raw_items_with_grade_band": sum(1 for x in res["criteria"]
                                                   if x["chunk_label"] == c["label"] and x.get("grade_band")),
                  "error": c["error"], "cached": c["cached"], "seconds": round((c["latency_ms"] or 0) / 1000, 1),
                  "usage": c["usage"]} for c in res["chunks"]]
    return {"variant": variant, "pipeline": {"provider": provider, "model": model, "params": res["params"]},
            "stats": res["stats"], "chunks": chunk_log, "criteria": criteria}


async def _run_variant(variant: str, pages: list[str], name: str, spec: str | None = None, t: dict | None = None) -> dict:
    from services.standards_parser import extract_criteria
    if spec:
        return await _run_pipeline_variant(variant, spec, pages, name, t or {})
    chunks = _chunks_current(pages) if variant == "current" else _chunks_proposed(pages)
    criteria: list[dict] = []
    chunk_log = []
    seen_ids: set[str] = set()
    for label, text in chunks:
        if not text.strip():
            chunk_log.append({"chunk": label, "chars": 0, "skipped": "no text"})
            continue
        t0 = time.monotonic()
        if variant == "current":
            with _Recorder() as rec:
                got, error = await extract_criteria(text, set_type="state_standards", name=f"{name} ({label})")
            raw = rec.replies[-1] if rec.replies else ""
        else:
            got = []
            raw, error = await _proposed_extract(text, f"{name} ({label})")
        raw_items, truncated = salvage_json_array(raw)
        raw_items = [c for c in raw_items if isinstance(c, dict)]

        if variant == "current":
            kept = got
        else:
            # keep the fields the prompt asks for (code, grade_band) and every complete
            # item even when the reply was cut off
            kept = [{
                "id": str(c.get("id") or f"criterion-{i + 1}"),
                "code": str(c.get("code") or ""),
                "name": str(c.get("name") or "")[:100],
                "description": str(c.get("description") or "")[:1000],
                "category": str(c.get("category") or "General")[:100],
                "grade_band": str(c.get("grade_band") or ""),
            } for i, c in enumerate(raw_items)]
            if truncated and not error:
                error = f"reply cut off at max_tokens; kept {len(kept)} complete items"
        for c in kept:
            cid = c["id"]
            if cid in seen_ids:  # same de-dupe rule as ingest_state_standards.py
                cid = f"{cid}-{label.replace(' ', '')}"
                c["id"] = cid
            seen_ids.add(cid)
            c["chunk"] = label
            criteria.append(c)
        chunk_log.append({
            "chunk": label, "chars": len(text),
            "chars_dropped_by_truncation": max(0, len(text) - CURRENT_MAX_CHARS) if variant == "current" else 0,
            "criteria_kept": len(kept),
            "raw_items": len(raw_items), "reply_cut_off": truncated,
            "raw_items_with_code": sum(1 for c in raw_items if c.get("code")),
            "raw_items_with_grade_band": sum(1 for c in raw_items if c.get("grade_band")),
            "raw_reply_chars": len(raw or ""),
            "error": error, "seconds": round(time.monotonic() - t0, 1),
        })
        print(f"    [{variant}] {label}: {len(text)} chars -> {len(kept)} criteria"
              + (f" (reply cut off; {len(raw_items)} complete items were in it)" if truncated and variant == "current" else "")
              + (f"  ERROR: {error}" if error else ""))
    return {"variant": variant, "chunks": chunk_log, "criteria": criteria}


async def stage_pdf_extract(manifest: dict, targets: list[dict], out: Path, variants: list[str],
                            specs: dict | None = None) -> None:
    """variants: names; specs: name -> 'provider:model' for pipeline-backed variants."""
    specs = specs or {}
    from services.document_parser import parse_document
    for t in targets:
        pdf = t.get("pdf") or {}
        paths = pdf.get("paths") or ([pdf["path"]] if pdf.get("path") else [])
        if not paths:
            print(f"{t['key']}: no pdf.path / pdf.paths in manifest, skipping")
            continue
        missing = [x for x in paths if not Path(x).exists()]
        if missing:
            print(f"{t['key']}: PDF not found: {missing} -- download it first (see RUNBOOK)")
            continue
        # one page list across all files; "pages" applies to that combined list
        all_pages: list[str] = []
        methods, warnings = [], []
        for x in paths:
            parsed = await parse_document(Path(x).read_bytes(), Path(x).name, None)
            all_pages.extend(parsed.pages if parsed.pages else [parsed.text])
            methods.append(parsed.method)
            warnings.extend(parsed.warnings)
        idx = _page_range(pdf.get("pages"), len(all_pages))
        pages = [all_pages[i] for i in idx]
        print(f"{t['key']}: parsed {len(all_pages)} pages from {len(paths)} file(s) via {set(methods)}; "
              f"using {len(pages)} ({sum(len(x or '') for x in pages)} chars)")
        for v in variants:
            dest = out / f"pdf_{t['state']}_{t['subject']}_{v}.json"
            if dest.exists():
                print(f"  {v}: already extracted ({dest.name}); delete it to re-run")
                continue
            res = await _run_variant(v, pages, f"{t['state']} {t['subject']} eval", specs.get(v), t)
            res.update({"target": t["key"], "pdf": pdf, "parse_method": sorted(set(methods)),
                        "pages_used": len(pages), "parse_warnings": warnings})
            save_json(dest, res)
            total = sum(c["chars"] for c in res["chunks"])
            dropped = sum(c.get("chars_dropped_by_truncation", 0) for c in res["chunks"])
            print(f"  {v}: {len(res['criteria'])} criteria; "
                  f"{dropped}/{total} chars past the 12000-char cut; "
                  f"{sum(1 for c in res['chunks'] if c.get('error'))} chunks errored")


async def stage_pdf_pages(manifest: dict, targets: list[dict]) -> None:
    """Print, per page, which grades it mentions most and its first real line, to choose
    the `pages` range for the grade band. G6x4 = "grade 6" mentioned 4 times on that page."""
    from services.document_parser import parse_document
    for t in targets:
        pdf = t.get("pdf") or {}
        paths = pdf.get("paths") or ([pdf["path"]] if pdf.get("path") else [])
        n = 0
        print(f"\n== {t['key']}")
        for x in paths:
            if not Path(x).exists():
                print(f"   missing: {x}")
                continue
            parsed = await parse_document(Path(x).read_bytes(), Path(x).name, None)
            for pg in (parsed.pages or [parsed.text]):
                n += 1
                text = pg or ""
                grades = Counter()
                for m in _GRADE_RX.finditer(text):
                    word = (m.group(1) or m.group(2) or m.group(3) or "").lower()
                    g = _GRADE_WORDS.get(word, word)
                    grades[str(g)] += 1
                hits = " ".join(f"G{g}x{c}" for g, c in sorted(grades.items(), key=lambda kv: -kv[1])[:4])
                heading = next((ln.strip() for ln in text.splitlines()
                                if ln.strip() and not re.match(r"^\d+\s*\|", ln.strip())), "")
                print(f"   p{n:>3}  {len(text):>6} chars  [{hits:<22}]  {heading[:70]}")
