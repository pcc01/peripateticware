// src/api/captures.ts

import { apiFetch, getToken, API_BASE } from './client';
import { logLocationEvent } from './sessionEvents';

export interface Capture {
  id: string;
  capture_type: string;
  file_path?: string;
  transcript?: string | null;
  transcript_confidence?: number | null;
  transcript_language?: string | null;
  title?: string;
  description?: string;
  created_at: string;
}

export async function fetchCaptures(activityId?: string): Promise<Capture[]> {
  const qs = activityId ? `?activity_id=${activityId}` : '';
  const data = await apiFetch<{ captures: Capture[] } | Capture[]>(
    `/api/v1/student/captures${qs}`
  );
  return Array.isArray(data) ? data : data.captures ?? [];
}

export async function fetchCapture(id: string): Promise<Capture> {
  return apiFetch<Capture>(`/api/v1/student/captures/${id}`);
}

/** Upload a file capture (photo, audio, video, sketch) */
export async function uploadCapture(params: {
  file: { uri: string; name: string; type: string };
  captureType: string;
  sessionId?: string;
  title?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
}): Promise<Capture> {
  const token = await getToken();
  const form = new FormData();
  // React Native FormData accepts { uri, name, type }
  form.append('file', params.file as unknown as Blob);
  form.append('capture_type', params.captureType);
  if (params.sessionId)   form.append('session_id', params.sessionId);
  if (params.title)       form.append('title', params.title);
  if (params.description) form.append('description', params.description);
  if (params.latitude  != null) form.append('latitude',  String(params.latitude));
  if (params.longitude != null) form.append('longitude', String(params.longitude));

  const res = await fetch(`${API_BASE}/api/v1/student/captures/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token ?? ''}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `Upload failed (${res.status})`);
  }
  const capture = (await res.json()) as Capture;

  // Best-effort: fire a location_update session event so teacher map updates live
  if (params.sessionId && params.latitude != null && params.longitude != null) {
    logLocationEvent(params.sessionId, params.latitude, params.longitude).catch(() => {});
  }

  return capture;
}
