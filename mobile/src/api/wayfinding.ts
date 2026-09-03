// src/api/wayfinding.ts
// Multi-step scavenger-hunt wayfinding — rung B write path.
//
// The student's app resolves "am I at this stop?" ON DEVICE (see
// useWayfinding.ts). This module reports only WHICH stop was reached and
// whether it was in sequence — never a coordinate. See
// WAYFINDING_CONSENT_LADDER.md §2.

import { apiFetch } from './client';

export interface WaypointProgressRow {
  waypoint_id: string;
  waypoint_index: number | null;
  arrived_at: string | null;
  arrival_was_in_sequence: boolean;
  captured: boolean;
  skipped: boolean;
}

export interface WaypointProgress {
  session_id: string;
  progress: WaypointProgressRow[];
  reached: number;
  total: number;
  required_reached: number;
  required_total: number;
  complete: boolean;
}

/**
 * Mark a waypoint reached (or skipped) for the current session. Idempotent
 * per (session, waypoint). Returns the updated progress summary.
 * Best-effort by default — a failed report must never block the hunt.
 */
export async function recordWaypointArrival(
  sessionId: string,
  waypointId: string,
  opts: { inSequence?: boolean; captured?: boolean; skipped?: boolean } = {}
): Promise<WaypointProgress | null> {
  try {
    return await apiFetch<WaypointProgress>(
      `/api/v1/sessions/${sessionId}/waypoints/${waypointId}/arrive`,
      {
        method: 'POST',
        body: JSON.stringify({
          in_sequence: opts.inSequence ?? true,
          captured: opts.captured ?? false,
          skipped: opts.skipped ?? false,
        }),
      }
    );
  } catch {
    return null;
  }
}

export async function fetchWaypointProgress(
  sessionId: string
): Promise<WaypointProgress | null> {
  try {
    return await apiFetch<WaypointProgress>(
      `/api/v1/sessions/${sessionId}/waypoints/progress`
    );
  } catch {
    return null;
  }
}

// ── Capability / consent (WAYFINDING_CONSENT_LADDER.md §4) ───────────────────

export type Rung = 'A' | 'B' | 'C' | 'D' | 'E';

export interface WayfindingCapability {
  effective_rung: Rung;
  activity_ceiling: Rung;
  consent_rung: Rung;
  age_floor: Rung;
  /** Rungs the teacher enabled that this student could still consent to. */
  consent_needed_for: Rung[];
  /** Retention sentence to show inline in the consent prompt, per rung. */
  retention_copy: Partial<Record<Rung, string>>;
}

export async function fetchMyCapability(
  activityId: string
): Promise<WayfindingCapability | null> {
  try {
    return await apiFetch<WayfindingCapability>(
      `/api/v1/student/activities/${activityId}/my-capability`
    );
  } catch {
    return null;
  }
}

/**
 * Rung D — share the current position with the supervising teacher for the
 * length of the live session. Best-effort; 403s (consent not granted) are
 * swallowed. Never called unless capability.effective_rung >= 'D'.
 */
export async function postLivePosition(
  sessionId: string,
  latitude: number,
  longitude: number,
  accuracy?: number | null
): Promise<void> {
  try {
    await apiFetch(`/api/v1/sessions/${sessionId}/live-position`, {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude, accuracy: accuracy ?? null }),
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Rung E — append breadcrumb points ([lng, lat, epochMs]) to the recorded
 * path. Best-effort. Never called unless capability.effective_rung >= 'E'.
 */
export async function postTrackBatch(
  sessionId: string,
  points: number[][]
): Promise<void> {
  if (!points.length) return;
  try {
    await apiFetch(`/api/v1/sessions/${sessionId}/track`, {
      method: 'POST',
      body: JSON.stringify({ points }),
    });
  } catch {
    /* best-effort */
  }
}

/** Student self-consent (13+) for one capability rung. */
export async function recordGpsConsent(
  activityId: string,
  rung: Rung,
  consentGiven: boolean
): Promise<boolean> {
  try {
    await apiFetch('/api/v1/student/consent/gps', {
      method: 'POST',
      body: JSON.stringify({ activity_id: activityId, rung, consent_given: consentGiven }),
    });
    return true;
  } catch {
    return false;
  }
}
