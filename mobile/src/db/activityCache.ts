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

/**
 * Cache the FULL activity-detail payload (from GET /student/activities/{id}) —
 * including the wayfinding waypoints, route geometry, phases and discovery
 * content — so a multi-step scavenger hunt renders and navigates with no
 * connection. Called on every successful fetchActivity().
 */
export async function cacheActivityDetail(a: Activity): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO activity_cache
       (id, title, description, subject, grade_level, activity_type,
        difficulty_level, estimated_duration_minutes, location_name,
        location_latitude, location_longitude, location_radius_meters,
        bloom_level, status, detail_json, cached_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,strftime('%s','now'))`,
    [
      a.id, a.title, a.description ?? null, a.subject ?? null,
      a.grade_level ?? null, a.activity_type ?? null,
      a.difficulty_level ?? null, a.estimated_duration_minutes ?? null,
      a.location_name ?? null, a.location_latitude ?? null,
      a.location_longitude ?? null, a.location_radius_meters ?? null,
      a.bloom_level ?? null, a.status ?? null,
      JSON.stringify(a),
    ]
  );
}

export async function getCachedActivity(id: string): Promise<Activity | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Activity & { detail_json?: string | null }>(
    'SELECT * FROM activity_cache WHERE id = ?',
    [id]
  );
  if (!row) return null;
  if (row.detail_json) {
    try {
      return JSON.parse(row.detail_json) as Activity;
    } catch {
      // fall through to the flat-column reconstruction
    }
  }
  const { detail_json, ...flat } = row;
  return flat as Activity;
}
