-- =============================================================================
-- Peripateticware -- Complete Database Initialization
-- =============================================================================
-- Merged from init.sql + complete_schema.sql
-- Safe to run on a fresh database (all statements use IF NOT EXISTS).
-- Mounted at: ./database/init.sql -> /docker-entrypoint-initdb.d/01-init.sql
-- Runs automatically on first postgres container start (empty volume only).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- pgvector (for RAG embeddings) -- skip gracefully if not installed
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector not available, skipping.';
END;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE activity_type_enum AS ENUM (
        'inquiry', 'field_observation', 'hands_on', 'project', 'discussion', 'experiment', 'discovery'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE activity_status_enum AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE project_status_enum AS ENUM ('planning', 'active', 'completed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 1. users
-- Role stored as VARCHAR with uppercase CHECK constraint.
-- Backend UserRole enum uses UPPERCASE values to match.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- organizations (must come before users so FK can reference it)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug                  VARCHAR(100) NOT NULL UNIQUE,
    name                  VARCHAR(255) NOT NULL,
    type                  VARCHAR(50)  NOT NULL DEFAULT 'school',
                              -- 'school' | 'district' | 'homeschool_family' | 'homeschool_coop'
    license_key           TEXT,
    license_tier          VARCHAR(30)  NOT NULL DEFAULT 'free',
    license_status        VARCHAR(20)  NOT NULL DEFAULT 'active',
    license_valid_until   TIMESTAMP,
    trial_started_at      TIMESTAMP,
    max_teachers                INTEGER NOT NULL DEFAULT 3,
    max_classrooms              INTEGER NOT NULL DEFAULT 1,
    max_students                INTEGER NOT NULL DEFAULT 30,  -- org-wide total
    max_students_per_classroom  INTEGER NOT NULL DEFAULT 30,  -- per-classroom cap
    -- Tier defaults:
    --   free:     1 classroom, 30/class (30 total)
    --   starter:  3 classrooms, 35/class (300 total)
    --   school:  15 classrooms, 40/class (1500 total)
    --   district: 60 classrooms, 40/class (unlimited total)
    ollama_base_url       TEXT,
    anthropic_api_key_enc TEXT,
    paddle_customer_id    VARCHAR(128),
    paddle_subscription_id VARCHAR(128),
    contact_email         VARCHAR(255),
    created_at            TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_organizations_slug ON organizations(slug);

CREATE TABLE IF NOT EXISTS users (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    username        VARCHAR(255) NOT NULL UNIQUE,
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    full_name       VARCHAR(255),
    hashed_password VARCHAR(255) NOT NULL,
    role            VARCHAR(50)  NOT NULL DEFAULT 'STUDENT'
                        CHECK (role IN ('STUDENT', 'TEACHER', 'PARENT', 'ADMIN', 'HOMESCHOOL')),
    avatar_url      VARCHAR(512),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    age_group       VARCHAR(20)  NULL,
    requires_parental_consent BOOLEAN NOT NULL DEFAULT FALSE,
    -- Multi-tenancy
    org_id          UUID         REFERENCES organizations(id) ON DELETE SET NULL,
    invite_token_used VARCHAR(128),
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);
CREATE INDEX IF NOT EXISTS ix_users_org_id    ON users(org_id);

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_members (
    id        UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id    UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id   UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role      VARCHAR(30)  NOT NULL DEFAULT 'member',
                               -- 'owner' | 'admin' | 'member'
    joined_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_org_members_org  ON organization_members(org_id);
CREATE INDEX IF NOT EXISTS ix_org_members_user ON organization_members(user_id);

-- ---------------------------------------------------------------------------
-- classrooms
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classrooms (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id      UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    teacher_id  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    grade_level INTEGER,
    subject     VARCHAR(100),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_classrooms_org     ON classrooms(org_id);
CREATE INDEX IF NOT EXISTS ix_classrooms_teacher ON classrooms(teacher_id);

-- ---------------------------------------------------------------------------
-- classroom_students
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classroom_students (
    classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    student_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrolled_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (classroom_id, student_id)
);

-- ---------------------------------------------------------------------------
-- classroom_invitations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classroom_invitations (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    classroom_id UUID         NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    org_id       UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by   UUID         REFERENCES users(id) ON DELETE SET NULL,
    email        VARCHAR(255),            -- null = open link (anyone with the token can join)
    token        VARCHAR(128) NOT NULL UNIQUE,
    status       VARCHAR(20)  NOT NULL DEFAULT 'pending',
                                 -- 'pending' | 'accepted' | 'expired' | 'revoked'
    expires_at   TIMESTAMP    NOT NULL,
    accepted_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
    accepted_at  TIMESTAMP,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_classroom_invitations_token     ON classroom_invitations(token);
CREATE INDEX IF NOT EXISTS ix_classroom_invitations_classroom ON classroom_invitations(classroom_id);
CREATE INDEX IF NOT EXISTS ix_classroom_invitations_email     ON classroom_invitations(email);

-- ---------------------------------------------------------------------------
-- 2. student_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_profiles (
    id                      UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    learning_style          VARCHAR(50),
    bloom_level             INTEGER   DEFAULT 1,
    marzano_level           INTEGER   DEFAULT 1,
    prior_knowledge         JSONB,
    device_sensor_precision FLOAT,
    device_npu_power        FLOAT,
    device_camera_level     FLOAT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_profiles_user_id ON student_profiles(user_id);

-- ---------------------------------------------------------------------------
-- 3. curriculum_units
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS curriculum_units (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    title         VARCHAR(255) NOT NULL,
    description   TEXT,
    subject       VARCHAR(255),
    grade_level   INTEGER,
    bloom_level   INTEGER,
    marzano_level INTEGER,
    raw_content   JSONB,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    ALTER TABLE curriculum_units ADD COLUMN content_embedding vector(384);
EXCEPTION
    WHEN undefined_object THEN RAISE NOTICE 'pgvector not loaded, skipping embedding column.';
    WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_curriculum_units_subject     ON curriculum_units(subject);
CREATE INDEX IF NOT EXISTS idx_curriculum_units_grade_level ON curriculum_units(grade_level);

-- ---------------------------------------------------------------------------
-- 4. activities  (full schema including all Phase 5 columns)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
    id                         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id                 UUID         REFERENCES users(id) ON DELETE SET NULL,
    title                      VARCHAR(255) NOT NULL,
    description                TEXT,
    learning_objectives        JSONB        DEFAULT '[]'::jsonb,
    location_latitude          FLOAT,
    location_longitude         FLOAT,
    location_radius_meters     INTEGER      DEFAULT 100,
    location_name              VARCHAR(255),
    location_info              TEXT,
    location_context_id        UUID,
    grade_level                INTEGER,
    subject                    VARCHAR(100),
    difficulty_level           INTEGER      DEFAULT 3,
    estimated_duration_minutes INTEGER,
    materials_needed           JSONB        DEFAULT '[]'::jsonb,
    resources                  JSONB        DEFAULT '[]'::jsonb,
    curriculum_unit_ids        UUID[],
    assessment_type            VARCHAR(50)  DEFAULT 'formative',
    bloom_level                INTEGER,
    marzano_level              INTEGER,
    dok_level                  INTEGER,
    solo_level                 INTEGER,
    primary_framework          VARCHAR(50)  DEFAULT 'blooms',
    rubric_id                  UUID,
    activity_type              activity_type_enum   DEFAULT 'inquiry',
    suggested_lessons          JSONB        DEFAULT '[]'::jsonb,
    status                     activity_status_enum DEFAULT 'draft',
    is_active                  BOOLEAN      NOT NULL DEFAULT TRUE,
    is_shareable               BOOLEAN      NOT NULL DEFAULT FALSE,
    view_count                 INTEGER      DEFAULT 0,
    created_at                 TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMP    NOT NULL DEFAULT NOW(),
    published_at               TIMESTAMP,
    -- Legacy columns from original init.sql (kept for compatibility)
    curriculum_unit_id         UUID         REFERENCES curriculum_units(id) ON DELETE SET NULL,
    activity_type_legacy       VARCHAR(50),
    orient_phase               TEXT,
    inquiry_phase              TEXT,
    reflect_phase              TEXT,
    location                   VARCHAR(255),
    due_date                   TIMESTAMP,
    -- Student-proposed activity metadata
    is_student_proposed        BOOLEAN      NOT NULL DEFAULT FALSE,
    proposed_by_student_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
    -- Completion mode
    -- 'field_only'          — activity is complete when field work is done
    -- 'field_and_reflection' — requires extended writing/reflection after field work
    completion_mode            VARCHAR(20)  NOT NULL DEFAULT 'field_only'
                                   CHECK (completion_mode IN ('field_only','field_and_reflection')),
    -- When TRUE and completion_mode = 'field_and_reflection', teacher must explicitly
    -- approve field work before student can begin reflection phase.
    -- Default FALSE: student can start reflection immediately after field work.
    require_field_approval     BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_activities_teacher    ON activities(teacher_id);
CREATE INDEX IF NOT EXISTS idx_activities_status     ON activities(status);
CREATE INDEX IF NOT EXISTS idx_activities_subject    ON activities(subject);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. learning_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learning_sessions (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    curriculum_id UUID         REFERENCES curriculum_units(id) ON DELETE SET NULL,
    activity_id   UUID         REFERENCES activities(id) ON DELETE SET NULL,
    title         VARCHAR(255),
    latitude      FLOAT,
    longitude     FLOAT,
    location_name VARCHAR(255),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    status        VARCHAR(50)  NOT NULL DEFAULT 'in_progress',
    inquiry_log   JSONB        DEFAULT '[]'::jsonb,
    evidence      JSONB        DEFAULT '{}'::jsonb,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_learning_sessions_user_id     ON learning_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_activity_id ON learning_sessions(activity_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_status      ON learning_sessions(status);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_created_at  ON learning_sessions(created_at DESC);

-- ---------------------------------------------------------------------------
-- 6. multimodal_inputs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS multimodal_inputs (
    id                    UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id            UUID      NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    input_type            VARCHAR(50),
    raw_data              JSONB,
    timestamp             TIMESTAMP NOT NULL DEFAULT NOW(),
    processing_latency_ms INTEGER
);

DO $$
BEGIN
    ALTER TABLE multimodal_inputs ADD COLUMN embedding vector(384);
EXCEPTION
    WHEN undefined_object THEN RAISE NOTICE 'pgvector not loaded, skipping embedding column.';
    WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_multimodal_inputs_session_id ON multimodal_inputs(session_id);

-- ---------------------------------------------------------------------------
-- 7. triple_join_records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS triple_join_records (
    id                    UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id            UUID      NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    site_context          JSONB,
    curriculum_context    JSONB,
    persona_context       JSONB,
    inquiry_path          JSONB,
    recommended_resources TEXT[],
    confidence_score      FLOAT,
    created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_triple_join_session_id ON triple_join_records(session_id);

-- ---------------------------------------------------------------------------
-- 8. projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id             UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id     UUID                NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title          VARCHAR(255)        NOT NULL,
    description    TEXT,
    grade_level    INTEGER,
    subject        VARCHAR(100),
    duration_weeks INTEGER,
    start_date     TIMESTAMP,
    end_date       TIMESTAMP,
    status         project_status_enum NOT NULL DEFAULT 'planning',
    created_at     TIMESTAMP           NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP           NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_teacher_id ON projects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_projects_status     ON projects(status);

-- ---------------------------------------------------------------------------
-- 9. project_activities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_activities (
    id          UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id  UUID      NOT NULL REFERENCES projects(id)   ON DELETE CASCADE,
    activity_id UUID      NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    "order"     INTEGER   NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_activities_project_id  ON project_activities(project_id);
CREATE INDEX IF NOT EXISTS idx_project_activities_activity_id ON project_activities(activity_id);

-- ---------------------------------------------------------------------------
-- 10. student_projects  (from original init.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_projects (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    title         VARCHAR(255) NOT NULL,
    activity_id   UUID         REFERENCES activities(id) ON DELETE CASCADE,
    student_id    UUID         REFERENCES users(id) ON DELETE CASCADE,
    status        VARCHAR(50)  DEFAULT 'active',
    progress      INTEGER      DEFAULT 0,
    current_phase VARCHAR(50),
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_projects_student  ON student_projects(student_id);
CREATE INDEX IF NOT EXISTS idx_student_projects_activity ON student_projects(activity_id);
CREATE INDEX IF NOT EXISTS idx_student_projects_status   ON student_projects(status);

-- ---------------------------------------------------------------------------
-- 11. observability_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS observability_logs (
    id               UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id       VARCHAR(255),
    endpoint         VARCHAR(255),
    start_time       TIMESTAMP NOT NULL DEFAULT NOW(),
    end_time         TIMESTAMP,
    total_latency_ms INTEGER,
    components       JSONB,
    status_code      INTEGER,
    error_message    TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_observability_logs_request_id ON observability_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_observability_logs_created_at ON observability_logs(created_at DESC);

-- ---------------------------------------------------------------------------
-- 12. sync_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_logs (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id     VARCHAR(255),
    session_id    UUID         REFERENCES learning_sessions(id) ON DELETE SET NULL,
    operation     VARCHAR(50),
    entity_type   VARCHAR(100),
    entity_id     VARCHAR(255),
    data          JSONB,
    is_synced     BOOLEAN      NOT NULL DEFAULT FALSE,
    sync_attempts INTEGER      NOT NULL DEFAULT 0,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    synced_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_device_id  ON sync_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_is_synced  ON sync_logs(is_synced);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at DESC);

-- ---------------------------------------------------------------------------
-- 13. Phase 6: evidence_captures
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidence_captures (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID        NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    student_id          UUID        NOT NULL REFERENCES users(id)             ON DELETE CASCADE,
    activity_id         UUID        NOT NULL REFERENCES activities(id)        ON DELETE CASCADE,
    capture_type        VARCHAR(50) NOT NULL
                            CHECK (capture_type IN ('photo','video','audio','text','sketch','measurement')),
    title               VARCHAR(255),
    description         TEXT,
    file_url            TEXT,
    file_size_bytes     INTEGER,
    duration_seconds    INTEGER,
    transcription       TEXT,
    learning_objectives JSONB       NOT NULL DEFAULT '[]'::jsonb,
    competencies        JSONB       NOT NULL DEFAULT '[]'::jsonb,
    location_latitude   FLOAT,
    location_longitude  FLOAT,
    ai_analysis         JSONB,
    device_metadata     JSONB,
    created_at          TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_captures_session_id  ON evidence_captures(session_id);
CREATE INDEX IF NOT EXISTS idx_evidence_captures_student_id  ON evidence_captures(student_id);
CREATE INDEX IF NOT EXISTS idx_evidence_captures_activity_id ON evidence_captures(activity_id);
CREATE INDEX IF NOT EXISTS idx_evidence_captures_created_at  ON evidence_captures(created_at DESC);

-- ---------------------------------------------------------------------------
-- 14. Phase 6: notebook_entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notebook_entries (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE INDEX IF NOT EXISTS idx_notebook_entries_session_id  ON notebook_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_notebook_entries_student_id  ON notebook_entries(student_id);
CREATE INDEX IF NOT EXISTS idx_notebook_entries_activity_id ON notebook_entries(activity_id);
CREATE INDEX IF NOT EXISTS idx_notebook_entries_created_at  ON notebook_entries(created_at DESC);

-- ---------------------------------------------------------------------------
-- 15. Phase 6: activity_submissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_submissions (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id        UUID        NOT NULL REFERENCES users(id)             ON DELETE CASCADE,
    activity_id       UUID        NOT NULL REFERENCES activities(id)        ON DELETE CASCADE,
    session_id        UUID        REFERENCES learning_sessions(id)          ON DELETE SET NULL,
    submission_status VARCHAR(50) NOT NULL DEFAULT 'draft'
                          CHECK (submission_status IN ('draft','submitted','graded')),
    compiled_evidence JSONB,
    teacher_feedback  TEXT,
    grade             FLOAT,
    rubric_scores     JSONB,
    submitted_at      TIMESTAMP,
    graded_at         TIMESTAMP,
    created_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP   NOT NULL DEFAULT NOW(),

    -- ── Completion mode tracking ───────────────────────────────────────────
    -- completion_phase: which phase is this submission currently in
    --   'field_work'  — student doing/done field work, not yet reflecting
    --   'reflection'  — field work complete, student writing reflection
    --   'complete'    — all phases done / field_only activity
    completion_phase       VARCHAR(20) NOT NULL DEFAULT 'complete',

    -- field_phase_status: mirrors review flow but for the field work phase only
    --   'not_applicable' — field_only activity
    --   'in_progress'    — student doing field work
    --   'submitted'      — field work done; awaiting teacher review (gated) or ready for reflection
    --   'reviewed'       — teacher left comments, student can proceed (ungated)
    --   'approved'       — teacher explicitly unlocked reflection (gated)
    --   'rejected'       — teacher sent back for more field work
    field_phase_status     VARCHAR(30) NOT NULL DEFAULT 'not_applicable',
    field_phase_feedback   TEXT,
    field_phase_reviewed_at TIMESTAMP,

    -- reflection_status: tracks the reflection phase
    --   'not_applicable' — field_only activity
    --   'not_started'    — field work done, reflection not begun
    --   'in_progress'    — student is writing
    --   'submitted'      — submitted for final teacher review
    reflection_status      VARCHAR(20) NOT NULL DEFAULT 'not_applicable',
    reflection_content     JSONB,
    linked_field_note_id   UUID        -- FK added below after student_field_notes is created
);

CREATE INDEX IF NOT EXISTS idx_activity_submissions_student_id  ON activity_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_activity_submissions_activity_id ON activity_submissions(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_submissions_status      ON activity_submissions(submission_status);

-- ===========================================================================
-- Demo seed data REMOVED (2026-07-05).
-- The @example.com demo users/orgs/classroom/homeschool sample data used to
-- be seeded here UNCONDITIONALLY — meaning every fresh database, including
-- production, got accounts with the published password SecurePass123!.
-- Demo accounts are now seeded ONLY by backend startup (main.py) when
-- ENVIRONMENT=development. This file is schema + reference data only.
-- ===========================================================================

-- ===========================================================================
-- Phase 5 / 6 / 7 tables — appended to complete the schema
-- All statements are idempotent (IF NOT EXISTS).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- New enums (Phase 5-7)
-- ---------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE capture_type_enum AS ENUM ('photo','video','audio','sketch','text','document'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE competency_status_enum AS ENUM ('not_started','in_progress','achieved','exceeds'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE privacy_framework_enum AS ENUM ('gdpr_eu','coppa_us','ccpa_california','pipeda_canada','lgpd_brazil','pdpa_singapore'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE field_note_status_enum AS ENUM ('draft','complete','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE self_project_status_enum AS ENUM ('personal','submitted_for_review','published'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE peer_project_status_enum AS ENUM ('draft','pending_approval','published','closed','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE peer_project_audience_enum AS ENUM ('whole_class','selected_students'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE peer_project_response_status_enum AS ENUM ('assigned','in_progress','submitted','reviewed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(255),
    message    TEXT,
    is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- ---------------------------------------------------------------------------
-- email_preferences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_preferences (
    id                       UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                  UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receive_notifications    BOOLEAN   NOT NULL DEFAULT TRUE,
    receive_progress_updates BOOLEAN   NOT NULL DEFAULT TRUE,
    receive_announcements    BOOLEAN   NOT NULL DEFAULT TRUE,
    created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_prefs_user_id ON email_preferences(user_id);

-- ---------------------------------------------------------------------------
-- student_captures
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_captures (
    id                    UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id            UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id           UUID              REFERENCES activities(id) ON DELETE SET NULL,
    session_id            UUID              REFERENCES learning_sessions(id) ON DELETE SET NULL,
    capture_type          capture_type_enum NOT NULL,
    file_path             VARCHAR(512),
    file_size_bytes       INTEGER,
    mime_type             VARCHAR(100),
    captured_at           TIMESTAMP         NOT NULL DEFAULT NOW(),
    location_latitude     FLOAT,
    location_longitude    FLOAT,
    transcript            TEXT,
    transcript_confidence FLOAT,
    transcript_language   VARCHAR(10),
    duration_seconds      INTEGER,
    dimensions            VARCHAR(20),
    description           TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_captures_student   ON student_captures(student_id);
CREATE INDEX IF NOT EXISTS idx_student_captures_activity  ON student_captures(activity_id);
CREATE INDEX IF NOT EXISTS idx_student_captures_captured  ON student_captures(captured_at);

-- ---------------------------------------------------------------------------
-- student_notebooks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_notebooks (
    id               UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id       UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id      UUID      REFERENCES activities(id) ON DELETE SET NULL,
    where_notes      TEXT,
    why_notes        TEXT,
    how_notes        TEXT,
    learning_insights TEXT,
    next_steps       TEXT,
    rubric_scores    JSONB,
    is_submitted     BOOLEAN   NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    submitted_at     TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_student_notebooks_student  ON student_notebooks(student_id);
CREATE INDEX IF NOT EXISTS idx_student_notebooks_activity ON student_notebooks(activity_id);

-- ---------------------------------------------------------------------------
-- capture_annotations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS capture_annotations (
    id               UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    capture_id       UUID      NOT NULL REFERENCES student_captures(id) ON DELETE CASCADE,
    teacher_id       UUID      REFERENCES users(id) ON DELETE SET NULL,
    annotation_type  VARCHAR(50),
    linked_objective VARCHAR(255),
    linked_concept   VARCHAR(255),
    explanation      TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_capture_annotations_capture ON capture_annotations(capture_id);

-- ---------------------------------------------------------------------------
-- notebook_capture_links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notebook_capture_links (
    id          UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    notebook_id UUID      NOT NULL REFERENCES student_notebooks(id) ON DELETE CASCADE,
    capture_id  UUID      NOT NULL REFERENCES student_captures(id)  ON DELETE CASCADE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notebook_capture_links_nb  ON notebook_capture_links(notebook_id);
CREATE INDEX IF NOT EXISTS idx_notebook_capture_links_cap ON notebook_capture_links(capture_id);

-- ---------------------------------------------------------------------------
-- notebook_feedback
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notebook_feedback (
    id          UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    notebook_id UUID      NOT NULL REFERENCES student_notebooks(id) ON DELETE CASCADE,
    teacher_id  UUID      REFERENCES users(id) ON DELETE SET NULL,
    comment     TEXT      NOT NULL,
    is_positive BOOLEAN   NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notebook_feedback_nb ON notebook_feedback(notebook_id);

-- ---------------------------------------------------------------------------
-- student_competencies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_competencies (
    id              UUID                   PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id      UUID                   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id     UUID                   REFERENCES activities(id) ON DELETE SET NULL,
    competency_name VARCHAR(255)           NOT NULL,
    bloom_level     INTEGER,
    score           FLOAT,
    status          competency_status_enum NOT NULL DEFAULT 'not_started',
    assessed_at     TIMESTAMP              NOT NULL DEFAULT NOW(),
    assessed_by_id  UUID                   REFERENCES users(id) ON DELETE SET NULL,
    notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_competencies_student ON student_competencies(student_id);

-- ---------------------------------------------------------------------------
-- cached_locations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cached_locations (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    latitude        FLOAT        NOT NULL,
    longitude       FLOAT        NOT NULL,
    radius_meters   INTEGER      NOT NULL DEFAULT 100,
    search_query    VARCHAR(512),
    raw_result      JSONB,
    source_backend  VARCHAR(50),
    country_code    VARCHAR(2),
    is_enriched     BOOLEAN      NOT NULL DEFAULT FALSE,
    last_updated    TIMESTAMP    NOT NULL DEFAULT NOW(),
    last_used       TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- enriched_locations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enriched_locations (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    cached_location_id  UUID         REFERENCES cached_locations(id) ON DELETE SET NULL,
    place_name          VARCHAR(512),
    place_type          VARCHAR(100),
    country             VARCHAR(100),
    region              VARCHAR(100),
    locality            VARCHAR(255),
    enrichment_data     JSONB,
    wikidata_id         VARCHAR(50),
    wikipedia_summary   TEXT,
    educational_context TEXT,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- location_search_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS location_search_history (
    id             UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID      REFERENCES users(id) ON DELETE SET NULL,
    search_query   VARCHAR(512),
    latitude       FLOAT,
    longitude      FLOAT,
    result_count   INTEGER   DEFAULT 0,
    searched_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- popular_destinations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS popular_destinations (
    id                 UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    cached_location_id UUID         REFERENCES cached_locations(id) ON DELETE CASCADE,
    visit_count        INTEGER      NOT NULL DEFAULT 1,
    last_visited       TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- location_enrichment_queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS location_enrichment_queue (
    id                 UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    cached_location_id UUID      UNIQUE REFERENCES cached_locations(id) ON DELETE CASCADE,
    priority           INTEGER   NOT NULL DEFAULT 0,
    search_count       INTEGER   NOT NULL DEFAULT 1,
    status             VARCHAR(50) NOT NULL DEFAULT 'pending',
    attempts           INTEGER   NOT NULL DEFAULT 0,
    max_attempts       INTEGER   NOT NULL DEFAULT 3,
    last_error         TEXT,
    created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    scheduled_for      TIMESTAMP NOT NULL DEFAULT NOW(),
    processed_at       TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_enrich_queue_status    ON location_enrichment_queue(status);
CREATE INDEX IF NOT EXISTS idx_enrich_queue_scheduled ON location_enrichment_queue(scheduled_for);

-- ---------------------------------------------------------------------------
-- activity_locations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_locations (
    activity_id        UUID      NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    cached_location_id UUID      NOT NULL REFERENCES cached_locations(id) ON DELETE CASCADE,
    selected_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    lesson_generated   BOOLEAN   NOT NULL DEFAULT FALSE,
    PRIMARY KEY (activity_id, cached_location_id)
);

-- ---------------------------------------------------------------------------
-- compliance_checks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compliance_checks (
    id                 UUID                   PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id        UUID                   REFERENCES activities(id) ON DELETE SET NULL,
    jurisdiction_id    VARCHAR(100),
    framework          privacy_framework_enum,
    student_age        INTEGER,
    is_compliant       BOOLEAN                NOT NULL DEFAULT FALSE,
    issues             TEXT[],
    warnings           TEXT[],
    required_actions   JSONB                  DEFAULT '{}'::jsonb,
    data_collection    TEXT[],
    third_parties      TEXT[],
    activity_purpose   VARCHAR(255),
    checked_by_user_id UUID                   REFERENCES users(id) ON DELETE SET NULL,
    timestamp          TIMESTAMP              NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_activity ON compliance_checks(activity_id);

-- ---------------------------------------------------------------------------
-- consent_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consent_logs (
    id               UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id       UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id      UUID      REFERENCES activities(id) ON DELETE SET NULL,
    consent_type     VARCHAR(50),
    data_categories  TEXT[],
    purpose          VARCHAR(255),
    jurisdiction_id  VARCHAR(100),
    given_by_student BOOLEAN   NOT NULL DEFAULT FALSE,
    given_by_parent  BOOLEAN   NOT NULL DEFAULT FALSE,
    parent_id        UUID      REFERENCES users(id) ON DELETE SET NULL,
    consent_given_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMP,
    withdrawn_at     TIMESTAMP,
    ip_address       VARCHAR(45),
    user_agent       VARCHAR(512)
);
CREATE INDEX IF NOT EXISTS idx_consent_logs_student  ON consent_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_consent_logs_activity ON consent_logs(activity_id);

-- ---------------------------------------------------------------------------
-- data_retention_policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_retention_policies (
    id                     UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id            UUID      REFERENCES activities(id) ON DELETE SET NULL,
    jurisdiction_id        VARCHAR(100),
    data_category          VARCHAR(100),
    retention_days         INTEGER   NOT NULL,
    purpose                VARCHAR(255),
    deletion_method        VARCHAR(50),
    can_archive            BOOLEAN   NOT NULL DEFAULT FALSE,
    archive_duration_days  INTEGER,
    effective_date         TIMESTAMP NOT NULL DEFAULT NOW(),
    deletion_scheduled_for TIMESTAMP,
    deletion_completed_at  TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_retention_activity ON data_retention_policies(activity_id);

-- ---------------------------------------------------------------------------
-- privacy_configurations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS privacy_configurations (
    id                UUID                   PRIMARY KEY DEFAULT uuid_generate_v4(),
    jurisdiction_id   VARCHAR(100)           NOT NULL UNIQUE,
    jurisdiction_name VARCHAR(255),
    framework         privacy_framework_enum,
    country_code      VARCHAR(2),
    subdivision_code  VARCHAR(10),
    config_json       JSONB                  NOT NULL DEFAULT '{}'::jsonb,
    version           VARCHAR(20),
    effective_date    TIMESTAMP              NOT NULL,
    sunset_date       TIMESTAMP,
    source_url        VARCHAR(512),
    auto_discovered   BOOLEAN                NOT NULL DEFAULT FALSE,
    loaded_at         TIMESTAMP              NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP              NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_privacy_config_jurisdiction ON privacy_configurations(jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_privacy_config_country      ON privacy_configurations(country_code);

-- ---------------------------------------------------------------------------
-- classes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classes (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    grade_level INTEGER,
    school_year VARCHAR(20),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);

-- ---------------------------------------------------------------------------
-- student_self_projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_self_projects (
    id              UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id      UUID                    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(255)            NOT NULL,
    description     TEXT,
    cover_image_url VARCHAR(500),
    status          self_project_status_enum NOT NULL DEFAULT 'personal',
    created_at      TIMESTAMP               NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP               NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_self_projects_student ON student_self_projects(student_id);

-- ---------------------------------------------------------------------------
-- student_field_notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_field_notes (
    id              UUID                   PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id      UUID                   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    self_project_id UUID                   REFERENCES student_self_projects(id) ON DELETE SET NULL,
    title           VARCHAR(255)           NOT NULL,
    description     TEXT,
    status          field_note_status_enum NOT NULL DEFAULT 'draft',
    location_latitude  FLOAT,
    location_longitude FLOAT,
    location_name      VARCHAR(255),
    created_at      TIMESTAMP              NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP              NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_field_notes_student ON student_field_notes(student_id);

-- FK deferred from activity_submissions (student_field_notes wasn't created yet)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_activity_submissions_field_note'
          AND table_name      = 'activity_submissions'
    ) THEN
        ALTER TABLE activity_submissions
            ADD CONSTRAINT fk_activity_submissions_field_note
            FOREIGN KEY (linked_field_note_id)
            REFERENCES student_field_notes(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- student_field_note_captures
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_field_note_captures (
    id            UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_note_id UUID      NOT NULL REFERENCES student_field_notes(id) ON DELETE CASCADE,
    capture_id    UUID      NOT NULL REFERENCES student_captures(id)   ON DELETE CASCADE,
    order_index   INTEGER   NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fnc_field_note ON student_field_note_captures(field_note_id);

-- ---------------------------------------------------------------------------
-- student_peer_projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_peer_projects (
    id                   UUID                       PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_student_id    UUID                       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id             UUID                       NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    title                VARCHAR(255)               NOT NULL,
    description          TEXT                       NOT NULL,
    learning_objectives_text JSONB                  NOT NULL DEFAULT '[]'::jsonb,
    guiding_prompts      JSONB                      NOT NULL DEFAULT '[]'::jsonb,
    curriculum_objective_ids UUID[],
    allowed_capture_types    TEXT[],
    audience             peer_project_audience_enum NOT NULL DEFAULT 'whole_class',
    target_student_ids   UUID[],
    status               peer_project_status_enum   NOT NULL DEFAULT 'draft',
    approval_required    BOOLEAN                    NOT NULL DEFAULT TRUE,
    approved_by_teacher_id UUID                     REFERENCES users(id) ON DELETE SET NULL,
    approved_at          TIMESTAMP,
    teacher_feedback     TEXT,
    published_at         TIMESTAMP,
    author_can_see_individual_responses BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMP                  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP                  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_peer_projects_author  ON student_peer_projects(author_student_id);
CREATE INDEX IF NOT EXISTS idx_peer_projects_class   ON student_peer_projects(class_id);
CREATE INDEX IF NOT EXISTS idx_peer_projects_status  ON student_peer_projects(status);

-- ---------------------------------------------------------------------------
-- peer_project_example_captures
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS peer_project_example_captures (
    id              UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    peer_project_id UUID      NOT NULL REFERENCES student_peer_projects(id) ON DELETE CASCADE,
    capture_id      UUID      NOT NULL REFERENCES student_captures(id)      ON DELETE CASCADE,
    caption         TEXT,
    order_index     INTEGER   NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pp_example_captures_project ON peer_project_example_captures(peer_project_id);

-- ---------------------------------------------------------------------------
-- peer_project_responses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS peer_project_responses (
    id                UUID                            PRIMARY KEY DEFAULT uuid_generate_v4(),
    peer_project_id   UUID                            NOT NULL REFERENCES student_peer_projects(id) ON DELETE CASCADE,
    student_id        UUID                            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status            peer_project_response_status_enum NOT NULL DEFAULT 'assigned',
    notebook_entry_id UUID                            REFERENCES student_notebooks(id) ON DELETE SET NULL,
    completed_at      TIMESTAMP,
    created_at        TIMESTAMP                       NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP                       NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pp_responses_project ON peer_project_responses(peer_project_id);
CREATE INDEX IF NOT EXISTS idx_pp_responses_student ON peer_project_responses(student_id);

-- ---------------------------------------------------------------------------
-- peer_project_response_captures
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS peer_project_response_captures (
    id          UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    response_id UUID      NOT NULL REFERENCES peer_project_responses(id) ON DELETE CASCADE,
    capture_id  UUID      NOT NULL REFERENCES student_captures(id)       ON DELETE CASCADE,
    order_index INTEGER   NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pp_response_captures_resp ON peer_project_response_captures(response_id);

-- ---------------------------------------------------------------------------
-- class_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_settings (
    id                                          UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id                                    UUID      NOT NULL UNIQUE REFERENCES classes(id) ON DELETE CASCADE,
    peer_project_approval_mode                  VARCHAR(20) NOT NULL DEFAULT 'teacher_gate',
    peer_project_author_sees_individual_responses BOOLEAN NOT NULL DEFAULT FALSE,
    students_can_create_peer_projects           BOOLEAN   NOT NULL DEFAULT TRUE,
    students_can_create_field_notes             BOOLEAN   NOT NULL DEFAULT TRUE,
    updated_at                                  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- admin_users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    username      VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(50)  NOT NULL DEFAULT 'admin',
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login    TIMESTAMP,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);

-- ---------------------------------------------------------------------------
-- admin_audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id         UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id   UUID      REFERENCES admin_users(id) ON DELETE SET NULL,
    action     VARCHAR(200) NOT NULL,
    resource   VARCHAR(200),
    details    JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    success    BOOLEAN   NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin    ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created  ON admin_audit_logs(created_at);

-- ---------------------------------------------------------------------------
-- admin_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_sessions (
    id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id   UUID         NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP    NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin  ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token  ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);

-- ---------------------------------------------------------------------------
-- standards_sets
-- ---------------------------------------------------------------------------
-- Stores both teacher-created rubric standards and homeschool state-reporting
-- requirements.  criteria is a JSONB array of {id, code, description, subject}
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS standards_sets (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(255) NOT NULL,
    description         TEXT,
    -- type values:
    --   'state_standards'  — official academic standards (TEKS, NGSS, etc.)
    --                        shared globally; uploaded once per state by admin/teacher
    --   'state_reporting'  — homeschool annual reporting requirements (vary by state)
    --                        personal to a homeschool parent, or global if admin uploads
    --   'rubric'           — teacher-created assessment rubric
    --   'custom'           — any other custom criteria set
    type                VARCHAR(50)  NOT NULL,
    owner_id            UUID         REFERENCES users(id) ON DELETE SET NULL,
    state_code          VARCHAR(10),
    is_global           BOOLEAN      NOT NULL DEFAULT FALSE,
    source_file         VARCHAR(512),
    -- SHA-256 hex digest of the uploaded source file.
    -- On re-upload, if checksum matches the stored value the Ollama extraction
    -- step is skipped and the cached criteria are returned immediately.
    source_checksum     VARCHAR(64),
    -- Ollama extraction lifecycle
    -- 'pending'    — file uploaded, extraction queued
    -- 'processing' — Ollama is running
    -- 'complete'   — criteria extracted and cached in criteria JSONB
    -- 'failed'     — extraction failed; criteria may be empty
    processing_status   VARCHAR(20)  NOT NULL DEFAULT 'complete',
    last_processed_at   TIMESTAMP,
    -- Academic validity window.
    -- state_standards  → defaults to July 31 of the current school year
    -- state_reporting  → defaults to December 31 of the current calendar year
    -- rubric/custom    → NULL (no expiry)
    -- When NOW() > valid_until the set is considered stale; the UI prompts
    -- the owner to re-verify or re-upload.
    valid_until         DATE,
    criteria            JSONB        NOT NULL DEFAULT '[]',
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_standards_sets_owner  ON standards_sets(owner_id);
CREATE INDEX IF NOT EXISTS idx_standards_sets_type   ON standards_sets(type);

-- ---------------------------------------------------------------------------
-- activity_standards_map
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_standards_map (
    id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id      UUID         NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    standards_set_id UUID         NOT NULL REFERENCES standards_sets(id) ON DELETE CASCADE,
    criterion_id     VARCHAR(100) NOT NULL,
    coverage_level   VARCHAR(50)  DEFAULT 'partial',
    notes            TEXT,
    mapped_by        UUID         REFERENCES users(id) ON DELETE SET NULL,
    ai_suggested     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_activity_standards_criterion
        UNIQUE (activity_id, standards_set_id, criterion_id)
);
CREATE INDEX IF NOT EXISTS idx_asm_activity   ON activity_standards_map(activity_id);
CREATE INDEX IF NOT EXISTS idx_asm_standards  ON activity_standards_map(standards_set_id);

-- ---------------------------------------------------------------------------
-- homeschool_children
-- ---------------------------------------------------------------------------
-- Links a HOMESCHOOL-role parent to the child STUDENT accounts they own.
-- Created here for fresh installs; main.py startup DDL also creates it
-- idempotently for existing volumes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS homeschool_children (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    child_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grade_level  INTEGER      DEFAULT 0,
    age_band     VARCHAR(10)  DEFAULT 'k6',
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE(parent_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_hs_children_parent ON homeschool_children(parent_id);
CREATE INDEX IF NOT EXISTS idx_hs_children_child  ON homeschool_children(child_id);

-- ---------------------------------------------------------------------------
-- student_proposals  (Reverse Scavenger Hunt)
-- ---------------------------------------------------------------------------
-- Students propose place-based challenges. Teacher approves → becomes Activity.
-- States: draft → pending → approved | rejected
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_proposals (
    id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title                VARCHAR(255) NOT NULL,
    challenge_description TEXT        NOT NULL,
    location_hint        VARCHAR(500) DEFAULT '',
    subject              VARCHAR(100) DEFAULT 'General',
    note_to_teacher      TEXT         DEFAULT '',
    status               VARCHAR(20)  NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft','pending','approved','rejected')),
    teacher_feedback     TEXT         DEFAULT '',
    approved_activity_id UUID         REFERENCES activities(id) ON DELETE SET NULL,
    created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proposals_student ON student_proposals(student_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status  ON student_proposals(status);

-- ---------------------------------------------------------------------------
-- ai_task_config  (per-task AI provider settings, hot-reloaded by admin UI)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_task_config (
    task_type   VARCHAR(64)  PRIMARY KEY,
    provider    VARCHAR(32)  NOT NULL DEFAULT 'ollama',
    model       VARCHAR(128),
    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by  VARCHAR(128)
);

-- ---------------------------------------------------------------------------
-- ai_api_keys  (encrypted provider API keys stored via Admin UI)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_api_keys (
    provider      VARCHAR(64)  PRIMARY KEY,
    encrypted_key TEXT         NOT NULL,
    model         VARCHAR(128),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by    VARCHAR(128)
);

-- ---------------------------------------------------------------------------
-- ai_batch_queue  (items queued for Anthropic Batch API processing)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_batch_queue (
    id                   SERIAL       PRIMARY KEY,
    task_type            VARCHAR(64)  NOT NULL,
    entity_type          VARCHAR(64)  NOT NULL,
    entity_id            VARCHAR(64)  NOT NULL,
    prompt               TEXT         NOT NULL,
    status               VARCHAR(32)  NOT NULL DEFAULT 'pending',
    anthropic_batch_id   VARCHAR(128),
    anthropic_request_id VARCHAR(128),
    result               JSONB,
    error_message        TEXT,
    fallback_used        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    submitted_at         TIMESTAMP,
    processed_at         TIMESTAMP,
    notified             BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS ix_ai_batch_queue_status    ON ai_batch_queue(status);
CREATE INDEX IF NOT EXISTS ix_ai_batch_queue_entity_id ON ai_batch_queue(entity_id);
CREATE INDEX IF NOT EXISTS ix_ai_batch_queue_batch_id  ON ai_batch_queue(anthropic_batch_id);

-- ---------------------------------------------------------------------------
-- platform_audit_log  (immutable audit trail for platform-admin actions:
-- org suspend/reinstate, impersonation, AI key changes, maintenance toggles.
-- Written by routes/platform_admin.py::_audit. Added 2026-07-05 — previously
-- only created by an alembic migration, which init.sql-based installs never ran.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID NOT NULL,
    action      VARCHAR(80) NOT NULL,
    target_type VARCHAR(40),
    target_id   VARCHAR(80),
    detail      JSONB,
    ip_address  VARCHAR(45),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor_created ON platform_audit_log (actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_target        ON platform_audit_log (target_type, target_id);

-- ---------------------------------------------------------------------------
-- org_api_keys  (BYOK: per-org encrypted provider keys; read fail-open by
-- services/ai_router.py::_get_org_key. Added 2026-07-05, same reason as above.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_api_keys (
    org_id        UUID NOT NULL,
    provider      VARCHAR(64) NOT NULL,
    encrypted_key TEXT NOT NULL,
    model         VARCHAR(128),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (org_id, provider)
);

-- ---------------------------------------------------------------------------
-- platform_ai_budgets  (per-org monthly AI spend cap, used for monitoring only
-- — this is an internal alert threshold, not a customer billing/invoicing
-- record; see backend/services/ai_router.py::_budget_check and
-- backend/tasks/budget_monitor.py)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_ai_budgets (
    org_id               UUID         PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    monthly_dollar_cap   NUMERIC(10,4) NOT NULL DEFAULT 5.00,
    alert_threshold_pct  INTEGER      NOT NULL DEFAULT 80,
    created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- platform_ai_ledger  (one row per AI call — token usage + internal cost
-- estimate for monitoring/alerting; org_id/user_id nullable for
-- platform/system calls)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_ai_ledger (
    id          BIGSERIAL    PRIMARY KEY,
    org_id      UUID         REFERENCES organizations(id) ON DELETE SET NULL,
    user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
    task_type   VARCHAR(64),
    provider    VARCHAR(32),
    model       VARCHAR(128),
    tokens_in   INTEGER      NOT NULL DEFAULT 0,
    tokens_out  INTEGER      NOT NULL DEFAULT 0,
    cost_usd    NUMERIC(12,6) NOT NULL DEFAULT 0,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_platform_ai_ledger_org_created
    ON platform_ai_ledger(org_id, created_at);
CREATE INDEX IF NOT EXISTS ix_platform_ai_ledger_created
    ON platform_ai_ledger(created_at);

-- ---------------------------------------------------------------------------
-- teacher_notifications  (in-app notifications, used for batch result alerts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teacher_notifications (
    id         SERIAL       PRIMARY KEY,
    teacher_id VARCHAR(64)  NOT NULL,
    type       VARCHAR(64)  NOT NULL,
    payload    JSONB,
    is_read    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_teacher_notif_teacher_unread
    ON teacher_notifications(teacher_id, is_read);

-- ===========================================================================
-- Verification
-- ===========================================================================
SELECT '✅ Database initialization complete!' AS status;

SELECT tablename
FROM   pg_tables
WHERE  schemaname = 'public'
ORDER  BY tablename;

SELECT email, role, is_active FROM users WHERE email LIKE '%example.com' ORDER BY role;
