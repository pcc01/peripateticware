# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Startup helpers for main.py:lifespan().

Each function owns one logical block of the startup sequence.
Extracted from a 1,377-line monolithic lifespan() as part of the
NASA Power-of-10 Rule 4 refactor (2026-06-25).

NOTE: Inline SQL patches here are NOT Alembic migrations.
TODO (backlog): Convert each _apply_*_migrations() call to a proper
      Alembic migration so schema history is tracked in the migration chain.
"""

from sqlalchemy import text
import asyncio
import json
import logging
import uuid
from datetime import datetime
from core.encryption import blind_index

logger = logging.getLogger(__name__)

# Demo classroom name used across several seed helpers
_DEMO_CLASS_NAME = "Demo Class — Field Science"

# E2E/Detox test classroom name — keeps @test.local test data separate from
# the @example.com demo data seeded by seed_demo_classroom()
_TEST_CLASS_NAME = "Test Class — E2E"


async def _exec_safepoint(conn, sql: str, label: str | None = None) -> bool:
    """Execute one DDL/DML statement inside its own SAVEPOINT.

    Prevents the cascading-failure bug where one obsolete or order-dependent
    statement (e.g. a statement referencing a table/column that a later
    migration block hasn't created yet) aborts the *entire* enclosing
    transaction — silently skipping every statement that runs after it in
    that transaction, even completely unrelated ones. A plain try/except
    around the call does NOT protect later statements: once Postgres marks a
    transaction aborted, every subsequent statement fails with
    "current transaction is aborted" until a ROLLBACK or SAVEPOINT boundary,
    regardless of whether Python catches the exception.

    Pattern matches the fix already applied to
    backend/alembic/versions/20260524_discovery_taxonomies_comprehensive_CORRECTED.py
    (commit bc631f4) — using begin_nested() issues a real SQL SAVEPOINT, so a
    failure here only rolls back to that savepoint, not the whole transaction.

    Returns True if the statement committed, False if it was skipped.
    """
    try:
        async with conn.begin_nested():
            await conn.execute(text(sql))
        return True
    except Exception as e:
        logger.warning(f"⊘ Migration statement skipped ({label or sql[:60].strip()}…): {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# MIGRATION HELPERS
# ─────────────────────────────────────────────────────────────────────────────

async def apply_enum_and_core_column_migrations(engine) -> None:
    """Block 1: Enum types + ADD COLUMN IF NOT EXISTS for activities and users.

    2026-07-07 fix: every statement now runs through _exec_safepoint(), which
    scopes each one to its own SAVEPOINT. Previously all statements shared one
    transaction, so the AssessmentRubrics ALTERs at the bottom of this
    function — which reference a table that apply_core_schema_migrations()
    (Block 5) doesn't create until *later* in the startup sequence, see
    main.py's call order — failed on every restart of a fresh/reconciled
    database and silently rolled back every other column in this function,
    including is_platform_admin, email_index, deleted_at, and state_code.
    """
    async with engine.begin() as conn:
        # Create enum types if missing, then convert columns to VARCHAR so
        # we are never dependent on the enum type again.
        await _exec_safepoint(conn, """
            DO $$ BEGIN
                CREATE TYPE activity_status AS ENUM ('draft', 'published', 'archived');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """, "create activity_status enum")
        await _exec_safepoint(conn, """
            DO $$ BEGIN
                CREATE TYPE activity_type_enum AS ENUM (
                    'inquiry','field_observation','hands_on','project',
                    'discussion','experiment','discovery'
                );
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """, "create activity_type_enum")
        await _exec_safepoint(conn,
            "ALTER TABLE activities ALTER COLUMN status TYPE VARCHAR(50) "
            "USING status::VARCHAR", "activities.status -> VARCHAR")
        await _exec_safepoint(conn,
            "ALTER TABLE activities ALTER COLUMN activity_type TYPE VARCHAR(50) "
            "USING activity_type::VARCHAR", "activities.activity_type -> VARCHAR")
        # ── Users columns ────────────────────────────────────────────────
        await _exec_safepoint(conn, "ALTER TABLE users ADD COLUMN IF NOT EXISTS age_group VARCHAR(20)")
        await _exec_safepoint(conn, "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE")
        await _exec_safepoint(conn, "ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_org_id UUID")
        await _exec_safepoint(conn, "ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_country_code VARCHAR(10)")
        await _exec_safepoint(conn, "ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token_used VARCHAR(128)")
        # NOTE: no REFERENCES organizations(id) here on purpose — the
        # organizations table isn't created until apply_core_schema_migrations()
        # runs later in the startup sequence (main.py). A hard FK here failed
        # on any database where organizations didn't exist yet. Plain UUID
        # column; referential integrity for org_id is enforced at the
        # application layer.
        await _exec_safepoint(conn, "ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID")
        await _exec_safepoint(conn, "ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)")
        await _exec_safepoint(conn, "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)")
        await _exec_safepoint(conn, "ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_token VARCHAR(128)")
        # ── Session 33 encryption + soft-delete columns ───────────────────
        await _exec_safepoint(conn, "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_index VARCHAR(64)")
        await _exec_safepoint(conn, "ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP")
        await _exec_safepoint(conn, "ALTER TABLE users ADD COLUMN IF NOT EXISTS state_code VARCHAR(10)")
        # Backfill email_index with plain email for users where encryption is off
        await _exec_safepoint(conn, "UPDATE users SET email_index = LOWER(email) WHERE email_index IS NULL")
        # ── Activities location columns ───────────────────────────────────
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS enriched_location_id UUID")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS location_address VARCHAR(512)")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS location_info TEXT")
        # Structured Wikidata/Wikipedia place enrichment (name, description, type,
        # features, architect/artist, construction date, historical significance,
        # keywords, learning opportunities, wikidata_id) — captured by the teacher
        # builder's WikiLocationInfo panel and saved with the activity so students
        # can read it offline in the field (no signal required at click-time,
        # since it ships in the same GET /student/activities/{id} payload).
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS location_wiki_data JSONB")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS suggested_lessons JSONB")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS wiki_location_id VARCHAR(255)")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS location_source VARCHAR(50)")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS location_context_id UUID")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS privacy_jurisdiction_id VARCHAR(100)")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS privacy_compliant BOOLEAN DEFAULT FALSE")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS last_compliance_check TIMESTAMP")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS originator_student_id UUID")
        # ── Taxonomy / assessment columns ─────────────────────────────────
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS assessment_type VARCHAR(50) DEFAULT 'formative'")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS marzano_level INTEGER")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS dok_level INTEGER")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS solo_level INTEGER")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS primary_framework VARCHAR(50) DEFAULT 'blooms'")
        # ── Shared library columns ─────────────────────────────────────────
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS share_scope VARCHAR(20) DEFAULT 'org'")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS language VARCHAR(50)")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS state_standard VARCHAR(100)")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discipline VARCHAR(100)")
        # ── AssessmentRubrics columns ──────────────────────────────────────
        # assessment_rubrics doesn't exist until Block 5 runs (see docstring
        # above) — these three harmlessly skip via savepoint until then, and
        # Block 5 already creates the table with these columns included.
        await _exec_safepoint(conn, "ALTER TABLE assessment_rubrics ADD COLUMN IF NOT EXISTS total_points INTEGER NOT NULL DEFAULT 100")
        await _exec_safepoint(conn, "ALTER TABLE assessment_rubrics ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE")
        await _exec_safepoint(conn, "ALTER TABLE assessment_rubrics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()")
    logger.info("✅ Enum and core column migrations applied")


async def apply_location_table_migrations(engine) -> None:
    """Block 2: Create cached_locations, enriched_locations, classes, ai_task_config."""
    logger.info("Running location table migrations…")
    _stmts = [
        """CREATE TABLE IF NOT EXISTS cached_locations (
            id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            name             VARCHAR(255) NOT NULL,
            latitude         FLOAT        NOT NULL,
            longitude        FLOAT        NOT NULL,
            location_type    VARCHAR(100),
            address          VARCHAR(512),
            place_id         VARCHAR(255) UNIQUE,
            rating           FLOAT,
            user_ratings_total INTEGER,
            source           VARCHAR(50),
            search_region    VARCHAR(255),
            search_latitude  FLOAT,
            search_longitude FLOAT,
            search_radius_meters INTEGER,
            cached_at        TIMESTAMP    DEFAULT NOW(),
            last_accessed    TIMESTAMP    DEFAULT NOW(),
            access_count     INTEGER      DEFAULT 1
        )""",
        """CREATE TABLE IF NOT EXISTS enriched_locations (
            id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            cached_location_id  UUID        UNIQUE REFERENCES cached_locations(id),
            description         TEXT,
            image_url           VARCHAR(512),
            wikipedia_url       VARCHAR(512),
            wikidata_id         VARCHAR(100),
            architect_or_artist VARCHAR(255),
            construction_date   VARCHAR(100),
            historical_significance TEXT,
            subjects            TEXT[]      DEFAULT '{}',
            keywords            TEXT[]      DEFAULT '{}',
            learning_opportunities TEXT[]   DEFAULT '{}',
            grade_levels        INTEGER[]   DEFAULT '{}',
            best_for_subjects   TEXT[]      DEFAULT '{}',
            safety_considerations TEXT[]    DEFAULT '{}',
            accessibility       JSONB       DEFAULT '{}',
            nearby_attractions  TEXT[]      DEFAULT '{}',
            enriched_at         TIMESTAMP   DEFAULT NOW(),
            enrichment_source   VARCHAR(50),
            enrichment_quality  FLOAT       DEFAULT 0.0,
            teacher_rating      FLOAT,
            usage_count         INTEGER     DEFAULT 0,
            last_used           TIMESTAMP,
            created_lessons     INTEGER     DEFAULT 0
        )""",
        """CREATE TABLE IF NOT EXISTS classes (
            id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
            teacher_id   UUID         NOT NULL REFERENCES users(id),
            name         VARCHAR(255) NOT NULL,
            description  TEXT,
            grade_level  INTEGER,
            school_year  VARCHAR(20),
            is_active    BOOLEAN      DEFAULT TRUE,
            created_at   TIMESTAMP    DEFAULT NOW(),
            updated_at   TIMESTAMP    DEFAULT NOW()
        )""",
        "ALTER TABLE cached_locations ADD COLUMN IF NOT EXISTS name VARCHAR(255)",
        "ALTER TABLE cached_locations ADD COLUMN IF NOT EXISTS location_type VARCHAR(100)",
        "ALTER TABLE cached_locations ADD COLUMN IF NOT EXISTS address VARCHAR(512)",
        "ALTER TABLE cached_locations ADD COLUMN IF NOT EXISTS place_id VARCHAR(255)",
        "ALTER TABLE cached_locations ADD COLUMN IF NOT EXISTS rating FLOAT",
        "ALTER TABLE cached_locations ADD COLUMN IF NOT EXISTS user_ratings_total INTEGER",
        "ALTER TABLE cached_locations ADD COLUMN IF NOT EXISTS source VARCHAR(50)",
        "ALTER TABLE cached_locations ADD COLUMN IF NOT EXISTS search_region VARCHAR(255)",
        "ALTER TABLE cached_locations ADD COLUMN IF NOT EXISTS search_latitude FLOAT",
        "ALTER TABLE cached_locations ADD COLUMN IF NOT EXISTS search_longitude FLOAT",
        "ALTER TABLE cached_locations ADD COLUMN IF NOT EXISTS search_radius_meters INTEGER",
        "ALTER TABLE cached_locations ADD COLUMN IF NOT EXISTS cached_at TIMESTAMP DEFAULT NOW()",
        "ALTER TABLE cached_locations ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMP DEFAULT NOW()",
        "ALTER TABLE cached_locations ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 1",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS description TEXT",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS image_url TEXT",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS subjects JSONB DEFAULT '[]'",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS grade_levels JSONB DEFAULT '[]'",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS learning_opportunities JSONB DEFAULT '[]'",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS enrichment_quality FLOAT DEFAULT 0.0",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS enrichment_source VARCHAR(100)",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0",
        # The rest of the EnrichedLocation ORM model's columns (models/database.py)
        # were never added here. On any environment where enriched_locations was
        # first created by database/init.sql's older, differently-shaped table
        # (place_name/place_type/enrichment_data JSONB blob design — no
        # `keywords` column at all) rather than the CREATE TABLE IF NOT EXISTS
        # above, this CREATE is a no-op and the table is permanently missing
        # every one of these columns. The very first SELECT the ORM issues
        # against this table (the enrich_location cache-check query) lists
        # every mapped column, so it 500s with UndefinedColumnError on
        # `keywords` before ever reaching real enrichment logic — this is what
        # made "Learn about this place" / student background info never load
        # anything in production, on every single search, unconditionally.
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}'",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS wikipedia_url VARCHAR(512)",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS wikidata_id VARCHAR(100)",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS architect_or_artist VARCHAR(255)",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS construction_date VARCHAR(100)",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS historical_significance TEXT",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS best_for_subjects TEXT[] DEFAULT '{}'",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS safety_considerations TEXT[] DEFAULT '{}'",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS accessibility JSONB DEFAULT '{}'",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS nearby_attractions TEXT[] DEFAULT '{}'",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMP DEFAULT NOW()",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS teacher_rating FLOAT",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS last_used TIMESTAMP",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS created_lessons INTEGER DEFAULT 0",
        "ALTER TABLE enriched_locations ADD COLUMN IF NOT EXISTS cached_location_id UUID",
        # `subjects`/`grade_levels`/`learning_opportunities` were healed above
        # as JSONB, but the ORM model declares them ARRAY(String)/ARRAY(Integer)
        # (native Postgres TEXT[]/INTEGER[]) — on any DB where those ALTERs
        # actually ran (i.e. the column didn't already exist as an array from
        # the CREATE TABLE), the column is now the wrong type and every read/
        # write through the ORM fails. Convert in place, but only when the
        # column is actually jsonb today — a no-op everywhere the column is
        # already the correct array type.
        #
        # jsonb_array_elements_text() throws if the JSONB value isn't a JSON
        # array (a scalar, an object, etc.) — and because ALTER COLUMN TYPE
        # USING evaluates its expression against every row in one pass, a
        # SINGLE row anywhere in the table with an unexpected shape aborts
        # the entire conversion, permanently stranding the column on jsonb
        # with no visible error (the per-statement try/except below only
        # logged at DEBUG and never printed the actual exception, so this
        # could fail silently forever). Guarded with jsonb_typeof() so every
        # shape converts to *something* instead of throwing: arrays convert
        # element-by-element, scalars become a single-element array, and
        # anything else (object, or a value jsonb_typeof can't make sense
        # of) falls back to empty rather than aborting the whole ALTER.
        """DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'enriched_locations' AND column_name = 'subjects' AND data_type = 'jsonb') THEN
                ALTER TABLE enriched_locations ALTER COLUMN subjects TYPE TEXT[] USING (
                    CASE
                        WHEN subjects IS NULL THEN '{}'::TEXT[]
                        WHEN jsonb_typeof(subjects) = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(subjects))
                        WHEN jsonb_typeof(subjects) = 'string' THEN ARRAY[subjects #>> '{}']
                        ELSE '{}'::TEXT[]
                    END
                );
            END IF;
        END $$;""",
        """DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'enriched_locations' AND column_name = 'grade_levels' AND data_type = 'jsonb') THEN
                ALTER TABLE enriched_locations ALTER COLUMN grade_levels TYPE INTEGER[] USING (
                    CASE
                        WHEN grade_levels IS NULL THEN '{}'::INTEGER[]
                        WHEN jsonb_typeof(grade_levels) = 'array' THEN ARRAY(
                            SELECT elem::INTEGER FROM jsonb_array_elements_text(grade_levels) AS elem
                            WHERE elem ~ '^-?[0-9]+$'
                        )
                        WHEN jsonb_typeof(grade_levels) = 'number' THEN ARRAY[(grade_levels #>> '{}')::INTEGER]
                        ELSE '{}'::INTEGER[]
                    END
                );
            END IF;
        END $$;""",
        """DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'enriched_locations' AND column_name = 'learning_opportunities' AND data_type = 'jsonb') THEN
                ALTER TABLE enriched_locations ALTER COLUMN learning_opportunities TYPE TEXT[] USING (
                    CASE
                        WHEN learning_opportunities IS NULL THEN '{}'::TEXT[]
                        WHEN jsonb_typeof(learning_opportunities) = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(learning_opportunities))
                        WHEN jsonb_typeof(learning_opportunities) = 'string' THEN ARRAY[learning_opportunities #>> '{}']
                        ELSE '{}'::TEXT[]
                    END
                );
            END IF;
        END $$;""",
        "ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS captured_at TIMESTAMP DEFAULT NOW()",
        """CREATE TABLE IF NOT EXISTS location_search_history (
            id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
            latitude       FLOAT   NOT NULL,
            longitude      FLOAT   NOT NULL,
            radius_meters  INTEGER DEFAULT 5000,
            search_query   VARCHAR(255),
            results_count  INTEGER DEFAULT 0,
            cached_count   INTEGER DEFAULT 0,
            enriched_count INTEGER DEFAULT 0,
            teacher_id     UUID    REFERENCES users(id),
            activity_id    UUID    REFERENCES activities(id),
            searched_at    TIMESTAMP DEFAULT NOW()
        )""",
        "CREATE TABLE IF NOT EXISTS ai_task_config (id SERIAL PRIMARY KEY, task_type VARCHAR(100) UNIQUE NOT NULL, provider VARCHAR(50) NOT NULL DEFAULT 'ollama', enabled BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())",
        "ALTER TABLE ai_task_config ADD COLUMN IF NOT EXISTS model VARCHAR(128)",
        "ALTER TABLE ai_task_config ADD COLUMN IF NOT EXISTS updated_by VARCHAR(128)",
    ]
    for _stmt in _stmts:
        try:
            async with engine.begin() as _c:
                await _c.execute(text(_stmt))
        except Exception as _e:
            # Plain "ADD COLUMN IF NOT EXISTS" / "CREATE TABLE IF NOT EXISTS"
            # statements "fail" constantly and harmlessly (column/table
            # already exists) — DEBUG is right for those. The DO $$ type-
            # conversion blocks above are a different story: a failure there
            # silently strands enriched_locations on the wrong column type
            # forever, with every enrichment write 500ing at runtime — and
            # the previous version of this except clause didn't even print
            # `_e`, so that failure mode was completely invisible in prod
            # logs. Surface those specifically at WARNING with the real
            # exception text.
            if "ALTER COLUMN" in _stmt and " TYPE " in _stmt:
                logger.warning(f"Location column type-conversion migration failed: {_e}\nStatement: {_stmt[:300]}")
            else:
                logger.debug(f"Migration skipped (already applied): {_stmt[:60]}… ({_e})")
    logger.info("✅ Location table migrations complete")


async def apply_agent_runs_table(engine) -> None:
    """Block 3: Create agent_runs audit table, indexes, and seed ai_task_config defaults."""
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS agent_runs (
                    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
                    agent_name      VARCHAR(100) NOT NULL,
                    provider        VARCHAR(20)  NOT NULL,
                    model           VARCHAR(120) NOT NULL,
                    user_id         UUID,
                    subject_type    VARCHAR(60),
                    subject_id      UUID,
                    input_summary   TEXT,
                    output_ref      VARCHAR(255),
                    confidence      FLOAT,
                    latency_ms      INTEGER,
                    token_usage     JSONB,
                    status          VARCHAR(20)  NOT NULL DEFAULT 'success',
                    error           TEXT,
                    created_at      TIMESTAMP    DEFAULT NOW()
                )
            """))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_agent_runs_agent_name ON agent_runs (agent_name)"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_agent_runs_user_id    ON agent_runs (user_id)"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_agent_runs_subject_id ON agent_runs (subject_id)"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_agent_runs_created_at ON agent_runs (created_at)"
            ))
        logger.info("agent_runs table ready")
    except Exception as e:
        logger.warning(f"⊘ agent_runs table skipped: {e}")

    try:
        async with engine.begin() as _c:
            await _c.execute(text("""
                INSERT INTO ai_task_config (task_type, provider, enabled)
                VALUES
                    ('activity_suggestions',  'ollama', TRUE),
                    ('standards_mapping',     'ollama', TRUE),
                    ('rubric_mapping',        'ollama', TRUE),
                    ('taxonomy_mapping',      'ollama', TRUE),
                    ('submission_assessment', 'ollama', TRUE)
                ON CONFLICT (task_type) DO NOTHING
            """))
        logger.info("✅ ai_task_config seeded (defaults)")
    except Exception as _e:
        logger.warning(f"⚠ ai_task_config seed skipped: {_e}")


