// src/api/journal.ts

import { apiFetch } from './client';

// Mirrors backend NotebookResponse (backend/routes/student.py) — the
// student_notebooks table, keyed by where/why/how rather than a single
// freeform "content" field.
export interface JournalEntry {
  id: string;
  student_id: string;
  activity_id?: string | null;
  where_notes?: string | null;
  why_notes?: string | null;
  how_notes?: string | null;
  learning_insights?: string | null;
  next_steps?: string | null;
  is_submitted: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotebookEntryInput {
  activity_id?: string;
  where_notes?: string;
  why_notes?: string;
  how_notes?: string;
  learning_insights?: string;
  next_steps?: string;
}

export interface ProgressData {
  total_activities_completed: number;
  total_captures: number;
  current_streak_days: number;
  competencies: { name: string; level: number; max_level: number }[];
  badges: { id: string; name: string; emoji: string; earned_at: string }[];
}

export async function fetchJournal(): Promise<JournalEntry[]> {
  try {
    const data = await apiFetch<{ entries: JournalEntry[] } | JournalEntry[]>(
      '/api/v1/student/notebook'
    );
    return Array.isArray(data) ? data : (data as any).entries ?? [];
  } catch {
    return [];
  }
}

/** Most recent notebook entry for a given activity, or null if the student
 * hasn't started one yet (used to resume a draft / detect prior submission). */
export async function fetchNotebookEntryForActivity(activityId: string): Promise<JournalEntry | null> {
  try {
    const entries = await apiFetch<JournalEntry[]>(
      `/api/v1/student/notebook?activity_id=${activityId}`
    );
    return entries[0] ?? null;
  } catch {
    return null;
  }
}

export async function createNotebookEntry(input: NotebookEntryInput): Promise<JournalEntry> {
  return apiFetch<JournalEntry>('/api/v1/student/notebook', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateNotebookEntry(id: string, input: NotebookEntryInput): Promise<JournalEntry> {
  return apiFetch<JournalEntry>(`/api/v1/student/notebook/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function submitNotebookEntry(id: string): Promise<void> {
  await apiFetch(`/api/v1/student/notebook/${id}/submit`, { method: 'POST' });
}

export async function linkCaptureToNotebook(entryId: string, captureId: string): Promise<void> {
  await apiFetch(`/api/v1/student/notebook/${entryId}/link-capture?capture_id=${captureId}`, {
    method: 'POST',
  });
}

export async function fetchProgress(): Promise<ProgressData> {
  return apiFetch<ProgressData>('/api/v1/student/progress');
}
