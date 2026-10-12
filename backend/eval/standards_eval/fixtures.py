# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.
"""
Self-test fixtures: a synthetic two-state CASE corpus, a matching synthetic
"state PDF", and a deterministic fake LLM. Used ONLY by `selftest`, which
refuses to run against a database that already holds real standards.

The fake LLM is crude on purpose (word overlap); it exists to push every
stage of the harness through its real code paths, not to be accurate.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from pathlib import Path

from eval.standards_eval.common import content_words, jaccard

NS = uuid.UUID("5f0e7b52-9d1c-4d55-9a54-6a1e2d9c0e11")

TOPICS = {
    "RP": ("ratios and rates", ["unit rate in a recipe", "scaling a map distance", "comparing prices per ounce"]),
    "NS": ("rational numbers", ["ordering negative temperatures", "locating elevations below sea level", "dividing fractions of a garden plot"]),
    "EE": ("expressions and equations", ["writing an equation for total cost", "solving for an unknown length", "evaluating a formula for area"]),
    "G": ("geometry", ["finding the area of an irregular field", "measuring the volume of a planter", "drawing a scale model of a building"]),
    "SP": ("statistics and probability", ["summarizing bird counts with a median", "comparing two samples of leaf lengths", "estimating a probability from repeated trials"]),
}
VERBS = ["Solve real-world problems about", "Represent and explain", "Analyze patterns in"]


def _uid(*parts) -> uuid.UUID:
    return uuid.uuid5(NS, ":".join(str(p) for p in parts))


def build_standards(state: str) -> tuple[list[dict], list[dict]]:
    """Return (items, associations) for one synthetic state framework."""
    fw = _uid("fw", state)
    items, assocs = [], []
    for grade in (6, 7, 8):
        for dom, (dom_name, contexts) in TOPICS.items():
            d_id = _uid(state, grade, dom)
            items.append({"id": d_id, "framework_id": fw, "code": f"{state}.{grade}.{dom}", "item_type": "Domain",
                          "statement": f"Grade {grade} {dom_name}", "levels": [f"{grade:02d}"], "parent": None})
            for k, ctx in enumerate(contexts, start=1):
                s_id = _uid(state, grade, dom, k)
                verb = VERBS[(grade + k) % len(VERBS)]
                stmt = f"{verb} {dom_name} such as {ctx}, using grade {grade} methods and justifying each step."
                items.append({"id": s_id, "framework_id": fw, "code": f"{state}.{grade}.{dom}.{k}", "item_type": "Standard",
                              "statement": stmt, "levels": [f"{grade:02d}"], "parent": d_id})
                assocs.append({"o": s_id, "d": d_id, "t": "isChildOf", "fw": fw})
                if grade > 6:
                    assocs.append({"o": _uid(state, grade - 1, dom, k), "d": s_id, "t": "precedes", "fw": fw})
    return items, assocs


async def seed_database(session_factory) -> dict:
    """Insert synthetic jurisdictions/frameworks/items/associations. Refuses on a DB with real data."""
    from sqlalchemy import text as _t
    async with session_factory() as db:
        real = (await db.execute(_t(
            "SELECT count(*) FROM standards_frameworks WHERE official_source_url NOT LIKE 'https://selftest.invalid/%'"
        ))).scalar()
        if real:
            raise SystemExit("selftest refused: this database already holds real standards frameworks. "
                             "Run the self-test only against a scratch database.")
        now = datetime.utcnow()
        jids = {}
        for state, name in (("TX", "Texas"), ("GA", "Georgia")):
            jid = _uid("jur", state)
            jids[state] = str(jid)
            await db.execute(_t("""
                INSERT INTO jurisdictions (id, country_code, subdivision_code, level, name, is_issuing_agency, external_ref, created_at, updated_at)
                VALUES (:id, 'US', :sub, 'state', :name, true, :ref, :now, :now) ON CONFLICT (id) DO NOTHING
            """), {"id": jid, "sub": f"US-{state}", "name": name, "ref": state, "now": now})
            sid = _uid("src", state)
            await db.execute(_t("""
                INSERT INTO standards_sources (id, name, source_type, base_url, jurisdiction_id, is_authoritative, poll_frequency_days, created_at, updated_at)
                VALUES (:id, :n, 'case_api', 'https://selftest.invalid/', :j, true, 7, :now, :now) ON CONFLICT (id) DO NOTHING
            """), {"id": sid, "n": f"selftest {state}", "j": jid, "now": now})
            fw = _uid("fw", state)
            await db.execute(_t("""
                INSERT INTO standards_frameworks (id, source_id, jurisdiction_id, title, subject, official_source_url,
                    is_authoritative_over_uploads, raw, created_at, updated_at)
                VALUES (:id, :s, :j, :t, 'Mathematics', :u, true, '{}'::jsonb, :now, :now) ON CONFLICT (id) DO NOTHING
            """), {"id": fw, "s": sid, "j": jid, "t": f"{name} Mathematics Standards (selftest)",
                   "u": f"https://selftest.invalid/{state}", "now": now})
            items, assocs = build_standards(state)
            for it in items:
                await db.execute(_t("""
                    INSERT INTO standards_items (id, framework_id, human_coding_scheme, full_statement, education_levels,
                        item_type, parent_id, is_retired, raw, created_at, updated_at)
                    VALUES (:id, :fw, :c, :s, CAST(:lv AS varchar[]), :ty, :p, false, '{}'::jsonb, :now, :now)
                    ON CONFLICT (id) DO NOTHING
                """), {"id": it["id"], "fw": it["framework_id"], "c": it["code"], "s": it["statement"],
                       "lv": it["levels"], "ty": it["item_type"], "p": it["parent"], "now": now})
            for a in assocs:
                await db.execute(_t("""
                    INSERT INTO standards_associations (id, framework_id, origin_item_id, destination_item_id, association_type)
                    VALUES (:id, :fw, :o, :d, :t) ON CONFLICT (id) DO NOTHING
                """), {"id": _uid("as", a["o"], a["d"], a["t"]), "fw": a["fw"], "o": a["o"], "d": a["d"], "t": a["t"]})
        # one cross-state crosswalk per TX leaf -> GA twin
        tx_items, _ = build_standards("TX")
        for it in tx_items:
            if it["item_type"] != "Standard":
                continue
            twin = _uid("GA", *it["code"].split(".")[1:2], it["code"].split(".")[2], it["code"].split(".")[3])
            await db.execute(_t("""
                INSERT INTO standards_associations (id, framework_id, origin_item_id, destination_item_id, association_type)
                VALUES (:id, :fw, :o, :d, 'exactMatchOf') ON CONFLICT (id) DO NOTHING
            """), {"id": _uid("x", it["id"], twin), "fw": it["framework_id"], "o": it["id"], "d": twin})
        await db.commit()
    return jids


def write_pdf(state: str, path: Path, drop_every: int = 5) -> None:
    """Render a synthetic 'official PDF' for one state: every standard listed with
    its code, except every Nth is omitted (so coverage cannot be 100%), plus
    filler pages so the current 12-page / 12000-char chunking actually truncates."""
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    items, _ = build_standards(state)
    c = canvas.Canvas(str(path), pagesize=letter)
    y = 750
    n = 0

    def line(txt):
        nonlocal y
        if y < 60:
            c.showPage()
            y = 750
        c.drawString(40, y, txt[:110])
        y -= 14

    for _ in range(4):  # front matter pages
        for k in range(45):
            line(f"Introduction paragraph {k}: these standards describe the knowledge and skills for mathematics.")
    for it in items:
        if it["item_type"] == "Domain":
            line("")
            line(it["statement"].upper())
            continue
        n += 1
        if n % drop_every == 0:
            continue
        line(f"{it['code']} {it['statement']}")
        line("   Example: students may use tables, diagrams, or equations when working on this expectation.")
    c.save()


# ---------------------------------------------------------------------------
# Fake LLM
# ---------------------------------------------------------------------------

async def fake_dispatch(provider, messages, model=None, max_tokens=2048, timeout=120, images=None, temperature=None) -> str:
    text = "\n".join(m.get("content", "") for m in messages)
    if "[[EVAL:activity]]" in text:
        skill = text.split("SKILL (do not quote it):", 1)[1].split("Rules:", 1)[0].strip()
        words = content_words(skill)
        # reorder words so no 4-gram survives, add filler
        words = words[1::2] + words[0::2]
        return json.dumps({"activity": "Outside in the park, learners work in teams on " + " ; ".join(words)
                           + ". They record findings in field notebooks and present a short poster."})
    if "[[EVAL:coverage]]" in text:
        out = []
        for block in re.split(r"\n\s*\n", text):
            m = re.match(r"S(\d+) OFFICIAL: (.*)", block.strip())
            if not m:
                continue
            official = m.group(2)
            cands = re.findall(r"E(\d+): (.*)", block)
            best = max(cands, key=lambda e: jaccard(official, e[1]), default=None)
            score = jaccard(official, best[1]) if best else 0
            verdict = "full" if score > 0.6 else "partial" if score > 0.3 else "none"
            out.append({"standard": f"S{m.group(1)}", "match": f"E{best[0]}" if best and verdict != "none" else None,
                        "verdict": verdict})
        return json.dumps({"results": out})
    if "[[EVAL:unmatched]]" in text:
        ids = re.findall(r"^U(\d+):", text, flags=re.M)
        return json.dumps({"results": [{"item": f"U{i}", "class": "non_standard"} for i in ids]})
    if "CANDIDATE STANDARDS (classify each)" in text:
        sub = text.split("STUDENT SUBMISSION:", 1)[1].split("GRADE LEVEL:", 1)[0]
        cands = re.findall(r"^- CODE: (.*?) \| TITLE: (.*?) \| (.*)$", text, flags=re.M)
        scored = sorted(cands, key=lambda c: -jaccard(sub, c[2]))
        maps = []
        for i, (code, title, desc) in enumerate(scored):
            maps.append({"code": code, "title": title, "decision": "applies" if i == 0 else "no",
                         "rationale": "fake", "confidence": 0.8 if i == 0 else 0.1})
        return json.dumps({"mappings": maps, "overall_confidence": 0.7})
    if "JSON ARRAY:" in text and "DOCUMENT TEXT:" in text:
        doc = text.split("DOCUMENT TEXT:", 1)[1]
        out = []
        for code, stmt in re.findall(r"^([A-Z]{2}\.\d\.[A-Z]{1,2}\.\d)\s+(.*)$", doc, flags=re.M):
            g = code.split(".")[1]
            out.append({"id": code.lower().replace(".", "-"), "code": code, "name": stmt[:40],
                        "description": stmt, "category": code.split(".")[2], "grade_band": g,
                        "bloom_level": 3, "dok_level": 2, "required": True, "weight": 1.0})
        return json.dumps(out)
    return "{}"
