-- =============================================================================
-- Peripateticware — Phase 6 Student Schema
-- =============================================================================
-- Run this script ONCE after the existing schema.sql has been applied.
-- All statements use IF NOT EXISTS so they are safe to re-run.
--
-- PowerShell command to execute inside Docker:
--   docker-compose exec -T postgres psql `
--     -U peripateticware -d peripateticware `
--     -f /docker-entrypoint-initdb.d/student_schema.sql
--
-- Or directly via the helper script:
--   .\scripts\Run-StudentSchema.ps1
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1.  evidence_captures
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence_captures (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID        NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    student_id          UUID        NOT NULL REFERENCES users(id)             ON DELETE CASCADE,
    activity_id         UUID        NOT NULL REFERENCES activities(id)        ON DELETE CASCADE,

    -- Capture metadata
    capture_type        VARCHAR(50) NOT NULL
                            CHECK (capture_type IN ('photo','video','audio','text','sketch','measurement')),
    title               VARCHAR(255),
    description         TEXT,

    -- Media
    file_url            TEXT,
    file_size_bytes     INTEGER,
    duration_seconds    INTEGER,        -- audio / video
    transcription       TEXT,           -- ASR output

    -- Learning context (arrays stored as JSONB for flexibility)
    learning_objectives JSONB       NOT NULL DEFAULT '[]'::jsonb,
    competencies        JSONB       NOT NULL DEFAULT '[]'::jsonb,

    -- GPS at capture time
    location_latitude   FLOAT,
    location_longitude  FLOAT,

    -- Async AI analysis (populated after upload)
    ai_analysis         JSONB,          -- {quality_score, insights}
    device_metadata     JSONB,          -- raw device metadata (EXIF, etc.)

    created_at          TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_captures_session_id
    ON evidence_captures(session_id);
CREATE INDEX IF NOT EXISTS idx_evidence_captures_student_id
    ON evidence_captures(student_id);
CREATE INDEX IF NOT EXISTS idx_evidence_captures_activity_id
    ON evidence_captures(activity_id);
CREATE INDEX IF NOT EXISTS idx_evidence_captures_created_at
    ON evidence_captures(created_at DESC);


-- -----------------------------------------------------------------------------
-- 2.  notebook_entries
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notebook_entries (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID        NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    student_id          UUID        NOT NULL REFERENCES users(id)             ON DELETE CASCADE,
    activity_id         UUID        NOT NULL REFERENCES activities(id)        ON DELETE CASCADE,

    reflection_type     VARCHAR(50) NOT NULL DEFAULT 'freeform'
                            CHECK (reflection_type IN ('freeform','guided','structured')),
    title               VARCHAR(255),
    content             TEXT        NOT NULL,

    learning_objectives JSONB       NOT NULL DEFAULT '[]'::jsonb,
    competencies        JSONB       NOT NULL DEFAULT '[]'::jsonb,

    created_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notebook_entries_session_id
    ON notebook_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_notebook_entries_student_id
    ON notebook_entries(student_id);
CREATE INDEX IF NOT EXISTS idx_notebook_entries_activity_id
    ON notebook_entries(activity_id);
CREATE INDEX IF NOT EXISTS idx_notebook_entries_created_at
    ON notebook_entries(created_at DESC);


-- -----------------------------------------------------------------------------
-- 3.  activity_submissions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_submissions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          UUID        NOT NULL REFERENCES users(id)             ON DELETE CASCADE,
    activity_id         UUID        NOT NULL REFERENCES activities(id)        ON DELETE CASCADE,
    session_id          UUID             REFERENCES learning_sessions(id)     ON DELETE SET NULL,

    submission_status   VARCHAR(50) NOT NULL DEFAULT 'draft'
                            CHECK (submission_status IN ('draft','submitted','graded')),

    -- Snapshot of all evidence + reflections at submit time
    compiled_evidence   JSONB,          -- {captures: [...], reflections: [...]}

    -- Teacher assessment (populated after grading)
    teacher_feedback    TEXT,
    grade               FLOAT,
    rubric_scores       JSONB,          -- {criterion_id: score, ...}

    submitted_at        TIMESTAMP,
    graded_at           TIMESTAMP,
    created_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_submissions_student_id
    ON activity_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_activity_submissions_activity_id
    ON activity_submissions(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_submissions_status
    ON activity_submissions(submission_status);
CREATE INDEX IF NOT EXISTS idx_activity_submissions_submitted_at
    ON activity_submissions(submitted_at DESC NULLS LAST);


-- -----------------------------------------------------------------------------
-- 4.  Backfill: add activity_id FK column to learning_sessions if absent
--     (existing sessions may not have this column in older builds)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM   information_schema.columns
        WHERE  table_name  = 'learning_sessions'
        AND    column_name = 'activity_id'
    ) THEN
        ALTER TABLE learning_sessions
            ADD COLUMN activity_id UUID REFERENCES activities(id) ON DELETE SET NULL;

        CREATE INDEX idx_learning_sessions_activity_id
            ON learning_sessions(activity_id);
    END IF;
END;
$$;

-- Backfill completed_at column if absent (older builds)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM   information_schema.columns
        WHERE  table_name  = 'learning_sessions'
        AND    column_name = 'completed_at'
    ) THEN
        ALTER TABLE learning_sessions ADD COLUMN completed_at TIMESTAMP;
    END IF;
END;
$$;


-- -----------------------------------------------------------------------------
-- Done
-- -----------------------------------------------------------------------------
SELECT 'Phase 6 student schema applied successfully.' AS result;
