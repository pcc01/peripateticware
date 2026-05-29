/**
 * Peripateticware API Service
 * Wired to FastAPI backend at /api/v1/student/*
 *
 * Set API_BASE_URL to your machine's local IP when testing on a physical
 * device, e.g. http://192.168.1.x:8000/api/v1
 * Android emulator: http://10.0.2.2:8000/api/v1
 * iOS simulator / Expo Go on same machine: http://localhost:8000/api/v1
 */

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
client.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
client.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
    }
    return Promise.reject(err);
  }
);

// ── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: async (email: string, password: string) => {
    const { data } = await client.post('/auth/login', { email, password });
    return data as { access_token: string; user: User };
  },
  register: async (payload: RegisterPayload) => {
    const { data } = await client.post('/auth/register', payload);
    return data as { access_token: string; user: User };
  },
};

// ── Student activities ────────────────────────────────────────────────────────

export const activitiesApi = {
  list: async (params?: ActivityListParams) => {
    const { data } = await client.get('/student/activities', { params });
    return data as StudentPaginatedActivityResponse;
  },
  get: async (id: string) => {
    const { data } = await client.get(`/student/activities/${id}`);
    return data as StudentActivityDetail;
  },
  start: async (id: string, location?: LocationPayload) => {
    const { data } = await client.post(`/student/activities/${id}/start`, location ?? {});
    return data as LearningSessionResponse;
  },
  submit: async (activityId: string, sessionId: string) => {
    const { data } = await client.post(`/student/activities/${activityId}/submit`, {
      session_id: sessionId,
    });
    return data as ActivitySubmissionResponse;
  },
  getSubmission: async (activityId: string) => {
    const { data } = await client.get(`/student/submissions/${activityId}`);
    return data as SubmissionDetailResponse;
  },
};

// ── Sessions ──────────────────────────────────────────────────────────────────

export const sessionsApi = {
  getProgress: async (sessionId: string) => {
    const { data } = await client.get(`/student/sessions/${sessionId}/progress`);
    return data as SessionProgressResponse;
  },
  listEvidence: async (sessionId: string) => {
    const { data } = await client.get(`/student/sessions/${sessionId}/evidence`);
    return data as EvidenceListResponse;
  },
  addEvidence: async (sessionId: string, formData: FormData) => {
    const { data } = await client.post(
      `/student/sessions/${sessionId}/evidence`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data as EvidenceCaptureResponse;
  },
  listReflections: async (sessionId: string) => {
    const { data } = await client.get(`/student/sessions/${sessionId}/reflections`);
    return data as NotebookListResponse;
  },
  addReflection: async (sessionId: string, entry: NotebookEntryCreate) => {
    const { data } = await client.post(
      `/student/sessions/${sessionId}/reflection`,
      entry
    );
    return data as NotebookEntryResponse;
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role: 'student' | 'teacher' | 'parent' | 'admin';
}

export interface RegisterPayload {
  email: string;
  username: string;
  password: string;
  full_name: string;
  role?: string;
}

export interface ActivityListParams {
  subject?: string;
  grade_level?: number;
  lat?: number;
  lon?: number;
  skip?: number;
  limit?: number;
}

export interface StudentActivitySummary {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade_level: number;
  estimated_duration_minutes: number;
  difficulty_level: number;
  location_name: string;
  location_latitude: number;
  location_longitude: number;
  location_radius_meters: number;
  bloom_level: number;
  materials_needed: string[];
  learning_objectives: string[];
  assessment_type?: string;
  activity_type?: string;
}

export interface StudentActivityDetail extends StudentActivitySummary {
  location_info?: string;
  resources: Record<string, string>[];
  suggested_lessons?: unknown[];
  marzano_level?: number;
  dok_level?: number;
  solo_level?: number;
  primary_framework?: string;
  created_at?: string;
}

export interface StudentPaginatedActivityResponse {
  activities: StudentActivitySummary[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface LocationPayload {
  location_latitude?: number;
  location_longitude?: number;
  location_name?: string;
}

export interface LearningSessionResponse {
  session_id: string;
  activity_id: string;
  student_id: string;
  status: string;
  started_at: string;
  location?: { latitude: number; longitude: number; name: string };
}

export interface SessionProgressResponse {
  session_id: string;
  activity_id: string;
  status: string;
  evidence_count: number;
  reflection_count: number;
  time_elapsed_minutes?: number;
  learning_objectives_total: number;
  learning_objectives_addressed: string[];
  competencies_demonstrated: string[];
  started_at: string;
}

export interface EvidenceCaptureResponse {
  id: string;
  session_id: string;
  student_id: string;
  activity_id: string;
  capture_type: string;
  title?: string;
  description?: string;
  file_url?: string;
  duration_seconds?: number;
  transcription?: string;
  learning_objectives: string[];
  competencies: string[];
  created_at: string;
}

export interface EvidenceListResponse {
  captures: EvidenceCaptureResponse[];
  total: number;
}

export interface NotebookEntryCreate {
  reflection_type: 'freeform' | 'guided' | 'structured';
  title?: string;
  content: string;
  learning_objectives: string[];
  competencies: string[];
}

export interface NotebookEntryResponse {
  id: string;
  session_id: string;
  student_id: string;
  activity_id: string;
  reflection_type: string;
  title?: string;
  content: string;
  learning_objectives: string[];
  competencies: string[];
  created_at: string;
  updated_at: string;
}

export interface NotebookListResponse {
  entries: NotebookEntryResponse[];
  total: number;
}

export interface ActivitySubmissionResponse {
  submission_id: string;
  activity_id: string;
  student_id: string;
  submission_status: string;
  submitted_at?: string;
  evidence_count: number;
  reflection_count: number;
}

export interface SubmissionDetailResponse extends ActivitySubmissionResponse {
  teacher_feedback?: string;
  grade?: number;
  rubric_scores?: Record<string, number>;
  graded_at?: string;
}
