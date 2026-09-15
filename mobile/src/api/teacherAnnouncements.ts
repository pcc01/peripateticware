// src/api/teacherAnnouncements.ts
// TEACHER side of classroom-wide announcements — backend/routes/
// teacher_communication.py has had create/list endpoints for this the
// whole time (POST/GET /teacher/classrooms/{id}/announcements), but until
// now nothing in the mobile app called them: app/student-announcements.tsx
// (2026-09-14) built the read side for students, but there was no way for
// a teacher to actually create one. This is that missing compose/list side.

import { apiFetch } from './client';

export interface TeacherAnnouncement {
  id: string;
  classroom_id: string;
  classroom_name: string;
  teacher_id: string;
  teacher_name: string;
  title: string;
  body: string;
  created_at: string;
}

export async function fetchClassroomAnnouncements(classroomId: string): Promise<TeacherAnnouncement[]> {
  return apiFetch<TeacherAnnouncement[]>(`/api/v1/teacher/classrooms/${classroomId}/announcements`);
}

export async function createClassroomAnnouncement(
  classroomId: string,
  title: string,
  body: string
): Promise<TeacherAnnouncement> {
  return apiFetch<TeacherAnnouncement>(`/api/v1/teacher/classrooms/${classroomId}/announcements`, {
    method: 'POST',
    body: JSON.stringify({ title, body }),
  });
}
