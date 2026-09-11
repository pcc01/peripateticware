-- reset-activity-submission-prod.sql
--
-- Clears the learning-session, notebook entries, and submission record for
-- ONE activity + ONE student, so maestro/flows/activity/4-6-activity-flow.yaml
-- (and any other flow that submits field work) can be re-run from scratch.
-- Scoped by activity title + student email — only ever touches the
-- dedicated QA student's data, never real student data. Safe to run
-- repeatedly.
--
-- startActivitySession is "start or resume" server-side, and a submitted
-- activity_submissions row makes ReflectPhase render "Submitted ✓" instead
-- of "Submit field work" on load — so without this, re-running 4-6 (or the
-- full non-waypoint suite, which includes it) against the same QA account
-- fails at "Tap on Submit field work: element not found" the second time,
-- same class of gotcha as reset-wayfinding-prod.sql.
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
    WHERE ls.activity_id = act.id AND ls.student_id = stu.id
),
_submissions AS (
    DELETE FROM activity_submissions
    WHERE activity_id IN (SELECT id FROM act)
      AND student_id  IN (SELECT id FROM stu)
    RETURNING 1
),
_entries AS (
    DELETE FROM notebook_entries
    WHERE session_id IN (SELECT id FROM sess)
    RETURNING 1
)
DELETE FROM learning_sessions
WHERE id IN (SELECT id FROM sess);

COMMIT;

-- Show that nothing is left for this activity + student.
SELECT
    (SELECT count(*) FROM learning_sessions ls
       JOIN activities a ON ls.activity_id = a.id
       JOIN users u ON ls.student_id = u.id
      WHERE a.title = :'activity' AND u.email = :'student_email')  AS sessions_left,
    (SELECT count(*) FROM activity_submissions asub
       JOIN activities a ON asub.activity_id = a.id
       JOIN users u ON asub.student_id = u.id
      WHERE a.title = :'activity' AND u.email = :'student_email')  AS submissions_left;
