// src/db/questions.ts
// Downloads questions.sqlite from backend on first launch (or when stale),
// then queries locally. Zero network required in the field.

import * as FileSystem from 'expo-file-system';
import { getDb } from './database';
import { API_BASE, getToken } from '@/src/api/client';

const QUESTIONS_CACHE_DAYS = 7;

export interface LocalQuestion {
  id: number;
  subject: string;
  grade_band: string;
  bloom_level: string;
  observation_type: string;
  question_text: string;
  follow_up: string | null;
}

/** Returns true if local question DB is empty or older than QUESTIONS_CACHE_DAYS */
async function needsRefresh(): Promise<boolean> {
  const db = await getDb();
  const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM questions');
  if (!count || count.n === 0) return true;

  const meta = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM questions_meta WHERE key = 'downloaded_at'"
  );
  if (!meta) return true;

  const ageMs = Date.now() - parseInt(meta.value, 10);
  return ageMs > QUESTIONS_CACHE_DAYS * 86_400_000;
}

/** Download questions.sqlite from backend and import into local DB */
export async function syncQuestionsFromServer(): Promise<void> {
  try {
    const token = await getToken();
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    // Download the sqlite file
    const tmpPath = FileSystem.cacheDirectory + 'questions_download.sqlite';
    const result = await FileSystem.downloadAsync(
      `${API_BASE}/api/v1/aristotelian-questions/sqlite`,
      tmpPath,
      { headers }
    );
    if (result.status !== 200) throw new Error(`Download failed: ${result.status}`);

    // Open downloaded DB and read all rows
    const { SQLiteDatabase } = await import('expo-sqlite');
    const downloadedDb = await (await import('expo-sqlite')).openDatabaseAsync(tmpPath);
    const rows = await downloadedDb.getAllAsync<LocalQuestion>(
      'SELECT * FROM aristotelian_questions ORDER BY id'
    );
    await downloadedDb.closeAsync();
    await FileSystem.deleteAsync(tmpPath, { idempotent: true });

    if (rows.length === 0) return; // Nothing to import

    // Insert into local DB
    const db = await getDb();
    await db.runAsync('DELETE FROM questions');
    await db.withTransactionAsync(async () => {
      for (const q of rows) {
        await db.runAsync(
          `INSERT OR REPLACE INTO questions
           (id, subject, grade_band, bloom_level, observation_type, question_text, follow_up)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [q.id, q.subject, q.grade_band, q.bloom_level, q.observation_type, q.question_text, q.follow_up ?? null]
        );
      }
      await db.runAsync(
        "INSERT OR REPLACE INTO questions_meta (key, value) VALUES ('downloaded_at', ?)",
        [Date.now().toString()]
      );
    });

    console.log(`✅ Questions synced: ${rows.length} questions stored locally`);
  } catch (e) {
    console.warn('⊘ Questions sync failed (will use cached or API fallback):', e);
  }
}

/** Get a random question from local DB — zero network. Falls back to null. */
export async function getLocalQuestion(params: {
  subject?: string;
  gradeBand?: string;
  bloomLevel?: string;
}): Promise<LocalQuestion | null> {
  try {
    const db = await getDb();
    const conditions: string[] = [];
    const args: string[] = [];

    if (params.subject) {
      conditions.push('subject = ?');
      args.push(params.subject.toLowerCase());
    }
    if (params.gradeBand) {
      conditions.push('grade_band = ?');
      args.push(params.gradeBand.toLowerCase());
    }
    if (params.bloomLevel) {
      conditions.push('bloom_level = ?');
      args.push(params.bloomLevel.toLowerCase());
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const row = await db.getFirstAsync<LocalQuestion>(
      `SELECT * FROM questions ${where} ORDER BY RANDOM() LIMIT 1`,
      args
    );
    return row ?? null;
  } catch {
    return null;
  }
}

/** Initialise questions on app start — refresh if stale */
export async function initQuestions(): Promise<void> {
  if (await needsRefresh()) {
    await syncQuestionsFromServer();
  }
}
