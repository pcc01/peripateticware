# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Seed rich demo data for the homeschool account (Sarah Rivera)

Revision ID: 20260530_seed_homeschool_demo_data
Revises: 20260530_homeschool_children_table
Create Date: 2026-05-30

Seeds:
  - 6 published activities created by Sarah Rivera (homeschool@example.com)
      covering Science, Geography, Social Studies, Earth Science, and Math
      for grades 4 (Emma) and 7 (Lucas)
  - standards_sets + activity_standards_map tables added to schema if missing
  - 1 state_reporting standards set: Texas Home Education Required Subjects 2025-26
      with 7 criteria (Language Arts, Math, Science, Social Studies, Health,
      Fine Arts, Physical Education)
  - 12 activity->standards mappings (full + partial coverage)
  - 8 learning_sessions across Emma and Lucas showing completed + in-progress work
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = '20260530_seed_homeschool_demo_data'
down_revision = '20260530_homeschool_children_table'
branch_labels = None
depends_on = None

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS standards_sets (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    type        VARCHAR(50)  NOT NULL,
    owner_id    UUID         REFERENCES users(id) ON DELETE SET NULL,
    state_code  VARCHAR(10),
    is_global   BOOLEAN      NOT NULL DEFAULT FALSE,
    source_file VARCHAR(512),
    criteria    JSONB        NOT NULL DEFAULT '[]',
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_standards_sets_owner ON standards_sets(owner_id);
CREATE INDEX IF NOT EXISTS idx_standards_sets_type  ON standards_sets(type);

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
CREATE INDEX IF NOT EXISTS idx_asm_activity  ON activity_standards_map(activity_id);
CREATE INDEX IF NOT EXISTS idx_asm_standards ON activity_standards_map(standards_set_id);
"""

_SEED_SQL = """
DO $$
DECLARE
  v_hs       UUID;
  v_emma     UUID;
  v_lucas    UUID;
  v_std_set  UUID := uuid_generate_v4();
  v_a1 UUID := uuid_generate_v4();
  v_a2 UUID := uuid_generate_v4();
  v_a3 UUID := uuid_generate_v4();
  v_a4 UUID := uuid_generate_v4();
  v_a5 UUID := uuid_generate_v4();
  v_a6 UUID := uuid_generate_v4();
BEGIN
  SELECT id INTO v_hs    FROM users WHERE email = 'homeschool@example.com' LIMIT 1;
  SELECT id INTO v_emma  FROM users WHERE email = 'child1@example.com'     LIMIT 1;
  SELECT id INTO v_lucas FROM users WHERE email = 'child2@example.com'     LIMIT 1;
  IF v_hs IS NULL THEN RETURN; END IF;

  INSERT INTO activities (
    id, teacher_id, title, description, subject, grade_level,
    activity_type, difficulty_level, estimated_duration_minutes,
    bloom_level, assessment_type, status, is_active, location_name, created_at, updated_at
  ) VALUES
    (v_a1, v_hs, 'Creek Habitat Study',
     'Visit a local creek or drainage channel. Sketch the habitat and identify at least 5 organisms — insects, plants, birds, or fish. Use a field guide or photo ID app. Record water clarity, flow rate (fast/slow), and any signs of pollution.',
     'Science', 4, 'discovery', 2, 75, 'analyze', 'observation', 'published', TRUE,
     'Local creek or drainage channel', NOW() - INTERVAL ''45 days'', NOW() - INTERVAL ''45 days''),
    (v_a2, v_hs, 'Map Your Neighborhood',
     'Walk a 6-block radius of your home with a blank sheet of paper. Draw a sketch map including streets, landmarks, green spaces, and points of interest. Use cardinal directions and add a legend. Compare your map to a digital map — what did you include that Google Maps misses?',
     'Geography', 4, 'inquiry', 2, 60, 'create', 'portfolio', 'published', TRUE,
     'Home neighbourhood', NOW() - INTERVAL ''38 days'', NOW() - INTERVAL ''38 days''),
    (v_a3, v_hs, 'Local History Walk',
     'Find 3 historical markers, plaques, or buildings within 2 km of home. Photograph each and research the story behind it. Write 2–3 sentences per site explaining why it was significant. Discuss: how has the area changed since then?',
     'Social Studies', 4, 'discovery', 2, 90, 'evaluate', 'portfolio', 'published', TRUE,
     'Local downtown or neighbourhood', NOW() - INTERVAL ''30 days'', NOW() - INTERVAL ''30 days''),
    (v_a4, v_hs, 'Native Plant Journal',
     'Over two weeks, photograph and document 8 native plants in your area. For each entry record: common name, scientific name, leaf shape, habitat, and one ecological role. Sketch at least 3 in detail.',
     'Science', 7, 'inquiry', 3, 120, 'analyze', 'portfolio', 'published', TRUE,
     'Local parks and wild spaces', NOW() - INTERVAL ''40 days'', NOW() - INTERVAL ''40 days''),
    (v_a5, v_hs, 'Weather Station Setup',
     'Build or assemble a basic weather station. Record temperature, precipitation, and wind direction every day for 14 days. Graph the results and identify one pattern or anomaly. Compare your data to the official forecast.',
     'Earth Science', 7, 'inquiry', 3, 30, 'evaluate', 'portfolio', 'published', TRUE,
     'Home or garden', NOW() - INTERVAL ''50 days'', NOW() - INTERVAL ''50 days''),
    (v_a6, v_hs, 'Farmers Market Mathematics',
     'Visit a local farmers market with a $20 budget. Choose 5 items and calculate best value-per-unit. Apply 8.25% sales tax. Track actual spend vs. plan. Calculate the percentage difference between cheapest and most expensive vendor for the same item.',
     'Mathematics', 7, 'discovery', 3, 90, 'apply', 'observation', 'published', TRUE,
     'Local farmers market', NOW() - INTERVAL ''22 days'', NOW() - INTERVAL ''22 days'')
  ON CONFLICT DO NOTHING;

  INSERT INTO standards_sets (
    id, name, description, type, owner_id, state_code, is_global, criteria, created_at, updated_at
  ) VALUES (
    v_std_set,
    'Texas Home Education Required Subjects 2025–26',
    'Annual reporting requirements for home-educated students under Texas Education Code §26.003.',
    'state_reporting', v_hs, 'TX', FALSE,
    '[
      {"id":"TX-LA", "code":"TX-LA", "subject":"Language Arts","description":"Reading, writing, spelling, grammar, and oral communication"},
      {"id":"TX-MA", "code":"TX-MA", "subject":"Mathematics","description":"Arithmetic, geometry, algebra readiness, and practical mathematics"},
      {"id":"TX-SCI","code":"TX-SCI","subject":"Science","description":"Life science, earth science, physical science with hands-on inquiry"},
      {"id":"TX-SS", "code":"TX-SS", "subject":"Social Studies","description":"Texas history, US history, geography, civics, and economics"},
      {"id":"TX-HE", "code":"TX-HE", "subject":"Health Education","description":"Personal health, nutrition, safety, and physical fitness"},
      {"id":"TX-FA", "code":"TX-FA", "subject":"Fine Arts","description":"Visual art, music, theatre, or dance — at least one discipline per year"},
      {"id":"TX-PE", "code":"TX-PE", "subject":"Physical Education","description":"Regular physical activity and movement education"}
    ]''::jsonb,
    NOW() - INTERVAL ''60 days'', NOW() - INTERVAL ''60 days''
  ) ON CONFLICT DO NOTHING;

  INSERT INTO activity_standards_map
    (id, activity_id, standards_set_id, criterion_id, coverage_level, notes, mapped_by, ai_suggested)
  VALUES
    (uuid_generate_v4(),v_a1,v_std_set,''TX-SCI'',''full'',     ''Life science observation: habitat identification and organism recording.'',v_hs,FALSE),
    (uuid_generate_v4(),v_a1,v_std_set,''TX-LA'', ''partial'',  ''Field sketching and written descriptions address descriptive writing.'',  v_hs,TRUE),
    (uuid_generate_v4(),v_a2,v_std_set,''TX-SS'', ''full'',     ''Geography strand: spatial thinking, cardinal directions, map-making.'',   v_hs,FALSE),
    (uuid_generate_v4(),v_a2,v_std_set,''TX-MA'', ''partial'',  ''Map scale and distance estimation addresses practical mathematics.'',      v_hs,TRUE),
    (uuid_generate_v4(),v_a3,v_std_set,''TX-SS'', ''full'',     ''Texas and US history strands through primary-source sites.'',             v_hs,FALSE),
    (uuid_generate_v4(),v_a3,v_std_set,''TX-LA'', ''partial'',  ''Written site descriptions address informational writing.'',               v_hs,TRUE),
    (uuid_generate_v4(),v_a4,v_std_set,''TX-SCI'',''full'',     ''Life science: classification, ecological relationships, scientific naming.'',v_hs,FALSE),
    (uuid_generate_v4(),v_a4,v_std_set,''TX-LA'', ''partial'',  ''Journal entries and sketches address scientific writing.'',               v_hs,TRUE),
    (uuid_generate_v4(),v_a5,v_std_set,''TX-SCI'',''full'',     ''Earth science: meteorology, data collection, pattern analysis.'',         v_hs,FALSE),
    (uuid_generate_v4(),v_a5,v_std_set,''TX-MA'', ''partial'',  ''Graphing temperature and precipitation data: data and statistics.'',      v_hs,TRUE),
    (uuid_generate_v4(),v_a6,v_std_set,''TX-MA'', ''full'',     ''Percentages, unit pricing, tax calculation, and budgeting.'',             v_hs,FALSE),
    (uuid_generate_v4(),v_a6,v_std_set,''TX-SS'', ''partial'',  ''Producer/consumer economics and market pricing: economics strand.'',      v_hs,TRUE)
  ON CONFLICT ON CONSTRAINT uq_activity_standards_criterion DO NOTHING;

  INSERT INTO learning_sessions
    (id, user_id, activity_id, title, status, location_name, created_at, updated_at, completed_at)
  VALUES
    (uuid_generate_v4(),v_emma,v_a1,''Creek Habitat Study'',
     ''completed'',''Barton Creek Greenbelt'',
     NOW()-INTERVAL''42 days'',NOW()-INTERVAL''42 days'',NOW()-INTERVAL''42 days''),
    (uuid_generate_v4(),v_emma,v_a2,''Map Your Neighborhood'',
     ''completed'',''Home neighbourhood'',
     NOW()-INTERVAL''35 days'',NOW()-INTERVAL''35 days'',NOW()-INTERVAL''35 days''),
    (uuid_generate_v4(),v_emma,v_a3,''Local History Walk'',
     ''in_progress'',''Downtown'',
     NOW()-INTERVAL''3 days'',NOW()-INTERVAL''3 days'',NULL),
    (uuid_generate_v4(),v_lucas,v_a4,''Native Plant Journal — Week 1'',
     ''completed'',''Zilker Park'',
     NOW()-INTERVAL''38 days'',NOW()-INTERVAL''31 days'',NOW()-INTERVAL''31 days''),
    (uuid_generate_v4(),v_lucas,v_a4,''Native Plant Journal — Week 2'',
     ''completed'',''Bull Creek District Park'',
     NOW()-INTERVAL''30 days'',NOW()-INTERVAL''24 days'',NOW()-INTERVAL''24 days''),
    (uuid_generate_v4(),v_lucas,v_a5,''Weather Station — Week 1'',
     ''completed'',''Home garden'',
     NOW()-INTERVAL''48 days'',NOW()-INTERVAL''41 days'',NOW()-INTERVAL''41 days''),
    (uuid_generate_v4(),v_lucas,v_a5,''Weather Station — Week 2'',
     ''completed'',''Home garden'',
     NOW()-INTERVAL''40 days'',NOW()-INTERVAL''33 days'',NOW()-INTERVAL''33 days''),
    (uuid_generate_v4(),v_lucas,v_a6,''Farmers Market Mathematics'',
     ''completed'',''SFC Farmers Market'',
     NOW()-INTERVAL''20 days'',NOW()-INTERVAL''20 days'',NOW()-INTERVAL''20 days'')
  ON CONFLICT DO NOTHING;

END $$;
"""


def upgrade() -> None:
    op.execute(text(_SCHEMA_SQL))
    op.execute(text(_SEED_SQL))


def downgrade() -> None:
    op.execute(text("""
        DO $$
        DECLARE v_hs UUID;
        BEGIN
          SELECT id INTO v_hs FROM users WHERE email = 'homeschool@example.com' LIMIT 1;
          IF v_hs IS NULL THEN RETURN; END IF;
          DELETE FROM learning_sessions
            WHERE user_id IN (
              SELECT id FROM users WHERE email IN ('child1@example.com','child2@example.com')
            );
          DELETE FROM activity_standards_map
            WHERE standards_set_id IN (
              SELECT id FROM standards_sets WHERE owner_id = v_hs
            );
          DELETE FROM standards_sets WHERE owner_id = v_hs;
          DELETE FROM activities WHERE teacher_id = v_hs;
        END $$;
    """))
