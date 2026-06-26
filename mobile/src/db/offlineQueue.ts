// src/db/offlineQueue.ts
// Local queue for captures and notes created offline.
// CaptureSheet writes here first; sync loop uploads when online.

import 'react-native-get-random-values'; // needed for crypto.randomUUID polyfill
import { getDb } from './database';
import { uploadCapture } from '@/src/api/captures';
import { apiFetch } from '@/src/api/client';

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
}

export async function queueCapture(capture: Omit<QueuedCapture, 'id'>): Promise<string> {
  const db = await getDb();
  const id = uuid();
  await db.runAsync(
    `INSERT INTO capture_queue
     (id, local_uri, capture_type, session_id, activity_id, title, description, latitude, longitude)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

export async function flushQueue(): Promise<{ uploaded: number; failed: number }> {
  let uploaded = 0;
  let failed = 0;

  // Upload queued captures
  const captures = await getPendingCaptures();
  for (const cap of captures) {
    try {
      const ext = cap.local_uri.split('.').pop() ?? 'bin';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        m4a: 'audio/m4a', webm: 'audio/webm', mp4: 'video/mp4',
        txt: 'text/plain',
      };
      await uploadCapture({
        file: { uri: cap.local_uri, name: `capture.${ext}`, type: mimeMap[ext] ?? 'application/octet-stream' },
        captureType: cap.capture_type,
        sessionId: cap.session_id,
        latitude: cap.latitude,
        longitude: cap.longitude,
      });
      await removeCaptureFromQueue(cap.id);
      uploaded++;
    } catch {
      const db = await getDb();
      await db.runAsync(
        'UPDATE capture_queue SET retry_count = retry_count + 1 WHERE id = ?',
        [cap.id]
      );
      failed++;
    }
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

  return { uploaded, failed };
}
