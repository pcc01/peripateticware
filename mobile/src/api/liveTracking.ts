// src/api/liveTracking.ts
// Teacher real-time field tracking — reuses the polling approach web's
// useSessionWebSocket hook already settled on (see that file's own comment:
// the backend WebSocket endpoint was never implemented; GET .../events is
// the real, working mechanism). No native WebSocket dependency needed here.

import { apiFetch } from './client';

export interface ActiveSession {
  session_id: string;
  student_id: string;
  student_name: string;
  activity_id: string;
  activity_title: string;
  status: string;
  started_at: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
}

export interface SessionEvent {
  id: string;
  session_id: string;
  student_id: string;
  event_type: string;
  phase: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export async function fetchActiveSessions(): Promise<ActiveSession[]> {
  return apiFetch<ActiveSession[]>('/api/v1/activities/teacher/active-sessions');
}

export async function fetchSessionEvents(sessionId: string, since?: string): Promise<SessionEvent[]> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';
  const data = await apiFetch<{ events: SessionEvent[]; count: number }>(`/api/v1/sessions/${sessionId}/events${qs}`);
  return data.events ?? [];
}
