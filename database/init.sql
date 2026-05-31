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
CREATE TABLE IF NOT EXISTS users (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    username        VARCHAR(255) NOT NULL UNIQUE,
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    full_name       VARCHAR(255),
    hashed_password VARCHAR(255) NOT NULL,
    role            VARCHAR(50)  NOT NULL DEFAULT 'STUDENT'
                        CHECK (role IN ('STUDENT', 'TEACHER', 'PARENT', 'ADMIN')),
    avatar_url      VARCHAR(512),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    age_group       VARCHAR(20)  NULL,
    requires_parental_consent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);

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
    proposed_by_student_id     UUID         REFERENCES users(id) ON DELETE SET NULL
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
    updated_at        TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_submissions_student_id  ON activity_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_activity_submissions_activity_id ON activity_submissions(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_submissions_status      ON activity_submissions(submission_status);

-- ---------------------------------------------------------------------------
-- Demo seed data
-- Password for all users: SecurePassword123
-- Hash: $2b$12$5TniPxM.qx2B6jRaywxNv.Z4C/XFkj9H4RKkhwH53N5rFVRg.Gls. (verified bcrypt)
-- ---------------------------------------------------------------------------
INSERT INTO users (email, username, first_name, last_name, full_name, hashed_password, role, is_active)
VALUES
    ('student@example.com',    'student',    'Alex',     'Johnson', 'Alex Johnson',          '$2b$12$5TniPxM.qx2B6jRaywxNv.Z4C/XFkj9H4RKkhwH53N5rFVRg.Gls.', 'STUDENT',    TRUE),
    ('teacher@example.com',    'teacher',    'Jane',     'Smith',   'Jane Smith',            '$2b$12$5TniPxM.qx2B6jRaywxNv.Z4C/XFkj9H4RKkhwH53N5rFVRg.Gls.', 'TEACHER',    TRUE),
    ('parent@example.com',     'parent',     'Margaret', 'Brown',   'Margaret Brown',        '$2b$12$5TniPxM.qx2B6jRaywxNv.Z4C/XFkj9H4RKkhwH53N5rFVRg.Gls.', 'PARENT',     TRUE),
    ('admin@example.com',      'admin',      'Paul',     'Admin',   'Paul Christopher Cerda','$2b$12$5TniPxM.qx2B6jRaywxNv.Z4C/XFkj9H4RKkhwH53N5rFVRg.Gls.', 'ADMIN',      TRUE),
    ('homeschool@example.com', 'homeschool', 'Sarah',    'Rivera',  'Sarah Rivera',          '$2b$12$5TniPxM.qx2B6jRaywxNv.Z4C/XFkj9H4RKkhwH53N5rFVRg.Gls.', 'HOMESCHOOL', TRUE),
    ('child1@example.com',     'emma_r',     'Emma',     'Rivera',  'Emma Rivera',           '$2b$12$5TniPxM.qx2B6jRaywxNv.Z4C/XFkj9H4RKkhwH53N5rFVRg.Gls.', 'STUDENT',    TRUE),
    ('child2@example.com',     'lucas_r',    'Lucas',    'Rivera',  'Lucas Rivera',          '$2b$12$5TniPxM.qx2B6jRaywxNv.Z4C/XFkj9H4RKkhwH53N5rFVRg.Gls.', 'STUDENT',    TRUE)
ON CONFLICT (email) DO NOTHING;

-- Link homeschool children to their parent
INSERT INTO homeschool_children (id, parent_id, child_id, grade_level, age_band)
SELECT uuid_generate_v4(), p.id, c.id, grade, band
FROM (SELECT id FROM users WHERE email = 'homeschool@example.com') p,
     (VALUES
       ('child1@example.com', 4, 'k6'),
       ('child2@example.com', 7, 'm712')
     ) AS kids(email, grade, band)
JOIN users c ON c.email = kids.email
ON CONFLICT (parent_id, child_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Homeschool demo seed — activities, state standards, mappings, sessions
-- Seeded for Sarah Rivera (homeschool@example.com) and her children:
--   Emma Rivera  (child1@example.com, grade 4, K–6)
--   Lucas Rivera (child2@example.com, grade 7, 7–12)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_hs       UUID;  -- Sarah Rivera (homeschool parent)
  v_emma     UUID;  -- Emma Rivera  (grade 4)
  v_lucas    UUID;  -- Lucas Rivera (grade 7)
  v_std_set  UUID := uuid_generate_v4();  -- standards set

  -- Activity IDs
  v_a1 UUID := uuid_generate_v4();  -- Creek Habitat Study       (gr 4 Science)
  v_a2 UUID := uuid_generate_v4();  -- Map Your Neighborhood     (gr 4 Geography)
  v_a3 UUID := uuid_generate_v4();  -- Local History Walk        (gr 4 Social Studies)
  v_a4 UUID := uuid_generate_v4();  -- Native Plant Journal      (gr 7 Science)
  v_a5 UUID := uuid_generate_v4();  -- Weather Station Setup     (gr 7 Earth Science)
  v_a6 UUID := uuid_generate_v4();  -- Farmers Market Maths      (gr 7 Math)
BEGIN
  SELECT id INTO v_hs    FROM users WHERE email = 'homeschool@example.com' LIMIT 1;
  SELECT id INTO v_emma  FROM users WHERE email = 'child1@example.com'     LIMIT 1;
  SELECT id INTO v_lucas FROM users WHERE email = 'child2@example.com'     LIMIT 1;

  IF v_hs IS NULL THEN RETURN; END IF;

  -- ── Activities ──────────────────────────────────────────────────────────
  INSERT INTO activities (
    id, teacher_id, title, description, subject, grade_level,
    activity_type, difficulty_level, estimated_duration_minutes,
    bloom_level, assessment_type, status, is_active,
    location_name, created_at, updated_at
  ) VALUES
    (v_a1, v_hs,
     'Creek Habitat Study',
     'Visit a local creek or drainage channel. Sketch the habitat and identify at least 5 organisms — insects, plants, birds, or fish. Use a field guide or photo ID app. Record water clarity, flow rate (fast/slow), and any signs of pollution.',
     'Science', 4, 'discovery', 2, 75, 'analyze', 'observation', 'published', TRUE,
     'Local creek or drainage channel', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),

    (v_a2, v_hs,
     'Map Your Neighborhood',
     'Walk a 6-block radius of your home with a blank sheet of paper. Draw a sketch map including streets, landmarks, green spaces, and points of interest. Use cardinal directions and add a legend. Compare your map to a digital map — what did you include that Google Maps misses?',
     'Geography', 4, 'inquiry', 2, 60, 'create', 'portfolio', 'published', TRUE,
     'Home neighbourhood', NOW() - INTERVAL '38 days', NOW() - INTERVAL '38 days'),

    (v_a3, v_hs,
     'Local History Walk',
     'Find 3 historical markers, plaques, or buildings within 2 km of home. Photograph each and research the story behind it. Write 2–3 sentences per site explaining why it was significant. Discuss: how has the area changed since then?',
     'Social Studies', 4, 'discovery', 2, 90, 'evaluate', 'portfolio', 'published', TRUE,
     'Local downtown or neighbourhood', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'),

    (v_a4, v_hs,
     'Native Plant Journal',
     'Over two weeks, photograph and document 8 native plants in your area. For each entry record: common name, scientific name, leaf shape, habitat, and one ecological role (e.g. food source, erosion control). Sketch at least 3 in detail.',
     'Science', 7, 'inquiry', 3, 120, 'analyze', 'portfolio', 'published', TRUE,
     'Local parks and wild spaces', NOW() - INTERVAL '40 days', NOW() - INTERVAL '40 days'),

    (v_a5, v_hs,
     'Weather Station Setup',
     'Build or assemble a basic weather station (thermometer, rain gauge, wind vane). Record temperature, precipitation, and wind direction every day for 14 days. Graph the results and identify one pattern or anomaly. Compare your data to the official forecast — how close were you?',
     'Earth Science', 7, 'inquiry', 3, 30, 'evaluate', 'portfolio', 'published', TRUE,
     'Home or garden', NOW() - INTERVAL '50 days', NOW() - INTERVAL '50 days'),

    (v_a6, v_hs,
     'Farmers Market Mathematics',
     'Visit a local farmers market with a $20 budget. Before buying anything, choose 5 items and calculate the best value-per-unit. Apply a 8.25% sales tax. Track what you actually spent vs. your plan. Calculate the percentage difference between the cheapest and most expensive vendor for the same item.',
     'Mathematics', 7, 'discovery', 3, 90, 'apply', 'observation', 'published', TRUE,
     'Local farmers market', NOW() - INTERVAL '22 days', NOW() - INTERVAL '22 days')
  ON CONFLICT DO NOTHING;

  -- ── State Reporting Standards Set ────────────────────────────────────────
  -- Modelled on a generic US state homeschool annual report requirement.
  INSERT INTO standards_sets (
    id, name, description, type, owner_id, state_code, is_global,
    source_file, source_checksum, processing_status, last_processed_at, valid_until,
    criteria, created_at, updated_at
  ) VALUES (
    v_std_set,
    'Texas Home Education Required Subjects 2025–26',
    'Annual reporting requirements for home-educated students under Texas Education Code §26.003. Students must receive instruction in the required subjects appropriate to their grade level.',
    'state_reporting',
    v_hs,
    'TX',
    FALSE,
    NULL,        -- source_file
    NULL,        -- source_checksum (manually entered, no Ollama processing)
    'complete',  -- processing_status
    NOW(),       -- last_processed_at
    '2026-12-31'::DATE,  -- valid_until (calendar year end for reporting requirements)
    '[
      {"id": "TX-LA",  "code": "TX-LA",  "subject": "Language Arts",       "description": "Reading, writing, spelling, grammar, and oral communication appropriate to grade level"},
      {"id": "TX-MA",  "code": "TX-MA",  "subject": "Mathematics",          "description": "Arithmetic, geometry, algebra readiness, and practical mathematics"},
      {"id": "TX-SCI", "code": "TX-SCI", "subject": "Science",              "description": "Life science, earth science, physical science with hands-on observation and inquiry"},
      {"id": "TX-SS",  "code": "TX-SS",  "subject": "Social Studies",       "description": "Texas history, US history, geography, civics, and economics"},
      {"id": "TX-HE",  "code": "TX-HE",  "subject": "Health Education",     "description": "Personal health, nutrition, safety, and physical fitness"},
      {"id": "TX-FA",  "code": "TX-FA",  "subject": "Fine Arts",            "description": "Visual art, music, theatre, or dance — at least one discipline per year"},
      {"id": "TX-PE",  "code": "TX-PE",  "subject": "Physical Education",   "description": "Regular physical activity and movement education"}
    ]'::jsonb,
    NOW() - INTERVAL '60 days',
    NOW() - INTERVAL '60 days'
  ) ON CONFLICT DO NOTHING;

  -- ── Activity → Standards Mappings ────────────────────────────────────────
  INSERT INTO activity_standards_map
    (id, activity_id, standards_set_id, criterion_id, coverage_level, notes, mapped_by, ai_suggested)
  VALUES
    -- Creek Habitat Study → Science (full) + Language Arts (partial — observation journal)
    (uuid_generate_v4(), v_a1, v_std_set, 'TX-SCI', 'full',
     'Meets life science and earth science observation objectives through habitat identification and organism recording.', v_hs, FALSE),
    (uuid_generate_v4(), v_a1, v_std_set, 'TX-LA',  'partial',
     'Field sketching and written descriptions address descriptive writing strand.', v_hs, TRUE),

    -- Map Your Neighborhood → Social Studies (full) + Math (partial — scale)
    (uuid_generate_v4(), v_a2, v_std_set, 'TX-SS',  'full',
     'Covers geography strand: spatial thinking, cardinal directions, map-making.', v_hs, FALSE),
    (uuid_generate_v4(), v_a2, v_std_set, 'TX-MA',  'partial',
     'Map scale and distance estimation addresses practical mathematics.', v_hs, TRUE),

    -- Local History Walk → Social Studies (full) + Language Arts (partial)
    (uuid_generate_v4(), v_a3, v_std_set, 'TX-SS',  'full',
     'Addresses Texas and US history strands through primary-source sites.', v_hs, FALSE),
    (uuid_generate_v4(), v_a3, v_std_set, 'TX-LA',  'partial',
     'Written site descriptions address informational writing.', v_hs, TRUE),

    -- Native Plant Journal → Science (full) + Language Arts (partial)
    (uuid_generate_v4(), v_a4, v_std_set, 'TX-SCI', 'full',
     'Life science: classification, ecological relationships, scientific naming convention.', v_hs, FALSE),
    (uuid_generate_v4(), v_a4, v_std_set, 'TX-LA',  'partial',
     'Journal entries and sketches address descriptive and scientific writing.', v_hs, TRUE),

    -- Weather Station Setup → Science (full) + Math (partial)
    (uuid_generate_v4(), v_a5, v_std_set, 'TX-SCI', 'full',
     'Earth science strand: meteorology, data collection, pattern analysis.', v_hs, FALSE),
    (uuid_generate_v4(), v_a5, v_std_set, 'TX-MA',  'partial',
     'Graphing temperature and precipitation data addresses data and statistics strand.', v_hs, TRUE),

    -- Farmers Market Maths → Math (full) + Social Studies (partial — economics)
    (uuid_generate_v4(), v_a6, v_std_set, 'TX-MA',  'full',
     'Percentages, unit pricing, tax calculation, and budgeting address practical mathematics.', v_hs, FALSE),
    (uuid_generate_v4(), v_a6, v_std_set, 'TX-SS',  'partial',
     'Producer/consumer economics and market pricing address economics strand.', v_hs, TRUE)
  ON CONFLICT ON CONSTRAINT uq_activity_standards_criterion DO NOTHING;

  -- ── Learning Sessions for Emma (grade 4) ────────────────────────────────
  INSERT INTO learning_sessions
    (id, user_id, activity_id, title, status, location_name, created_at, updated_at, completed_at)
  VALUES
    (uuid_generate_v4(), v_emma, v_a1, 'Creek Habitat Study',
     'completed', 'Barton Creek Greenbelt',
     NOW() - INTERVAL '42 days', NOW() - INTERVAL '42 days', NOW() - INTERVAL '42 days'),

    (uuid_generate_v4(), v_emma, v_a2, 'Map Your Neighborhood',
     'completed', 'Home neighbourhood',
     NOW() - INTERVAL '35 days', NOW() - INTERVAL '35 days', NOW() - INTERVAL '35 days'),

    (uuid_generate_v4(), v_emma, v_a3, 'Local History Walk',
     'in_progress', 'Downtown',
     NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days', NULL)
  ON CONFLICT DO NOTHING;

  -- ── Learning Sessions for Lucas (grade 7) ────────────────────────────────
  INSERT INTO learning_sessions
    (id, user_id, activity_id, title, status, location_name, created_at, updated_at, completed_at)
  VALUES
    (uuid_generate_v4(), v_lucas, v_a4, 'Native Plant Journal — Week 1',
     'completed', 'Zilker Park',
     NOW() - INTERVAL '38 days', NOW() - INTERVAL '31 days', NOW() - INTERVAL '31 days'),

    (uuid_generate_v4(), v_lucas, v_a4, 'Native Plant Journal — Week 2',
     'completed', 'Bull Creek District Park',
     NOW() - INTERVAL '30 days', NOW() - INTERVAL '24 days', NOW() - INTERVAL '24 days'),

    (uuid_generate_v4(), v_lucas, v_a5, 'Weather Station — Week 1',
     'completed', 'Home garden',
     NOW() - INTERVAL '48 days', NOW() - INTERVAL '41 days', NOW() - INTERVAL '41 days'),

    (uuid_generate_v4(), v_lucas, v_a5, 'Weather Station — Week 2',
     'completed', 'Home garden',
     NOW() - INTERVAL '40 days', NOW() - INTERVAL '33 days', NOW() - INTERVAL '33 days'),

    (uuid_generate_v4(), v_lucas, v_a6, 'Farmers Market Mathematics',
     'completed', 'SFC Farmers Market',
     NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days')
  ON CONFLICT DO NOTHING;

END $$;

-- ---------------------------------------------------------------------------
-- Global state reporting requirement sets (15 states, is_global=TRUE)
-- Owned by the admin seed user. All homeschool families in these states share
-- these sets automatically — no upload needed.
-- Source: bluefolder.app/guides/homeschool-records (March 2026)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_admin UUID;
BEGIN
  SELECT id INTO v_admin FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1;
  IF v_admin IS NULL THEN RETURN; END IF;

  -- TEXAS — zero regulation
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE state_code='TX' AND type='state_reporting' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'Texas Homeschool Requirements 2025–26',
      'Texas has no state record-keeping requirements for homeschoolers under Texas Education Code §26.003. Families are not required to notify the district, track attendance, or submit any documentation.',
      'state_reporting',v_admin,'TX',TRUE,NULL,'complete',NOW(),'2026-12-31'::DATE,
      '[{"id":"TX-ATT","code":"TX-ATT","subject":"Attendance","category":"attendance","required":false,"description":"No attendance tracking required by state law. Voluntary tracking recommended.","weight":1.0},{"id":"TX-CUR","code":"TX-CUR","subject":"Curriculum","category":"curriculum","required":false,"description":"No curriculum submission or approval required.","weight":1.0},{"id":"TX-TEST","code":"TX-TEST","subject":"Testing / Evaluation","category":"testing","required":false,"description":"No standardized testing or evaluations required.","weight":1.0},{"id":"TX-PORT","code":"TX-PORT","subject":"Portfolio / Work Samples","category":"portfolio","required":false,"description":"No portfolio required. Recommended for re-enrollment or college applications.","weight":1.0},{"id":"TX-IMMU","code":"TX-IMMU","subject":"Immunization Records","category":"immunization","required":false,"description":"No state immunization record requirement for homeschoolers.","weight":1.0},{"id":"TX-TRAN","code":"TX-TRAN","subject":"Transcripts","category":"transcripts","required":false,"description":"No progress reports required. High school transcripts strongly recommended.","weight":1.0}]'::jsonb,
      NOW(),NOW()
    );
  END IF;

  -- ILLINOIS — minimal (required subjects, no submission)
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE state_code='IL' AND type='state_reporting' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'Illinois Homeschool Requirements 2025–26',
      'Illinois requires specific subjects to be taught but no notifications, registration, or submissions to the district.',
      'state_reporting',v_admin,'IL',TRUE,NULL,'complete',NOW(),'2026-12-31'::DATE,
      '[{"id":"IL-ATT","code":"IL-ATT","subject":"Attendance","category":"attendance","required":false,"description":"No attendance record requirement.","weight":1.0},{"id":"IL-CUR","code":"IL-CUR","subject":"Required Subjects","category":"curriculum","required":true,"description":"Must teach: language arts, math, biological/physical science, social sciences, fine arts, and physical development. No submission required.","weight":1.0},{"id":"IL-TEST","code":"IL-TEST","subject":"Testing / Evaluation","category":"testing","required":false,"description":"No standardized testing required.","weight":1.0},{"id":"IL-PORT","code":"IL-PORT","subject":"Portfolio","category":"portfolio","required":false,"description":"No portfolio required.","weight":1.0},{"id":"IL-IMMU","code":"IL-IMMU","subject":"Immunization Records","category":"immunization","required":false,"description":"No immunization requirement for homeschoolers.","weight":1.0},{"id":"IL-TRAN","code":"IL-TRAN","subject":"Transcripts","category":"transcripts","required":false,"description":"No progress reports required.","weight":1.0}]'::jsonb,
      NOW(),NOW()
    );
  END IF;

  -- CALIFORNIA — PSA annual filing
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE state_code='CA' AND type='state_reporting' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'California Homeschool Requirements 2025–26',
      'California homeschool families typically operate as a private school (PSA filing). File annually Oct 1–15.',
      'state_reporting',v_admin,'CA',TRUE,NULL,'complete',NOW(),'2026-12-31'::DATE,
      '[{"id":"CA-ATT","code":"CA-ATT","subject":"Attendance","category":"attendance","required":true,"description":"Maintain attendance register. Equivalent to 175 days recommended.","weight":1.0},{"id":"CA-CUR","code":"CA-CUR","subject":"PSA Filing + Subjects","category":"curriculum","required":true,"description":"File annual Private School Affidavit (PSA) between Oct 1–15. Must teach: English, math, social sciences, science, fine arts, health, PE.","weight":1.0},{"id":"CA-TEST","code":"CA-TEST","subject":"Testing","category":"testing","required":false,"description":"No standardized testing required for PSA families.","weight":1.0},{"id":"CA-PORT","code":"CA-PORT","subject":"Portfolio","category":"portfolio","required":false,"description":"No portfolio required.","weight":1.0},{"id":"CA-IMMU","code":"CA-IMMU","subject":"Immunization Records","category":"immunization","required":true,"description":"Maintain immunization records. Required for school-sponsored activities.","weight":1.0},{"id":"CA-TRAN","code":"CA-TRAN","subject":"Transcripts","category":"transcripts","required":false,"description":"Transcripts required for college-bound high schoolers.","weight":1.0}]'::jsonb,
      NOW(),NOW()
    );
  END IF;

  -- FLORIDA — notice of intent + annual evaluation
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE state_code='FL' AND type='state_reporting' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'Florida Homeschool Requirements 2025–26',
      'Florida requires annual Notice of Intent to the school district and an annual evaluation (test, teacher eval, or portfolio review).',
      'state_reporting',v_admin,'FL',TRUE,NULL,'complete',NOW(),'2026-12-31'::DATE,
      '[{"id":"FL-ATT","code":"FL-ATT","subject":"Attendance","category":"attendance","required":false,"description":"No specific day/hour count, but a log is recommended.","weight":1.0},{"id":"FL-CUR","code":"FL-CUR","subject":"Notice of Intent","category":"curriculum","required":true,"description":"File written Notice of Intent with school district superintendent within 30 days of beginning homeschooling and by August 1 each year.","weight":1.0},{"id":"FL-TEST","code":"FL-TEST","subject":"Annual Evaluation","category":"testing","required":true,"description":"Choose: (1) standardized test, (2) certified teacher evaluation, or (3) portfolio review. Results kept on file.","weight":1.0},{"id":"FL-PORT","code":"FL-PORT","subject":"Portfolio","category":"portfolio","required":true,"description":"Maintain a portfolio of work samples and activity log. Required if choosing portfolio evaluation.","weight":1.0},{"id":"FL-IMMU","code":"FL-IMMU","subject":"Immunization Records","category":"immunization","required":true,"description":"Maintain Florida Form 680 or exemption on file.","weight":1.0},{"id":"FL-TRAN","code":"FL-TRAN","subject":"Transcripts","category":"transcripts","required":false,"description":"No formal transcripts required beyond evaluation results.","weight":1.0}]'::jsonb,
      NOW(),NOW()
    );
  END IF;

  -- NORTH CAROLINA — annual notice + standardized test
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE state_code='NC' AND type='state_reporting' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'North Carolina Homeschool Requirements 2025–26',
      'NC requires annual notice to DNPE, 9 months of instruction, immunization records, and annual standardized testing.',
      'state_reporting',v_admin,'NC',TRUE,NULL,'complete',NOW(),'2026-12-31'::DATE,
      '[{"id":"NC-ATT","code":"NC-ATT","subject":"Attendance","category":"attendance","required":true,"description":"Operate for at least 9 calendar months. Maintain attendance records on file.","weight":1.0},{"id":"NC-CUR","code":"NC-CUR","subject":"DNPE Notice + Subjects","category":"curriculum","required":true,"description":"File annual notice with NC Division of Non-Public Education (DNPE). Must teach: math, language arts, science, social studies.","weight":1.0},{"id":"NC-TEST","code":"NC-TEST","subject":"Annual Standardized Test","category":"testing","required":true,"description":"Administer a nationally standardized test annually. Results kept on file for one year.","weight":1.0},{"id":"NC-PORT","code":"NC-PORT","subject":"Portfolio","category":"portfolio","required":false,"description":"No portfolio required.","weight":1.0},{"id":"NC-IMMU","code":"NC-IMMU","subject":"Immunization Records","category":"immunization","required":true,"description":"Maintain current immunization record or waiver on file.","weight":1.0},{"id":"NC-TRAN","code":"NC-TRAN","subject":"Transcripts","category":"transcripts","required":false,"description":"No progress reports required.","weight":1.0}]'::jsonb,
      NOW(),NOW()
    );
  END IF;

  -- GEORGIA — declaration + 180 days + monthly reports + testing every 3 years
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE state_code='GA' AND type='state_reporting' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'Georgia Homeschool Requirements 2025–26',
      'GA requires annual Declaration of Intent, 180 days of instruction, monthly progress reports, and standardized testing every 3 years.',
      'state_reporting',v_admin,'GA',TRUE,NULL,'complete',NOW(),'2026-12-31'::DATE,
      '[{"id":"GA-ATT","code":"GA-ATT","subject":"Attendance","category":"attendance","required":true,"description":"180 days of instruction (4.5 hrs/day). Keep on file.","weight":1.0},{"id":"GA-CUR","code":"GA-CUR","subject":"Declaration + Subjects","category":"curriculum","required":true,"description":"Annual Declaration of Intent with local superintendent. Must teach: reading, language arts, math, social studies, science.","weight":1.0},{"id":"GA-TEST","code":"GA-TEST","subject":"Testing Every 3 Years","category":"testing","required":true,"description":"Nationally standardized test every 3 years. Results kept on file.","weight":1.0},{"id":"GA-PORT","code":"GA-PORT","subject":"Monthly Progress Reports","category":"portfolio","required":true,"description":"Maintain monthly progress reports for each required subject.","weight":1.0},{"id":"GA-IMMU","code":"GA-IMMU","subject":"Immunization Records","category":"immunization","required":true,"description":"Maintain Certificate of Immunization or exemption on file.","weight":1.0},{"id":"GA-TRAN","code":"GA-TRAN","subject":"Transcripts","category":"transcripts","required":false,"description":"Monthly reports satisfy progress reporting.","weight":1.0}]'::jsonb,
      NOW(),NOW()
    );
  END IF;

  -- VIRGINIA — annual notice + annual assessment submitted to district
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE state_code='VA' AND type='state_reporting' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'Virginia Homeschool Requirements 2025–26',
      'VA requires annual Notice of Intent by Aug 15 and submission of annual assessment results (test or evaluator) by Aug 1.',
      'state_reporting',v_admin,'VA',TRUE,NULL,'complete',NOW(),'2026-12-31'::DATE,
      '[{"id":"VA-ATT","code":"VA-ATT","subject":"Attendance","category":"attendance","required":true,"description":"180 days of instruction per year. Keep records on file.","weight":1.0},{"id":"VA-CUR","code":"VA-CUR","subject":"Notice of Intent","category":"curriculum","required":true,"description":"File annual Notice of Intent with school division by August 15.","weight":1.0},{"id":"VA-TEST","code":"VA-TEST","subject":"Annual Assessment","category":"testing","required":true,"description":"Submit annual evidence of progress: standardized test (50th percentile+) OR licensed teacher evaluation. Submit to division by August 1.","weight":1.0},{"id":"VA-PORT","code":"VA-PORT","subject":"Portfolio (optional)","category":"portfolio","required":false,"description":"Portfolio optional — used in the teacher evaluation path.","weight":1.0},{"id":"VA-IMMU","code":"VA-IMMU","subject":"Immunization Records","category":"immunization","required":true,"description":"Maintain immunization records for school-sponsored activities.","weight":1.0},{"id":"VA-TRAN","code":"VA-TRAN","subject":"Transcripts","category":"transcripts","required":false,"description":"High school transcripts strongly recommended.","weight":1.0}]'::jsonb,
      NOW(),NOW()
    );
  END IF;

  -- OHIO — 900 hours + annual notification + assessment submitted
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE state_code='OH' AND type='state_reporting' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'Ohio Homeschool Requirements 2025–26',
      'OH requires annual notification to the local district, 900 instructional hours, and annual assessment results submitted to the superintendent.',
      'state_reporting',v_admin,'OH',TRUE,NULL,'complete',NOW(),'2026-12-31'::DATE,
      '[{"id":"OH-ATT","code":"OH-ATT","subject":"Attendance — Hours","category":"attendance","required":true,"description":"900 instructional hours per year. Maintain a log of hours on file.","weight":1.0},{"id":"OH-CUR","code":"OH-CUR","subject":"Annual Notification + Subjects","category":"curriculum","required":true,"description":"File annual notification with local superintendent. Must teach: language arts, math, science, health, social studies, fine arts, PE.","weight":1.0},{"id":"OH-TEST","code":"OH-TEST","subject":"Annual Assessment","category":"testing","required":true,"description":"Annual assessment: standardized test OR portfolio review by certified teacher. Submit results to superintendent annually.","weight":1.0},{"id":"OH-PORT","code":"OH-PORT","subject":"Portfolio (optional)","category":"portfolio","required":false,"description":"Portfolio optional — used in the portfolio assessment path.","weight":1.0},{"id":"OH-IMMU","code":"OH-IMMU","subject":"Immunization Records","category":"immunization","required":true,"description":"Maintain immunization records or signed exemption.","weight":1.0},{"id":"OH-TRAN","code":"OH-TRAN","subject":"Transcripts","category":"transcripts","required":false,"description":"High school transcripts strongly recommended.","weight":1.0}]'::jsonb,
      NOW(),NOW()
    );
  END IF;

  -- NEW YORK — IHIP + quarterly reports + annual assessment (highest regulation)
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE state_code='NY' AND type='state_reporting' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'New York Homeschool Requirements 2025–26',
      'NY is the highest-regulation state: requires an annual IHIP, four quarterly reports, and annual assessment results submitted to the district.',
      'state_reporting',v_admin,'NY',TRUE,NULL,'complete',NOW(),'2026-12-31'::DATE,
      '[{"id":"NY-ATT","code":"NY-ATT","subject":"Attendance — Hours","category":"attendance","required":true,"description":"900 hrs/year (grades 1–6) or 990 hrs/year (grades 7–12). Include hours in quarterly reports.","weight":1.0},{"id":"NY-CUR","code":"NY-CUR","subject":"IHIP Filing","category":"curriculum","required":true,"description":"File Individualized Home Instruction Plan (IHIP) with district superintendent by July 1. Must list subjects, textbooks, and instructors. 10 required subjects (gr 1–6) or 17 subjects (gr 7–12).","weight":1.0},{"id":"NY-TEST","code":"NY-TEST","subject":"Annual Assessment","category":"testing","required":true,"description":"Annual assessment: standardized test (grades 4–8 and annually thereafter) OR narrative evaluation by certified teacher. Submit results to district by June 1.","weight":1.0},{"id":"NY-PORT","code":"NY-PORT","subject":"Quarterly Progress Reports","category":"portfolio","required":true,"description":"Submit four quarterly reports to the district each year. Each report must include: hours per subject, grade or narrative per subject, and materials used.","weight":1.0},{"id":"NY-IMMU","code":"NY-IMMU","subject":"Immunization Records","category":"immunization","required":true,"description":"Maintain immunization records. Required under NY Public Health Law.","weight":1.0},{"id":"NY-TRAN","code":"NY-TRAN","subject":"Transcripts","category":"transcripts","required":true,"description":"Quarterly reports constitute ongoing progress documentation. Formal transcripts required for high school graduation.","weight":1.0}]'::jsonb,
      NOW(),NOW()
    );
  END IF;

  -- PENNSYLVANIA — notarized affidavit + portfolio + annual evaluator (highest regulation)
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE state_code='PA' AND type='state_reporting' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'Pennsylvania Homeschool Requirements 2025–26',
      'PA is one of the highest-regulation states: notarized affidavit, portfolio of work samples, and annual evaluation by a licensed PA teacher or psychologist.',
      'state_reporting',v_admin,'PA',TRUE,NULL,'complete',NOW(),'2026-12-31'::DATE,
      '[{"id":"PA-ATT","code":"PA-ATT","subject":"Attendance — Hours","category":"attendance","required":true,"description":"900 hrs/year (elementary) or 990 hrs/year (secondary). Log of instructional hours required in portfolio.","weight":1.0},{"id":"PA-CUR","code":"PA-CUR","subject":"Notarized Affidavit","category":"curriculum","required":true,"description":"File notarized affidavit with school district superintendent by August 1. List subjects, materials, and instructor qualifications.","weight":1.0},{"id":"PA-TEST","code":"PA-TEST","subject":"Annual Evaluation","category":"testing","required":true,"description":"Annual evaluation by a licensed PA teacher or psychologist OR standardized test. Submit results to district by June 30. Student must show sustained progress.","weight":1.0},{"id":"PA-PORT","code":"PA-PORT","subject":"Portfolio of Work Samples","category":"portfolio","required":true,"description":"Maintain portfolio: activity log, work samples per subject, reading list. Portfolio reviewed by licensed evaluator as part of annual evaluation.","weight":1.0},{"id":"PA-IMMU","code":"PA-IMMU","subject":"Immunization Records","category":"immunization","required":true,"description":"Maintain immunization records or signed exemption under PA School Code.","weight":1.0},{"id":"PA-TRAN","code":"PA-TRAN","subject":"Transcripts","category":"transcripts","required":true,"description":"Annual evaluation constitutes progress documentation. Keep all evaluations permanently. Transcripts required for high school graduation.","weight":1.0}]'::jsonb,
      NOW(),NOW()
    );
  END IF;

