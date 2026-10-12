# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.
"""
Stage `retrieval`: run every test query through each retrieval arm and record
the ranked standards returned.

Arms (all over the real rag_documents / standards graph, same embeddings):
  vector        pgvector cosine only -- the pre-migration behaviour, reproduced
                with the same SQL as /rag-retrieve's vector channel (the route
                itself can no longer do vector-only: Stage 1 is hybrid).
  hybrid        /rag-retrieve with include_ancestors=false&include_related=false
                (vector + full-text, fused by RRF; no graph).
  hybrid_graph  /rag-retrieve with graph expansion on (current default).
  agent_current exactly what StandardsMappingAgent.run_with_retrieval retrieves
                today: vector only, source_type='standards', top_k=5, no
                jurisdiction filter, no retired filter, then expand_seeds().

The first three run twice: with the target state's jurisdiction_id filter,
and without it (what an unfiltered caller gets). The route functions are
called in-process with the same db session, so no auth token is needed and
nothing is written.
"""

from __future__ import annotations

import time
from pathlib import Path
from uuid import UUID

from sqlalchemy import bindparam, text as _t

from eval.standards_eval.common import append_jsonl, load_json, read_jsonl, save_json

LIST_LEN = 15  # compare every arm on the same list length (route caps combined at top_k*3 = 15)

ALL_ARMS = [
    ("vector_scoped", True),
    ("vector", True), ("vector", False),
    ("hybrid", True), ("hybrid", False),
    ("hybrid_graph", True), ("hybrid_graph", False),
    ("agent_current", False),
]
# Unfiltered hybrid runs full-text search over every standard in the database
# (p50 ~13 s, p95 ~23 s on prod in the smoke test). They are skipped by default
# so a full run does not load the production database for an hour; pass
# --retrieval-arms all to include them.
DEFAULT_ARMS = [a for a in ALL_ARMS if a not in (("hybrid", False), ("hybrid_graph", False))]
ARMS = DEFAULT_ARMS


async def _vector_only(db, query: str, jurisdiction_id: str | None) -> tuple[list[dict], int]:
    from services.embedding_service import embed_text
    t0 = time.monotonic()
    emb = (await embed_text(query, input_type="query")).get("embedding") or []
    if not emb:
        return [], int((time.monotonic() - t0) * 1000)
    vec = "[" + ",".join(str(v) for v in emb) + "]"
    jclause = "AND rd.metadata->>'jurisdiction_id' = :jid" if jurisdiction_id else ""
    rows = (await db.execute(_t(f"""
        SELECT rd.node_id::text, 1 - (rd.embedding <=> CAST(:emb AS vector)) AS score
        FROM rag_documents rd
        WHERE rd.embedding IS NOT NULL AND rd.source_type = 'standards'
          {jclause}
          AND NOT (rd.node_type = 'standards_item' AND EXISTS (
                SELECT 1 FROM standards_items si WHERE si.id = rd.node_id AND si.is_retired = true))
        ORDER BY rd.embedding <=> CAST(:emb AS vector)
        LIMIT :k
    """), {"emb": vec, "jid": jurisdiction_id, "k": LIST_LEN})).fetchall()
    res = [{"node_id": r[0], "relation": "match", "score": float(r[1])} for r in rows if r[0]]
    return res, int((time.monotonic() - t0) * 1000)


async def _vector_scoped(db, query: str, leaf_ids: list) -> tuple[list[dict], int]:
    """Vector search over the SAME rag_documents rows, restricted to the target's
    grade-band leaf standards (subject framework + grade + leaf). Shows what
    scoping retrieval to subject and grade would do, independent of text format."""
    from services.embedding_service import embed_text
    t0 = time.monotonic()
    emb = (await embed_text(query, input_type="query")).get("embedding") or []
    if not emb or not leaf_ids:
        return [], int((time.monotonic() - t0) * 1000)
    vec = "[" + ",".join(str(v) for v in emb) + "]"
    rows = (await db.execute(_t("""
        SELECT rd.node_id::text, 1 - (rd.embedding <=> CAST(:emb AS vector)) AS score
        FROM rag_documents rd
        WHERE rd.embedding IS NOT NULL AND rd.node_type = 'standards_item' AND rd.node_id IN :ids
        ORDER BY rd.embedding <=> CAST(:emb AS vector)
        LIMIT :k
    """).bindparams(bindparam("ids", expanding=True)),
        {"emb": vec, "ids": [UUID(x) for x in leaf_ids], "k": LIST_LEN})).fetchall()
    return ([{"node_id": r[0], "relation": "match", "score": float(r[1])} for r in rows if r[0]],
            int((time.monotonic() - t0) * 1000))


async def _route(db, query: str, jurisdiction_id: str | None, graph: bool, top_k: int) -> tuple[list[dict], int]:
    from routes.inference import rag_retrieve
    resp = await rag_retrieve(
        query=query, top_k=top_k, source_type="standards", jurisdiction_id=jurisdiction_id,
        include_ancestors=graph, include_related=graph, db=db, current_user=None,
    )
    res = []
    for d in resp.get("documents", [])[:LIST_LEN]:
        if d.get("node_type") == "standards_item" and d.get("node_id"):
            res.append({"node_id": d["node_id"], "relation": d.get("relation", "match"),
                        "score": float(d.get("relevance_score") or 0.0)})
    return res, int(resp.get("retrieval_time_ms") or 0)


