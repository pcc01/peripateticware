import {
  cacheActivities,
  cacheActivityDetail,
  getCachedActivities,
  getCachedActivity,
} from '@/src/db/activityCache';
// src/api/activities.ts

import { apiFetch } from './client';
import { prefetchTilesForRoute } from '@/src/lib/tileCache';

export interface ActivityPhaseDetail {
  title: string;
  instructions: string;
  due_date: string;
}

export interface ActivityPhases {
  orient: ActivityPhaseDetail;
  inquiry: ActivityPhaseDetail;
  reflect: ActivityPhaseDetail;
}

// Discovery/scavenger-hunt specific content (backend/schemas/student_
// activities.py's ActivityDiscoveryDetail) -- only present when
// activity_type === 'discovery'. This is the teacher/AI-authored task
// itself (e.g. "take photos of 8 native plants in Central Park"), distinct
// from the generic description/learning_objectives every activity has.
export interface ActivityDiscoveryDetail {
  task_description: string;
  mode?: 'location_based' | 'task_based' | null;
  documentation_requirements?: Record<string, boolean> | null;
  success_criteria?: string | null;
  difficulty_level?: number | null;
  time_limit_minutes?: number | null;
  location_required: boolean;
}

// Multi-step scavenger-hunt wayfinding (backend/schemas/student_activities.py's
// WayfindingDetail). Only present when the teacher enabled it AND there are
// stops. Waypoints are teacher content (no PII) and ship in this payload so
// the map + route render with no signal in the field. Rung B navigation is
// resolved ON DEVICE — no coordinate is ever sent back; only which stop was
// reached. See WAYFINDING_CONSENT_LADDER.md.
export interface Waypoint {
  id: string;
  sequence_index: number;
  name: string;
  clue_text?: string | null;
  latitude: number;
  longitude: number;
  arrival_radius_meters: number;
  symbol?: string | null;
  required: boolean;
  capture_requirements?: Record<string, boolean> | null;
  hint_unlock_rule?: 'immediate' | 'on_arrival' | 'after_minutes' | null;
  hint_unlock_minutes?: number | null;
}

export interface WayfindingDetail {
  enabled: boolean;
  mode?: 'ordered' | 'free_choice' | 'guided_path' | null;
  capability_ceiling?: string | null;
  route_geometry?: { type: 'LineString'; coordinates: [number, number][] } | null;
  waypoints: Waypoint[];
}

export interface Activity {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade_level: number;
  activity_type: string;
  difficulty_level: number;
  estimated_duration_minutes: number;
  location_name?: string;
  location_latitude?: number;
  location_longitude?: number;
  location_radius_meters?: number;
  bloom_level?: string;
  status: string;
  learning_objectives?: string[];
  phases?: ActivityPhases;
  discovery?: ActivityDiscoveryDetail | null;
  wayfinding?: WayfindingDetail | null;
  // Author's choice (backend/schemas/activities.py's AIInteractionModeEnum):
  // 'ai_chat' = "Ask Peri" AI conversation available; 'curated_only' =
  // curated question bank only, no live AI call. Defaults to 'ai_chat' on
  // the backend for every existing activity, so treat a missing value the
  // same way here.
  ai_interaction_mode?: 'ai_chat' | 'curated_only';
}

export interface ActivitiesResponse {
  activities: Activity[];
  total?: number;
  page?: number;
  total_pages?: number;
}

export async function fetchActivities(params?: {
  subject?: string;
  grade_level?: number;
  page?: number;
}): Promise<Activity[]> {
  const qs = params
    ? '?' + new URLSearchParams(
        Object.fromEntries(
          Object.entries(params)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        )
      ).toString()
    : '';
  try {
    const data = await apiFetch<ActivitiesResponse | Activity[]>(
      `/api/v1/student/activities${qs}`
    );
    const activities = Array.isArray(data) ? data : data.activities ?? [];
    // Cache for offline use (fire and forget)
    cacheActivities(activities).catch(() => {});
    // Proactively warm the full detail + map tiles for scavenger hunts so
    // they open and navigate later with no signal (fire and forget).
    prefetchHunts(activities);
    return activities;
  } catch {
    // Network unavailable — return cached
    return getCachedActivities();
  }
}

export async function fetchActivity(id: string): Promise<Activity> {
  try {
    const activity = await apiFetch<Activity>(`/api/v1/student/activities/${id}`);
    // Persist the FULL detail payload (waypoints, route, phases) so a
    // multi-step hunt renders and advances offline.
    cacheActivityDetail(activity).catch(() => {});
    if (activity.wayfinding?.enabled && activity.wayfinding.waypoints?.length) {
      prefetchTilesForRoute(activity.wayfinding).catch(() => {});
    }
    return activity;
  } catch {
    const cached = await getCachedActivity(id);
    if (cached) return cached;
    throw new Error('Activity not available offline');
  }
}

// How many hunts to warm per Discover refresh — a cheap GET each, plus a
// capped tile download for any with a route. Keeps the proactive cache from
// hammering the network on a big activity list.
const MAX_HUNT_PREFETCH = 6;

/**
 * Warm the offline cache for scavenger hunts in a freshly fetched list:
 * fetch each one's full detail (which itself caches detail + tiles). Fully
 * best-effort and sequential so it never competes with foreground fetches.
 */
export function prefetchHunts(activities: Activity[]): void {
  const hunts = activities
    .filter((a) => a.activity_type === 'discovery')
    .slice(0, MAX_HUNT_PREFETCH);
  if (hunts.length === 0) return;
  (async () => {
    for (const h of hunts) {
      try {
        const cached = await getCachedActivity(h.id);
        // Skip if we already have the full detail payload cached.
        if (cached && (cached.phases || cached.wayfinding !== undefined)) continue;
        await fetchActivity(h.id);
      } catch {
        // ignore — this is purely opportunistic
      }
    }
  })();
}

export interface StartedSession {
  session_id: string;
  activity_id: string;
  student_id: string;
  status: string;
  started_at: string;
}

/** Start or resume the learning session for this activity (idempotent server-side). */
export async function startActivitySession(activityId: string): Promise<StartedSession> {
  return apiFetch<StartedSession>(`/api/v1/student/activities/${activityId}/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
