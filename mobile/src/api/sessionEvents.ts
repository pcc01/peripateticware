// src/api/sessionEvents.ts
// M-14: Fire phase/capture events so teacher dashboard can monitor live sessions

import { apiFetch } from './client';

export type SessionEventType =
  | 'phase_started'
  | 'phase_completed'
  | 'capture_added'
  | 'geofence_exit'
  | 'session_submitted';

export async function logSessionEvent(
  sessionId: string,
  eventType: SessionEventType,
  phase?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await apiFetch(`/api/v1/sessions/${sessionId}/events`, {
      method: 'POST',
      body: JSON.stringify({ event_type: eventType, phase, metadata }),
    });
  } catch {
    // Events are best-effort — never block the student flow
  }
}
