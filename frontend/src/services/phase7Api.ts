// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// frontend/src/services/phase7Api.ts
//
// Uses the shared apiClient from config/api.ts which already handles:
//   - Auth token from localStorage ('auth_token')
//   - VITE_API_URL base (defaults to http://localhost:8000/api/v1)
//   - 401 redirect to /login
//   - Content-Type: application/json

import { apiClient } from '../config/api'
import type {
  Class, ClassSettings,
  SelfProject, SelfProjectCreate, SelfProjectShareRequest,
  FieldNote, FieldNoteListItem, FieldNoteCreate, FieldNoteUpdate, PaginatedFieldNotes,
  PeerProject, PeerProjectCreate, PaginatedPeerProjects,
  PeerProjectResponse,
  PeerProjectGrade, PeerProjectGradeCreate,
  CrossClassShare, AudioCaptureResult,
  Proposal, ProposalCreate, ProposalUpdate,
} from '../types/phase7'

// ============================================================================
// CLASS APIs  (teacher)
// ============================================================================

export const classApi = {
  list: () =>
    apiClient.get<Class[]>('/teacher/classes').then(r => r.data),

  getSettings: (classId: string) =>
    apiClient.get<ClassSettings>(`/teacher/classes/${classId}/settings`).then(r => r.data),

  updateSettings: (classId: string, settings: Partial<ClassSettings>) =>
    apiClient.put<ClassSettings>(`/teacher/classes/${classId}/settings`, settings).then(r => r.data),

  enrollStudent: (classId: string, studentId: string) =>
    apiClient.post(`/teacher/classes/${classId}/enroll`, { student_id: studentId }).then(r => r.data),
}

// ============================================================================
// SELF-PROJECT APIs  (student)
// ============================================================================

export const selfProjectApi = {
  list: () =>
    apiClient.get<{ items: SelfProject[] } | SelfProject[]>('/student/self-projects')
      .then(r => Array.isArray(r.data) ? r.data : (r.data as any).items ?? []),

  get: (id: string) =>
    apiClient.get<SelfProject>(`/student/self-projects/${id}`).then(r => r.data),

  create: (data: SelfProjectCreate) =>
    apiClient.post<SelfProject>('/student/self-projects', data).then(r => r.data),

  update: (id: string, data: Partial<SelfProjectCreate>) =>
    apiClient.put<SelfProject>(`/student/self-projects/${id}`, data).then(r => r.data),

  archive: (id: string) =>
    apiClient.post<SelfProject>(`/student/self-projects/${id}/archive`).then(r => r.data),

  requestClassmateShare: (id: string, body: SelfProjectShareRequest) =>
    apiClient.post(`/student/self-projects/${id}/share-to-classmates`, body).then(r => r.data),
}

// ============================================================================
// FIELD NOTE APIs  (student)
// ============================================================================

