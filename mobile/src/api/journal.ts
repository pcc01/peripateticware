// src/api/journal.ts

import { apiFetch } from './client';

export interface JournalEntry {
  id: string;
  title?: string;
  content?: string;
  activity_id?: string;
  activity_title?: string;
  captures_count?: number;
  created_at: string;
  updated_at?: string;
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
    return Array.isArray(data) ? data : data.entries ?? [];
  } catch {
    return [];
  }
}

export async function fetchProgress(): Promise<ProgressData> {
  return apiFetch<ProgressData>('/api/v1/student/progress');
}