END $$;

INSERT INTO curriculum_units (title, description, subject, grade_level)
VALUES
    ('Local Ecosystems',  'Explore and understand local biodiversity and ecological relationships', 'Biology',              5),
    ('Weather Patterns',  'Study local weather patterns, climate data collection, and analysis',   'Earth Science',        4),
    ('Community History', 'Investigate local historical sites and community heritage',             'Social Studies',       5),
    ('Urban Gardening',   'Learn sustainable gardening practices in urban environments',           'Environmental Science', 3)
ON CONFLICT DO NOTHING;

-- Sample activities (inserted after teacher user exists)
WITH teacher AS (SELECT id FROM users WHERE email = 'teacher@example.com' LIMIT 1)
INSERT INTO activities (
    title, description, teacher_id, subject, grade_level, difficulty_level,
    estimated_duration_minutes, location_name, location_latitude, location_longitude,
    bloom_level, status, is_active
)
SELECT
    act.title, act.description, teacher.id, act.subject, act.grade_level,
    act.difficulty_level, act.duration, act.location_name, act.lat, act.lon,
    act.bloom_level, 'published'::activity_status_enum, TRUE
FROM teacher, (VALUES
    ('Park Biodiversity Survey',  'Students explore a local park to document plant and animal species', 'Biology',              5, 3, 60, 'Central Park',    47.6062, -122.3321, 3),
    ('Weather Data Collection',   'Students collect and analyze local weather data over 2 weeks',       'Earth Science',        4, 2, 45, 'School Grounds',  47.6062, -122.3321, 2),
    ('Community Heritage Walk',   'Guided walk to identify and document historical sites',              'Social Studies',       5, 2, 90, 'Downtown District',47.6062, -122.3321, 2),
    ('School Garden Project',     'Design and maintain a sustainable garden at school',                 'Environmental Science',3, 3, 120,'School Campus',   47.6062, -122.3321, 3)
) AS act(title, description, subject, grade_level, difficulty_level, duration, location_name, lat, lon, bloom_level)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sample student proposals — Reverse Scavenger Hunt
-- Seeded under student@example.com (Alex Johnson) for demo purposes.
-- One approved (with matching Activity), one pending, two drafts.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_student_id  UUID;
  v_teacher_id  UUID;
  v_activity_id UUID := uuid_generate_v4();
  v_p1          UUID := uuid_generate_v4();
  v_p2          UUID := uuid_generate_v4();
  v_p3          UUID := uuid_generate_v4();
  v_p4          UUID := uuid_generate_v4();