export const fieldNoteApi = {
  list: (params?: { status?: string; self_project_id?: string; page?: number }) =>
    apiClient.get<PaginatedFieldNotes>('/student/field-notes', { params }).then(r => r.data),

  get: (id: string) =>
    apiClient.get<FieldNote>(`/student/field-notes/${id}`).then(r => r.data),

  create: (data: FieldNoteCreate) =>
    apiClient.post<FieldNote>('/student/field-notes', data).then(r => r.data),

  update: (id: string, data: FieldNoteUpdate) =>
    apiClient.put<FieldNote>(`/student/field-notes/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    apiClient.delete(`/student/field-notes/${id}`),

  share: (id: string) =>
    apiClient.post(`/student/field-notes/${id}/share`).then(r => r.data),

  unshare: (id: string) =>
    apiClient.post(`/student/field-notes/${id}/unshare`).then(r => r.data),

  submitForPromotion: (id: string, message?: string) =>
    apiClient.post(`/student/field-notes/${id}/submit-for-promotion`, { message }).then(r => r.data),

  addCapture: (id: string, captureId: string, order = 0) =>
    apiClient.post(`/student/field-notes/${id}/captures`, { capture_id: captureId, order })
      .then(r => r.data),

  removeCapture: (id: string, captureId: string) =>
    apiClient.delete(`/student/field-notes/${id}/captures/${captureId}`),
}

// ============================================================================
// FIELD NOTE APIs  (teacher)
// ============================================================================

export const teacherFieldNoteApi = {
  list: (params?: { class_id?: string; status?: string; student_id?: string; page?: number }) =>
    apiClient.get<PaginatedFieldNotes>('/teacher/field-notes', { params }).then(r => r.data),

  approve: (id: string, body: { feedback?: string; create_as?: 'activity' | 'project' }) =>
    apiClient.post(`/teacher/field-notes/${id}/approve`, body).then(r => r.data),

  reject: (id: string, feedback: string) =>
    apiClient.post(`/teacher/field-notes/${id}/reject`, { feedback }).then(r => r.data),
}

// ============================================================================
// PEER PROJECT APIs  (student author)
// ============================================================================

export const peerProjectApi = {
  listAuthored: (params?: { status?: string; page?: number }) =>
    apiClient.get<PaginatedPeerProjects>('/student/peer-projects/authored', { params })
      .then(r => r.data),

  listAvailable: (params?: { class_id?: string; page?: number }) =>
    apiClient.get<PaginatedPeerProjects>('/student/peer-projects/available', { params })
      .then(r => r.data),

  get: (id: string) =>
    apiClient.get<PeerProject>(`/student/peer-projects/${id}`).then(r => r.data),

  create: (classId: string, data: PeerProjectCreate) =>
    apiClient.post<PeerProject>(`/student/peer-projects?class_id=${classId}`, data)
      .then(r => r.data),

  update: (id: string, data: Partial<PeerProjectCreate>) =>
    apiClient.put<PeerProject>(`/student/peer-projects/${id}`, data).then(r => r.data),

  addExample: (id: string, captureId: string, caption?: string) =>
    apiClient.post(`/student/peer-projects/${id}/examples`, { capture_id: captureId, caption })
      .then(r => r.data),

  removeExample: (id: string, exampleId: string) =>
    apiClient.delete(`/student/peer-projects/${id}/examples/${exampleId}`),

  submit: (id: string) =>
    apiClient.post(`/student/peer-projects/${id}/submit`).then(r => r.data),

  startResponse: (id: string) =>
    apiClient.post<PeerProjectResponse>(`/student/peer-projects/${id}/respond`).then(r => r.data),

  getMyResponse: (id: string) =>
    apiClient.get<PeerProjectResponse>(`/student/peer-projects/${id}/my-response`)
      .then(r => r.data),

  addCaptureToResponse: (id: string, captureId: string, order = 0) =>
    apiClient.post(`/student/peer-projects/${id}/my-response/captures`,
                   { capture_id: captureId, order }).then(r => r.data),

  completeResponse: (id: string) =>
    apiClient.post(`/student/peer-projects/${id}/my-response/complete`).then(r => r.data),
}

// ============================================================================
// PEER PROJECT APIs  (teacher)
// ============================================================================

export const teacherPeerProjectApi = {
  list: (params?: { class_id?: string; status?: string; page?: number }) =>
    apiClient.get<PaginatedPeerProjects>('/teacher/peer-projects', { params }).then(r => r.data),

  approve: (id: string, body: { feedback?: string; curriculum_objective_ids?: string[] }) =>
    apiClient.post(`/teacher/peer-projects/${id}/approve`, body).then(r => r.data),

  reject: (id: string, feedback: string) =>
    apiClient.post(`/teacher/peer-projects/${id}/reject`, { feedback }).then(r => r.data),

  setAuthorVisibility: (id: string, canSee: boolean) =>
    apiClient.put(`/teacher/peer-projects/${id}/author-visibility?can_see=${canSee}`)
      .then(r => r.data),

  gradeResponse: (responseId: string, grade: PeerProjectGradeCreate) =>
    apiClient.post<PeerProjectGrade>(
      `/teacher/peer-project-responses/${responseId}/grade`, grade
    ).then(r => r.data),

  getGrade: (responseId: string) =>
    apiClient.get<PeerProjectGrade>(`/teacher/peer-project-responses/${responseId}/grade`)
      .then(r => r.data),

  shareCrossClass: (id: string, body: { target_class_id: string; anonymized_title?: string }) =>
    apiClient.post<CrossClassShare>(`/teacher/peer-projects/${id}/cross-class`, body)
      .then(r => r.data),
}

// ============================================================================
// CROSS-CLASS CONSENT  (student)
// ============================================================================

export const crossClassApi = {
  respondToConsent: (shareId: string, consent: boolean, note?: string) =>
    apiClient.post(`/student/peer-projects/cross-class/${shareId}/consent`,
                   { consent, student_consent_note: note }).then(r => r.data),
}

// ============================================================================
// AUDIO CAPTURE
// ============================================================================

export const audioApi = {
  upload: async (
    blob: Blob,
    durationSeconds: number,
    contextType: 'activity' | 'field_note' | 'peer_project_response',
    contextId?: string,
    location?: { lat: number; lng: number },
  ): Promise<AudioCaptureResult> => {
    const form = new FormData()
    const ext = blob.type.includes('ogg') ? 'ogg' : 'webm'
    form.append('file', blob, `recording.${ext}`)
    form.append('duration_seconds', String(Math.round(durationSeconds)))
    form.append('context_type', contextType)
    if (contextId) form.append('context_id', contextId)
    if (location) {
      form.append('location_lat', String(location.lat))
      form.append('location_lng', String(location.lng))
    }
    const response = await apiClient.post<AudioCaptureResult>(
      '/student/captures/upload',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return response.data
  },

  // Tokenless stream URL. NOTE: this alone is unauthenticated — prefer
  // getMediaStreamUrl() (or pass captureId to <AudioPlayer>) which mints a
  // short-lived signed media token. The raw JWT is NO LONGER placed in the URL.
  streamUrl: (captureId: string): string =>
    `/api/v1/student/captures/${captureId}/stream`,

  // Mint a short-lived (5 min) signed media token and return the full stream
  // URL with ?mt=<token>. Safe to use as an <audio>/<img> src.
  getMediaStreamUrl: async (captureId: string): Promise<string> => {
    const { data } = await apiClient.post(`/student/captures/${captureId}/media-token`)
    return data.stream_url as string
  },
}
// ============================================================================
// PROPOSAL APIs  (student + teacher)
// ============================================================================

export const proposalApi = {
  // Student: CRUD
  create: (data: ProposalCreate) =>
    apiClient.post<{ id: string; status: string }>('/proposals', data).then(r => r.data),

  list: () =>
    apiClient.get<Proposal[]>('/proposals').then(r => r.data),

  get: (id: string) =>
    apiClient.get<Proposal>(`/proposals/${id}`).then(r => r.data),

  update: (id: string, data: ProposalUpdate) =>
    apiClient.put<{ ok: boolean }>(`/proposals/${id}`, data).then(r => r.data),

  submit: (id: string) =>
    apiClient.post<{ status: string }>(`/proposals/${id}/submit`).then(r => r.data),

  remove: (id: string) =>
    apiClient.delete(`/proposals/${id}`).then(r => r.data),

  // Teacher: review queue
  listPending: () =>
    apiClient.get<Proposal[]>('/teacher/proposals').then(r => r.data),

  approve: (id: string) =>
    apiClient.post<{ status: string; activity_id: string }>(`/teacher/proposals/${id}/approve`).then(r => r.data),

  reject: (id: string, feedback: string) =>
    apiClient.post<{ status: string }>(`/teacher/proposals/${id}/reject`, { feedback }).then(r => r.data),
}

// ============================================================================
// PROFESSOR — FIELDWORK LOCATION MAP
// ============================================================================

import type { FieldworkLocationsResponse, ProjectActiveSessionsResponse, ProjectCompletionReportResponse } from '../types/phase7'

export const professorApi = {
  /**
   * Fetch GPS snapshots (field notes + captures) for a given activity.
   * Used by CourseFieldworkTracker to render the historical location map.
   * No live streaming — single fetch on mount.
   */
  getFieldworkLocations: (activityId: string): Promise<FieldworkLocationsResponse> =>
    apiClient
      .get<FieldworkLocationsResponse>(`/activities/${activityId}/fieldwork-locations`)
      .then((r) => r.data),
}

// ============================================================================
// PROJECT LIVE TRACKING  (teacher)
// ============================================================================

export const projectTrackingApi = {
  /**
   * Currently in-progress sessions across every activity in a project.
   * Already activity-gated (discovery_location_gps_capture_enabled) and
   * consent-filtered server-side — see backend/routes/projects.py.
   */
  getProjectActiveSessions: (projectId: string): Promise<ProjectActiveSessionsResponse> =>
    apiClient
      .get<ProjectActiveSessionsResponse>(`/teacher/projects/${projectId}/active-sessions`)
      .then((r) => r.data),

  /**
   * "What's the status right now" snapshot for a long-running project —
   * per-activity completion counts + per-participant status table. One-time
   * fetch, no polling (unlike the live tracking above).
   */
  getProjectCompletionReport: (projectId: string): Promise<ProjectCompletionReportResponse> =>
    apiClient
      .get<ProjectCompletionReportResponse>(`/teacher/projects/${projectId}/completion-report`)
      .then((r) => r.data),
}
