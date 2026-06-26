// src/api/sessionEvents.ts
// M-14: Fire phase/capture events so teacher dashboard can monitor live sessions

import { apiFetch } from './client';

export type SessionEventType =
  | 'phase_started'
  | 'phase_completed'
  | 'capture_added'
  | 'geofence_exit'
  | 'session_submitted'
  | 'location_update';

/** Convenience wrapper — fires a location_update event with GPS coordinates. Best-effort. */
export async function logLocationEvent(
  sessionId: string,
  latitude: number,
  longitude: number,
  accuracy?: number
): Promise<void> {
  try {
    await apiFetch(`/api/v1/sessions/${sessionId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        event_type: 'location_update',
 