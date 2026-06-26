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
  `);
}
