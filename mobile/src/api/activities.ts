import { cacheActivities, getCachedActivities, getCachedActivity } from '@/src/db/activityCache';
// src/api/activities.ts

import { apiFetch } from './client';

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
    return activities;
  } catch {
    // Network unavailable — return cached
    return getCachedActivities();
  }
}

export async function fetchActivity(id: string): Promise<Activity> {
  try {
    return await apiFetch<Activity>(`/api/v1/student/activities/${id}`);
  } catch {
    const cached = await getCachedActivity(id);
    if (cached) return cached;
    throw new Error('Activity not available offline');
  }
}
