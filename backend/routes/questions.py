# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1

"""
Aristotelian observation questions — Block 11

Questions guide students toward evidence-based answers through:
  - Careful observation (What do you see/hear/measure?)
  - Classification (What kind of thing is this?)
  - Causation (What caused this? What will happen next?)
  - Comparison (How does this differ from...?)
  - Evidence (What would prove/disprove this?)

NOT abstract (not "what is justice?") — these have concrete, observable answers grounded in the Aristotelian tradition.
"""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pathlib import Path
from typing import Optional
import io
import json
import logging
import sqlite3
import tempfile
import os

from core.database import get_db
from core.dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/aristotelian-questions", tags=["questions"])


# ── Seed data ─────────────────────────────────────────────────────────────────
# Lives in data/aristotelian_questions.json, not inline here — at 190+ entries
# (up from the original 26) a literal Python list stopped being something
# anyone could reasonably review or edit by hand. Loaded once at import time;
# format is {subject, grade_band, bloom_level, observation_type,
# question_text, follow_up} per entry.

_SEED_PATH = Path(__file__).parent.parent / "data" / "aristotelian_questions.json"


def _load_seed_questions() -> list[tuple]:
    with open(_SEED_PATH, encoding="utf-8") as f:
        rows = json.load(f)
    return [
        (r["subject"], r["grade_band"], r["bloom_level"], r["observation_type"], r["question_text"], r["follow_up"])
        for r in rows
    ]


SEED_QUESTIONS = _load_seed_questions()


# ── Startup table creation ────────────────────────────────────────────────────

# asyncpg rejects multiple statements in a single execute() — split into separate calls
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS aristotelian_questions (
    id              SERIAL PRIMARY KEY,
    subject         VARCHAR(50)  NOT NULL,
    grade_band      VARCHAR(10)  NOT NULL,
    bloom_level     VARCHAR(20)  NOT NULL,
    observation_type VARCHAR(30) NOT NULL,
    question_text   TEXT        NOT NULL,
    follow_up       TEXT,
    created_at      TIMESTAMP   DEFAULT NOW()
)
"""
CREATE_INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_aq_subject ON aristotelian_questions(subject)",
    "CREATE INDEX IF NOT EXISTS idx_aq_grade   ON aristotelian_questions(grade_band)",
    "CREATE INDEX IF NOT EXISTS idx_aq_bloom   ON aristotelian_questions(bloom_level)",
    # Backs ON CONFLICT (question_text) below — question_text is the natural
    # key here (there's no other stable identifier in the seed JSON), so a
    # unique index on it is what makes reseeding idempotent.
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_aq_question_text_unique ON aristotelian_questions(question_text)",
]

SEED_SQL = """
INSERT INTO aristotelian_questions
    (subject, grade_band, bloom_level, observation_type, question_text, follow_up)