async def apply_parent_activity_submission_migrations(engine) -> None:
    """Block 4: parent_child_links table + activity completion/submission columns."""
    try:
        async with engine.begin() as _c:
            await _c.execute(text("""
                CREATE TABLE IF NOT EXISTS parent_child_links (
                    parent_id   UUID NOT NULL,
                    child_id    UUID NOT NULL,
                    relationship VARCHAR(50) DEFAULT 'guardian',
                    linked_at   TIMESTAMPTZ DEFAULT NOW(),
                    PRIMARY KEY (parent_id, child_id)
                )
            """))
            await _c.execute(text(
                "ALTER TABLE parent_child_links ADD COLUMN IF NOT EXISTS relationship VARCHAR(50) DEFAULT 'guardian'"
            ))
            await _c.execute(text(
                "ALTER TABLE parent_child_links ADD COLUMN IF NOT EXISTS linked_at TIMESTAMPTZ DEFAULT NOW()"
            ))
        logger.info("✅ parent_child_links table ready")
    except Exception as _e:
        logger.warning(f"⚠ parent_child_links table skipped: {_e}")

    _submission_stmts = [
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS completion_mode VARCHAR(50) DEFAULT 'field_only'",
        "ALTER TABLE activities ADD COLUMN IF NOT EXISTS require_field_approval BOOLEAN DEFAULT FALSE",
        "CREATE TABLE IF NOT EXISTS activity_submissions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id UUID, session_id UUID, activity_id UUID, completion_phase VARCHAR(50) DEFAULT 'field_work', field_phase_status VARCHAR(50) DEFAULT 'not_started', field_phase_feedback TEXT, reflection_status VARCHAR(50) DEFAULT 'not_started', linked_field_note_id UUID, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS student_id UUID",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS session_id UUID",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS activity_id UUID",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS completion_phase VARCHAR(50) DEFAULT 'field_work'",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS field_phase_status VARCHAR(50) DEFAULT 'not_started'",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS field_phase_feedback TEXT",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS reflection_status VARCHAR(50) DEFAULT 'not_started'",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS linked_field_note_id UUID",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS submission_status VARCHAR(50) DEFAULT 'draft'",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS compiled_evidence JSONB",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS teacher_feedback TEXT",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS grade DOUBLE PRECISION",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS rubric_scores JSONB",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP",
        "ALTER TABLE activity_submissions ADD COLUMN IF NOT EXISTS graded_at TIMESTAMP",
    ]
    for _s in _submission_stmts:
        try:
            async with engine.begin() as _c:
                await _c.execute(text(_s))
        except Exception as _e:
            logger.debug(f"Activity submission migration skipped: {_s[:60]}…")
    logger.info("✅ Activity submission migrations complete")