async def _agent_current(db, query: str, top_k: int) -> tuple[list[dict], int]:
    """Mirror of StandardsMappingAgent.run_with_retrieval's retrieval block."""
    from services.embedding_service import embed_text
    from services.graph_retrieval import expand_seeds
    t0 = time.monotonic()
    emb = (await embed_text(query, input_type="query")).get("embedding") or []
    if not emb:
        return [], int((time.monotonic() - t0) * 1000)
    vec = "[" + ",".join(str(v) for v in emb) + "]"
    rows = (await db.execute(_t("""
        SELECT content, source_name, metadata, node_type, node_id::text,
               1 - (embedding <=> CAST(:emb AS vector)) AS score
        FROM rag_documents
        WHERE embedding IS NOT NULL AND source_type = 'standards'
        ORDER BY embedding <=> CAST(:emb AS vector)
        LIMIT :k
    """), {"emb": vec, "k": top_k})).fetchall()
    seeds, res = [], []
    for r in rows:
        seeds.append({"id": None, "node_type": r[3], "node_id": r[4],
                      "relevance_score": float(r[5]) if r[5] is not None else 0.0})
        if r[3] == "standards_item" and r[4]:
            meta = r[2] or {}
            res.append({"node_id": r[4], "relation": "match", "score": float(r[5] or 0.0),
                        "code": meta.get("human_coding_scheme") or r[1] or "", "title": r[1] or "",
                        "content": r[0] or ""})
    for item in await expand_seeds(db, seeds, include_ancestors=True, include_related=True):
        if item.get("node_type") == "standards_item" and item.get("node_id"):
            res.append({"node_id": item["node_id"], "relation": item.get("relation"),
                        "score": float(item.get("relevance_score") or 0.0),
                        "code": item.get("source_name") or "", "title": item.get("source_name") or "",
                        "content": item.get("content") or ""})
    return res, int((time.monotonic() - t0) * 1000)


async def _node_info(db, node_ids: set[str]) -> dict:
    """node_id -> jurisdiction, leaf flag, code, statement -- for scoring."""
    ids = [UUID(n) for n in node_ids if n]
    info: dict = {}
    for i in range(0, len(ids), 2000):
        chunk = ids[i:i + 2000]
        rows = (await db.execute(_t("""
            SELECT i.id::text, f.jurisdiction_id::text, i.human_coding_scheme, i.full_statement,
                   i.item_type, i.education_levels,
                   NOT EXISTS (SELECT 1 FROM standards_items c WHERE c.parent_id = i.id AND c.is_retired = false) AS is_leaf
            FROM standards_items i JOIN standards_frameworks f ON f.id = i.framework_id
            WHERE i.id IN :ids
        """).bindparams(bindparam("ids", expanding=True)), {"ids": chunk})).fetchall()
        for r in rows:
            info[r[0]] = {"jurisdiction_id": r[1], "code": r[2] or "", "statement": (r[3] or "")[:300],
                          "item_type": r[4], "education_levels": r[5] or [], "is_leaf": bool(r[6])}
    return info


async def stage_retrieval(manifest: dict, targets: list[dict], out: Path, session_factory, limit: int | None = None,
                          arms: list | None = None) -> None:
    arms = arms or ARMS
    queries = [q for q in read_jsonl(out / "testset.jsonl") if q["target"] in {t["key"] for t in targets}]
    if limit:
        queries = queries[:limit]
    corpora = {t["key"]: (load_json(out / f"corpus_{t['state']}_{t['subject']}.json") or {}) for t in targets}
    jids = {k: c.get("jurisdiction_id") for k, c in corpora.items()}
    leaves = {k: [it["id"] for it in c.get("items", [])] for k, c in corpora.items()}
    path = out / "retrieval.jsonl"
    done = {(r["qid"], r["arm"], r["jfilter"]) for r in read_jsonl(path)}
    top_k = manifest["top_k"]
    seen_nodes: set[str] = set()
    n = 0
    async with session_factory() as db:
        for q in queries:
            jid = jids.get(q["target"])
            for arm, jfilter in arms:
                if (q["qid"], arm, jfilter) in done:
                    continue
                use_jid = jid if jfilter else None
                try:
                    if arm == "vector_scoped":
                        res, ms = await _vector_scoped(db, q["activity"], leaves.get(q["target"], []))
                    elif arm == "vector":
                        res, ms = await _vector_only(db, q["activity"], use_jid)
                    elif arm == "hybrid":
                        res, ms = await _route(db, q["activity"], use_jid, graph=False, top_k=top_k)
                    elif arm == "hybrid_graph":
                        res, ms = await _route(db, q["activity"], use_jid, graph=True, top_k=top_k)
                    else:
                        res, ms = await _agent_current(db, q["activity"], top_k=top_k)
                    err = None
                except Exception as e:  # keep going; the report counts errors
                    await db.rollback()
                    res, ms, err = [], 0, f"{type(e).__name__}: {e}"
                append_jsonl(path, {"qid": q["qid"], "target": q["target"], "arm": arm, "jfilter": jfilter,
                                    "results": res, "ms": ms, "error": err})
                n += 1
            if n and n % 50 == 0:
                print(f"  {n} arm-runs done")

        for r in read_jsonl(path):
            seen_nodes.update(x["node_id"] for x in r["results"])
        for q in queries:
            seen_nodes.update(q["gold_ids"])
        info = load_json(out / "node_info.json", {}) or {}
        info.update(await _node_info(db, {n for n in seen_nodes if n not in info}))
    save_json(out / "node_info.json", info)
    print(f"retrieval.jsonl: {n} new arm-runs; node_info.json: {len(info)} nodes")
