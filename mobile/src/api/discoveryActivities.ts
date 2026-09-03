// src/api/discoveryActivities.ts
// TEACHER/HOMESCHOOL creating a "discovery" (reverse scavenger hunt)
// activity from the field — reuses backend/routes/activities.py's
// POST /api/v1/activities + POST /api/v1/activities/{id}/publish, the same
// endpoints the web activity builder uses for every activity type. Unlike
// web's builder (a full multi-step authoring flow), this is a deliberately
// narrow form: only activity_type='discovery', only the fields that
// matter for a place-based challenge authored on the spot. General
// activity creation stays web-only — see app/teacher-create-scavenger-
// hunt.tsx's header comment for why this one type is the exception.
//
// backend/schemas/activities.py's discovery_* fields (discovery_mode,
// discovery_task_description, etc.) existed on the Activity model since
// Phase 3 but were never actually settable through ActivityCreate or
// persisted by create_activity() until the same change that added this
// file — see that schema/route's own comments.

import { apiFetch } from './client';

export type DiscoveryMode = 'location_based' | 'task_based';

export interface DiscoveryWaypointInput {
  sequence_index: number;
  name: string;
  latitude: number;
  longitude: number;
  arrival_radius_meters: number;
  required: boolean;
  clue_text?: string | null;
}

export interface CreateDiscoveryActivityInput {
  title: string;
  description: string;
  location_latitude: number;
  location_longitude: number;
  location_name: string;
  location_radius_meters: number;
  grade_level: number;
  subject: string;
  estimated_duration_minutes: number;
  learning_objectives: string[];
  bloom_level: number; // 1-6
  discovery_mode: DiscoveryMode;
  discovery_task_description: string;
  discovery_difficulty_level: number; // 1-4
  discovery_time_limit_minutes?: number;
  discovery_success_criteria?: string;
  discovery_location_required: boolean;
  // Multi-step wayfinding (WAYFINDING_CONSENT_LADDER.md). Present only when the
  // teacher captured 2+ stops; the backend clamps the ceiling and stores the
  // waypoints via ActivityCreate.
  discovery_wayfinding_enabled?: boolean;
  wayfinding_mode?: 'ordered' | 'free_choice' | 'guided_path';
  wayfinding_capability_ceiling?: 'B' | 'C' | 'D' | 'E';
  waypoints?: DiscoveryWaypointInput[];
}

export async function createDiscoveryActivity(input: CreateDiscoveryActivityInput): Promise<{ id: string }> {
  return apiFetch<{ id: string }>('/api/v1/activities', {
    method: 'POST',
    body: JSON.stringify({ ...input, activity_type: 'discovery' }),
  });
}

export async function publishActivity(activityId: string): Promise<void> {
  await apiFetch(`/api/v1/activities/${activityId}/publish`, { method: 'POST' });
}
