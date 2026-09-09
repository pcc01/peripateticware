-- reset-wayfinding-prod.sql
--
-- Clears all learning-session and waypoint-progress state for ONE wayfinding
-- activity, so maestro/flows-prod/wayfinding-prod.yaml starts again from
-- "0 of 3 stops". Scoped by activity title — only ever touches the dedicated
-- QA activity, never real student data. Safe to run repeatedly.
--
-- startActivitySession is "start or resume" server-side, so without this a
-- second run (or a second device on the same QA student account) resumes the
-- finished session and the flow fails at "NEXT STOP".
--
-- Pass the title with -v activity=... (defaults to the South Whidbey QA hunt).
-- Host / db user / db name come from your shell env, not the repo — set
-- PROD_SSH / DB_USER / DB_NAME first (PROD_E2E_GUIDE.md §0):
--
--   ssh "$PROD_SSH" "docker exec -i peripateticware-postgres \
--     psql -U $DB_USER -d $DB_NAME \
--     -v activity='Campus Wayfinding Hunt'" < scripts/reset-wayfinding-prod.sql
--
-- (use the activity title you actually ran)

\if :{?activity}
\else
  \set activity 'QA Waypoints — South Whidbey Community Park'
\endif

\set ON_ERROR_STOP on
\echo 'Resetting wayfinding state for activity:' :'activity'

BEGIN;

WITH act AS (
    SELECT id FROM activities WHERE title = :'activity'
),
sess AS (
    SELECT ls.id
    FROM learning_sessions ls
    JOIN act ON ls.activity_id = act.id
),
_events AS (
    DELETE FROM session_events
    WHERE session_id IN (SELECT id FROM sess)
    RETURNING 1
),
_progress AS (
    DELETE FROM session_waypoint_progress
    WHERE activity_id IN (SELECT id FROM act)
       OR session_id  IN (SELECT id FROM sess)
    RETURNING 1
),
_tracks AS (
    DELETE FROM session_tracks
    WHERE session_id IN (SELECT id FROM sess)
    RETURNING 1
)
DELETE FROM learning_sessions
WHERE id IN (SELECT id FROM sess);

COMMIT;

-- Show that nothing is left for this activity.
SELECT
    (SELECT count(*) FROM learning_sessions ls
       JOIN activities a ON ls.activity_id = a.id
      WHERE a.title = :'activity')                              AS sessions_left,
    (SELECT count(*) FROM session_waypoint_progress swp
       JOIN activities a ON swp.activity_id = a.id
      WHERE a.title = :'activity')                              AS progress_rows_left;
