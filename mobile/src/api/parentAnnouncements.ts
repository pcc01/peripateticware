// src/api/parentAnnouncements.ts
// Classroom-wide, teacher-initiated broadcasts — one-way (no reply), scoped
// server-side to classrooms this parent's linked children belong to. See
// backend/routes/parent.py's get_parent_announcements /
// AnnouncementResponse (~line 804) for the exact shape and the security
// note on scoping. Unlike studentAnnouncements, each item also carries
// child_id/child_name — a parent can have more than one linked child,
// possibly in different classrooms, so the UI needs to say which child an
// announcement applies to.

import { apiFetch } from './client';

export interface ParentAnnouncement {
  id: string;
  classroom_id: string;
  classroom_name: string;
  teacher_id: string;
  teacher_name: string;
  child_id: string;
  child_name: string;
  title: string;
  body: string;
  created_at: string;
}

export async function fetchParentAnnouncements(): Promise<ParentAnnouncement[]> {
  return apiFetch<ParentAnnouncement[]>('/api/v1/parent/announcements');
}
