-- reset-activity-submission-prod.sql
--
-- Clears the learning-session and notebook/submission state for ONE
-- activity + ONE student, so maestro/flows/activity/4-6-activity-flow.yaml
-- (and any other flow that submits field work) can be re-run from scratch.
-- Scoped by activity title + student email — only ever touches the
-- dedicated QA student's data, never real student data. Safe to run
-- repeatedly.
--
-- WHAT ACTUALLY GATES "Submitted ✓" (found the hard way — the first
-- version of this script reset the wrong tables and silently did nothing):
-- app/activity/[id].tsx loads GET /api/v1/student/notebook?activity_id=...
-- (routes/student.py list_notebook_entries) on activity mount and sets
-- submitted = existing.is_submitted from the most recent row. That endpoint
-- queries the StudentNotebook model — table student_notebooks — NOT the
-- similarly-named notebook_entries table in database/student_schema.sql,
-- which is a separate, unrelated (dead-in-this-flow) schema that doesn't
-- even have an is_submitted column. activity_submissions is also unrelated
-- to this flow (nothing in the submit path writes to it). The first
-- version of this script deleted from activity_submissions and
-- notebook_entries and joined learning_sessions on a student_id column
-- that doesn't exist there (it's user_id) — so on a real run it would
-- either error out (ON_ERROR_STOP) or, if that CTE just matched zero rows,
-- commit having changed nothing, while looking like it succeeded.
--
-- startActivitySession is also "start or resume" server-side (only resumes
-- a session with status='in_progress' though — see
-- routes/student_activities.py start_activity_session), so this also
-- clears learning_sessions for a fully clean re-run of phase/capture state,
-- not just the submit flag.
--
-- Pass the title/email with -v (defaults to the Creek Habitat Study QA
-- activity + the standard loadtest student). Host / db user / db name come
-- from your shell env, not the repo — set PROD_SSH / DB_USER / DB_NAME first
-- (PROD_E2E_GUIDE.md §0):
--
--   ssh "$PROD_SSH" "docker exec -i peripateticware-postgres \
--     psql -U $DB_USER -d $DB_NAME \
--     -v activity='Creek Habitat Study' \
--     -v student_email='loadtest.student@thewordinbits.com'" \
--     < scripts/reset-activity-submission-prod.sql

\if :{?activity}
\else
  \set activity 'Creek Habitat Study'
\endif
\if :{?student_email}
\else
  \set student_email 'loadtest.student@thewordinbits.com'
\endif

\set ON_ERROR_STOP on
\echo 'Resetting submission state for activity:' :'activity' 'student:' :'student_email'

BEGIN;

WITH act AS (
    SELECT id FROM activities WHERE title = :'activity'
),
stu AS (
    SELECT id FROM users WHERE email = :'student_email'
),
sess AS (
    SELECT ls.id
    FROM learning_sessions ls, act, stu
    WHERE ls.activity_id = act.id AND ls.user_id = stu.id
),
nb AS (
    SELECT sn.id
    FROM student_notebooks sn, act, stu
    WHERE sn.activity_id = act.id AND sn.student_id = stu.id
),
_feedback AS (
    DELETE FROM notebook_feedback
    WHERE notebook_id IN (SELECT id FROM nb)
    RETURNING 1
),
_capture_links AS (
    DELETE FROM notebook_capture_links
    WHERE notebook_id IN (SELECT id FROM nb)
    RETURNING 1
),
_notebooks AS (
    DELETE FROM student_notebooks
    WHERE id IN (SELECT id FROM nb)
    RETURNING 1
)
DELETE FROM learning_sessions
WHERE id IN (SELECT id FROM sess);

COMMIT;

-- Show that nothing is left for this activity + student.
SELECT
    (SELECT count(*) FROM learning_sessions ls
       JOIN activities a ON ls.activity_id = a.id
       JOIN users u ON ls.user_id = u.id
      WHERE a.title = :'activity' AND u.email = :'student_email')     AS sessions_left,
    (SELECT count(*) FROM student_notebooks sn
       JOIN activities a ON sn.activity_id = a.id
       JOIN users u ON sn.student_id = u.id
      WHERE a.title = :'activity' AND u.email = :'student_email')     AS notebooks_left;
