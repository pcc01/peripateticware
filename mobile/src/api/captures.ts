// src/api/captures.ts

import { apiFetch, getToken, API_BASE, ApiError } from './client';
import { logLocationEvent } from './sessionEvents';

export interface Capture {
  id: string;
  capture_type: string;
  file_path?: string;
  transcript?: string | null;
  transcript_confidence?: number | null;
  transcript_language?: string | null;
  /** 'pending' | 'completed' | 'failed' | 'disabled' — see backend
   * models/database.py TranscriptStatus. Lets the UI tell "still
   * transcribing" apart from "won't have one" instead of guessing from a
   * null transcript. */
  transcript_status?: string | null;
  title?: string;
  description?: string;
  created_at: string;
  /** Client-only, never sent by the backend: the on-device file URI (photo/
   * audio/video) or raw text (note) captured just before upload, so the
   * activity screen can offer an instant review/preview without an
   * authenticated round-trip to fetch the uploaded file back. */
  local_uri?: string;
  local_text?: string;
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

/**
 * Mint a short-lived (5 min) signed media token and return a ready-to-play
 * absolute stream URL for this capture's audio/video/photo file — for
 * reviewing a capture that's already been uploaded (no local_uri anymore,
 * e.g. from the journal/portfolio list), as opposed to the just-captured
 * local file CaptureSheet.tsx already has on-device.
 *
 * Mirrors the web app's useSignedCaptureUrl/audioApi.getMediaStreamUrl
 * (frontend/src/hooks/useSignedCaptureUrl.ts) against the same backend
 * endpoints (POST .../media-token, GET .../stream?mt=) — see
 * backend/routes/student.py::mint_capture_media_token/stream_capture.
 * Returns an ABSOLUTE url (API_BASE + path): unlike a browser <audio> tag,
 * expo-av's Audio.Sound has no page origin to resolve a relative path
 * against.
 */
export async function getMediaStreamUrl(captureId: string): Promise<string> {
  const data = await apiFetch<{ media_token: string; stream_url: string }>(
    `/api/v1/student/captures/${captureId}/media-token`,
    { method: 'POST' }
  );
  return `${API_BASE}${data.stream_url}`;
}

/** Upload a file capture (photo, audio, video, sketch) */
export async function uploadCapture(params: {
  file: { uri: string; name: string; type: string };
  captureType: string;
  sessionId?: string;
  activityId?: string;
  title?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  /** On-device speech-recognition transcript (audio captures only) —
   * produced entirely on the student's device by CaptureSheet.tsx, sent
   * here as plain text alongside the audio file. See
   * AUDIO_TRANSCRIPTION_ON_DEVICE_HANDOFF.md, Task B: the backend trusts
   * this value as-is (transcript_status='completed') rather than running
   * any server-side transcription — there is no cloud or self-hosted ASR
   * fallback if it's absent, by design. */
  transcript?: string;
}): Promise<Capture> {
  const token = await getToken();
  const form = new FormData();
  // React Native FormData accepts { uri, name, type }
  form.append('file', params.file as unknown as Blob);
  form.append('capture_type', params.captureType);
  if (params.sessionId)   form.append('session_id', params.sessionId);
  if (params.activityId)  form.append('activity_id', params.activityId);
  if (params.title)       form.append('title', params.title);
  if (params.description) form.append('description', params.description);
  if (params.latitude  != null) form.append('latitude',  String(params.latitude));
  if (params.longitude != null) form.append('longitude', String(params.longitude));
  if (params.transcript)  form.append('transcript', params.transcript);

  const res = await fetch(`${API_BASE}/api/v1/student/captures/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token ?? ''}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err?.detail;
    // Structured detail (2026-09-14, see privacy_engine.py's
    // enforce_or_raise): {"error_code": "consent_required", "message": ...}
    // for a privacy-enforcement block, vs. a plain string for every other
    // failure this endpoint can produce. Throw an ApiError (not a bare
    // Error) so callers -- specifically offlineQueue.ts's flushQueue() --
    // can check `.errorCode` to tell a permanent consent-block apart from a
    // transient network/server error, instead of string-matching English
    // prose.
    if (detail && typeof detail === 'object' && 'message' in detail) {
      throw new ApiError(res.status, detail.message, detail.error_code);
    }
    throw new ApiError(res.status, typeof detail === 'string' ? detail : `Upload failed (${res.status})`);
  }
  const capture = (await res.json()) as Capture;

  // Best-effort: fire a location_update session event so teacher map updates live
  if (params.sessionId && params.latitude != null && params.longitude != null) {
    logLocationEvent(params.sessionId, params.latitude, params.longitude).catch(() => {});
  }

  return capture;
}

/**
 * Ask the backend to re-send the parental consent request email (the same
 * real flow accept_invite's initial send uses — see
 * routes/student.py::request_guardian_consent). Called from a capture
 * that's stuck with blocked_reason='consent_required' in the local queue
 * (see src/db/offlineQueue.ts), giving the student a way to prompt their
 * guardian themselves instead of passively waiting.
 *
 * Throws ApiError with errorCode:
 *   'no_guardian_email_on_file' — no parent_email on this account yet
 *   'consent_request_cooldown'  — a request was already sent recently (429)
 */
export async function requestGuardianConsent(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>('/api/v1/student/consent/request-guardian', {
    method: 'POST',
  });
}