VALUES (:subject, :grade_band, :bloom_level, :observation_type, :question_text, :follow_up)
ON CONFLICT (question_text) DO NOTHING
"""


async def ensure_questions_table(engine):
    """
    Create table/indexes and seed any new questions — called from main.py
    startup on every boot, not just when the table is empty. The seed JSON
    started at 26 questions and grew to 190+; gating the insert loop behind
    `count == 0` meant an already-seeded dev database from the 26-question
    era would never pick up the rest without a manual wipe. ON CONFLICT
    (question_text) DO NOTHING (backed by the unique index above) makes
    re-running the full seed list on every startup cheap and safe — already-
    present rows are skipped, only genuinely new ones get inserted.
    """
    try:
        async with engine.begin() as conn:
            await conn.execute(text(CREATE_TABLE_SQL))
            for idx_sql in CREATE_INDEXES_SQL:
                await conn.execute(text(idx_sql))
            before = (await conn.execute(text("SELECT COUNT(*) FROM aristotelian_questions"))).scalar()
            for q in SEED_QUESTIONS:
                await conn.execute(text(SEED_SQL), dict(zip(
                    ["subject", "grade_band", "bloom_level", "observation_type", "question_text", "follow_up"], q
                )))
            after = (await conn.execute(text("SELECT COUNT(*) FROM aristotelian_questions"))).scalar()
            if after > before:
                logger.info(f"✅ Aristotelian questions: {after - before} new question(s) seeded ({after} total)")
            else:
                logger.info(f"✅ Aristotelian questions table ready ({after} questions)")
    except Exception as e:
        logger.warning(f"⊘ Questions table setup skipped: {e}")


# ── API endpoint ──────────────────────────────────────────────────────────────

@router.get("")
async def get_questions(
    subject: Optional[str] = Query(None),
    grade: Optional[str] = Query(None),
    bloom: Optional[str] = Query(None),
    observation_type: Optional[str] = Query(None),
    limit: int = Query(5, le=20),
    db: AsyncSession = Depends(get_db),
):
    """
    Return Aristotelian observation questions filtered by subject, grade band, and bloom level.
    Used by student capture flow to surface relevant evidence-gathering questions.
    """
    conditions = []
    params: dict = {"limit": limit}

    if subject:
        conditions.append("subject = :subject")
        params["subject"] = subject.lower()
    if grade:
        conditions.append("grade_band = :grade")
        params["grade"] = grade.lower()
    if bloom:
        conditions.append("bloom_level = :bloom")
        params["bloom"] = bloom.lower()
    if observation_type:
        conditions.append("observation_type = :obs_type")
        params["obs_type"] = observation_type.lower()

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"SELECT * FROM aristotelian_questions {where} ORDER BY RANDOM() LIMIT :limit"

    try:
        result = await db.execute(text(sql), params)
        rows = result.mappings().all()
        return {"questions": [dict(r) for r in rows], "count": len(rows)}
    except Exception as e:
        logger.error(f"Questions query error: {e}")
        return {"questions": [], "count": 0}


@router.get("/subjects")
async def list_subjects(db: AsyncSession = Depends(get_db)):
    """List all available subjects."""
    try:
        result = await db.execute(text(
            "SELECT DISTINCT subject FROM aristotelian_questions ORDER BY subject"
        ))
        return {"subjects": [r[0] for r in result.fetchall()]}
    except Exception:
        return {"subjects": ["science", "math", "history", "art", "language"]}


@router.get("/sqlite", response_class=StreamingResponse)
async def download_sqlite(db: AsyncSession = Depends(get_db)):
    """
    Return all questions as a self-contained SQLite file (Block 11.4).
    Mobile downloads this once on first launch and queries locally thereafter.
    No auth required — questions are not sensitive.
    """
    try:
        result = await db.execute(text(
            "SELECT id, subject, grade_band, bloom_level, observation_type, "
            "question_text, follow_up FROM aristotelian_questions ORDER BY id"
        ))
        rows = result.fetchall()
    except Exception as e:
        logger.error(f"SQLite export query error: {e}")
        rows = []

    # Build SQLite in a temp file then stream it
    tmp_path = f"/tmp/questions_{id(rows)}.sqlite"
    try:
        conn = sqlite3.connect(tmp_path)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS aristotelian_questions (
                id               INTEGER PRIMARY KEY,
                subject          TEXT NOT NULL,
                grade_band       TEXT NOT NULL,
                bloom_level      TEXT NOT NULL,
                observation_type TEXT NOT NULL,
                question_text    TEXT NOT NULL,
                follow_up        TEXT
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_subject ON aristotelian_questions(subject)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_grade   ON aristotelian_questions(grade_band)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_bloom   ON aristotelian_questions(bloom_level)")
        if rows:
            cur.executemany(
                "INSERT OR IGNORE INTO aristotelian_questions "
                "(id, subject, grade_band, bloom_level, observation_type, question_text, follow_up) "
                "VALUES (?,?,?,?,?,?,?)",
                rows
            )
        else:
            # DB empty — fall back to in-memory seed constants
            for i, q in enumerate(SEED_QUESTIONS, start=1):
                cur.execute(
                    "INSERT OR IGNORE INTO aristotelian_questions "
                    "(id, subject, grade_band, bloom_level, observation_type, question_text, follow_up) "
                    "VALUES (?,?,?,?,?,?,?)",
                    (i, *q)
                )
        conn.commit()
        conn.close()

        buf = io.BytesIO()
        with open(tmp_path, "rb") as f:
            buf.write(f.read())
    finally:
        os.unlink(tmp_path)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename=questions.sqlite"},
    )
