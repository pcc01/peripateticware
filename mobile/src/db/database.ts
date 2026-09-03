// src/db/database.ts
// SQLite singleton — opens (or creates) peripateticware.db on device
// All offline tables live here: questions, activity_cache, capture_queue, field_note_queue

import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('peripateticware.db');
  await initSchema(_db);
  return _db;
}

async function initSchema(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    -- Observation questions (downloaded from /api/v1/aristotelian-questions/sqlite)
    CREATE TABLE IF NOT EXISTS questions (
      id              INTEGER PRIMARY KEY,
      subject         TEXT NOT NULL,
      grade_band      TEXT NOT NULL,
      bloom_level     TEXT NOT NULL,
      observation_type TEXT NOT NULL,
      question_text   TEXT NOT NULL,
      follow_up       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_q_subject ON questions(subject);
    CREATE INDEX IF NOT EXISTS idx_q_grade   ON questions(grade_band);
    CREATE INDEX IF NOT EXISTS idx_q_bloom   ON questions(bloom_level);

    -- Metadata about the questions download
    CREATE TABLE IF NOT EXISTS questions_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- Cached activities (from GET /api/v1/student/activities)
    CREATE TABLE IF NOT EXISTS activity_cache (
      id                TEXT PRIMARY KEY,
      title             TEXT NOT NULL,
      description       TEXT,
      subject           TEXT,
      grade_level       INTEGER,
      activity_type     TEXT,
      difficulty_level  INTEGER,
      estimated_duration_minutes INTEGER,
      location_name     TEXT,
      location_latitude REAL,
      location_longitude REAL,
      location_radius_meters REAL,
      bloom_level       TEXT,
      status            TEXT,
      cached_at         INTEGER DEFAULT (strftime('%s','now'))
    );

    -- Capture upload queue (offline captures waiting to sync)
    CREATE TABLE IF NOT EXISTS capture_queue (
      id            TEXT PRIMARY KEY,
      local_uri     TEXT NOT NULL,
      capture_type  TEXT NOT NULL,
      session_id    TEXT,
      activity_id   TEXT,
      title         TEXT,
      description   TEXT,
      latitude      REAL,
      longitude     REAL,
      created_at    INTEGER DEFAULT (strftime('%s','now')),
      retry_count   INTEGER DEFAULT 0,
      last_error    TEXT
    );

    -- Field note / reflection queue
    CREATE TABLE IF NOT EXISTS note_queue (
      id           TEXT PRIMARY KEY,
      type         TEXT NOT NULL,  -- 'reflection' | 'field_note'
      activity_id  TEXT,
      content      TEXT NOT NULL,
      created_at   INTEGER DEFAULT (strftime('%s','now')),
      retry_count  INTEGER DEFAULT 0,
      last_error   TEXT
    );

    -- Wayfinding: local mirror of per-waypoint progress so a multi-step
    -- scavenger hunt advances ("2 of 5 stops") with no connection. Synced
    -- to the server by flushArrivals() when back online.
    CREATE TABLE IF NOT EXISTS wp_progress (
      activity_id     TEXT NOT NULL,
      waypoint_id     TEXT NOT NULL,
      waypoint_index  INTEGER,
      arrived_at      INTEGER,           -- epoch seconds, NULL = not reached
      in_sequence     INTEGER DEFAULT 1,
      captured        INTEGER DEFAULT 0,
      skipped         INTEGER DEFAULT 0,
      synced          INTEGER DEFAULT 0, -- 1 once the server has this arrival
      PRIMARY KEY (activity_id, waypoint_id)
    );

    -- Pending "I reached this stop" reports, replayed on reconnect.
    CREATE TABLE IF NOT EXISTS wp_arrival_queue (
      id            TEXT PRIMARY KEY,
      activity_id   TEXT NOT NULL,
      waypoint_id   TEXT NOT NULL,
      in_sequence   INTEGER DEFAULT 1,
      captured      INTEGER DEFAULT 0,
      skipped       INTEGER DEFAULT 0,
      created_at    INTEGER DEFAULT (strftime('%s','now')),
      retry_count   INTEGER DEFAULT 0
    );
  `);

  // Idempotent column add for the full activity-detail payload (wayfinding
  // waypoints, route, phases, discovery). Older installs have activity_cache
  // without it. ALTER ... ADD COLUMN is a no-op-safe SQLite op wrapped here
  // so a re-run doesn't throw "duplicate column".
  try {
    await db.execAsync('ALTER TABLE activity_cache ADD COLUMN detail_json TEXT');
  } catch {
    // column already exists — fine
  }
}
