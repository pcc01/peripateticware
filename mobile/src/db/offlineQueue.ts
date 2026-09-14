// src/db/offlineQueue.ts
// Local queue for captures and notes created offline.
// CaptureSheet writes here first; sync loop uploads when online.

import 'react-native-get-random-values'; // needed for crypto.randomUUID polyfill
import { getDb } from './database';
import { uploadCapture } from '@/src/api/captures';
import { apiFetch, ApiError } from '@/src/api/client';
import { flushArrivals } from './wayfindingStore';

function uuid(): string {
  // Simple RFC-4122 v4 UUID without crypto dependency
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Capture queue ──────────────────────────────────────────────────────────

export interface QueuedCapture {
  id: string;
  local_uri: string;
  capture_type: string;
  session_id?: string;
  activity_id?: string;
  title?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  /** On-device speech-recognition transcript, set only for capture_type
   * 'audio' when CaptureSheet's parallel recognition session produced text.
   * Carried through the queue so it uploads together with the audio file —
   * see uploadCapture()'s `transcript` param. */
  transcript?: string;
  /** Set to 'consent_required' when the server's privacy-enforcement gate
   * rejected this upload — permanent until a guardian grants consent, so
   * flushQueue() records it here instead of bumping retry_count. See that
   * function's own comment for the full reasoning. */
  blocked_reason?: string | null;
}

export async function queueCapture(capture: Omit<QueuedCapture, 'id'>): Promise<string> {
  const db = await getDb();
  const id = uuid();
  await db.runAsync(
    `INSERT INTO capture_queue
     (id, local_uri, capture_type, session_id, activity_id, title, description, latitude, longitude, transcript)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      capture.local_uri,
      capture.capture_type,
      capture.session_id ?? null,
      capture.activity_id ?? null,
      capture.title ?? null,
      capture.description ?? null,
      capture.latitude ?? null,
      capture.longitude ?? null,
      capture.transcript ?? null,
    ]
  );
  return id;
}

export async function getPendingCaptures(): Promise<QueuedCapture[]> {
  const db = await getDb();
  return db.getAllAsync<QueuedCapture>(
    'SELECT * FROM capture_queue WHERE retry_count < 5 ORDER BY created_at ASC'
  );
}

export async function removeCaptureFromQueue(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM capture_queue WHERE id = ?', [id]);
}

/**
 * Amend a still-queued (not-yet-synced) capture's content in place, rather
 * than creating a new queue row — used by PeriChatSheet.tsx so re-opening
 * "Ask Peri" during the same activity visit grows ONE evolving transcript
 * capture instead of a new one per close. Returns false (a no-op, not an
 * error) if `id` no longer exists in the local queue — the row was already
 * uploaded and removed by flushQueue() since the last save, so there's
 * nothing left here to amend. The caller's job in that case is to queue a
 * fresh capture instead (see PeriChatSheet.tsx): once a capture has synced,
 * every other capture type in this app treats it as immutable evidence, and
 * a mutate-after-upload endpoint doesn't exist for any of them — a
 * re-opened chat becomes a new checkpoint capture instead, not a patch to
 * the uploaded one.
 */
export async function updateQueuedCaptureUri(id: string, local_uri: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.runAsync('UPDATE capture_queue SET local_uri = ? WHERE id = ?', [local_uri, id]);
  return result.changes > 0;
}

// ── Note queue ─────────────────────────────────────────────────────────────

export interface QueuedNote {
  id: string;
  type: 'reflection' | 'field_note';
  activity_id?: string;
  content: string;
}

export async function queueNote(note: Omit<QueuedNote, 'id'>): Promise<string> {
  const db = await getDb();
  const id = uuid();
  await db.runAsync(
    'INSERT INTO note_queue (id, type, activity_id, content) VALUES (?, ?, ?, ?)',
    [id, note.type, note.activity_id ?? null, note.content]
  );
  return id;
}

export async function getPendingNotes(): Promise<QueuedNote[]> {
  const db = await getDb();
  return db.getAllAsync<QueuedNote>(
    'SELECT * FROM note_queue WHERE retry_count < 5 ORDER BY created_at ASC'
  );
}

export async function removeNoteFromQueue(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM note_queue WHERE id = ?', [id]);
}

// ── Sync loop — call when connectivity is restored ─────────────────────────

export async function flushQueue(): Promise<{ uploaded: number; failed: number; blocked: number }> {
  let uploaded = 0;
  let failed = 0;
  let blocked = 0;

  // Upload queued captures
  const captures = await getPendingCaptures();
  for (const cap of captures) {
    try {
      // BUG FIX (2026-09-14): a sketch's local_uri is a full
      // `data:image/svg+xml;base64,<payload>` string (see CaptureSheet.tsx's
      // submitSketch/upload) — not a file:// path like every other capture
      // type. `local_uri.split('.').pop()` on a data URI (base64 has no '.'
      // in its alphabet) returned the ENTIRE data URI as `ext`, so the
      // uploaded filename became `capture.data:image/svg+xml;base64,<huge
      // payload>` — the backend then failed with `OSError: [Errno 36] File
      // name too long` (500) trying to write that to disk. Every sketch
      // capture failed to upload for this reason alone, regardless of the
      // activity_id fix above. Extract the extension from the data URI's
      // declared MIME type instead of blindly splitting on '.'.
      const dataUriMatch = cap.local_uri.match(/^data:([^;]+);base64,/);
      let ext: string;
      let mimeType: string;
      if (dataUriMatch) {
        mimeType = dataUriMatch[1];
        ext = mimeType === 'image/svg+xml' ? 'svg' : (mimeType.split('/').pop() ?? 'bin');
      } else {
        const mimeMap: Record<string, string> = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
          m4a: 'audio/m4a', webm: 'audio/webm', mp4: 'video/mp4',
          txt: 'text/plain',
        };
        ext = cap.local_uri.split('.').pop() ?? 'bin';
        mimeType = mimeMap[ext] ?? 'application/octet-stream';
      }
      await uploadCapture({
        file: { uri: cap.local_uri, name: `capture.${ext}`, type: mimeType },
        captureType: cap.capture_type,
        sessionId: cap.session_id,
        // BUG FIX (2026-09-14): activity_id was captured into the local
        // queue (queueCapture() stores it) but never forwarded here, so
        // every capture uploaded via the offline queue landed on the server
        // with activity_id=NULL. The reflection/draft save itself always
        // succeeded (it's a separate notebook-entry write), so the student
        // saw "Saved" — but GET /captures?activity_id=... (used by both the
        // activity screen and the journal's "Show captures" list) filters
        // directly on that column, so the captures were silently invisible
        // even though the files were safely uploaded and on disk server-side.
        activityId: cap.activity_id,
        title: cap.title,
        description: cap.description,
        latitude: cap.latitude,
        longitude: cap.longitude,
        transcript: cap.transcript,
      });
      await removeCaptureFromQueue(cap.id);
      uploaded++;
    } catch (e) {
      const db = await getDb();
      // BUG FIX / DESIGN (2026-09-14): a privacy-enforcement consent block
      // is PERMANENT until a guardian acts — bumping retry_count and
      // treating it like a flaky network error meant it either retried
      // forever on the same cadence as a real transient failure, or
      // silently stopped being retried at all once retry_count hit 5,
      // dropping the student's already-captured work from consideration
      // with no clear signal why. Record the reason instead, leave
      // retry_count untouched (so it keeps being re-attempted on every
      // future explicit "Save to Server"/Submit — the flush loop no longer
      // runs on any automatic background cadence, so there's no spam risk),
      // and let the UI (journal/activity capture lists) show it honestly:
      // "saved on your device, needs a parent's OK" instead of
      // "upload failed, try again".
      const blockedReason = e instanceof ApiError && e.errorCode === 'consent_required' ? 'consent_required' : null;
      if (blockedReason) {
        await db.runAsync(
          'UPDATE capture_queue SET blocked_reason = ? WHERE id = ?',
          [blockedReason, cap.id]
        );
        blocked++;
      } else {
        await db.runAsync(
          'UPDATE capture_queue SET retry_count = retry_count + 1 WHERE id = ?',
          [cap.id]
        );
        failed++;
      }
    }
  }

  // Replay queued waypoint arrivals (multi-step scavenger hunts). Best-effort
  // — a still-failing arrival stays queued and retries on the next flush.
  try {
    const wp = await flushArrivals();
    uploaded += wp.synced;
    failed += wp.failed;
  } catch {
    // never let a wayfinding sync error block capture/note upload
  }

  // Upload queued notes
  const notes = await getPendingNotes();
  for (const note of notes) {
    try {
      await apiFetch('/api/v1/student/field-notes', {
        method: 'POST',
        body: JSON.stringify({ content: note.content, activity_id: note.activity_id }),
      });
      await removeNoteFromQueue(note.id);
      uploaded++;
    } catch {
      const db = await getDb();
      await db.runAsync(
        'UPDATE note_queue SET retry_count = retry_count + 1 WHERE id = ?',
        [note.id]
      );
      failed++;
    }
  }

  return { uploaded, failed, blocked };
}

/** Captures currently stuck on a permanent consent block, for the UI to
 * surface (badge/message) and for a "retry after consent granted" action to
 * check without re-running a full flush. */
export async function getConsentBlockedCaptures(): Promise<QueuedCapture[]> {
  const db = await getDb();
  return db.getAllAsync<QueuedCapture>(
    "SELECT * FROM capture_queue WHERE blocked_reason = 'consent_required' ORDER BY created_at ASC"
  );
}
