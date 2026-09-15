// src/api/classrooms.ts
// The teacher's real classrooms (backend/routes/classrooms.py's `classrooms`
// table) -- the roster/consent/parent-linking model that
// classroom_students, classroom_announcements, and parent_child_links all
// key off of. This is a SEPARATE concept from `Class`
// (backend/routes/activities.py's /teacher/classes, backed by a different
// table, consumed by src/api/teacher.ts's fetchTeacherClasses /
// app/teacher-classes.tsx's "Classes" stat card) -- the two were never the
// same thing despite the similar naming.
//
// BUG FIX (2026-09-15): app/teacher-messages.tsx and
// app/teacher-announcements.tsx originally (incorrectly) used
// fetchTeacherClasses() for their classroom pickers, copying the pattern
// already used elsewhere in the app. But routes/teacher_communication.py's
// classroom_id (for sending messages/announcements) is verified against
// `classrooms`, not `Class` -- so a teacher with a real classroom (visible
// via the web app or the "Classes" stat card if a `Class` row also exists)
// could still see an empty classroom picker here, with Send/Post silently
// unable to do anything ("there is a class but it isn't accessible in the
// app"). This is the correct source for anything that will end up calling
// a routes/classrooms.py or routes/teacher_communication.py endpoint.

import { apiFetch } from './client';

export interface Classroom {
  id: string;
  name: string;
  grade_level: number | null;
  subject: string | null;
  is_active: boolean;
  student_count: number;
  max_students_per_classroom: number;
  at_capacity: boolean;
  created_at: string | null;
}

export async function fetchMyClassrooms(): Promise<Classroom[]> {
  return apiFetch<Classroom[]>('/api/v1/classrooms');
}
