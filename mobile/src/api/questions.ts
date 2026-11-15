// src/api/questions.ts
// Prefers local SQLite (zero network), falls back to API when online

import { getLocalQuestion } from '@/src/db/questions';
import { apiFetch } from './client';
import { fillBankPlaceToken } from '@/src/lib/gradeBand';

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
  // Preferred inquiry stage (spec item 10's observation_type->stage
  // mapping) — several stages have no matching bank row at all, so this
  // is a soft preference, not a hard filter (see getLocalQuestion).
  stage?: string;
  // Activity's location_name, substituted for any {place} token in the
  // bank's question_text/follow_up (spec item 13 adds the first rows that
  // actually use it).
  placeName?: string;
}): Promise<ObservationQuestion | null> {
  const fillPlace = (q: ObservationQuestion | null): ObservationQuestion | null => {
    if (!q) return q;
    return {
      ...q,
      question_text: fillBankPlaceToken(q.question_text, params.placeName) ?? q.question_text,
      follow_up: fillBankPlaceToken(q.follow_up, params.placeName),
    };
  };

  // 1. Try local SQLite first (works offline)
  const local = await getLocalQuestion({
    subject: params.subject,
    gradeBand: params.grade,
    bloomLevel: params.bloom,
    stage: params.stage,
  });
  if (local) return fillPlace(local);

  // 2. Fall back to API (requires network)
  try {
    const qs = '?' + new URLSearchParams(
      Object.fromEntries(
        Object.entries({ subject: params.subject, grade: params.grade, bloom: params.bloom, limit: '1' })
          .filter(([, v]) => v !== undefined) as [string, string][]
      )
    ).toString();
    const data = await apiFetch<{ questions: ObservationQuestion[] }>(
      `/api/v1/aristotelian-questions${qs}`
    );
    return fillPlace(data.questions?.[0] ?? null);
  } catch {
    return null;
  }
}