async def apply_core_schema_migrations(engine) -> None:
    """Block 5: Discovery mode, compliance, org/classroom, standards, student tables.

    2026-07-07 fix: every statement now runs through _exec_safepoint() instead
    of sharing one bare transaction. This function used to abort entirely the
    first time it hit a statement referencing stale schema (e.g.
    student_peer_projects.initiator_id after that column was renamed to
    author_student_id on this database) — and because Postgres aborts the
    whole transaction on any failure, every statement AFTER that point used
    to silently no-op too (evidence_captures, notebook_entries,
    student_competencies, student_profiles, and the rest of the
    student_peer_projects columns), even though each was individually wrapped
    in its own try/except. Catching the Python exception never fixed the
    underlying aborted Postgres transaction — only a SAVEPOINT does.
    """
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))  # verify connection
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS rubric_id UUID")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS curriculum_unit_ids UUID[] DEFAULT '{}'")
        # ── Discovery-mode columns ──────────────────────────────────────────
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_mode VARCHAR(50)")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_task_description TEXT")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_location_required BOOLEAN DEFAULT FALSE")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_documentation_requirements JSONB")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_success_criteria TEXT")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_difficulty_level INTEGER DEFAULT 2")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_time_limit_minutes INTEGER")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_location_gps_capture_enabled BOOLEAN DEFAULT TRUE")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS discovery_location_sharing_rules JSONB")
        # ── Publishing / stats columns ────────────────────────────────────
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_shareable BOOLEAN DEFAULT FALSE")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS hero_image_url VARCHAR(512)")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0")
        await _exec_safepoint(conn, "ALTER TABLE activities ADD COLUMN IF NOT EXISTS published_at TIMESTAMP")
        # ── Phase content columns ─────────────────────────────────────────
        await _exec_safepoint(conn, "ALTER TABLE activities ALTER COLUMN location_latitude DROP NOT NULL")
        await _exec_safepoint(conn, "ALTER TABLE activities ALTER COLUMN location_longitude DROP NOT NULL")
        await _exec_safepoint(conn, "ALTER TABLE activities ALTER COLUMN location_name DROP NOT NULL")
        await _exec_safepoint(conn, "ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_parental_consent BOOLEAN NOT NULL DEFAULT FALSE")
        # ── Compliance tables ─────────────────────────────────────────────
        await _exec_safepoint(conn,
            """CREATE TABLE IF NOT EXISTS compliance_rules (
                rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                regulation_id VARCHAR(100),
                version VARCHAR(20),
                jurisdiction VARCHAR(100) NOT NULL,
                effective_date TIMESTAMP,
                sunset_date TIMESTAMP,
                rule_definition JSONB,
                created_by VARCHAR(255) DEFAULT 'system',
                created_at TIMESTAMP DEFAULT NOW(),
                previous_version_id UUID,
                change_log TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                audit_hash VARCHAR(256),
                regulation_type VARCHAR(20) NOT NULL DEFAULT 'privacy',
                ai_student_permitted BOOLEAN NOT NULL DEFAULT TRUE,
                ai_teacher_permitted BOOLEAN NOT NULL DEFAULT TRUE
            )""", "create compliance_rules")
        for _col_sql in [
            "ALTER TABLE compliance_rules ADD COLUMN IF NOT EXISTS regulation_type VARCHAR(20) NOT NULL DEFAULT 'privacy'",
            "ALTER TABLE compliance_rules ADD COLUMN IF NOT EXISTS ai_student_permitted BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE compliance_rules ADD COLUMN IF NOT EXISTS ai_teacher_permitted BOOLEAN NOT NULL DEFAULT TRUE",
        ]:
            await _exec_safepoint(conn, _col_sql)
        await _exec_safepoint(conn,
            """CREATE TABLE IF NOT EXISTS rule_audit_log (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                rule_id VARCHAR(256),
                data_access_id UUID,
                student_id_hash VARCHAR(256),
                action VARCHAR(100) NOT NULL DEFAULT 'access',
                data_type VARCHAR(100),
                timestamp TIMESTAMP DEFAULT NOW(),
                rules_applied JSONB,
                enforcement_actions JSONB,
                compliance_status VARCHAR(20) NOT NULL DEFAULT 'COMPLIANT',
                actor_id VARCHAR(256),
                actor_role VARCHAR(50),
                jurisdiction_ids JSONB,
                notes TEXT
            )""", "create rule_audit_log")
        await _exec_safepoint(conn,
            "CREATE TABLE IF NOT EXISTS consent_records ("
            "id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
            "student_id_hash VARCHAR(256) NOT NULL,"
            "jurisdiction VARCHAR(50) NOT NULL,"
            "consent_type VARCHAR(50) NOT NULL,"
            "data_categories JSONB,"
            "granted_at TIMESTAMP DEFAULT NOW(),"
            "granted_by VARCHAR(256),"
            "withdrawn_at TIMESTAMP,"
            "is_active BOOLEAN NOT NULL DEFAULT TRUE,"
            "consent_version VARCHAR(10),"
            "ip_hash VARCHAR(256),"
            "user_agent_hash VARCHAR(256))", "create consent_records")
        await _exec_safepoint(conn, "ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS data_categories JSONB")
        await _exec_safepoint(conn, "ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMP")
        await _exec_safepoint(conn, "ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS granted_by VARCHAR(256)")
        await _exec_safepoint(conn, "ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS ip_hash VARCHAR(256)")
        await _exec_safepoint(conn, "ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS user_agent_hash VARCHAR(256)")
        # RF-4: ConsentRecord.granted_by (models/compliance.py) switched from a
        # plain VARCHAR(256) to EncryptedString(256) — Fernet ciphertext (base64
        # of version+timestamp+iv+padded-ciphertext+hmac) runs roughly 2.3x the
        # plaintext length (see core/encryption.py's EncryptedString docstring:
        # "ensure the column is wide enough, e.g. 600 for a 255-char field").
        # Widen the physical column so encrypted values of a near-max-length
        # plaintext don't 500 with "value too long for type character varying".
        await _exec_safepoint(conn, "ALTER TABLE consent_records ALTER COLUMN granted_by TYPE VARCHAR(600)")
        # ── Multi-tenancy tables ───────────────────────────────────────────
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS organizations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                type VARCHAR(50) NOT NULL DEFAULT 'school',
                license_tier VARCHAR(30) NOT NULL DEFAULT 'free',
                license_status VARCHAR(20) NOT NULL DEFAULT 'active',
                max_teachers INTEGER DEFAULT 3,
                max_classrooms INTEGER DEFAULT 1,
                max_students INTEGER DEFAULT 30,
                contact_email VARCHAR(255),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """, "create organizations")
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS classrooms (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                grade_level INTEGER,
                subject VARCHAR(100),
                teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
                org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """, "create classrooms")
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS classroom_students (
                classroom_id UUID REFERENCES classrooms(id) ON DELETE CASCADE,
                student_id UUID REFERENCES users(id) ON DELETE CASCADE,
                enrolled_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (classroom_id, student_id)
            )
        """, "create classroom_students")
        # ── Standards & rubrics tables ─────────────────────────────────────
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS standards_sets (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                description TEXT,
                type VARCHAR(50) NOT NULL,
                owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
                state_code VARCHAR(10),
                is_global BOOLEAN DEFAULT FALSE,
                source_file VARCHAR(512),
                criteria JSONB DEFAULT '[]',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """, "create standards_sets")
        await _exec_safepoint(conn, "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_students_per_classroom INTEGER DEFAULT 30")
        await _exec_safepoint(conn, "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS country_code VARCHAR(10)")
        await _exec_safepoint(conn, "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subdivision_code VARCHAR(20)")
        await _exec_safepoint(conn, "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS has_under_13_students BOOLEAN NOT NULL DEFAULT TRUE")
        await _exec_safepoint(conn, "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS privacy_jurisdiction_ids JSONB DEFAULT '[]'::jsonb")
        await _exec_safepoint(conn, "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS org_type_v2 VARCHAR(50)")
        await _exec_safepoint(conn, "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ip_country_hint VARCHAR(10)")
        await _exec_safepoint(conn, "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP")
        await _exec_safepoint(conn, "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS grace_period_started_at TIMESTAMP")
        await _exec_safepoint(conn, "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS paddle_customer_id VARCHAR(128)")
        await _exec_safepoint(conn, "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS paddle_subscription_id VARCHAR(128)")
        await _exec_safepoint(conn, "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP")
        await _exec_safepoint(conn, "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP")
        await _exec_safepoint(conn, "ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE")
        await _exec_safepoint(conn, "ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS grade_level VARCHAR(50) DEFAULT ''")
        await _exec_safepoint(conn, "ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS subject VARCHAR(100) DEFAULT ''")
        await _exec_safepoint(conn, "ALTER TABLE standards_sets ADD COLUMN IF NOT EXISTS source_checksum VARCHAR(64)")
        await _exec_safepoint(conn, "ALTER TABLE standards_sets ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20) DEFAULT 'complete'")
        await _exec_safepoint(conn, "ALTER TABLE standards_sets ADD COLUMN IF NOT EXISTS last_processed_at TIMESTAMP")
        await _exec_safepoint(conn, "ALTER TABLE standards_sets ADD COLUMN IF NOT EXISTS valid_until DATE")
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS homeschool_children (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                parent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                child_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                grade_level INTEGER DEFAULT 0,
                age_band VARCHAR(10) DEFAULT 'k6',
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(parent_id, child_id)
            )
        """, "create homeschool_children")
        # ── Calendar events ──────────────────────────────────────────────────
        # Explicit teacher-created events (deadlines, field trips, holidays) that
        # show up on the classroom calendar alongside auto-derived
        # planned/completed activity dates. Every INSERT this app makes always
        # supplies `id` explicitly (see routes/calendar.py) -- the DEFAULT here
        # is just a safety net, not relied upon.
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS classroom_events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
                created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                event_date DATE NOT NULL,
                event_type VARCHAR(50) NOT NULL DEFAULT 'event',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """, "create classroom_events")
        await _exec_safepoint(conn,
            "CREATE INDEX IF NOT EXISTS idx_classroom_events_classroom ON classroom_events(classroom_id, event_date)"
        )
        # ── Classroom announcements ─────────────────────────────────────────
        # Teacher-initiated broadcast posts visible to every student + parent
        # associated with a classroom (e.g. "field trip Friday"). Distinct
        # from classroom_events (calendar entries): announcements are a
        # messaging concept, not a schedule concept, so they get their own
        # table rather than overloading classroom_events. See
        # routes/teacher_communication.py for create/list; routes/parent.py
        # and routes/student.py for the parent/student-facing read side.
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS classroom_announcements (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
                teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                body TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """, "create classroom_announcements")
        await _exec_safepoint(conn,
            "CREATE INDEX IF NOT EXISTS idx_classroom_announcements_classroom ON classroom_announcements(classroom_id, created_at DESC)"
        )
        # ── Parent/teacher 1:1 messaging ─────────────────────────────────────
        # routes/teacher_communication.py (send/list/reply) and routes/parent.py
        # (existing parent-side inbox) both read/write this table. It was only
        # ever defined in alembic/versions/20260627_parent_portal_tables.py,
        # which this app has never actually applied (schema here is bootstrapped
        # from database/init.sql + these inline patches, not alembic -- see the
        # TODO at the top of this file). Mirrored here so it self-heals on
        # restart like every other table in this function.
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS parent_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                to_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                subject      VARCHAR(500) NOT NULL,
                body         TEXT NOT NULL,
                conversation_id UUID NOT NULL DEFAULT gen_random_uuid(),
                read_at      TIMESTAMP,
                created_at   TIMESTAMP DEFAULT NOW(),
                updated_at   TIMESTAMP DEFAULT NOW()
            )
        """, "create parent_messages")
        await _exec_safepoint(conn,
            "CREATE INDEX IF NOT EXISTS ix_parent_messages_to_user ON parent_messages(to_user_id, created_at DESC)"
        )
        await _exec_safepoint(conn,
            "CREATE INDEX IF NOT EXISTS ix_parent_messages_conversation ON parent_messages(conversation_id)"
        )
        # notifications.type/related_child_id/action_url — same source (the
        # unapplied 20260627 migration); routes/parent.py's notifications read
        # path and routes/teacher_communication.py's notify-on-send both depend
        # on these columns existing.
        await _exec_safepoint(conn, "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'info'")
        await _exec_safepoint(conn, "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_child_id UUID REFERENCES users(id)")
        await _exec_safepoint(conn, "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url VARCHAR(500)")
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS parent_settings (
                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                parent_id  UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                dark_mode  BOOLEAN DEFAULT false,
                language   VARCHAR(10) DEFAULT 'en',
                email_frequency          VARCHAR(20) DEFAULT 'weekly',
                notifications_enabled    BOOLEAN DEFAULT true,
                push_notifications_enabled BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """, "create parent_settings")
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS activity_standards_map (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
                standards_set_id UUID NOT NULL REFERENCES standards_sets(id) ON DELETE CASCADE,
                criterion_id VARCHAR(100) NOT NULL,
                coverage_level VARCHAR(50) DEFAULT 'partial',
                notes TEXT,
                mapped_by UUID REFERENCES users(id) ON DELETE SET NULL,
                ai_suggested BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW(),
                CONSTRAINT uq_activity_standards_criterion
                    UNIQUE (activity_id, standards_set_id, criterion_id)
            )
        """, "create activity_standards_map")
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS user_privacy_preferences (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                ferpa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                coppa_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                data_sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                configured_at TIMESTAMP,
                org_id UUID,
                org_governed BOOLEAN NOT NULL DEFAULT FALSE,
                org_governed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """, "create user_privacy_preferences")
        for _col in [
            "ALTER TABLE user_privacy_preferences ADD COLUMN IF NOT EXISTS org_id UUID",
            "ALTER TABLE user_privacy_preferences ADD COLUMN IF NOT EXISTS org_governed BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE user_privacy_preferences ADD COLUMN IF NOT EXISTS org_governed_at TIMESTAMP",
        ]:
            await _exec_safepoint(conn, _col)
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS assessment_rubrics (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                framework VARCHAR(50) DEFAULT 'blooms',
                criteria JSONB NOT NULL DEFAULT '[]',
                total_points INTEGER DEFAULT 100,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """, "create assessment_rubrics")
        # ── Phase 7 student tables ─────────────────────────────────────────
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS student_captures (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
                session_id UUID,
                capture_type VARCHAR(20) NOT NULL DEFAULT 'photo',
                file_path VARCHAR(512),
                file_url VARCHAR(512),
                transcript TEXT,
                transcript_status VARCHAR(20) DEFAULT 'pending',
                latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
                location_name VARCHAR(255),
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT NOW()
            )
        """, "create student_captures")
        # StudentCapture ORM model (models/database.py) and database/init.sql
        # (the Postgres first-init script, which only ever runs against a
        # brand-new empty data volume) both declare more columns than the
        # CREATE above. On any DB that was bootstrapped by THIS fallback
        # instead of init.sql, those columns never existed — every INSERT
        # from routes that set file_size_bytes/mime_type/etc. (e.g.
        # phase7_student_initiated.py's capture upload) 500s with
        # "column ... does not exist". Backfill them here so this block is
        # self-healing regardless of which path created the table.
        for _col in [
            "ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER",
            "ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100)",
            # captured_at: present in database/init.sql and required by the ORM
            # model (models/database.py StudentCapture.captured_at, indexed,
            # non-null-default). Missing from THIS fallback CREATE TABLE, so
            # any query that loads a StudentCapture row on a DB bootstrapped
            # here — e.g. field notes / journal / self-project pages, which
            # all eagerly load captures via selectinload — 500s with
            # "column student_captures.captured_at does not exist".
            "ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS captured_at TIMESTAMP DEFAULT NOW()",
            "ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS location_latitude FLOAT",
            "ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS location_longitude FLOAT",
            "ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS transcript_confidence FLOAT",
            "ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS transcript_language VARCHAR(10)",
            "ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS duration_seconds INTEGER",
            "ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS dimensions VARCHAR(20)",
            "ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS description TEXT",
            # location_lat_enc / location_lon_enc: the ORM model declares these
            # as EncryptedString(200) (models/database.py StudentCapture) for
            # the field-encryption feature, but NEITHER database/init.sql NOR
            # any prior migration ever created them — the encryption feature
            # was added to the model without a matching schema change. Every
            # default SELECT of StudentCapture includes all mapped columns, so
            # this 500s the same way the missing captured_at column did.
            "ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS location_lat_enc VARCHAR(200)",
            "ALTER TABLE student_captures ADD COLUMN IF NOT EXISTS location_lon_enc VARCHAR(200)",
        ]:
            await _exec_safepoint(conn, _col)
        # RF-4: StudentCapture.file_path switched from a plain VARCHAR(512) to
        # EncryptedString(512) — Fernet ciphertext runs roughly 2.3x the
        # plaintext length (see core/encryption.py's EncryptedString docstring:
        # "ensure the column is wide enough, e.g. 600 for a 255-char field").
        # Widen the physical column so encrypted values of a near-max-length
        # (512-char) plaintext path/URL don't 500 with "value too long for
        # type character varying".
        await _exec_safepoint(conn, "ALTER TABLE student_captures ALTER COLUMN file_path TYPE VARCHAR(1200)")
        await _exec_safepoint(
            conn,
            "CREATE INDEX IF NOT EXISTS idx_student_captures_timestamp ON student_captures (captured_at)",
            "create idx_student_captures_timestamp",
        )
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS student_notebooks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
                session_id UUID,
                content TEXT,
                tags TEXT[] DEFAULT '{}',
                is_private BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """, "create student_notebooks")
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS student_field_notes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
                session_id UUID,
                title VARCHAR(255),
                description TEXT,
                status VARCHAR(30) DEFAULT 'draft',
                teacher_feedback TEXT,
                is_shared BOOLEAN DEFAULT FALSE,
                latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
                location_name VARCHAR(255),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """, "create student_field_notes")
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS student_self_projects (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(30) DEFAULT 'active',
                subject VARCHAR(100),
                grade_level INTEGER,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """, "create student_self_projects")
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS student_peer_projects (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                initiator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                partner_id UUID REFERENCES users(id) ON DELETE SET NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(30) DEFAULT 'proposed',
                subject VARCHAR(100),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """, "create student_peer_projects")
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS student_proposals (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                location_name VARCHAR(255),
                subject VARCHAR(100),
                status VARCHAR(30) DEFAULT 'draft',
                teacher_feedback TEXT,
                approved_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """, "create student_proposals")
        # ── student_proposals column drift ─────────────────────────────────
        await _exec_safepoint(conn, "ALTER TABLE student_proposals ADD COLUMN IF NOT EXISTS note_to_teacher TEXT")
        # ── Align student tables with their ORM models (ADD COLUMN drift fixes) ──
        for _alter in [
            "ALTER TABLE student_self_projects ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(500)",
            "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS self_project_id UUID REFERENCES student_self_projects(id) ON DELETE SET NULL",
            "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS location_latitude DOUBLE PRECISION",
            "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS location_longitude DOUBLE PRECISION",
            "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS self_tagged_objective_ids UUID[] NOT NULL DEFAULT '{}'",
            "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS submitted_for_promotion_at TIMESTAMP",
            "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS submitted_with_message TEXT",
            "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS reviewed_by_teacher_id UUID REFERENCES users(id) ON DELETE SET NULL",
            "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP",
            "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS teacher_feedback TEXT",
            "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS promoted_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL",
            "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMP",
            "ALTER TABLE student_peer_projects ALTER COLUMN initiator_id DROP NOT NULL",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS author_student_id UUID REFERENCES users(id) ON DELETE CASCADE",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id) ON DELETE CASCADE",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS learning_objectives_text JSONB NOT NULL DEFAULT '[]'",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS guiding_prompts JSONB NOT NULL DEFAULT '[]'",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS curriculum_objective_ids UUID[] NOT NULL DEFAULT '{}'",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS allowed_capture_types TEXT[] NOT NULL DEFAULT '{}'",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS audience VARCHAR(30) NOT NULL DEFAULT 'whole_class'",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS target_student_ids UUID[] NOT NULL DEFAULT '{}'",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS approved_by_teacher_id UUID REFERENCES users(id) ON DELETE SET NULL",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS teacher_feedback TEXT",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS published_at TIMESTAMP",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS author_can_see_individual_responses BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS location_latitude FLOAT",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS location_longitude FLOAT",
            "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS location_name VARCHAR(255)",
        ]:
            await _exec_safepoint(conn, _alter, "student schema ALTER")
        # ── Native-enum -> VARCHAR conversions ──────────────────────────────
        # database/init.sql (the fresh-volume bootstrap path) declares these
        # status/audience columns as native Postgres ENUM types
        # (field_note_status_enum, self_project_status_enum,
        # peer_project_status_enum, peer_project_audience_enum,
        # peer_project_response_status_enum). Every ORM model in
        # models/database.py maps them as plain Column(String(30)) instead —
        # matching the same VARCHAR-not-enum choice already made for
        # activities.status/activity_type above in
        # apply_enum_and_core_column_migrations(). On any DB bootstrapped via
        # init.sql (enum columns), every INSERT/UPDATE that writes a plain
        # Python string into one of these columns 500s with
        # "column ... is of type ..._enum but expression is of type character
        # varying" — e.g. creating a field note, self-project, or peer
        # project/challenge. Also: field_note_status_enum only defines
        # ('draft','complete','archived'), but the route code uses
        # 'submitted'/'promoted' too (see phase7_student_initiated.py) — the
        # enum was stale even on its own terms, not just a type mismatch.
        for _enum_col in [
            "ALTER TABLE student_field_notes ALTER COLUMN status TYPE VARCHAR(30) USING status::VARCHAR",
            "ALTER TABLE student_self_projects ALTER COLUMN status TYPE VARCHAR(30) USING status::VARCHAR",
            "ALTER TABLE student_peer_projects ALTER COLUMN status TYPE VARCHAR(30) USING status::VARCHAR",
            "ALTER TABLE student_peer_projects ALTER COLUMN audience TYPE VARCHAR(30) USING audience::VARCHAR",
            "ALTER TABLE peer_project_responses ALTER COLUMN status TYPE VARCHAR(30) USING status::VARCHAR",
        ]:
            await _exec_safepoint(conn, _enum_col, "enum -> VARCHAR")
        # ── Phase 6: evidence_captures + notebook_entries ──────────────────
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS evidence_captures (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id UUID REFERENCES learning_sessions(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
                capture_type VARCHAR(50) NOT NULL,
                title VARCHAR(255),
                description TEXT,
                file_url TEXT,
                file_size_bytes INTEGER,
                duration_seconds INTEGER,
                transcription TEXT,
                learning_objectives JSONB DEFAULT '[]',
                competencies JSONB DEFAULT '[]',
                location_latitude DOUBLE PRECISION,
                location_longitude DOUBLE PRECISION,
                ai_analysis JSONB,
                device_metadata JSONB,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """, "create evidence_captures")
        await _exec_safepoint(conn, "CREATE INDEX IF NOT EXISTS ix_evidence_captures_session  ON evidence_captures (session_id)")
        await _exec_safepoint(conn, "CREATE INDEX IF NOT EXISTS ix_evidence_captures_student  ON evidence_captures (student_id)")
        await _exec_safepoint(conn, "CREATE INDEX IF NOT EXISTS ix_evidence_captures_activity ON evidence_captures (activity_id)")
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS notebook_entries (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id UUID REFERENCES learning_sessions(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
                reflection_type VARCHAR(50) NOT NULL DEFAULT 'freeform',
                title VARCHAR(255),
                content TEXT NOT NULL DEFAULT '',
                learning_objectives JSONB DEFAULT '[]',
                competencies JSONB DEFAULT '[]',
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """, "create notebook_entries")
        await _exec_safepoint(conn, "CREATE INDEX IF NOT EXISTS ix_notebook_entries_session ON notebook_entries (session_id)")
        await _exec_safepoint(conn, "CREATE INDEX IF NOT EXISTS ix_notebook_entries_student ON notebook_entries (student_id)")
        # ── student_competencies + student_profiles ────────────────────────
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS student_competencies (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                competency_name VARCHAR(255) NOT NULL,
                description TEXT,
                category VARCHAR(100),
                status VARCHAR(30) NOT NULL DEFAULT 'emerging',
                progress_percent INTEGER NOT NULL DEFAULT 0,
                evidence_count INTEGER NOT NULL DEFAULT 0,
                first_achieved_at TIMESTAMP,
                last_achieved_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """, "create student_competencies")
        await _exec_safepoint(conn, "CREATE INDEX IF NOT EXISTS ix_student_competencies_student ON student_competencies (student_id)")
        await _exec_safepoint(conn, """
            CREATE TABLE IF NOT EXISTS student_profiles (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                learning_style VARCHAR(50),
                bloom_level INTEGER DEFAULT 1,
                marzano_level INTEGER DEFAULT 1,
                grade_level INTEGER,
                device_sensor_precision DOUBLE PRECISION,
                device_npu_power DOUBLE PRECISION,
                device_camera_level DOUBLE PRECISION,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """, "create student_profiles")
    logger.info("✅ Core schema migrations applied")


async def apply_billing_column_migrations(engine) -> None:
    """Block 6: Billing columns on organizations (isolated — failures here don't block boot)."""
    for _col in [
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS grace_period_started_at TIMESTAMP",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS paddle_customer_id VARCHAR(128)",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS paddle_subscription_id VARCHAR(128)",
    ]:
        try:
            async with engine.begin() as _c:
                await _c.execute(text(_col))
        except Exception:
            logger.debug(f"Billing column migration skipped (likely exists): {_col[:60]}")


async def apply_rag_documents_table(engine) -> None:
    """Create rag_documents table and pgvector HNSW index for semantic retrieval."""
    try:
        async with engine.begin() as conn:
            # Ensure pgvector extension is enabled
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS rag_documents (
                    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    source_type VARCHAR(50)  NOT NULL,
                    source_id   VARCHAR(255),
                    source_name VARCHAR(512),
                    chunk_index INTEGER NOT NULL DEFAULT 0,
                    content     TEXT    NOT NULL,
                    metadata    JSONB   DEFAULT '{}',
                    embedding   vector(384),
                    owner_id    UUID REFERENCES users(id) ON DELETE SET NULL,
                    created_at  TIMESTAMP DEFAULT now(),
                    updated_at  TIMESTAMP DEFAULT now()
                )
            """))

            # HNSW index for fast approximate nearest-neighbour search
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS rag_documents_embedding_hnsw
                ON rag_documents
                USING hnsw (embedding vector_cosine_ops)
            """))

            # B-tree indices for filtered searches
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS rag_documents_source_type_idx
                ON rag_documents (source_type)
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS rag_documents_source_id_idx
                ON rag_documents (source_id)
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS rag_documents_owner_idx
                ON rag_documents (owner_id)
            """))

        logger.info("✅ rag_documents table + HNSW index ready")
    except Exception as e:
        logger.warning(f"⊘ rag_documents migration warning: {e}")


async def apply_student_phase7_migrations(engine) -> None:
    """Block 7: Extended student field_notes / peer_projects column migrations."""
    _stmts = [
        # ── Tables the ORM models declare (models/database.py: PeerProjectExampleCapture,
        # PeerProjectResponse, PeerProjectResponseCapture, ClassSettings) but that no
        # migration anywhere ever created — every "challenges" endpoint touching peer
        # project examples/responses/class settings 500'd with "relation does not exist".
        "CREATE TABLE IF NOT EXISTS peer_project_example_captures (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), peer_project_id UUID NOT NULL REFERENCES student_peer_projects(id) ON DELETE CASCADE, capture_id UUID NOT NULL REFERENCES student_captures(id) ON DELETE CASCADE, caption TEXT, order_index INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(peer_project_id, capture_id))",
        "ALTER TABLE peer_project_example_captures RENAME COLUMN \"order\" TO order_index",
        "CREATE TABLE IF NOT EXISTS peer_project_responses (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), peer_project_id UUID NOT NULL REFERENCES student_peer_projects(id) ON DELETE CASCADE, student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, status VARCHAR(30) DEFAULT 'in_progress', notebook_entry_id UUID REFERENCES student_notebooks(id) ON DELETE SET NULL, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(peer_project_id, student_id))",
        "CREATE TABLE IF NOT EXISTS peer_project_response_captures (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), response_id UUID NOT NULL REFERENCES peer_project_responses(id) ON DELETE CASCADE, capture_id UUID NOT NULL REFERENCES student_captures(id) ON DELETE CASCADE, order_index INT DEFAULT 0, UNIQUE(response_id, capture_id))",
        "ALTER TABLE peer_project_response_captures RENAME COLUMN \"order\" TO order_index",
        "CREATE TABLE IF NOT EXISTS class_settings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), class_id UUID NOT NULL UNIQUE REFERENCES classes(id) ON DELETE CASCADE, peer_project_approval_mode VARCHAR(20) DEFAULT 'teacher_gate', peer_project_author_sees_individual_responses BOOLEAN DEFAULT FALSE, students_can_create_peer_projects BOOLEAN DEFAULT TRUE, students_can_create_field_notes BOOLEAN DEFAULT TRUE, updated_at TIMESTAMPTZ DEFAULT NOW())",
        "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS location_latitude DOUBLE PRECISION",
        "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS location_longitude DOUBLE PRECISION",
        "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS self_project_id UUID REFERENCES student_self_projects(id) ON DELETE SET NULL",
        "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS self_tagged_objective_ids UUID[] DEFAULT '{}'",
        "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS submitted_for_promotion_at TIMESTAMPTZ",
        "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS submitted_with_message TEXT",
        "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS reviewed_by_teacher_id UUID",
        "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ",
        "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS promoted_activity_id UUID",
        "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ",
        # session_id: added to the ORM model (models/database.py StudentFieldNote,
        # used by the professor fieldwork map / GET /activities/{id}/fieldwork-locations)
        # and to database/init.sql for fresh installs, plus a proper Alembic
        # migration (20260716_add_session_id_to_field_notes) — but this project's
        # deploy path never actually runs `alembic upgrade`, only this self-healing
        # block. Any DB created before this column existed (e.g. production) never
        # got it, so every query touching student_field_notes — including the
        # plain list/get endpoints, since SQLAlchemy selects all mapped columns —
        # 500'd with "column session_id ... does not exist".
        "ALTER TABLE student_field_notes ADD COLUMN IF NOT EXISTS session_id UUID",
        "CREATE INDEX IF NOT EXISTS idx_field_notes_session ON student_field_notes (session_id)",
        "CREATE TABLE IF NOT EXISTS student_field_note_captures (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), field_note_id UUID NOT NULL REFERENCES student_field_notes(id) ON DELETE CASCADE, capture_id UUID NOT NULL REFERENCES student_captures(id) ON DELETE CASCADE, order_index INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(field_note_id, capture_id))",
        "ALTER TABLE student_field_note_captures RENAME COLUMN \"order\" TO order_index",
        "ALTER TABLE student_self_projects ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(500)",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS author_student_id UUID",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS class_id UUID",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS learning_objectives_text JSONB DEFAULT '[]'",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS guiding_prompts JSONB DEFAULT '[]'",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS curriculum_objective_ids UUID[] DEFAULT '{}'",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS allowed_capture_types TEXT[] DEFAULT '{}'",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS audience VARCHAR(30) DEFAULT 'whole_class'",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS target_student_ids UUID[] DEFAULT '{}'",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS approval_required BOOLEAN DEFAULT TRUE",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS approved_by_teacher_id UUID",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS teacher_feedback TEXT",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS author_can_see_individual_responses BOOLEAN DEFAULT FALSE",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS location_latitude FLOAT",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS location_longitude FLOAT",
        "ALTER TABLE student_peer_projects ADD COLUMN IF NOT EXISTS location_name VARCHAR(255)",
        # GPS map infrastructure (Session 30).
        # NOTE: consent_logs is NOT created here -- it's a real, pre-existing
        # table (see database/init.sql + models.database.ConsentLog) with a
        # completely different, append-only schema (student_id FK,
        # given_by_student/given_by_parent, withdrawn_at -- no unique
        # constraint by design). An earlier version of this migration block
        # tried to CREATE TABLE / ADD CONSTRAINT a fake student_id_hash-based
        # schema against it; that was always a silent no-op / silent failure
        # against the real table and has been removed. See GPS_MAP_HANDOFF.md
        # addendum for the full incident writeup.
        "CREATE TABLE IF NOT EXISTS session_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), session_id UUID NOT NULL, student_id UUID, event_type VARCHAR(50) NOT NULL, phase VARCHAR(30), metadata JSONB, created_at TIMESTAMP DEFAULT NOW())",
    ]
    for _s in _stmts:
        try:
            async with engine.begin() as _c:
                await _c.execute(text(_s))
        except Exception as _e:
            logger.debug(f"student-phase7 migration skipped: {_s[:60]}…")
    logger.info("✅ Student phase-7 column migrations applied")


# ─────────────────────────────────────────────────────────────────────────────
# SEED HELPERS
# ─────────────────────────────────────────────────────────────────────────────

async def seed_sample_activities(engine) -> None:
    """Ensure 3 published sample activities exist (idempotent per title)."""
    try:
        async with engine.begin() as conn:
            for _title, _desc, _subj, _grade, _dur, _loc, _lat, _lon in [
                (
                    'Creek Habitat Study',
                    'Visit a local creek or drainage channel. Sketch the habitat and identify at least 5 organisms — insects, plants, birds, or fish. Record water clarity and flow rate.',
                    'Science', 5, 75, 'Local creek or drainage channel', 37.8716, -122.2727,
                ),
                (
                    'Map Your Neighborhood',
                    'Walk a 6-block radius of where you are right now. Draw a sketch map including streets, landmarks, and green spaces. Compare your map to a digital map.',
                    'Geography', 4, 60, None, None, None,
                ),
                (
                    'Native Plant Journal',
                    'Over two weeks, photograph and document 8 native plants in your area. For each entry record: common name, leaf shape, habitat, and one ecological role.',
                    'Science', 6, 120, 'Local parks and wild spaces', 37.4419, -122.1430,
                ),
            ]:
                _exists = await conn.execute(
                    text("SELECT 1 FROM activities WHERE title = :title AND status = 'published'"),
                    {"title": _title},
                )
                if not _exists.scalar():
                    await conn.execute(text("""
                        INSERT INTO activities (
                            id, teacher_id, title, description, subject, grade_level,
                            activity_type, difficulty_level, estimated_duration_minutes,
                            bloom_level, assessment_type, status, is_active, location_name,
                            location_latitude, location_longitude, location_radius_meters,
                            created_at, updated_at
                        ) VALUES (
                            gen_random_uuid(),
                            (SELECT id FROM users WHERE role = 'TEACHER' LIMIT 1),
                            :title, :desc, :subj, :grade,
                            'discovery', 2, :dur, 4, 'observation',
                            'published', TRUE, :loc,
                            :lat, :lon, 500,
                            NOW(), NOW()
                        )
                    """), {"title": _title, "desc": _desc, "subj": _subj, "grade": _grade,
                           "dur": _dur, "loc": _loc, "lat": _lat, "lon": _lon})
        logger.info("✅ Seed activities ensured (3 sample activities)")
    except Exception as e:
        logger.warning(f"⊘ Sample activity seed skipped: {e}")


async def seed_demo_fieldwork_submission(engine) -> None:
    """Seed one fully "turned in" activity for student@example.com against
    the 'Creek Habitat Study' sample activity — a learning_sessions row, an
    evidence_captures row with a real GPS point, and a submitted
    activity_submissions row.

    Why: GET /activities/{id}/fieldwork-locations (the Fieldwork Map) and the
    teacher Submissions page had no real data to render against — every demo
    activity showed an empty state, so a teacher testing either page had no
    way to confirm a genuine submission renders correctly end to end. This
    mirrors the real submit flow in routes/student_activities.py::submit_activity
    (session -> evidence -> submission) rather than faking a shortcut.

    Depends on seed_sample_activities() (for the activity) and
    seed_demo_users() (for student@example.com) having already run — must be
    called after both, and only where student@example.com actually exists
    (dev, or ENABLE_DEMO_SEED_ACCOUNTS).
    """
    try:
        async with engine.begin() as conn:
            student_row = (await conn.execute(text(
                "SELECT id FROM users WHERE email = 'student@example.com'"
            ))).fetchone()
            activity_row = (await conn.execute(text(
                "SELECT id FROM activities WHERE title = 'Creek Habitat Study' "
                "AND status = 'published' LIMIT 1"
            ))).fetchone()

            if not student_row or not activity_row:
                logger.info(
                    "⊘ Demo fieldwork submission seed skipped "
                    "(student@example.com or 'Creek Habitat Study' not found yet)"
                )
                return

            student_id, activity_id = student_row[0], activity_row[0]

            already_submitted = (await conn.execute(
                text(
                    "SELECT 1 FROM activity_submissions "
                    "WHERE student_id = :sid AND activity_id = :aid "
                    "AND submission_status = 'submitted'"
                ),
                {"sid": student_id, "aid": activity_id},
            )).fetchone()
            if already_submitted:
                return

            session_row = (await conn.execute(
                text("""
                    INSERT INTO learning_sessions (
                        id, user_id, activity_id, title, latitude, longitude,
                        location_name, is_active, status,
                        created_at, updated_at, completed_at
                    ) VALUES (
                        gen_random_uuid(), :sid, :aid, 'Creek Habitat Study — Field Session',
                        37.8716, -122.2727, 'Local creek or drainage channel',
                        FALSE, 'completed',
                        NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'
                    )
                    RETURNING id
                """),
                {"sid": student_id, "aid": activity_id},
            )).fetchone()
            session_id = session_row[0]

            await conn.execute(
                text("""
                    INSERT INTO evidence_captures (
                        id, session_id, student_id, activity_id, capture_type,
                        title, description, learning_objectives, competencies,
                        location_latitude, location_longitude, created_at
                    ) VALUES (
                        gen_random_uuid(), :session_id, :sid, :aid, 'photo',
                        'Creek water sample', 'Clear water, moderate flow. Spotted water striders and a small school of minnows near the bank.',
                        '[]'::jsonb, '[]'::jsonb,
                        37.8716, -122.2727, NOW() - INTERVAL '2 days'
                    )
                """),
                {"session_id": session_id, "sid": student_id, "aid": activity_id},
            )

            await conn.execute(
                text("""
                    INSERT INTO activity_submissions (
                        id, student_id, activity_id, session_id, submission_status,
                        compiled_evidence, submitted_at, created_at, updated_at
                    ) VALUES (
                        gen_random_uuid(), :sid, :aid, :session_id, 'submitted',
                        :compiled, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'
                    )
                """),
                {
                    "sid": student_id, "aid": activity_id, "session_id": session_id,
                    "compiled": json.dumps({
                        "captures": [{
                            "title": "Creek water sample",
                            "capture_type": "photo",
                            "description": "Clear water, moderate flow. Spotted water striders and a small school of minnows near the bank.",
                            "location_latitude": 37.8716,
                            "location_longitude": -122.2727,
                        }],
                        "reflections": [],
                        "submitted_at": datetime.utcnow().isoformat(),
                    }),
                },
            )
        logger.info("✅ Demo fieldwork submission seeded (student@example.com -> Creek Habitat Study, with GPS + submission)")
    except Exception as e:
        logger.warning(f"⊘ Demo fieldwork submission seed skipped: {e}")


async def seed_demo_users(engine) -> None:
    """
    Upsert the 4 customer-facing demo users with SecurePass123!
    (homeschool/student/teacher/parent — no ADMIN row).

    Split from the original 5-user version on 2026-07-17: Paul wants these
    "try it yourself" logins live on production (peripateticware.com) so
    prospective customers can explore each role, but explicitly chose NOT to
    also seed admin@example.com there — a published, well-known password on
    an ADMIN account is a real backdoor once it's live on the public
    internet, not just a dev convenience. The admin row now lives in
    seed_demo_admin_account(), which stays dev-only. See main.py's lifespan()
    for the two different gates these run under.
    """
    try:
        async with engine.begin() as conn:
            # bcrypt hash of "SecurePass123!"
            _PW = "$2b$12$nVqpepgIpsqIYLr5JzOtZeV/HYj1ib6CGtweKasJ4SN3sGQA0eBsG"
            # BUG (found while debugging why every seeded demo/test account got
            # 401 "Invalid email/id or password" on a fresh database): this raw
            # SQL INSERT bypasses the ORM entirely, so it never populated
            # email_index. routes/auth.py's login ALWAYS looks up by
            # `User.email_index == blind_index(email)` — never by the plain
            # `email` column — so a row with email_index left NULL can never
            # be found at login, no matter how correct its password hash is.
            # This never surfaced locally because these accounts, once
            # created via the real signup flow (which does set email_index),
            # persist in a long-lived local dev DB; a fresh CI database hits
            # this raw INSERT for the first time and exposes it. Computing
            # email_index here so every seeded row is actually loginable.
            await conn.execute(text("""
                INSERT INTO users (email, email_index, username, first_name, last_name, full_name,
                                   hashed_password, role, is_active)
                VALUES
                  ('homeschool@example.com',:ei_hs,'homeschool','Sarah','Rivera','Sarah Rivera',
                   :pw,'HOMESCHOOL',TRUE),
                  ('student@example.com',:ei_student,'student','Alex','Johnson','Alex Johnson',
                   :pw,'STUDENT',TRUE),
                  ('teacher@example.com',:ei_teacher,'teacher','Jane','Smith','Jane Smith',
                   :pw,'TEACHER',TRUE),
                  ('parent@example.com',:ei_parent,'parent','Margaret','Brown','Margaret Brown',
                   :pw,'PARENT',TRUE)
                ON CONFLICT (email) DO UPDATE SET
                    hashed_password = EXCLUDED.hashed_password,
                    email_index     = EXCLUDED.email_index,
                    is_active       = TRUE
            """), {
                "pw": _PW,
                "ei_hs":      blind_index("homeschool@example.com"),
                "ei_student": blind_index("student@example.com"),
                "ei_teacher": blind_index("teacher@example.com"),
                "ei_parent":  blind_index("parent@example.com"),
            })
        logger.info("✅ Demo seed users ensured (homeschool/student/teacher/parent @example.com, SecurePass123!)")
    except Exception as e:
        logger.error(f"❌ Demo seed upsert FAILED — login with SecurePass123! will not work: {e}", exc_info=True)


async def seed_demo_admin_account(engine) -> None:
    """
    Upsert admin@example.com (SecurePass123!) — split out of seed_demo_users()
    so it can be gated separately (development only; never on the
    ENABLE_DEMO_SEED_ACCOUNTS production opt-in). A published-password ADMIN
    account has no place on a live, public site.
    """
    try:
        async with engine.begin() as conn:
            _PW = "$2b$12$nVqpepgIpsqIYLr5JzOtZeV/HYj1ib6CGtweKasJ4SN3sGQA0eBsG"  # SecurePass123!
            # See the email_index note in seed_demo_users() above — same bug,
            # same fix.
            await conn.execute(text("""
                INSERT INTO users (email, email_index, username, first_name, last_name, full_name,
                                   hashed_password, role, is_active)
                VALUES ('admin@example.com',:ei,'admin','Paul','Admin','Paul Christopher Cerda',
                        :pw,'ADMIN',TRUE)
                ON CONFLICT (email) DO UPDATE SET
                    hashed_password = EXCLUDED.hashed_password,
                    email_index     = EXCLUDED.email_index,
                    is_active       = TRUE
            """), {"pw": _PW, "ei": blind_index("admin@example.com")})
        logger.info("✅ Demo admin account ensured (admin@example.com, SecurePass123!) — dev only")
    except Exception as e:
        logger.error(f"❌ Demo admin seed upsert FAILED: {e}", exc_info=True)


async def seed_homeschool_example_children(engine) -> None:
    """
    Link 2 children to the primary homeschool demo account (homeschool@example.com
    / Sarah Rivera, SecurePass123!) created by seed_demo_users().

    Bug: seed_demo_users() creates 'homeschool@example.com' as a bare HOMESCHOOL
    user with no children at all -- the homeschool dashboard/UI is unusable
    without at least one child. A *different* homeschool family
    (homeschool.parent@demo.com / Laura Chen, Demo@1234!) is seeded separately
    in seed_homeschool_demo() and does get children, which is why that one
    worked while the more commonly-used @example.com / SecurePass123! account
    did not. This fills in the missing link for the @example.com account.

    UUIDs are generated in Python (not left to a DB-side DEFAULT) so this does
    not depend on a specific Postgres UUID extension (uuid-ossp vs pgcrypto)
    being installed -- homeschool_children.id has been seen created with
    either gen_random_uuid() or uuid_generate_v4() depending on which DDL
    path ran first, and relying on that default silently rolled back this
    entire seed transaction (including the user rows) whenever the
    installed extension didn't match.
    """
    try:
        async with engine.begin() as conn:
            _PW = "$2b$12$nVqpepgIpsqIYLr5JzOtZeV/HYj1ib6CGtweKasJ4SN3sGQA0eBsG"  # SecurePass123!

            parent_row = (await conn.execute(text(
                "SELECT id FROM users WHERE email = 'homeschool@example.com'"
            ))).first()
            if not parent_row:
                logger.warning("⊘ homeschool@example.com not found — skipping child seed (run seed_demo_users first)")
                return
            parent_id = parent_row[0]

            child_specs = [
                ("noah.rivera@example.com", "hs_noah_rivera", "Noah", "Rivera", 4, "k6"),
                ("ava.rivera@example.com",  "hs_ava_rivera",  "Ava",  "Rivera", 8, "m712"),
            ]

            for email, username, first, last, grade_level, age_band in child_specs:
                child_id = uuid.uuid4()
                # Same email_index bug as seed_demo_users() above.
                result = await conn.execute(text("""
                    INSERT INTO users (id, email, email_index, username, first_name, last_name, full_name,
                                       hashed_password, role, is_active)
                    VALUES (:id, :email, :ei, :username, :first, :last, :full, :pw, 'STUDENT', TRUE)
                    ON CONFLICT (email) DO UPDATE SET is_active = TRUE, email_index = EXCLUDED.email_index
                    RETURNING id
                """), {
                    "id": child_id, "email": email, "ei": blind_index(email), "username": username,
                    "first": first, "last": last, "full": f"{first} {last}", "pw": _PW,
                })
                # ON CONFLICT DO UPDATE ... RETURNING always returns a row (unlike
                # DO NOTHING), so this gives us the real id whether inserted or
                # already existing — no need for a second SELECT.
                actual_child_id = result.first()[0]

                await conn.execute(text("""
                    INSERT INTO homeschool_children (id, parent_id, child_id, grade_level, age_band, created_at)
                    VALUES (:id, :pid, :cid, :grade, :band, NOW())
                    ON CONFLICT (parent_id, child_id) DO NOTHING
                """), {
                    "id": uuid.uuid4(), "pid": parent_id, "cid": actual_child_id,
                    "grade": grade_level, "band": age_band,
                })
                await conn.execute(text("""
                    INSERT INTO parent_child_links (parent_id, child_id, relationship)
                    VALUES (:pid, :cid, 'guardian')
                    ON CONFLICT (parent_id, child_id) DO NOTHING
                """), {"pid": parent_id, "cid": actual_child_id})

        logger.info("✅ homeschool@example.com now has 2 linked children (Noah & Ava Rivera)")
    except Exception as e:
        logger.error(f"❌ Homeschool example-account child seed FAILED: {e}", exc_info=True)


async def seed_test_accounts(engine) -> None:
    """Upsert 6 E2E/Detox test accounts (@test.local, Test1234!)."""
    try:
        async with engine.begin() as conn:
            # bcrypt hash of "Test1234!"
            _TEST_PW = "$2b$12$9x4KrIaTK6Ihpc/00eDlUuJIcXim7VUT0Ob9X/PQRdvvF4IxcAk7m"
            # Same email_index bug as seed_demo_users() above — these are the
            # accounts mobile/e2e.js Detox and Maestro suites log in as, so
            # this alone would have blocked every mobile E2E run on a fresh DB.
            await conn.execute(text("""
                INSERT INTO users (email, email_index, username, first_name, last_name, full_name,
                                   hashed_password, role, is_active)
                VALUES
                  ('student@test.local',:ei_student,'test_student','Test','Student','Test Student',
                   :pw,'STUDENT',TRUE),
                  ('teacher@test.local',:ei_teacher,'test_teacher','Test','Teacher','Test Teacher',
                   :pw,'TEACHER',TRUE),
                  ('parent@test.local',:ei_parent,'test_parent','Test','Parent','Test Parent',
                   :pw,'PARENT',TRUE),
                  ('admin@test.local',:ei_admin,'test_admin','Test','Admin','Test Admin',
                   :pw,'ADMIN',TRUE),
                  ('homeschool@test.local',:ei_hs,'test_homeschool','Test','Homeschool','Test Homeschool',
                   :pw,'HOMESCHOOL',TRUE),
                  ('platform@test.local',:ei_platform,'test_platform','Test','Platform','Test Platform',
                   :pw,'ADMIN',TRUE)
                ON CONFLICT (email) DO UPDATE SET
                    hashed_password = EXCLUDED.hashed_password,
                    email_index     = EXCLUDED.email_index,
                    is_active       = TRUE
            """), {
                "pw": _TEST_PW,
                "ei_student": blind_index("student@test.local"),
                "ei_teacher": blind_index("teacher@test.local"),
                "ei_parent":  blind_index("parent@test.local"),
                "ei_admin":   blind_index("admin@test.local"),
                "ei_hs":      blind_index("homeschool@test.local"),
                "ei_platform": blind_index("platform@test.local"),
            })
        logger.info("✅ E2E test seed accounts ensured (student/teacher/parent/admin/homeschool/platform @test.local)")
    except Exception as e:
        logger.warning(f"⊘ Detox test seed upsert skipped: {e}")


async def seed_homeschool_demo(engine) -> None:
    """Demo homeschool family: Laura Chen (parent) + 2 children."""
    try:
        async with engine.begin() as conn:
            # bcrypt hash of "Demo@1234!"
            _DEMO_PW = "$2b$12$KwGO4zE1S5Xar9BFJJoaZuXsMZqbqvy38/wzm/T1ELjNE96Tq6sbC"
            # Same email_index bug as seed_demo_users() above.
            await conn.execute(text("""
                INSERT INTO users (email, email_index, username, first_name, last_name, full_name,
                                   hashed_password, role, is_active)
                VALUES ('homeschool.parent@demo.com',:ei,'hs_parent','Laura','Chen','Laura Chen',
                        :pw, 'HOMESCHOOL', TRUE)
                ON CONFLICT (email) DO UPDATE SET email_index = EXCLUDED.email_index
            """), {"pw": _DEMO_PW, "ei": blind_index("homeschool.parent@demo.com")})
            await conn.execute(text("""
                INSERT INTO users (email, email_index, username, first_name, last_name, full_name,
                                   hashed_password, role, is_active)
                VALUES ('hs.child1@demo.com',:ei,'hs_child1','Emma','Chen','Emma Chen',
                        :pw, 'STUDENT', TRUE)
                ON CONFLICT (email) DO UPDATE SET email_index = EXCLUDED.email_index
            """), {"pw": _DEMO_PW, "ei": blind_index("hs.child1@demo.com")})
            await conn.execute(text("""
                INSERT INTO users (email, email_index, username, first_name, last_name, full_name,
                                   hashed_password, role, is_active)
                VALUES ('hs.child2@demo.com',:ei,'hs_child2','Liam','Chen','Liam Chen',
                        :pw, 'STUDENT', TRUE)
                ON CONFLICT (email) DO UPDATE SET email_index = EXCLUDED.email_index
            """), {"pw": _DEMO_PW, "ei": blind_index("hs.child2@demo.com")})
            await conn.execute(text("""
                INSERT INTO homeschool_children (parent_id, child_id, grade_level, age_band)
                SELECT p.id, c.id,
                       CASE c.email WHEN 'hs.child1@demo.com' THEN 3 ELSE 6 END,
                       'k6'
                FROM users p, users c
                WHERE p.email = 'homeschool.parent@demo.com'
                  AND c.email IN ('hs.child1@demo.com', 'hs.child2@demo.com')
                ON CONFLICT (parent_id, child_id) DO NOTHING
            """))
            await conn.execute(text("""
                INSERT INTO parent_child_links (parent_id, child_id, relationship)
                SELECT p.id, c.id, 'guardian'
                FROM users p, users c
                WHERE p.email = 'homeschool.parent@demo.com'
                  AND c.email IN ('hs.child1@demo.com', 'hs.child2@demo.com')
                ON CONFLICT (parent_id, child_id) DO NOTHING
            """))
        logger.info("✅ Demo homeschool family seeded (homeschool.parent@demo.com + 2 children)")
    except Exception as e:
        logger.warning(f"⊘ Demo homeschool family seed skipped: {e}")


async def seed_demo_classroom(engine) -> None:
    """Demo classroom: teacher@example.com + student@example.com + 7 artifact steps."""
    # Step 1: org + classroom + enrollment
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO organizations (slug, name, type, license_tier)
                VALUES ('demo-school', 'Demo School', 'school', 'free')
                ON CONFLICT (slug) DO NOTHING
            """))
            await conn.execute(text("""
                INSERT INTO classrooms (name, grade_level, subject, teacher_id, org_id, is_active)
                SELECT :cname, 5, 'Science', t.id, o.id, TRUE
                FROM users t, organizations o
                WHERE t.email = 'teacher@example.com' AND o.slug = 'demo-school'
                  AND NOT EXISTS (
                      SELECT 1 FROM classrooms c
                      WHERE c.name = :cname AND c.teacher_id = t.id
                  )
            """), {"cname": _DEMO_CLASS_NAME})
            await conn.execute(text("""
                INSERT INTO classroom_students (classroom_id, student_id)
                SELECT c.id, s.id
                FROM classrooms c, users s
                WHERE c.name = :cname AND s.email = 'student@example.com'
                ON CONFLICT (classroom_id, student_id) DO NOTHING
            """), {"cname": _DEMO_CLASS_NAME})
            await conn.execute(text("""
                INSERT INTO classes (teacher_id, name, grade_level, is_active)
                SELECT t.id, :cname, 5, TRUE
                FROM users t
                WHERE t.email = 'teacher@example.com'
                  AND NOT EXISTS (
                      SELECT 1 FROM classes c WHERE c.name = :cname AND c.teacher_id = t.id
                  )
            """), {"cname": _DEMO_CLASS_NAME})
        logger.info("✅ Demo classroom seeded (teacher@example.com + student@example.com)")
    except Exception as e:
        logger.warning(f"⊘ Demo classroom seed skipped: {e}")

    # Step 2: student captures
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO student_captures (student_id, capture_type, transcript, transcript_status, location_name)
                SELECT s.id, v.ctype, v.note, 'complete', 'Schoolyard'
                FROM users s,
                     (VALUES ('photo','Maple leaf — early autumn color change'),
                             ('note','Observed three bird species near the pond')) AS v(ctype, note)
                WHERE s.email = 'student@example.com'
                  AND NOT EXISTS (
                      SELECT 1 FROM student_captures sc
                      WHERE sc.student_id = s.id AND sc.transcript = v.note
                  )
            """))
        logger.info("✅ Demo student captures seeded")
    except Exception as e:
        logger.warning(f"⊘ Demo student captures seed skipped: {e}")

    # Step 3: notebook entry
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO student_notebooks (student_id, content)
                SELECT s.id, 'My first field note: the pond ecosystem has frogs, dragonflies, and cattails.'
                FROM users s
                WHERE s.email = 'student@example.com'
                  AND NOT EXISTS (
                      SELECT 1 FROM student_notebooks n
                      WHERE n.student_id = s.id AND n.content LIKE 'My first field note%'
                  )
            """))
        logger.info("✅ Demo notebook entry seeded")
    except Exception as e:
        logger.warning(f"⊘ Demo notebook entry seed skipped: {e}")

    # Step 3b: self-project
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO student_self_projects (student_id, title, description, status)
                SELECT s.id, 'My Backyard Nature Study',
                       'A personal project collecting observations from around my home and school.',
                       'personal'
                FROM users s
                WHERE s.email = 'student@example.com'
                  AND NOT EXISTS (
                      SELECT 1 FROM student_self_projects p
                      WHERE p.student_id = s.id AND p.title = 'My Backyard Nature Study'
                  )
            """))
        logger.info("✅ Demo self-project seeded")
    except Exception as e:
        logger.warning(f"⊘ Demo self-project seed skipped: {e}")

    # Step 4: field note for teacher review
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO student_field_notes (student_id, self_project_id, title, description, status, location_name)
                SELECT s.id,
                       (SELECT id FROM student_self_projects sp
                        WHERE sp.student_id = s.id AND sp.title = 'My Backyard Nature Study' LIMIT 1),
                       'Pond Ecosystem Observation',
                       'Recorded the plants and animals around the school pond over one week.',
                       'submitted', 'School Pond'
                FROM users s
                WHERE s.email = 'student@example.com'
                  AND NOT EXISTS (
                      SELECT 1 FROM student_field_notes f
                      WHERE f.student_id = s.id AND f.title = 'Pond Ecosystem Observation'
                  )
            """))
        logger.info("✅ Demo field note seeded")
    except Exception as e:
        logger.warning(f"⊘ Demo field note seed skipped: {e}")

    # Step 5: challenge proposal for teacher review
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO student_proposals (student_id, teacher_id, title, description, location_name, subject, status)
                SELECT s.id, t.id, 'Build a Weather Station',
                       'I want to measure rainfall and temperature in the schoolyard for a month.',
                       'Schoolyard', 'Science', 'pending'
                FROM users s, users t
                WHERE s.email = 'student@example.com' AND t.email = 'teacher@example.com'
                  AND NOT EXISTS (
                      SELECT 1 FROM student_proposals p
                      WHERE p.student_id = s.id AND p.title = 'Build a Weather Station'
                  )
            """))
        logger.info("✅ Demo challenge proposal seeded")
    except Exception as e:
        logger.warning(f"⊘ Demo challenge proposal seed skipped: {e}")

    # Step 6: activity submission for teacher review
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO activity_submissions (student_id, activity_id, submission_status, submitted_at)
                SELECT s.id,
                       (SELECT id FROM activities ORDER BY created_at LIMIT 1),
                       'submitted', NOW()
                FROM users s
                WHERE s.email = 'student@example.com'
                  AND NOT EXISTS (
                      SELECT 1 FROM activity_submissions a
                      WHERE a.student_id = s.id AND a.submission_status = 'submitted'
                  )
            """))
        logger.info("✅ Demo activity submission seeded")
    except Exception as e:
        logger.warning(f"⊘ Demo activity submission seed skipped: {e}")

    # Step 7: peer project for teacher review
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO student_peer_projects
                    (author_student_id, class_id, title, description,
                     learning_objectives_text, guiding_prompts,
                     audience, status, approval_required)
                SELECT s.id, c.id, 'Compare Two Local Habitats',
                       'A peer project comparing the pond and the meadow ecosystems.',
                       '["Compare biodiversity across two habitats", "Record evidence with photos"]'::jsonb,
                       '["What lives here that does not live in the other habitat?"]'::jsonb,
                       'whole_class', 'submitted', TRUE
                FROM users s, users t, classes c
                WHERE s.email = 'student@example.com'
                  AND t.email = 'teacher@example.com'
                  AND c.teacher_id = t.id AND c.name = :cname
                  AND NOT EXISTS (
                      SELECT 1 FROM student_peer_projects p
                      WHERE p.author_student_id = s.id AND p.title = 'Compare Two Local Habitats'
                  )
            """), {"cname": _DEMO_CLASS_NAME})
        logger.info("✅ Demo peer project seeded")
    except Exception as e:
        logger.warning(f"⊘ Demo peer project seed skipped: {e}")


async def seed_test_classroom(engine) -> None:
    """
    E2E test classroom: teacher@test.local + student@test.local, enrolled
    together the same way seed_demo_classroom() links the @example.com pair.

    Kept as its own org ('test-school') rather than reusing 'demo-school' so
    E2E/Detox test data stays cleanly separate from the @example.com demo
    data — mirrors the existing separation between seed_demo_users() and
    seed_test_accounts().

    Once this classroom + enrollment exists, any published activity can be
    assigned to student@test.local through the normal teacher UI/API using
    teacher@test.local's account, since the student is already a member of
    a classroom that account owns.
    """
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO organizations (slug, name, type, license_tier)
                VALUES ('test-school', 'Test School', 'school', 'free')
                ON CONFLICT (slug) DO NOTHING
            """))
            await conn.execute(text("""
                INSERT INTO classrooms (name, grade_level, subject, teacher_id, org_id, is_active)
                SELECT :cname, 5, 'Science', t.id, o.id, TRUE
                FROM users t, organizations o
                WHERE t.email = 'teacher@test.local' AND o.slug = 'test-school'
                  AND NOT EXISTS (
                      SELECT 1 FROM classrooms c
                      WHERE c.name = :cname AND c.teacher_id = t.id
                  )
            """), {"cname": _TEST_CLASS_NAME})
            await conn.execute(text("""
                INSERT INTO classroom_students (classroom_id, student_id)
                SELECT c.id, s.id
                FROM classrooms c, users s
                WHERE c.name = :cname AND s.email = 'student@test.local'
                ON CONFLICT (classroom_id, student_id) DO NOTHING
            """), {"cname": _TEST_CLASS_NAME})
            await conn.execute(text("""
                INSERT INTO classes (teacher_id, name, grade_level, is_active)
                SELECT t.id, :cname, 5, TRUE
                FROM users t
                WHERE t.email = 'teacher@test.local'
                  AND NOT EXISTS (
                      SELECT 1 FROM classes c WHERE c.name = :cname AND c.teacher_id = t.id
                  )
            """), {"cname": _TEST_CLASS_NAME})
        logger.info("✅ Test classroom seeded (teacher@test.local + student@test.local)")
    except Exception as e:
        logger.warning(f"⊘ Test classroom seed skipped: {e}")


