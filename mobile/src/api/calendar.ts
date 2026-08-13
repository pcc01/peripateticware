// src/api/calendar.ts
// Unified calendar — reuses backend/routes/calendar.py's single role-aware
// GET /api/v1/calendar/events (see that file's own docstring for the full
// design: it unifies real activity sessions with explicit classroom_events
// rows into one response). The role split matters for callers:
//   STUDENT              — no params, always their own calendar
//   PARENT / HOMESCHOOL   — pass child_id (a linked/approved parent's child,
//                           or a homeschool account's own child)
//   TEACHER / ADMIN        — pass classroom_id; only this role can create/
//                           delete classroom_events (deadlines, field trips,
//                           holidays) via POST/DELETE below
// Passing the wrong param shape for your role 422s/403s server-side — see
// that endpoint's own role branches, they are NOT symmetric (HOMESCHOOL
// does not get a classroom_id path despite otherwise mirroring TEACHER's
// tabs elsewhere in this app).

import { apiFetch } from './client';

export type CalendarEventType = 'planned' | 'completed' | 'event' | 'deadline' | 'field_trip' | 'holiday';
export type ClassroomEventType = 'event' | 'deadline' | 'field_trip' | 'holiday';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: CalendarEventType;
  source: 'activity' | 'classroom_event';
  subject?: string | null;
  description?: string | null;
  student_id?: string | null;
  student_name?: string | null;
  classroom_id?: string | null;
}

export interface FetchCalendarParams {
  childId?: string;
  classroomId?: string;
  start?: string; // YYYY-MM-DD, defaults to 45 days ago server-side
  end?: string;   // YYYY-MM-DD, defaults to 45 days ahead server-side
}

export async function fetchCalendarEvents(params: FetchCalendarParams = {}): Promise<CalendarEvent[]> {
  const q = new URLSearchParams();
  if (params.childId) q.set('child_id', params.childId);
  if (params.classroomId) q.set('classroom_id', params.classroomId);
  if (params.start) q.set('start', params.start);
  if (params.end) q.set('end', params.end);
  const qs = q.toString();
  return apiFetch<CalendarEvent[]>(`/api/v1/calendar/events${qs ? `?${qs}` : ''}`);
}

export interface CreateClassroomEventInput {
  classroom_id: string;
  title: string;
  description?: string;
  event_date: string; // YYYY-MM-DD
  event_type: ClassroomEventType;
}

export async function createClassroomEvent(input: CreateClassroomEventInput): Promise<CalendarEvent> {
  return apiFetch<CalendarEvent>('/api/v1/calendar/events', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteClassroomEvent(eventId: string): Promise<void> {
  await apiFetch(`/api/v1/calendar/events/${eventId}`, { method: 'DELETE' });
}
