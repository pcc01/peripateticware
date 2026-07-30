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
