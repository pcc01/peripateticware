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
    apiClient.get<SelfProject[]>('/student/self-projects').then(r => r.data),

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
      '/student/captures/audio',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return response.data
  },

  // Build stream URL using the same base the apiClient uses
  streamUrl: (captureId: string): string => {
    const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1')
      .replace(/\/$/, '')
    return `${base}/student/captures/${captureId}/stream`
  },
}