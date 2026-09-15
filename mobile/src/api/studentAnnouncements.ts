// src/api/studentAnnouncements.ts
// Classroom-wide, teacher-initiated broadcasts — one-way (no reply), scoped
// server-side to classrooms the calling student is enrolled in. See
// backend/routes/student.py's get_student_announcements /
// StudentAnnouncementResponse (~line 712) for the exact shape and the
// security note on scoping.

import { apiFetch } from './client';

export interface StudentAnnouncement {
  id: string;
  classroom_id: string;
  classroom_name: string;
  teacher_id: string;
  teacher_name: string;
  title: string;
  body: string;
  created_at: string;
}

export async function fetchStudentAnnouncements(): Promise<StudentAnnouncement[]> {
  return apiFetch<StudentAnnouncement[]>('/api/v1/student/announcements');
}
