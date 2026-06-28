// src/db/activityCache.ts
// Cache activities locally so Discover works offline

import { getDb } from './database';
import { Activity } from '@/src/api/activities';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

export async function cacheActivities(activities: Activity[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const a of activities) {
      await db.runAsync(
        `INSERT OR REPLACE INTO activity_cache
         (id, title, description, subject, grade_level, activity_type,
          difficulty_level, estimated_duration_minutes, location_name,
          location_latitude, location_longitude, location_radius_meters,
          bloom_level, status, cached_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,strftime('%s','now'))`,
        [
          a.id, a.title, a.description ?? null, a.subject ?? null,
          a.grade_level ?? null, a.activity_type ?? null,
          a.difficulty_level ?? null, a.estimated_duration_minutes ?? null,
          a.location_name ?? null, a.location_latitude ?? null,
          a.location_longitude ?? null, a.location_radius_meters ?? null,
          a.bloom_level ?? null, a.status ?? null,
        ]
      );
    }
  });
}

export async function getCachedActivities(): Promise<Activity[]> {
  const db = await getDb();
  const cutoff = Math.floor((Date.now() - CACHE_TTL_MS) / 1000);
  const rows = await db.getAllAsync<Activity>(
    'SELECT * FROM activity_cache WHERE cached_at > ? ORDER BY title ASC',
    [cutoff]
  );
  return rows;
}

export async function getCachedActivity(id: string): Promise<Activity | null> {
  const db = await getDb();
  return db.getFirstAsync<Activity>(
    'SELECT * FROM activity_cache WHERE id = ?',
    [id]
  );
}
