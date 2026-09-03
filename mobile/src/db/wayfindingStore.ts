// src/db/wayfindingStore.ts
// Offline mirror of multi-step scavenger-hunt progress.
//
// PRIVACY: rung B — we store WHICH stop was reached and whether it was in
// sequence, never a coordinate. The local mirror lets a hunt advance
// ("2 of 5 stops") with no connection; flushArrivals() replays the
// reports to the server on reconnect. See WAYFINDING_CONSENT_LADDER.md §2.

import 'react-native-get-random-values';
import { getDb } from './database';
import { recordWaypointArrival } from '@/src/api/wayfinding';
import { startActivitySession } from '@/src/api/activities';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface LocalArrival {
  activity_id: string;
  waypoint_id: string;
  waypoint_index: number | null;
  arrived_at: number | null; // epoch seconds
  in_sequence: number; // 0 | 1
  captured: number; // 0 | 1
  skipped: number; // 0 | 1
  synced: number; // 0 | 1
}

interface QueuedArrival {
  id: string;
  activity_id: string;
  waypoint_id: string;
  in_sequence: number;
  captured: number;
  skipped: number;
  retry_count: number;
}

/**
 * Record a stop as reached in the local mirror and enqueue it for sync.
 * Idempotent per (activity, waypoint) — a re-report keeps the first
 * arrival time and never un-sets `captured`.
 */
export async function recordLocalArrival(
  activityId: string,
  waypoint: { id: string; sequence_index: number },
  opts: { inSequence?: boolean; captured?: boolean; skipped?: boolean } = {}
): Promise<void> {
  const db = await getDb();
  const inSeq = opts.inSequence === false ? 0 : 1;
  const cap = opts.captured ? 1 : 0;
  const skip = opts.skipped ? 1 : 0;
  const now = Math.floor(Date.now() / 1000);

  await db.runAsync(
    `INSERT OR IGNORE INTO wp_progress
       (activity_id, waypoint_id, waypoint_index, arrived_at, in_sequence, captured, skipped, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [activityId, waypoint.id, waypoint.sequence_index, now, inSeq, cap, skip]
  );
  await db.runAsync(
    `UPDATE wp_progress
        SET arrived_at  = COALESCE(arrived_at, ?),
            in_sequence = ?,
            captured    = MAX(captured, ?),
            skipped     = ?,
            synced      = 0
      WHERE activity_id = ? AND waypoint_id = ?`,
    [now, inSeq, cap, skip, activityId, waypoint.id]
  );
  await db.runAsync(
    `INSERT INTO wp_arrival_queue
       (id, activity_id, waypoint_id, in_sequence, captured, skipped)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuid(), activityId, waypoint.id, inSeq, cap, skip]
  );
}

/**
 * Mark a local arrival as already synced and drop its queued copy — call
 * after a direct (online) server report succeeds so flushArrivals() doesn't
 * replay it. The replay would be harmless (the endpoint is idempotent) but
 * this keeps the queue clean.
 */
export async function markLocalArrivalSynced(
  activityId: string,
  waypointId: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'DELETE FROM wp_arrival_queue WHERE activity_id = ? AND waypoint_id = ?',
    [activityId, waypointId]
  );
  await db.runAsync(
    'UPDATE wp_progress SET synced = 1 WHERE activity_id = ? AND waypoint_id = ?',
    [activityId, waypointId]
  );
}

/** Waypoint ids reached (per this device) for an activity. */
export async function getLocalProgress(activityId: string): Promise<LocalArrival[]> {
  const db = await getDb();
  return db.getAllAsync<LocalArrival>(
    'SELECT * FROM wp_progress WHERE activity_id = ? AND arrived_at IS NOT NULL',
    [activityId]
  );
}

/** Set of reached waypoint ids — convenience for merging with server progress. */
export async function getLocalArrivedIds(activityId: string): Promise<Set<string>> {
  const rows = await getLocalProgress(activityId);
  return new Set(rows.map((r) => r.waypoint_id));
}

/**
 * Replay every queued arrival to the server. Groups by activity, resolves
 * (or resumes) a session per activity, then POSTs each arrival. Best-effort:
 * anything still failing stays queued with a bumped retry count. Called from
 * flushQueue() when connectivity returns.
 */
export async function flushArrivals(): Promise<{ synced: number; failed: number }> {
  const db = await getDb();
  const rows = await db.getAllAsync<QueuedArrival>(
    'SELECT * FROM wp_arrival_queue WHERE retry_count < 5 ORDER BY created_at ASC'
  );
  if (rows.length === 0) return { synced: 0, failed: 0 };

  const byActivity = new Map<string, QueuedArrival[]>();
  for (const r of rows) {
    const list = byActivity.get(r.activity_id);
    if (list) list.push(r);
    else byActivity.set(r.activity_id, [r]);
  }

  let synced = 0;
  let failed = 0;
  for (const [activityId, items] of byActivity) {
    let sessionId: string;
    try {
      const s = await startActivitySession(activityId);
      sessionId = s.session_id;
    } catch {
      // Still offline or server unreachable — leave the whole batch queued.
      failed += items.length;
      continue;
    }
    for (const it of items) {
      const ok = await recordWaypointArrival(sessionId, it.waypoint_id, {
        inSequence: !!it.in_sequence,
        captured: !!it.captured,
        skipped: !!it.skipped,
      });
      if (ok) {
        await db.runAsync('DELETE FROM wp_arrival_queue WHERE id = ?', [it.id]);
        await db.runAsync(
          'UPDATE wp_progress SET synced = 1 WHERE activity_id = ? AND waypoint_id = ?',
          [activityId, it.waypoint_id]
        );
        synced++;
      } else {
        await db.runAsync(
          'UPDATE wp_arrival_queue SET retry_count = retry_count + 1 WHERE id = ?',
          [it.id]
        );
        failed++;
      }
    }
  }
  return { synced, failed };
}
