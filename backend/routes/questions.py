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
from typing import Optional
import io
import logging
import sqlite3
import tempfile
import os

from core.database import get_db
from core.dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/aristotelian-questions", tags=["questions"])


# ── Seed data ─────────────────────────────────────────────────────────────────
# Format: (subject, grade_band, bloom_level, observation_type, question_text, follow_up)

SEED_QUESTIONS = [
    # Science — observation
    ("science", "k-2",  "remember",  "observation",
     "What colour is this object? Does it change when you move it into shadow?",
     "Look closely — are all parts the same colour?"),
    ("science", "k-2",  "understand", "classification",
     "Is this object living or non-living? How can you tell?",
     "What evidence helps you decide?"),
    ("science", "3-5",  "understand", "observation",
     "What texture does this surface have? How many different textures can you find nearby?",
     "Which texture appears most often and why might that be?"),
    ("science", "3-5",  "apply",     "causation",
     "Why do you think this plant is growing toward the light? What would happen if you turned it around?",
     "What does this tell you about what plants need?"),
    ("science", "3-5",  "analyse",   "comparison",
     "How does the soil here differ from soil somewhere else you have seen?",
     "What might cause those differences?"),
    ("science", "6-8",  "analyse",   "causation",
     "What evidence tells you this rock was formed by water, heat, or pressure?",
     "What type of rock is this and what does its formation tell you about this place's history?"),
    ("science", "6-8",  "evaluate",  "evidence",
     "What measurements would you need to test whether this slope affects the speed of water flow?",
     "How would you control for other variables?"),
    ("science", "9-12", "evaluate",  "evidence",
     "What data would confirm or disprove your hypothesis about this ecosystem?",
     "What sample size would you need for your conclusion to be reliable?"),
    ("science", "9-12", "create",    "causation",
     "Design an experiment to determine what factor most influences plant growth in this location.",
     "What controls would you include?"),

    # Mathematics
    ("math", "k-2",  "remember",  "observation",
     "Count how many of each shape you can find. Which shape appears most?",
     "Can you arrange them from most to least common?"),
    ("math", "3-5",  "apply",     "measurement",
     "Estimate the height of this tree in metres. What method could you use to check your estimate?",
     "How close was your estimate? What caused the difference?"),
    ("math", "3-5",  "analyse",   "pattern",
     "Look at the cracks in this surface. What pattern do they follow? Why might they grow that way?",
     "Can you sketch the pattern and predict where the next crack would appear?"),
    ("math", "6-8",  "analyse",   "measurement",
     "How would you calculate the area of this irregular space using only a measuring tape?",
     "What is your margin of error?"),
    ("math", "9-12", "evaluate",  "evidence",
     "What statistical test would best determine whether the distribution of plants here is random or clustered?",
     "What does the result tell you about the environment?"),

    # History
    ("history", "3-5",  "understand", "observation",
     "What materials was this building made from? Where do you think those materials came from?",
     "What does that tell you about when it was built and who built it?"),
    ("history", "3-5",  "analyse",   "causation",
     "Why do you think people settled near this water source rather than further away?",
     "What other resources would they have needed nearby?"),
    ("history", "6-8",  "analyse",   "evidence",
     "What physical evidence at this site tells you something about its past use?",
     "What questions would you need primary sources to answer?"),
    ("history", "9-12", "evaluate",  "evidence",
     "What claims could you make about this site based on physical evidence alone, without documents?",
     "What are the limits of physical evidence as a historical source?"),

    # Art
    ("art", "k-2",  "remember",  "observation",
     "What colours, shapes, and textures do you see in front of you right now?",
     "Which is most eye-catching and why?"),
    ("art", "3-5",  "analyse",   "comparison",
     "How does the light here change the appearance of colours compared to indoors?",
     "How would an artist capture that difference?"),
    ("art", "6-8",  "evaluate",  "observation",
     "What compositional choices would you make to capture this scene? What would you include or exclude and why?",
     "What mood do you want to convey and how does your composition support it?"),
    ("art", "9-12", "create",    "causation",
     "How does the context of this place — its history, function, or community — affect how you would represent it?",
     "What artistic choices communicate that context to a viewer who has never been here?"),

    # Language arts
    ("language", "k-2",  "remember",  "observation",
     "What three words best describe what you see right now?",
     "Can you use those words in a sentence?"),
    ("language", "3-5",  "apply",     "observation",
     "Write a precise description of this object so that someone who cannot see it could identify it.",
     "What details are most important to include?"),
    ("language", "6-8",  "analyse",   "evidence",
     "What specific details from this place would you use as evidence in an argument about its importance?",
     "How do you decide which details are relevant?"),
    ("language", "9-12", "evaluate",  "evidence",
     "What is the most precise claim you can make about this place that is fully supported by what you observe?",
     "What would weaken that claim?"),
]


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
]

SEED_SQL = """
INSERT INTO aristotelian_questions
    (subject, grade_band, bloom_level, observation_type, question_text, follow_up)
VALUES (:subject, :grade_band, :bloom_level, :observation_type, :question_text, :follow_up)
ON CONFLICT DO NOTHING
"""


async def ensure_questions_table(engine):
    """Create table and seed if empty — called from main.py startup."""
    try:
        async with engine.begin() as conn:
            await conn.execute(text(CREATE_TABLE_SQL))
            for idx_sql in CREATE_INDEXES_SQL:
                await conn.execute(text(idx_sql))
            count = (await conn.execute(text("SELECT COUNT(*) FROM aristotelian_questions"))).scalar()
            if count == 0:
                for q in SEED_QUESTIONS:
                    await conn.execute(text(SEED_SQL), dict(zip(
                        ["subject", "grade_band", "bloom_level", "observation_type", "question_text", "follow_up"], q
                    )))
                logger.info(f"✅ Aristotelian questions seeded ({len(SEED_QUESTIONS)} questions)")
            else:
                logger.info(f"✅ Aristotelian questions table ready ({count} questions)")
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
