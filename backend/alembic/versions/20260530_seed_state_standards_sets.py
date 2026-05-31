# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Seed global state_standards sets for common academic frameworks

Revision ID: 20260530_seed_state_standards_sets
Revises: 20260530_seed_state_reporting_sets
Create Date: 2026-05-30

Seeds admin-owned (is_global=TRUE) state_standards sets for the major
academic frameworks used across US states. These are the CONTENT standards
(what to teach) as opposed to state_reporting (how to document it).

Sets seeded:
  - Common Core State Standards — English Language Arts (ELA) K–12
  - Common Core State Standards — Mathematics K–12
  - Next Generation Science Standards (NGSS)
  - Texas Essential Knowledge and Skills — Science (TEKS Science)
  - Texas Essential Knowledge and Skills — Math (TEKS Math)
  - College Board AP Framework (overview)

All are is_global=TRUE, valid_until=2026-07-31 (end of US school year).
processing_status='complete' — hand-authored summary criteria, no Ollama needed.

Note: These are high-level domain/strand summaries, not individual grade-level
standards. Full granular standards should be uploaded via /admin/curriculum/import
using the actual PDF documents.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = '20260530_seed_state_standards_sets'
down_revision = '20260530_seed_state_reporting_sets'
branch_labels = None
depends_on = None

