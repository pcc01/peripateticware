// src/api/teacher.ts
// Read-only summary for the mobile teacher dashboard — reuses the same
// backend/routes/activities.py `GET /teacher/dashboard` endpoint the web
// TeacherDashboard page calls. Mobile shows a lean subset (summary counts +
// recent activities); full classroom/roster/rubric management stays
// web-only, same reasoning as students being mobile-only for field capture.

import { apiFetch } from './client';

export interface TeacherRecentActivity {
  id: string;
  title: string;
  status: string;
  subject: string;
  created_at: string | null;
}

export interface TeacherDashboard {
  total_students: number;
  total_classes: number;
  active_activities: number;
  pending_submissions: number;
  activities: TeacherRecentActivity[];
}

export async function fetchTeacherDashboard(): Promise<TeacherDashboard> {
  // Note: lives under the activities router's own prefix, not /api/v1/teacher —
  // routes/activities.py's router is mounted at /api/v1/activities and this
  // endpoint is declared as "/teacher/dashboard" relative to that.
  return apiFetch<TeacherDashboard>('/api/v1/activities/teacher/dashboard');
}

export interface TeacherSubmission {
  session_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  activity_id: string;
  activity_title: string;
  status: string;
  started_at: string | null;
}

export async function fetchTeacherSubmissions(): Promise<TeacherSubmission[]> {
  // GET /activities/teacher/submissions — same ownership-filtered query
  // teacher_dashboard uses, no separate role gate (safe: it filters by
  // a.teacher_id == current_user.id, which only ever matches accounts
  // that actually own activities).
  return apiFetch<TeacherSubmission[]>('/api/v1/activities/teacher/submissions?limit=200');
}

// Full detail for one activity — reuses the generic (not student-scoped)
// GET /activities/{id}, which any owner (teacher or HOMESCHOOL) can read.
// Deliberately narrower than the full ActivityResponse schema: only the
// fields the read-only teacher-activity detail screen actually renders.
export interface TeacherActivityDetail {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade_level: number;
  status: string;
  activity_type: string;
  estimated_duration_minutes: number;
  location_name?: string | null;
  learning_objectives: string[];
  created_at: string;
}

export async function fetchTeacherActivityDetail(id: string): Promise<TeacherActivityDetail> {
  return apiFetch<TeacherActivityDetail>(`/api/v1/activities/${id}`);
}
