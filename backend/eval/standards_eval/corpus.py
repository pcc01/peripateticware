# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.
"""
Stages `frameworks` and `corpus`.

frameworks: for each manifest target (state + subject), list the CASE
  frameworks that match, with item counts, how many items fall in the grade
  band, how many are embedded in rag_documents, and which association types
  exist. The association counts answer the first-order question for the
  graph comparison: graph expansion can only add what the graph contains.
  If a state's framework has no `precedes` or cross-framework edges, graph
  expansion can only ever add ancestors.

corpus: freeze the evaluation corpus for each target -- the alignable leaf
  standards (items with no live children) in the grade band, with their
  ancestor path. Everything downstream samples and scores against this file.
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

from sqlalchemy import bindparam, text as _t

from eval.standards_eval.common import (
    grade_level_variants, grade_of, load_json, save_json,
)


async def _jurisdiction(db, state: str):
    row = (await db.execute(_t("""
        SELECT id, name, external_ref, subdivision_code
        FROM jurisdictions
        WHERE external_ref = :st OR subdivision_code = :sub
        ORDER BY (external_ref = :st) DESC
        LIMIT 1
    """), {"st": state, "sub": f"US-{state}"})).first()
    return row


async def list_frameworks(db, target: dict, grades: list[str]) -> dict:
    j = await _jurisdiction(db, target["state"])
    if not j:
        return {"target": target["key"], "error": f"no jurisdictions row for {target['state']}"}
    pats = target.get("framework_title_like") or ["%"]
    levels = grade_level_variants(grades)
    rows = (await db.execute(_t("""
        SELECT f.id, f.title, f.subject, f.version, f.adoption_status,
               f.last_change_datetime, f.is_authoritative_over_uploads, f.official_source_url,
               (SELECT count(*) FROM standards_items i
                 WHERE i.framework_id = f.id AND i.is_retired = false) AS n_items,
               (SELECT count(*) FROM standards_items i
                 WHERE i.framework_id = f.id AND i.is_retired = false
                   AND i.education_levels && CAST(:levels AS varchar[])) AS n_in_band
        FROM standards_frameworks f
        WHERE f.jurisdiction_id = :jid
          AND (f.title ILIKE ANY(CAST(:pats AS text[])) OR coalesce(f.subject,'') ILIKE ANY(CAST(:pats AS text[])))
        ORDER BY n_in_band DESC, f.title
    """), {"jid": j[0], "pats": pats, "levels": levels})).fetchall()

    frameworks = []
    for r in rows:
        assoc = (await db.execute(_t("""
            SELECT association_type, count(*) FROM standards_associations
            WHERE framework_id = :fid GROUP BY 1 ORDER BY 2 DESC
        """), {"fid": r[0]})).fetchall()
        frameworks.append({
            "id": str(r[0]), "title": r[1], "subject": r[2], "version": r[3],
            "adoption_status": r[4], "last_change_datetime": r[5],
            "is_authoritative_over_uploads": r[6], "official_source_url": r[7],
            "n_items": r[8], "n_in_grade_band": r[9],
            "associations": {a: n for a, n in assoc},
        })
    return {
        "target": target["key"],
        "jurisdiction": {"id": str(j[0]), "name": j[1], "external_ref": j[2]},
        "frameworks": frameworks,
    }


async def build_corpus(db, target: dict, grades: list[str], framework_ids: list[str]) -> dict:
    """Leaf items in the grade band for the chosen frameworks, with ancestor paths,
    embedding coverage, and graph-edge coverage."""
    levels = grade_level_variants(grades)
    band = {grade_of([g]) for g in grades}
    rules = [(re.compile(rx), int(g)) for rx, g in (target.get("grade_from_code") or [])]
    use_code_rules = bool(rules)
    # With grade_from_code rules the stored education_levels are ignored (they are
    # missing for TX and wrong for GA -- document-level 09-12 copied onto K-8 items),
    # so pull every leaf and assign the grade from the code instead.
    level_clause = "" if use_code_rules else "AND i.education_levels && CAST(:levels AS varchar[])"
    stmt = _t(f"""
        SELECT i.id, i.framework_id, i.human_coding_scheme, i.full_statement,
               i.education_levels, i.item_type, i.parent_id,
               EXISTS (SELECT 1 FROM rag_documents rd
                        WHERE rd.node_type = 'standards_item' AND rd.node_id = i.id
                          AND rd.embedding IS NOT NULL) AS indexed
        FROM standards_items i
        WHERE i.framework_id IN :fids
          AND i.is_retired = false
          {level_clause}
          AND length(coalesce(i.full_statement, '')) >= 25
          AND NOT EXISTS (SELECT 1 FROM standards_items c
                           WHERE c.parent_id = i.id AND c.is_retired = false)
    """).bindparams(bindparam("fids", expanding=True))
    params = {"fids": framework_ids} if use_code_rules else {"fids": framework_ids, "levels": levels}
    all_rows = (await db.execute(stmt, params)).fetchall()

    def code_grade(code: str | None):
        for rx, g in rules:
            if code and rx.search(code):
                return g
        return None

    rows, inferred = [], {}
    for r in all_rows:
        if use_code_rules:
            g = code_grade(r[2])
            if g is None or g not in band:
                continue
            inferred[str(r[0])] = g
        rows.append(r)
    leaf_ids = [r[0] for r in rows]

    # Ancestor paths in one recursive query.
    paths: dict[str, list[str]] = {}
    if leaf_ids:
        anc = (await db.execute(_t("""
            WITH RECURSIVE a AS (
                SELECT c.id AS leaf_id, p.id, p.parent_id, p.human_coding_scheme, p.full_statement, 1 AS depth
                FROM standards_items c JOIN standards_items p ON p.id = c.parent_id
                WHERE c.id IN :ids
                UNION ALL
                SELECT a.leaf_id, p.id, p.parent_id, p.human_coding_scheme, p.full_statement, a.depth + 1
                FROM a JOIN standards_items p ON p.id = a.parent_id
                WHERE a.depth < 6
            )
            SELECT leaf_id, depth, human_coding_scheme, full_statement FROM a ORDER BY leaf_id, depth DESC
        """).bindparams(bindparam("ids", expanding=True)), {"ids": leaf_ids})).fetchall()
        for leaf_id, _depth, code, stmt_text in anc:
            label = (stmt_text or code or "").strip()
            paths.setdefault(str(leaf_id), []).append(label[:120])

    # Per-leaf graph-edge coverage.
    edge_counts: dict[str, Counter] = {}
    if leaf_ids:
        edges = (await db.execute(_t("""
            SELECT sa.origin_item_id, sa.destination_item_id, sa.association_type,
                   (o.framework_id IS DISTINCT FROM d.framework_id) AS cross_framework
            FROM standards_associations sa
            LEFT JOIN standards_items o ON o.id = sa.origin_item_id
            LEFT JOIN standards_items d ON d.id = sa.destination_item_id
            WHERE sa.origin_item_id IN :ids OR sa.destination_item_id IN :ids
        """).bindparams(bindparam("ids", expanding=True)), {"ids": leaf_ids})).fetchall()
        leaf_set = {str(x) for x in leaf_ids}
        for o, d, typ, cross in edges:
            for end in (str(o), str(d)):
                if end in leaf_set:
                    key = typ + (":cross_framework" if cross else "")
                    edge_counts.setdefault(end, Counter())[key] += 1

    items = []
    for r in rows:
        iid = str(r[0])
        items.append({
            "id": iid,
            "framework_id": str(r[1]),
            "code": r[2] or "",
            "statement": r[3],
            "education_levels": r[4] or [],
            # K-12 items (e.g. math practice standards) carry many levels: use the lowest one IN the band
            "grade": inferred.get(iid, min((g for g in (grade_of([lv]) for lv in (r[4] or [])) if g in band),
                                           default=grade_of(r[4]))),
            "grade_source": "code_rule" if iid in inferred else "education_levels",
            "item_type": r[5],
            "parent_id": str(r[6]) if r[6] else None,
            "path": paths.get(iid, []),
            "indexed": bool(r[7]),
            "edges": dict(edge_counts.get(iid, {})),
        })

    n = len(items)
    has = lambda pred: sum(1 for it in items if pred(it))  # noqa: E731
    summary = {
        "n_leaves": n,
        "n_indexed": has(lambda it: it["indexed"]),
        "by_grade": dict(Counter(it["grade"] for it in items)),
        "leaves_with_precedes": has(lambda it: any(k.startswith("precedes") for k in it["edges"])),
        "leaves_with_cross_framework_edge": has(lambda it: any(k.endswith(":cross_framework") for k in it["edges"])),
        "leaves_with_any_non_child_edge": has(lambda it: any(not k.startswith("isChildOf") for k in it["edges"])),
        "codes_missing": has(lambda it: not it["code"]),
        "grade_from_code_rules": use_code_rules,
        "stored_grade_disagrees": has(lambda it: it.get("grade_source") == "code_rule"
                                      and it["grade"] not in {grade_of([lv]) for lv in it["education_levels"]}),
    }
    return {"target": target["key"], "framework_ids": framework_ids, "summary": summary, "items": items}


async def stage_frameworks(manifest: dict, targets: list[dict], out: Path, session_factory) -> None:
    results = []
    async with session_factory() as db:
        for t in targets:
            res = await list_frameworks(db, t, manifest["grade_band"])
            results.append(res)
            print(f"\n== {t['key']}")
            if "error" in res:
                print("   ERROR:", res["error"])
                continue
            for f in res["frameworks"][:10]:
                print(f"   {f['id']}  items={f['n_items']:>6}  in_band={f['n_in_grade_band']:>5}  {f['title'][:70]}")
                print(f"      version={f['version']} status={f['adoption_status']} assoc={f['associations']}")
    save_json(out / "frameworks.json", results)
    print(f"\nWrote {out / 'frameworks.json'}")
    print("Next: put the framework id(s) you want to evaluate into each target's "
          "\"framework_ids\" in the manifest (or leave it empty to use every listed "
          "framework with in_band > 0), then run the `corpus` stage.")


async def stage_corpus(manifest: dict, targets: list[dict], out: Path, session_factory) -> None:
    fw_all = {r["target"]: r for r in (load_json(out / "frameworks.json", []) or [])}
    async with session_factory() as db:
        for t in targets:
            fids = t.get("framework_ids") or [
                f["id"] for f in fw_all.get(t["key"], {}).get("frameworks", []) if f["n_in_grade_band"] > 0
            ]
            if not fids:
                print(f"{t['key']}: no frameworks selected -- run `frameworks` first or set framework_ids")
                continue
            corpus = await build_corpus(db, t, manifest["grade_band"], fids)
            jur = await _jurisdiction(db, t["state"])
            corpus["jurisdiction_id"] = str(jur[0]) if jur else None
            path = out / f"corpus_{t['state']}_{t['subject']}.json"
            save_json(path, corpus)
            s = corpus["summary"]
            print(f"{t['key']}: leaves={s['n_leaves']} indexed={s['n_indexed']} "
                  f"precedes={s['leaves_with_precedes']} cross_fw={s['leaves_with_cross_framework_edge']} "
                  f"by_grade={s['by_grade']}"
                  + (f" grade_from_code=yes stored_grade_wrong_or_missing={s['stored_grade_disagrees']}"
                     if s.get("grade_from_code_rules") else ""))
            if s["n_leaves"] and s["n_indexed"] < s["n_leaves"]:
                print(f"   WARNING: {s['n_leaves'] - s['n_indexed']} leaves have no embedding in rag_documents; "
                      "they can never be retrieved. Run scripts/backfill_standards_embeddings.py for this "
                      "jurisdiction before trusting retrieval numbers.")