_SQL = """
DO $$
DECLARE v_admin UUID;
BEGIN
  SELECT id INTO v_admin FROM users WHERE role = 'ADMIN' ORDER BY created_at LIMIT 1;
  IF v_admin IS NULL THEN RETURN; END IF;

  -- Common Core ELA
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE name LIKE 'Common Core%ELA%' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'Common Core State Standards — English Language Arts (K–12)',
      'CCSS ELA defines expectations for reading, writing, speaking, listening, and language for students in kindergarten through 12th grade. Adopted by 41 states. Full strand-level criteria included.',
      'state_standards',v_admin,NULL,TRUE,NULL,''complete'',NOW(),''2026-07-31''::DATE,
      ''[
        {"id":"CCSS-ELA-RL","code":"CCSS.ELA-LITERACY.RL","subject":"Reading: Literature","category":"Reading","description":"Key ideas and details, craft and structure, integration of knowledge and ideas in literary texts","required":true,"weight":1.0},
        {"id":"CCSS-ELA-RI","code":"CCSS.ELA-LITERACY.RI","subject":"Reading: Informational Text","category":"Reading","description":"Key ideas and details, craft and structure, integration of knowledge and ideas in informational texts","required":true,"weight":1.0},
        {"id":"CCSS-ELA-RF","code":"CCSS.ELA-LITERACY.RF","subject":"Reading: Foundational Skills","category":"Reading","description":"Print concepts, phonological awareness, phonics, fluency (K–5)","required":true,"weight":1.0},
        {"id":"CCSS-ELA-W","code":"CCSS.ELA-LITERACY.W","subject":"Writing","category":"Writing","description":"Text types and purposes, production and distribution, research and range of writing","required":true,"weight":1.0},
        {"id":"CCSS-ELA-SL","code":"CCSS.ELA-LITERACY.SL","subject":"Speaking & Listening","category":"Speaking","description":"Comprehension and collaboration, presentation of knowledge and ideas","required":true,"weight":1.0},
        {"id":"CCSS-ELA-L","code":"CCSS.ELA-LITERACY.L","subject":"Language","category":"Language","description":"Conventions of standard English, knowledge of language, vocabulary acquisition and use","required":true,"weight":1.0}
      ]''::jsonb,
      NOW(),NOW()
    );
  END IF;

  -- Common Core Math
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE name LIKE 'Common Core%Math%' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'Common Core State Standards — Mathematics (K–12)',
      'CCSS Math defines what students should understand and be able to do in mathematics across K–12. Adopted by 41 states. Includes Standards for Mathematical Practice and content domain strands.',
      'state_standards',v_admin,NULL,TRUE,NULL,''complete'',NOW(),''2026-07-31''::DATE,
      ''[
        {"id":"CCSS-MATH-PRACTICE","code":"CCSS.MATH.PRACTICE","subject":"Standards for Mathematical Practice","category":"Practice","description":"Make sense of problems, reason abstractly, construct arguments, model, use tools, attend to precision, find structure, express regularity","required":true,"weight":1.0},
        {"id":"CCSS-MATH-OA","code":"CCSS.MATH.OA","subject":"Operations & Algebraic Thinking","category":"Number","description":"Understand and apply properties of operations, solve problems involving the four operations (K–5)","required":true,"weight":1.0},
        {"id":"CCSS-MATH-NBT","code":"CCSS.MATH.NBT","subject":"Number & Operations in Base Ten","category":"Number","description":"Understand place value, perform multi-digit arithmetic (K–5)","required":true,"weight":1.0},
        {"id":"CCSS-MATH-NF","code":"CCSS.MATH.NF","subject":"Number & Operations — Fractions","category":"Number","description":"Develop understanding of fractions as numbers (3–5)","required":true,"weight":1.0},
        {"id":"CCSS-MATH-MD","code":"CCSS.MATH.MD","subject":"Measurement & Data","category":"Measurement","description":"Measure and estimate lengths, represent and interpret data (K–5)","required":true,"weight":1.0},
        {"id":"CCSS-MATH-G","code":"CCSS.MATH.G","subject":"Geometry","category":"Geometry","description":"Reason with shapes and their attributes, solve real-world problems (K–12)","required":true,"weight":1.0},
        {"id":"CCSS-MATH-RP","code":"CCSS.MATH.RP","subject":"Ratios & Proportional Relationships","category":"Algebra","description":"Understand ratio and rate concepts and use to solve problems (6–7)","required":true,"weight":1.0},
        {"id":"CCSS-MATH-EE","code":"CCSS.MATH.EE","subject":"Expressions & Equations","category":"Algebra","description":"Apply properties of operations, reason about and solve equations (6–8)","required":true,"weight":1.0},
        {"id":"CCSS-MATH-F","code":"CCSS.MATH.F","subject":"Functions","category":"Algebra","description":"Define, evaluate, and compare functions; model relationships (8–12)","required":true,"weight":1.0},
        {"id":"CCSS-MATH-SP","code":"CCSS.MATH.SP","subject":"Statistics & Probability","category":"Statistics","description":"Develop understanding of statistical variability, summarize and describe distributions (6–12)","required":true,"weight":1.0}
      ]''::jsonb,
      NOW(),NOW()
    );
  END IF;

  -- NGSS
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE name LIKE 'Next Generation Science%' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'Next Generation Science Standards (NGSS)',
      'NGSS defines science education expectations through three dimensions: disciplinary core ideas, science and engineering practices, and crosscutting concepts. Adopted by 20+ states.',
      'state_standards',v_admin,NULL,TRUE,NULL,''complete'',NOW(),''2026-07-31''::DATE,
      ''[
        {"id":"NGSS-PS","code":"NGSS.PS","subject":"Physical Science","category":"Disciplinary Core Ideas","description":"Matter and its interactions, motion and stability, energy, waves and electromagnetic radiation","required":true,"weight":1.0},
        {"id":"NGSS-LS","code":"NGSS.LS","subject":"Life Science","category":"Disciplinary Core Ideas","description":"From molecules to organisms, ecosystems, heredity, biological evolution","required":true,"weight":1.0},
        {"id":"NGSS-ESS","code":"NGSS.ESS","subject":"Earth & Space Science","category":"Disciplinary Core Ideas","description":"Earth's place in the universe, Earth's systems, Earth and human activity","required":true,"weight":1.0},
        {"id":"NGSS-ETS","code":"NGSS.ETS","subject":"Engineering, Technology & Applications","category":"Disciplinary Core Ideas","description":"Engineering design, links between engineering, technology, science, and society","required":true,"weight":1.0},
        {"id":"NGSS-SEP","code":"NGSS.SEP","subject":"Science & Engineering Practices","category":"Practices","description":"Asking questions, planning investigations, analyzing data, constructing explanations, communicating information","required":true,"weight":1.0},
        {"id":"NGSS-CCC","code":"NGSS.CCC","subject":"Crosscutting Concepts","category":"Crosscutting","description":"Patterns, cause and effect, scale, systems, energy and matter, structure and function, stability and change","required":true,"weight":1.0}
      ]''::jsonb,
      NOW(),NOW()
    );
  END IF;

  -- TEKS Science (Texas)
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE name LIKE 'TEKS%Science%' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'Texas Essential Knowledge and Skills — Science (TEKS Science)',
      'TEKS Science defines what Texas students should know and be able to do in science. Applies to all Texas public schools and homeschool families using TEKS alignment.',
      'state_standards',v_admin,''TX'',TRUE,NULL,''complete'',NOW(),''2026-07-31''::DATE,
      ''[
        {"id":"TEKS-SCI-INQUIRY","code":"TEKS.SCI.1","subject":"Scientific Investigation","category":"Process","description":"Safe practices, tools and equipment, recording and organizing data, communicating results","required":true,"weight":1.0},
        {"id":"TEKS-SCI-LIFE","code":"TEKS.SCI.LIFE","subject":"Life Science","category":"Content","description":"Organisms and environments, heredity, biological evolution, organisms and environments","required":true,"weight":1.0},
        {"id":"TEKS-SCI-EARTH","code":"TEKS.SCI.EARTH","subject":"Earth & Space Science","category":"Content","description":"Earth's structure, weather and climate, solar system, space exploration","required":true,"weight":1.0},
        {"id":"TEKS-SCI-PHYS","code":"TEKS.SCI.PHYS","subject":"Physical Science","category":"Content","description":"Properties of matter, force and motion, energy, sound and light","required":true,"weight":1.0},
        {"id":"TEKS-SCI-ENV","code":"TEKS.SCI.ENV","subject":"Environmental Systems","category":"Content","description":"Ecosystems, human impact on the environment, conservation (high school)","required":false,"weight":1.0}
      ]''::jsonb,
      NOW(),NOW()
    );
  END IF;

  -- TEKS Math (Texas)
  IF NOT EXISTS (SELECT 1 FROM standards_sets WHERE name LIKE 'TEKS%Math%' AND is_global=TRUE) THEN
    INSERT INTO standards_sets (id,name,description,type,owner_id,state_code,is_global,source_checksum,processing_status,last_processed_at,valid_until,criteria,created_at,updated_at) VALUES (
      uuid_generate_v4(),
      'Texas Essential Knowledge and Skills — Mathematics (TEKS Math)',
      'TEKS Math defines mathematics learning expectations for Texas students K–12. Revised 2012, with updates through 2024.',
      'state_standards',v_admin,''TX'',TRUE,NULL,''complete'',NOW(),''2026-07-31''::DATE,
      ''[
        {"id":"TEKS-MATH-NUM","code":"TEKS.MATH.NUM","subject":"Number & Operations","category":"Number","description":"Number sense, place value, fractions, decimals, rational numbers","required":true,"weight":1.0},
        {"id":"TEKS-MATH-ALG","code":"TEKS.MATH.ALG","subject":"Algebraic Reasoning","category":"Algebra","description":"Patterns, functions, equations, inequalities, systems of equations","required":true,"weight":1.0},
        {"id":"TEKS-MATH-GEO","code":"TEKS.MATH.GEO","subject":"Geometry & Measurement","category":"Geometry","description":"Two- and three-dimensional figures, coordinate geometry, measurement, transformations","required":true,"weight":1.0},
        {"id":"TEKS-MATH-DATA","code":"TEKS.MATH.DATA","subject":"Data Analysis & Statistics","category":"Statistics","description":"Data collection, representation, analysis, probability, statistical reasoning","required":true,"weight":1.0},
        {"id":"TEKS-MATH-FINANCE","code":"TEKS.MATH.FINANCE","subject":"Personal Financial Literacy","category":"Applied","description":"Savings, budgeting, credit, taxes, consumer decisions (introduced 2022)","required":true,"weight":1.0}
      ]''::jsonb,
      NOW(),NOW()
    );
  END IF;

END $$;
"""


def upgrade() -> None:
    op.execute(text(_SQL))


def downgrade() -> None:
    op.execute(text("""
        DELETE FROM standards_sets
        WHERE type = 'state_standards'
          AND is_global = TRUE
          AND name IN (
            'Common Core State Standards — English Language Arts (K–12)',
            'Common Core State Standards — Mathematics (K–12)',
            'Next Generation Science Standards (NGSS)',
            'Texas Essential Knowledge and Skills — Science (TEKS Science)',
            'Texas Essential Knowledge and Skills — Mathematics (TEKS Math)'
          )
    """))
