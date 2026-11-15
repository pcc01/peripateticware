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

export const CACHE_PRUNE_MAX_AGE_DAYS = 30;
export const CACHE_PRUNE_KEEP_MOST_RECENT = 50;

/**
 * Delete stale activity_cache rows (PERI_OFFLINE_SPEC_v2.md "SQLite
 * growth" — activity_cache is the one table that was INSERT-OR-REPLACE'd
 * forever with no prune anywhere, unlike `questions`, which is wiped and
 * reloaded on every sync).
 *
 * An activity is a prune candidate once it's older than
 * CACHE_PRUNE_MAX_AGE_DAYS OR falls outside the CACHE_PRUNE_KEEP_MOST_RECENT
 * most-recently-cached rows — UNLESS it has any unsynced local data
 * (a queued capture/note/arrival, or a hunt still in progress), which is
 * never pruned no matter how old, since that's the only copy of that work
 * until the next successful sync.
 *
 * Also prunes mirror-progress for any activity actually removed here
 * (spec's wayfinding section: "extend [pruning] to prune wp_progress rows
 * for activities removed from the cache, in the same pass") — once the
 * activity_cache row is gone there's nothing left to resume progress
 * display against, so keeping synced wp_progress rows around indefinitely
 * would just be the same unbounded-growth problem moved one table over.
 */
export async function pruneActivityCache(): Promise<{ deleted: number }> {
  const db = await getDb();
  const cutoff = Math.floor(Date.now() / 1000) - CACHE_PRUNE_MAX_AGE_DAYS * 86400;

  const [captureRows, noteRows, arrivalRows, progressRows, cacheRows] = await Promise.all([
    db.getAllAsync<{ activity_id: string | null }>(
      'SELECT DISTINCT activity_id FROM capture_queue'
    ),
    db.getAllAsync<{ activity_id: string | null }>(
      'SELECT DISTINCT activity_id FROM note_queue'
    ),
    db.getAllAsync<{ activity_id: string }>(
      'SELECT DISTINCT activity_id FROM wp_arrival_queue'
    ),
    // An in-progress hunt: a stop reached but not yet synced. (A fully-
    // synced wp_progress row is NOT protection on its own — only queue
    // rows and in-progress hunts are.)
    db.getAllAsync<{ activity_id: string }>(
      'SELECT DISTINCT activity_id FROM wp_progress WHERE arrived_at IS NOT NULL AND synced = 0'
    ),
    db.getAllAsync<{ id: string; cached_at: number }>(
      'SELECT id, cached_at FROM activity_cache ORDER BY cached_at DESC'
    ),
  ]);

  const protectedIds = new Set<string>();
  for (const r of [...captureRows, ...noteRows]) {
    if (r.activity_id) protectedIds.add(r.activity_id);
  }
  for (const r of arrivalRows) protectedIds.add(r.activity_id);
  for (const r of progressRows) protectedIds.add(r.activity_id);

  const toDelete = cacheRows
    .filter((row, index) => {
      if (protectedIds.has(row.id)) return false;
      const tooOld = row.cached_at < cutoff;
      const beyondKeepCount = index >= CACHE_PRUNE_KEEP_MOST_RECENT;
      return tooOld || beyondKeepCount;
    })
    .map((row) => row.id);

  for (const id of toDelete) {
    await db.runAsync('DELETE FROM activity_cache WHERE id = ?', [id]);
    await db.runAsync('DELETE FROM wp_progress WHERE activity_id = ?', [id]);
  }

  return { deleted: toDelete.length };
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
