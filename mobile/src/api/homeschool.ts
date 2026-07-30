// src/api/homeschool.ts
// Read-only summary for the mobile homeschool dashboard — reuses the same
// backend/routes/homeschool.py endpoints the web Homeschool pages call.
// Distinct from src/api/parent.ts: a HOMESCHOOL account is the child's
// teacher-of-record (creates activities, tracks state-requirement coverage),
// not just an observer of a school-enrolled kid's progress — but mobile
// still only shows a lean summary here, same as teacher/parent; curriculum
// coverage, standards import/export, and adding/editing children stay
// web-only.

import { apiFetch } from './client';

export interface HomeschoolDashboard {
  child_count: number;
  activity_count: number;
  session_count: number;
  standards_count: number;
}

export interface HomeschoolChild {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  grade_level: number | null;
  age_band: string | null;
  created_at: string | null;
}

export interface HomeschoolChildProgress {
  child_id: string;
  child_name: string;
  total_sessions: number;
  completed_sessions: number;
  overall_progress: number;
}

export async function fetchHomeschoolDashboard(): Promise<HomeschoolDashboard> {
  return apiFetch<HomeschoolDashboard>('/api/v1/homeschool/dashboard');
}

export async function fetchHomeschoolChildren(): Promise<HomeschoolChild[]> {
  return apiFetch<HomeschoolChild[]>('/api/v1/homeschool/children');
}

export async function fetchHomeschoolChildProgress(childId: string): Promise<HomeschoolChildProgress> {
  return apiFetch<HomeschoolChildProgress>(`/api/v1/homeschool/children/${childId}/progress`);
}