BEGIN
  SELECT id INTO v_student_id FROM users WHERE email = 'student@example.com' LIMIT 1;
  SELECT id INTO v_teacher_id FROM users WHERE email = 'teacher@example.com' LIMIT 1;

  IF v_student_id IS NULL THEN RETURN; END IF;

  -- 1. APPROVED — also creates the published Activity
  IF NOT EXISTS (SELECT 1 FROM student_proposals WHERE title = 'Stream Watch: Find 3 Native Plants') THEN
    INSERT INTO activities (
      id, teacher_id, title, description, subject, grade_level,
      activity_type, difficulty_level, estimated_duration_minutes,
      bloom_level, assessment_type, status, is_active,
      is_student_proposed, proposed_by_student_id, created_at, updated_at
    ) VALUES (
      v_activity_id, v_teacher_id,
      'Stream Watch: Find 3 Native Plants',
      'Visit any stream or creek near your home or school. Identify at least 3 native plants growing along the bank — photograph each one and write a sentence explaining what makes it native to the region.' || E'\n\n' ||
      '📍 Location: Any local stream, creek, or riverbank' || E'\n\n' ||
      '💡 Proposed by: Alex Johnson',
      'Science', 5, 'discovery', 2, 60,
      'apply', 'observation', 'published', TRUE,
      TRUE, v_student_id, NOW(), NOW()
    );

    INSERT INTO student_proposals (
      id, student_id, title, challenge_description, location_hint,
      subject, note_to_teacher, status, teacher_feedback,
      approved_activity_id, created_at, updated_at
    ) VALUES (
      v_p1, v_student_id,
      'Stream Watch: Find 3 Native Plants',
      'Visit any stream or creek near your home or school. Identify at least 3 native plants growing along the bank — photograph each one and write a sentence explaining what makes it native to the region.',
      'Any local stream, creek, or riverbank',
      'Science',
      'I did this with my family last weekend and thought it would make a great challenge for the class!',
      'approved', '',
      v_activity_id, NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days'
    );
  END IF;

  -- 2. PENDING — awaiting teacher review
  IF NOT EXISTS (SELECT 1 FROM student_proposals WHERE title = 'Shadow Tracker: Map Your Shadow at 3 Times of Day') THEN
    INSERT INTO student_proposals (
      id, student_id, title, challenge_description, location_hint,
      subject, note_to_teacher, status, teacher_feedback,
      approved_activity_id, created_at, updated_at
    ) VALUES (
      v_p2, v_student_id,
      'Shadow Tracker: Map Your Shadow at 3 Times of Day',
      'Go outside at morning, noon, and late afternoon and trace your shadow on the ground (or measure its length). Record the time, direction, and length each time. Can you explain why it changes?',
      'Any open outdoor space — a yard, park, or school field works great',
      'Science',
      'We learned about the sun's movement in class and I thought this would be a fun way to see it for real.',
      'pending', '',
      NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'
    );
  END IF;

  -- 3. DRAFT — still being worked on
  IF NOT EXISTS (SELECT 1 FROM student_proposals WHERE title = 'Sidewalk Ecosystem') THEN
    INSERT INTO student_proposals (
      id, student_id, title, challenge_description, location_hint,
      subject, note_to_teacher, status, teacher_feedback,
      approved_activity_id, created_at, updated_at
    ) VALUES (
      v_p3, v_student_id,
      'Sidewalk Ecosystem',
      'Pick a 1-metre square of sidewalk or pavement and look closely. How many different living things can you find — ants, moss, weeds pushing through cracks? Sketch what you see and describe each organism.',
      'Any sidewalk, pavement crack, or urban surface',
      'Environmental Studies',
      '',
      'draft', '',
      NULL, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'
    );
  END IF;

  -- 4. REJECTED with feedback — ready for revision
  IF NOT EXISTS (SELECT 1 FROM student_proposals WHERE title = 'Find a Place That Smells Like Nature') THEN
    INSERT INTO student_proposals (
      id, student_id, title, challenge_description, location_hint,
      subject, note_to_teacher, status, teacher_feedback,
      approved_activity_id, created_at, updated_at
    ) VALUES (
      v_p4, v_student_id,
      'Find a Place That Smells Like Nature',
      'Go somewhere outside that smells interesting — the woods, a garden, near water. Describe the smell and try to figure out what''s causing it.',
      'Anywhere outside',
      'Science',
      '',
      'rejected',
      'Love the idea! Can you add a more specific observation task — for example, identifying the source plant or describing 3 distinct smells? That would make it more measurable.',
      NULL, NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days'
    );
  END IF;

END $$;

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

-- ===========================================================================
-- Verification
-- ===========================================================================
SELECT '✅ Database initialization complete!' AS status;

SELECT tablename
FROM   pg_tables
WHERE  schemaname = 'public'
ORDER  BY tablename;

SELECT email, role, is_active FROM users WHERE email LIKE '%example.com' ORDER BY role;
