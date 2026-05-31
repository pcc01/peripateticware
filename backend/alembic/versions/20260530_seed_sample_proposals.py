# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Seed sample student proposals for student@example.com demo account

Revision ID: 20260530_seed_sample_proposals
Revises: 20260530_student_proposals
Create Date: 2026-05-30

Seeds 4 proposals in different states so potential users see a realistic
student experience immediately on first login:
  1. approved  — also creates a published Activity
  2. pending   — awaiting teacher review
  3. draft     — still being written
  4. rejected  — returned with teacher feedback, ready to revise
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = '20260530_seed_sample_proposals'
down_revision = '20260530_student_proposals'
branch_labels = None
depends_on = None

_SQL = """
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
      'Visit any stream or creek near your home or school. Identify at least 3 native plants growing along the bank — photograph each one and write a sentence explaining what makes it native to the region.' || chr(10) || chr(10) ||
      chr(128205) || ' Location: Any local stream, creek, or riverbank' || chr(10) || chr(10) ||
      chr(128161) || ' Proposed by: Alex Johnson',
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
      'approved', '', v_activity_id,
      NOW() - INTERVAL ''5 days'', NOW() - INTERVAL ''3 days''
    );
  END IF;

  -- 2. PENDING
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
      'We learned about the sun''s movement in class and I thought this would be a fun way to see it for real.',
      'pending', '', NULL,
      NOW() - INTERVAL ''1 day'', NOW() - INTERVAL ''1 day''
    );
  END IF;

  -- 3. DRAFT
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
      'Environmental Studies', '',
      'draft', '', NULL,
      NOW() - INTERVAL ''2 days'', NOW() - INTERVAL ''2 days''
    );
  END IF;

  -- 4. REJECTED with feedback
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
      'Science', '',
      'rejected',
      'Love the idea! Can you add a more specific observation task — for example, identifying the source plant or describing 3 distinct smells? That would make it more measurable.',
      NULL,
      NOW() - INTERVAL ''4 days'', NOW() - INTERVAL ''3 days''
    );
  END IF;

END $$;
"""


def upgrade() -> None:
    op.execute(text(_SQL))


def downgrade() -> None:
    op.execute(text("""
        DELETE FROM student_proposals
        WHERE title IN (
            'Stream Watch: Find 3 Native Plants',
            'Shadow Tracker: Map Your Shadow at 3 Times of Day',
            'Sidewalk Ecosystem',
            'Find a Place That Smells Like Nature'
        );
        DELETE FROM activities
        WHERE title = 'Stream Watch: Find 3 Native Plants' AND is_student_proposed = TRUE;
    """))
