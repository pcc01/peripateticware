# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.
"""
Stage `alignment`: end-to-end accuracy. For each test activity, build a
candidate list from each arm, hand it to the real StandardsMappingAgent
classifier (same system prompt, same model/provider configuration, same
anti-hallucination filter), and score which standards it says "applies".

Arms:
  case_agent_current   candidates exactly as run_with_retrieval builds them today
                       (vector top-5, no jurisdiction filter, graph expansion,
                       de-duplicated by code string)
  case_hybrid_j        /rag-retrieve hybrid, jurisdiction-filtered, no graph
  case_hybrid_graph_j  /rag-retrieve hybrid + graph, jurisdiction-filtered
  case_scope_vector    top-5 by cosine over this state's CASE leaves only
                       (same scope as the PDF arms: the control for PDF vs CASE)
  pdf_current          top-5 by cosine over criteria from the current PDF pipeline
  pdf_proposed         top-5 by cosine over criteria from the proposed PDF variant

The CASE-vs-PDF comparison is case_scope_vector vs pdf_*: same scope, same
retrieval method, same classifier; only the source of the standards differs.

Classification runs through BaseAgent.run(db=None): no agent_runs rows.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import numpy as np

from eval.standards_eval.common import append_jsonl, load_json, read_jsonl

ARMS = ["case_agent_current", "case_hybrid_j", "case_hybrid_graph_j",
        "case_scope_vector", "pdf_current", "pdf_proposed"]


def _dedupe_by_code(entries: list[dict]) -> list[dict]:
    """run_with_retrieval keys candidates on the code string and skips repeats."""
    seen, out = set(), []
    for e in entries:
        code = e.get("code") or ""
        if not code or code in seen:
            continue
        seen.add(code)
        out.append(e)
    return out


class _Index:
    """In-memory cosine index over a list of texts (same embedding provider as prod)."""

    def __init__(self, ids: list[str], vecs: np.ndarray):
        self.ids, self.vecs = ids, vecs

    @classmethod
    async def build(cls, ids: list[str], texts: list[str]) -> "_Index":
        from eval.standards_eval.pdf_match import _embed
        return cls(ids, await _embed(texts) if texts else np.zeros((0, 1), dtype=np.float32))

    async def search(self, query: str, k: int) -> list[tuple[str, float]]:
        from services.embedding_service import embed_text
        if not self.ids:
            return []
        q = np.array((await embed_text(query, input_type="query")).get("embedding") or [], dtype=np.float32)
        if q.size != self.vecs.shape[1]:
            return []
        q = q / (np.linalg.norm(q) or 1.0)
        sims = self.vecs @ q
        order = np.argsort(-sims)[:k]
        return [(self.ids[i], float(sims[i])) for i in order]


async def _classify(activity: str, grade, subject: str, candidates: list[dict]) -> dict:
    from agents.standards_mapping_agent import StandardsMappingAgent, StandardsMappingInput
    agent = StandardsMappingAgent()
    payload = StandardsMappingInput(submission_text=activity, grade_level=str(grade) if grade is not None else None,
                                    subject=subject, top_k=5)
    messages = agent.build_messages(payload, candidates=candidates)
    agent.build_messages = lambda p: messages  # same trick run_with_retrieval uses
    result = await agent.run(payload, db=None)
    if result.status != "success" or result.output is None:
        return {"status": result.status, "error": result.error, "mappings": []}
    out = agent._validate_against_candidates(result.output, {c["code"] for c in candidates})
    return {"status": "success", "error": None,
            "mappings": [m.model_dump() for m in out.mappings]}


async def stage_alignment(manifest: dict, targets: list[dict], out: Path, arms: list[str],
                          limit: int | None = None, concurrency: int = 4) -> None:
    keys = {t["key"] for t in targets}
    queries = [q for q in read_jsonl(out / "testset.jsonl") if q["target"] in keys]
    if limit:
        queries = queries[:limit]
    retr = {(r["qid"], r["arm"], r["jfilter"]): r for r in read_jsonl(out / "retrieval.jsonl")}
    node_info = load_json(out / "node_info.json", {}) or {}
    path = out / "alignment.jsonl"
    done = {(r["qid"], r["arm"]) for r in read_jsonl(path)}

    # in-memory indexes per target, built lazily
    idx_cache: dict = {}

    async def index_for(t: dict, kind: str):
        key = (t["key"], kind)
        if key in idx_cache:
            return idx_cache[key]
        if kind == "case":
            corpus = load_json(out / f"corpus_{t['state']}_{t['subject']}.json")
            exists = corpus is not None
            items = (corpus or {"items": []})["items"]
            idx = await _Index.build([i["id"] for i in items], [f"{i['code']} {i['statement']}".strip() for i in items])
            lookup = {i["id"]: {"code": i["code"] or i["id"][:8], "title": i["code"] or "standard",
                                "description": i["statement"]} for i in items}
        else:
            variant = kind.split("_", 1)[1]
            ext = load_json(out / f"pdf_{t['state']}_{t['subject']}_{variant}.json")
            exists = ext is not None
            crits = (ext or {}).get("criteria", [])
            idx = await _Index.build([c["id"] for c in crits],
                                     [" ".join(x for x in (c.get("name", ""), c.get("description", "")) if x) for c in crits])
            lookup = {c["id"]: {"code": c.get("code") or c["id"], "title": c.get("name") or c["id"],
                                "description": c.get("description", "")} for c in crits}
        idx_cache[key] = (idx, lookup, exists)
        return idx_cache[key]

    tmap = {t["key"]: t for t in targets}
    # build every in-memory index up front (sequentially) so concurrent workers only read them
    for t in targets:
        for arm in arms:
            if arm == "case_scope_vector":
                await index_for(t, "case")
            elif arm.startswith("pdf_"):
                await index_for(t, arm)

    work = [(q, arm) for q in queries for arm in arms if (q["qid"], arm) not in done]
    sem = asyncio.Semaphore(max(1, concurrency))
    counter = {"n": 0}

    async def one(q: dict, arm: str) -> None:
        t = tmap[q["target"]]
        cands: list[dict] = []   # what the classifier sees: code/title/description
        backing: dict[str, list[str]] = {}  # code -> underlying ids (node ids or criterion ids)
        if arm.startswith("case_") and arm != "case_scope_vector":
            src = {"case_agent_current": ("agent_current", False),
                   "case_hybrid_j": ("hybrid", True),
                   "case_hybrid_graph_j": ("hybrid_graph", True)}[arm]
            r = retr.get((q["qid"], *src))
            if r is None:
                return  # retrieval stage not run for this query
            entries = []
            for x in r["results"]:
                ni = node_info.get(x["node_id"], {})
                entries.append({
                    "code": x.get("code") or ni.get("code") or x["node_id"][:8],
                    "title": x.get("title") or ni.get("code") or "standard",
                    "description": x.get("content") or ni.get("statement", ""),
                    "_id": x["node_id"],
                })
            for e in entries:
                backing.setdefault(e["code"], []).append(e["_id"])
            cands = _dedupe_by_code(entries) if arm == "case_agent_current" else entries
        else:
            idx, lookup, exists = idx_cache[(t["key"], "case" if arm == "case_scope_vector" else arm)]
            if not exists:
                return  # no corpus / PDF extraction for this target yet: leave it for a later run
            # (an extraction that produced zero criteria IS scored: zero candidates, zero hits)
            for cid, _score in await idx.search(q["activity"], 5):
                e = dict(lookup[cid], _id=cid)
                backing.setdefault(e["code"], []).append(cid)
                cands.append(e)
        async with sem:
            try:
                cls = await _classify(q["activity"], q.get("grade"), q["subject"],
                                      [{k: v for k, v in c.items() if k != "_id"} for c in cands])
            except Exception as e:  # record and continue
                cls = {"status": "error", "error": f"{type(e).__name__}: {e}", "mappings": []}
        append_jsonl(path, {
            "qid": q["qid"], "target": q["target"], "arm": arm,
            "n_candidates": len(cands),
            "candidate_ids": [c["_id"] for c in cands],
            "ambiguous_codes": sum(1 for v in backing.values() if len(set(v)) > 1),
            "backing": backing, **cls,
        })
        counter["n"] += 1
        if counter["n"] % 25 == 0:
            print(f"  {counter['n']}/{len(work)} classifications done")

    await asyncio.gather(*(one(q, arm) for q, arm in work))
    print(f"alignment.jsonl: {counter['n']} new classifications")
