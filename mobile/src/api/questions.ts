// src/api/questions.ts
// Prefers local SQLite (zero network), falls back to API when online

import { getLocalQuestion } from '@/src/db/questions';
import { apiFetch } from './client';

export interface ObservationQuestion {
  id: number;
  subject: string;
  grade_band: string;
  bloom_level: string;
  observation_type: string;
  question_text: string;
  follow_up: string | null;
}

export async function fetchQuestion(params: {
  subject?: string;
  grade?: string;
  bloom?: string;
}): Promise<ObservationQuestion | null> {
  // 1. Try local SQLite first (works offline)
  const local = await getLocalQuestion({
    subject: params.subject,
    gradeBand: params.grade,
    bloomLevel: params.bloom,
  });
  if (local) return local;

  // 2. Fall back to API (requires network)
  try {
    const qs = '?' + new URLSearchParams(
      Object.fromEntries(
        Object.entries({ ...params, limit: '1' })
          .filter(([, v]) => v !== undefined) as [string, string][]
      )
    ).toString();
    const data = await apiFetch<{ questions: ObservationQuestion[] }>(
      `/api/v1/aristotelian-questions${qs}`
    );
    return data.questions?.[0] ?? null;
  } catch {
    return null;
  }
}
