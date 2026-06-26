import { cacheActivities, getCachedActivities, getCachedActivity } from '@/src/db/activityCache';
// src/api/activities.ts

import { apiFetch } from './client';

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