async def seed_compliance_frameworks(engine) -> None:
    """Seed default compliance frameworks (FERPA, COPPA, CCPA, GDPR) if table is empty."""
    try:
        import uuid as _uuid
        import json as _json
        from core.database import get_engine as _get_engine

        def _rule_uuid(key: str) -> str:
            return str(_uuid.uuid5(_uuid.NAMESPACE_URL, key))

        async with _get_engine().begin() as conn:
            existing = await conn.execute(text("SELECT COUNT(*) FROM compliance_rules"))
            count = existing.scalar()
            if count == 0:
                _frameworks = [
                    (
                        _rule_uuid("ferpa_us_v1"), "FERPA", "1.0", "US", "privacy",
                        _json.dumps({"framework": "ferpa", "jurisdiction_name": "United States", "country_code": "US", "max_retention_days": 365, "encryption_required": True, "encryption_algorithm": "AES-256", "student_data_sharing_allowed": False, "student_monitoring_allowed": True, "student_profiling_allowed": False, "student_targeting_allowed": False}),
                    ),
                    (
                        _rule_uuid("coppa_us_v1"), "COPPA", "1.0", "US-COPPA", "privacy",
                        _json.dumps({"framework": "coppa", "jurisdiction_name": "United States (Children)", "country_code": "US", "max_retention_days": 180, "encryption_required": True, "encryption_algorithm": "AES-256", "student_data_sharing_allowed": False, "student_monitoring_allowed": False, "student_profiling_allowed": False, "student_targeting_allowed": False, "behavioral_advertising_allowed": False}),
                    ),
                    (
                        _rule_uuid("ccpa_ca_v1"), "CCPA", "1.0", "US-CA", "data_protection",
                        _json.dumps({"framework": "ccpa", "jurisdiction_name": "California", "country_code": "US", "state_code": "CA", "max_retention_days": 365, "encryption_required": True, "encryption_algorithm": "AES-256", "student_data_sharing_allowed": False, "opt_out_right": True, "data_deletion_right": True}),
                    ),
                    (
                        _rule_uuid("gdpr_eu_v1"), "GDPR", "1.0", "EU", "data_protection",
                        _json.dumps({"framework": "gdpr", "jurisdiction_name": "European Union", "country_code": "EU", "max_retention_days": 730, "encryption_required": True, "encryption_algorithm": "AES-256", "lawful_basis_required": True, "right_to_erasure": True, "data_portability_right": True, "breach_notification_hours": 72}),
                    ),
                ]
                for rule_id, reg_id, ver, jur, reg_type, rule_json in _frameworks:
                    await conn.execute(text("""
                        INSERT INTO compliance_rules
                          (rule_id, regulation_id, version, jurisdiction, effective_date,
                           rule_definition, created_by, is_active, regulation_type)
                        VALUES
                          (:rule_id, :regulation_id, :version, :jurisdiction, NOW(),
                           CAST(:rule_definition AS JSONB), 'system', TRUE, :regulation_type)
                        ON CONFLICT (rule_id) DO NOTHING
                    """), {
                        "rule_id": rule_id, "regulation_id": reg_id, "version": ver,
                        "jurisdiction": jur, "regulation_type": reg_type, "rule_definition": rule_json,
                    })
                logger.info("✅ Default compliance frameworks seeded (FERPA, COPPA, CCPA, GDPR)")
    except Exception as e:
        logger.warning(f"⊘ Compliance framework seed skipped: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# CONFIG + BACKGROUND TASK HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def check_config_warnings(settings) -> None:
    """Log security warnings for insecure default config values.

    In production (ENVIRONMENT=production) the checks that would let an
    attacker forge auth tokens or leave student PII in plaintext are
    upgraded from warnings to a hard startup failure - better to refuse to
    boot than to silently serve real traffic with dev secrets.
    """
    is_prod = str(getattr(settings, "ENVIRONMENT", "")).lower() == "production"
    fatal: list = []

    if not getattr(settings, "SMTP_HOST", ""):
        logger.warning(
            "⚠  EMAIL: SMTP_HOST is not set — all emails will be logged to console "
            "and NOT delivered. Set SMTP_HOST + SMTP_USER + SMTP_PASSWORD + EMAIL_DRY_RUN=false "
            "in .env to enable real email delivery (signup confirmation, password reset, etc)."
        )

    if getattr(settings, "SECRET_KEY", "") in ("", "dev-secret-key-change-in-production"):
        msg = (
            "SECRET_KEY is set to the development default — JWTs (including admin "
            "sessions) can be forged by anyone. Generate a strong key: "
            "python -c \"import secrets; print(secrets.token_hex(32))\""
        )
        fatal.append(msg) if is_prod else logger.warning(f"⚠  SECURITY: {msg}")

    if getattr(settings, "AUDIT_HASH_SALT", "") in ("", "dev-audit-salt-change-in-production"):
        msg = (
            "AUDIT_HASH_SALT is set to the development default — student ID hashes "
            "in the audit log are predictable/reversible-by-guessing. Rotate before production."
        )
        fatal.append(msg) if is_prod else logger.warning(f"⚠  SECURITY: {msg}")

    if not getattr(settings, "FIELD_ENCRYPTION_KEY", ""):
        msg = (
            "FIELD_ENCRYPTION_KEY is blank — PII columns (email, full_name, GPS, "
            "messages) are stored in PLAINTEXT. This fails GDPR/FERPA/COPPA at-rest "
            "encryption expectations. Generate: python -c \"from cryptography.fernet "
            "import Fernet; print(Fernet.generate_key().decode())\""
        )
        fatal.append(msg) if is_prod else logger.warning(f"⚠  SECURITY: {msg}")

    if getattr(settings, "PLATFORM_API_SECRET", "") == "" and is_prod:
        logger.warning(
            "⚠  SECURITY: PLATFORM_API_SECRET is unset — the X-Platform-Secret "
            "second factor on /platform/* superadmin routes is disabled. Set it "
            "to a random value: python -c \"import secrets; print(secrets.token_hex(32))\""
        )

    if fatal and is_prod:
        for msg in fatal:
            logger.error(f"❌ SECURITY (fatal in production): {msg}")
        raise RuntimeError(
            "Refusing to start in production with insecure default secrets. "
            "Fix the ❌ SECURITY errors above in .env and restart. "
            f"({len(fatal)} fatal issue(s).)"
        )


async def seed_ai_task_config_orm(settings) -> None:
    """Seed AI task config defaults via ORM (supplements the raw SQL seed in apply_agent_runs_table)."""
    try:
        from models.ai_batch import AiTaskConfig, TaskType
        from sqlalchemy import select as _sel
        from core.database import get_session_factory as _get_session_factory

        _TASK_DEFAULTS = {
            TaskType.ACTIVITY_SUGGESTIONS:  settings.AI_DEFAULT_ACTIVITY_SUGGESTIONS,
            TaskType.STANDARDS_MAPPING:     settings.AI_DEFAULT_STANDARDS_MAPPING,
            TaskType.RUBRIC_MAPPING:        settings.AI_DEFAULT_RUBRIC_MAPPING,
            TaskType.TAXONOMY_MAPPING:      settings.AI_DEFAULT_TAXONOMY_MAPPING,
            TaskType.SUBMISSION_ASSESSMENT: settings.AI_DEFAULT_SUBMISSION_ASSESSMENT,
        }
        async with _get_session_factory()() as _db:
            for task_type, provider in _TASK_DEFAULTS.items():
                existing = (
                    await _db.execute(
                        _sel(AiTaskConfig).where(AiTaskConfig.task_type == task_type.value)
                    )
                ).scalar_one_or_none()
                if not existing:
                    _db.add(AiTaskConfig(task_type=task_type.value, provider=provider, enabled=True))
            await _db.commit()
        logger.info("✅ AI task config seeded (ORM)")
    except Exception as e:
        logger.warning(f"⊘ AI task config seed (ORM) skipped: {e}")


async def start_background_tasks(async_session, settings) -> None:
    """Start retention cleanup, AI batch scheduler, and budget monitor jobs.

    All three job groups share a single AsyncIOScheduler instance so there is
    only one scheduler running in the process.  Each group gracefully degrades
    if APScheduler is not installed or the relevant task module is missing.
    """
    # ── Build shared scheduler (all job groups reuse this instance) ───────────
    _scheduler = None
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        _scheduler = AsyncIOScheduler()
    except ImportError:
        logger.warning(
            "⊘ APScheduler not installed — scheduled jobs (retention, AI batch, "
            "budget monitor) will not run.  pip install apscheduler to enable."
        )

    # ── Retention cleanup — daily at 02:00 UTC ────────────────────────────────
    if _scheduler is not None:
        try:
            from tasks.retention_cleanup import run_retention_cleanup

            _scheduler.add_job(
                run_retention_cleanup,
                "cron",
                hour=2,
                minute=0,
                id="retention_cleanup",
                replace_existing=True,
            )
            logger.info("✅ Retention cleanup job scheduled (daily at 02:00 UTC)")
        except Exception as e:
            logger.warning(f"⊘ Retention cleanup job not added: {e}")
    else:
        # Fallback: asyncio loop — works without APScheduler
        try:
            from tasks.retention_cleanup import run_retention_cleanup_loop
            asyncio.create_task(run_retention_cleanup_loop(interval_hours=24))
            logger.info("✅ Retention cleanup fallback loop started (every 24 h)")
        except Exception as e:
            logger.warning(f"⊘ Retention cleanup fallback not started: {e}")

    # ── AI batch scheduler ────────────────────────────────────────────────────
    if _scheduler is not None:
        try:
            from apscheduler.triggers.cron import CronTrigger
            from services.batch_processor import run_full_cycle

            _cron_parts = settings.AI_BATCH_CRON.split()
            _scheduler.add_job(
                run_full_cycle,
                CronTrigger(
                    minute=_cron_parts[0],
                    hour=_cron_parts[1],
                    day=_cron_parts[2],
                    month=_cron_parts[3],
                    day_of_week=_cron_parts[4],
                ),
                id="ai_batch_cycle",
                replace_existing=True,
            )
            logger.info("✅ AI batch cycle job scheduled (%s)", settings.AI_BATCH_CRON)
        except Exception as e:
            logger.warning(f"⊘ AI batch cycle job not added: {e}")

    # ── Budget monitor jobs ────────────────────────────────────────────────────
    # Restored from git commit 0e096e6 ("wire real pgvector RAG ... + fix 3
    # truncated files") — this block existed there but was lost by the time of
    # the current HEAD commit. This is the real, previously-working code, not
    # a guess: it matches this function's own docstring (hourly alert job,
    # 15-min anomaly job) and tasks/budget_monitor.py's two exported functions.
    if _scheduler is not None:
        try:
            from tasks.budget_monitor import budget_alert_check, anomaly_detect, monthly_summary

            # budget_alert_check() and anomaly_detect() now open and close
            # their own DB session internally (see tasks/budget_monitor.py —
            # this lets them be scanned via Redis without holding a session
            # the whole time, and lets tests call them with zero args), so
            # they're registered directly as job targets instead of being
            # wrapped in a closure over async_session().
            _scheduler.add_job(budget_alert_check, "interval", hours=1,     id="budget_alert",    replace_existing=True)
            _scheduler.add_job(anomaly_detect,     "interval", minutes=15, id="anomaly_detect",   replace_existing=True)
            _scheduler.add_job(monthly_summary,    "cron", day=1, hour=6,   id="monthly_summary",  replace_existing=True)
            logger.info("✅ Budget monitor jobs added to scheduler (hourly alert, 15-min anomaly, monthly summary)")
        except Exception as e:
            logger.warning(f"⊘ Budget monitor jobs not added: {e}")

    # ── Privacy legislation crawler ───────────────────────────────────────────
    # Previously IAPP_CRAWLER_SCHEDULE was defined in config but referenced
    # NOWHERE — the "scheduled crawl" the crawler docstrings promised never ran.
    # It is now registered here, on that cron, but only when IAPP_CRAWLER_ENABLED
    # is true (default false), so it stays off until an operator opts in.
    if _scheduler is not None and getattr(settings, "IAPP_CRAWLER_ENABLED", False):
        try:
            from apscheduler.triggers.cron import CronTrigger
            from services.iapp_privacy_crawler import run_privacy_crawler
            from core.database import get_session_factory

            async def _run_privacy_crawler_job():
                # Own DB session — a scheduled job can't share a request session.
                async with get_session_factory()() as _db:
                    try:
                        await run_privacy_crawler(
                            db=_db,
                            auto_load=getattr(settings, "PRIVACY_AUTO_LOAD", False),
                        )
                    except Exception as _exc:
                        logger.error(f"Scheduled privacy crawl failed: {_exc}")

            _cron = settings.IAPP_CRAWLER_SCHEDULE.split()
            _scheduler.add_job(
                _run_privacy_crawler_job,
                CronTrigger(
                    minute=_cron[0], hour=_cron[1], day=_cron[2],
                    month=_cron[3], day_of_week=_cron[4],
                ),
                id="privacy_crawler",
                replace_existing=True,
            )
            logger.info("✅ Privacy legislation crawler scheduled (%s)", settings.IAPP_CRAWLER_SCHEDULE)
        except Exception as e:
            logger.warning(f"⊘ Privacy crawler job not added: {e}")
    else:
        logger.info("⊘ Privacy crawler disabled (IAPP_CRAWLER_ENABLED=false) — not scheduled")

    # ── Privacy jurisdiction catalog auto-renew ───────────────────────────────
    # Re-checks previously-discovered (non-adapter) catalog entries for updates.
    # Distinct from the crawler job above: that one refreshes the ~24 curated
    # PrivacySource adapters; this one re-runs discovery for anything sourced
    # from privacy_source_registry or AI recall-only synthesis, so a country's
    # law that changes after it was first auto-discovered doesn't go stale
    # forever. Off by default (PRIVACY_AUTO_RENEW_ENABLED=false) — same
    # opt-in convention as the crawler above.
    if _scheduler is not None and getattr(settings, "PRIVACY_AUTO_RENEW_ENABLED", False):
        try:
            from apscheduler.triggers.cron import CronTrigger
            from services.privacy_auto_renew import run_catalog_auto_renew, check_no_legislation_countries_for_updates
            from core.database import get_session_factory

            async def _run_privacy_auto_renew_job():
                async with get_session_factory()() as _db:
                    try:
                        await run_catalog_auto_renew(_db)
                    except Exception as _exc:
                        logger.error(f"Scheduled privacy catalog auto-renew failed: {_exc}")
                    try:
                        await check_no_legislation_countries_for_updates(_db)
                    except Exception as _exc:
                        logger.error(f"Scheduled no-legislation country recheck failed: {_exc}")

            _cron = settings.PRIVACY_AUTO_RENEW_SCHEDULE.split()
            _scheduler.add_job(
                _run_privacy_auto_renew_job,
                CronTrigger(
                    minute=_cron[0], hour=_cron[1], day=_cron[2],
                    month=_cron[3], day_of_week=_cron[4],
                ),
                id="privacy_catalog_auto_renew",
                replace_existing=True,
            )
            logger.info("✅ Privacy catalog auto-renew scheduled (%s)", settings.PRIVACY_AUTO_RENEW_SCHEDULE)
        except Exception as e:
            logger.warning(f"⊘ Privacy catalog auto-renew job not added: {e}")
    else:
        logger.info("⊘ Privacy catalog auto-renew disabled (PRIVACY_AUTO_RENEW_ENABLED=false) — not scheduled")

    # Start the shared scheduler — without this call, none of the job groups
    # registered above (retention cleanup, AI batch, budget monitor,
    # privacy crawler) ever run.
    if _scheduler is not None and not _scheduler.running:
        try:
            _scheduler.start()
            logger.info("✅ APScheduler started")
        except Exception as e:
            logger.warning(f"⊘ APScheduler failed to start: {e}")
