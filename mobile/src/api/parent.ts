// src/api/parent.ts
// Read-only summary for the mobile parent dashboard — reuses the same
// backend/routes/parent.py endpoints the web parent dashboard calls.
// GET /parent/dashboard exists but its `children` field is a permanent
// empty-array stub server-side (see that route's own comment), so the
// linked-children list comes from GET /parent/children instead, with each
// child's progress fetched individually from GET /parent/children/{id}/progress.

import { apiFetch } from './client';

export interface LinkedChild {
  id: string;
  child_id: string;
  child_name: string;
  child_avatar?: string | null;
  relationship: string;
  linked_at: string;
}

export interface CompetencyProgress {
  name: string;
  level: number;
  max_level: number;
}

export interface ChildProgress {
  child_id: string;
  child_name: string;
  grade: number;
  competencies: CompetencyProgress[];
  activities_completed: number;
  hours_learned: number;
  engagement_score: number;
  last_active: string;
}

export async function fetchLinkedChildren(): Promise<LinkedChild[]> {
  return apiFetch<LinkedChild[]>('/api/v1/parent/children');
}

export async function fetchChildProgress(childId: string): Promise<ChildProgress> {
  return apiFetch<ChildProgress>(`/api/v1/parent/children/${childId}/progress`);
}
