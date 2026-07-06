// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Comprehensive API Service Layer for Peripateticware
 * Unified service with methods for all domains: Activities, Projects, Sessions, etc.
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios'
import { useEffect, useReducer, useCallback, useRef } from 'react'
import * as Types from './types'

/* ============================================================================ */
/* API CLIENT SETUP */
/* ============================================================================ */

// Always use relative path so requests route through the Vite proxy.
// This ensures /api/v1/... hits http://backend:8000/api/v1/... in Docker dev.
const API_BASE_URL = '/api/v1'

export const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add token to requests
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Handle responses and errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError<Types.ApiError>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      window.location.href = '/login'
    }

    // Maintenance mode: backend middleware answers 503 with detail "maintenance"
    // for all non-exempt API calls. Send the user to the maintenance page
    // (platform admins can still reach /platform — that surface is exempt).
    if (
      error.response?.status === 503 &&
      (error.response?.data as { detail?: string })?.detail === 'maintenance' &&
      window.location.pathname !== '/maintenance' &&
      !window.location.pathname.startsWith('/platform')
    ) {
      window.location.href = '/maintenance'
    }
    
    console.error('API Error:', {
      status: error.response?.status,
      message: error.response?.data?.detail || error.message,
      url: error.config?.url,
    })
    
    throw error
  }
)

/* ============================================================================ */
/* AUTHENTICATION API */
/* ============================================================================ */

export const authApi = {
  async login(credentials: Types.LoginRequest): Promise<Types.LoginResponse> {
    const response = await axiosInstance.post<Types.LoginResponse>('/auth/login', credentials)
    return response.data
  },

  async signup(data: Types.SignupRequest): Promise<Types.LoginResponse> {
    const response = await axiosInstance.post<Types.LoginResponse>('/auth/signup', data)
    return response.data
  },

  async logout(): Promise<void> {
    try {
      await axiosInstance.post('/auth/logout', {})
    } catch (error) {
      console.warn('Logout API call failed:', error)
    }
  },

  async refreshToken(): Promise<{ access_token: string }> {
    const response = await axiosInstance.post<{ access_token: string }>('/auth/refresh', {})
    return response.data
  },

  async checkHealth(): Promise<{ status: string }> {
    const response = await axiosInstance.get<{ status: string }>('/auth/health')
    return response.data
  },
}

/* ============================================================================ */
/* ACTIVITIES API */
/* ============================================================================ */

export const activitiesApi = {
  async create(data: Types.CreateActivityRequest): Promise<Types.Activity> {
    const response = await axiosInstance.post<Types.Activity>('/activities', data)
    return response.data
  },

  async list(filters?: Types.ActivityFilters): Promise<Types.PaginatedActivityResponse> {
    const params = new URLSearchParams()
    if (filters?.status) params.append('status', filters.status)
    if (filters?.subject) params.append('subject', filters.subject)
    if (filters?.grade_level) params.append('grade_level', filters.grade_level)
    if (filters?.teacher_id) params.append('teacher_id', filters.teacher_id)
    if (filters?.skip !== undefined) params.append('skip', String(filters.skip))
    if (filters?.limit !== undefined) params.append('limit', String(filters.limit))
    if (filters?.page !== undefined) params.append('page', String(filters.page))
    if (filters?.page_size !== undefined) params.append('page_size', String(filters.page_size))

    const response = await axiosInstance.get<Types.PaginatedActivityResponse>(
      `/activities?${params.toString()}`
    )
    return response.data
  },

  async get(id: string): Promise<Types.Activity> {
    const response = await axiosInstance.get<Types.Activity>(`/activities/${id}`)
    return response.data
  },

  async update(id: string, data: Types.UpdateActivityRequest): Promise<Types.Activity> {
    const response = await axiosInstance.put<Types.Activity>(`/activities/${id}`, data)
    return response.data
  },

  async delete(id: string): Promise<void> {
    await axiosInstance.delete(`/activities/${id}`)
  },

  async publish(id: string): Promise<Types.Activity> {
    const response = await axiosInstance.post<Types.Activity>(`/activities/${id}/publish`, {})
    return response.data
  },

  async archive(id: string): Promise<Types.Activity> {
    const response = await axiosInstance.post<Types.Activity>(`/activities/${id}/archive`, {})
    return response.data
  },
}

/* ============================================================================ */
/* PROJECTS API */
/* ============================================================================ */

export const projectsApi = {
  async create(data: Types.ProjectFormData): Promise<Types.Project> {
    const response = await axiosInstance.post<Types.Project>('/teacher/projects', data)
    return response.data
  },

  async list(filters?: Types.ProjectFilters): Promise<Types.PaginatedProjectResponse> {
    const params = new URLSearchParams()
    if (filters?.status) params.append('status', filters.status)
    if (filters?.student_id) params.append('student_id', filters.student_id)
    if (filters?.activity_id) params.append('activity_id', filters.activity_id)
    if (filters?.teacher_id) params.append('teacher_id', filters.teacher_id)
    if (filters?.skip !== undefined) params.append('skip', String(filters.skip))
    if (filters?.limit !== undefined) params.append('limit', String(filters.limit))
    if (filters?.page !== undefined) params.append('page', String(filters.page))
    if (filters?.page_size !== undefined) params.append('page_size', String(filters.page_size))

    const response = await axiosInstance.get<Types.PaginatedProjectResponse>(
      `/teacher/projects?${params.toString()}`
    )
    return response.data
  },

  async get(id: string): Promise<Types.Project> {
    const response = await axiosInstance.get<Types.Project>(`/teacher/projects/${id}`)
    return response.data
  },

  async update(id: string, data: Partial<Types.ProjectFormData>): Promise<Types.Project> {
    const response = await axiosInstance.put<Types.Project>(`/teacher/projects/${id}`, data)
    return response.data
  },

  async delete(id: string): Promise<void> {
    await axiosInstance.delete(`/teacher/projects/${id}`)
  },

  async getByStudent(studentId: string): Promise<Types.Project[]> {
    const response = await axiosInstance.get<Types.Project[]>(`/teacher/projects?student_id=${studentId}`)
    return response.data
  },
}

/* ============================================================================ */
/* SESSIONS API */
/* ============================================================================ */

export const sessionsApi = {
  async create(data: Types.SessionFormData): Promise<Types.Session> {
    const response = await axiosInstance.post<Types.Session>('/sessions', data)
    return response.data
  },

  async list(filters?: Types.SessionFilters): Promise<Types.PaginatedSessionResponse> {
    const params = new URLSearchParams()
    if (filters?.status) params.append('status', filters.status)
    if (filters?.activity_id) params.append('activity_id', filters.activity_id)
    if (filters?.teacher_id) params.append('teacher_id', filters.teacher_id)
    if (filters?.skip !== undefined) params.append('skip', String(filters.skip))
    if (filters?.limit !== undefined) params.append('limit', String(filters.limit))
    if (filters?.page !== undefined) params.append('page', String(filters.page))
    if (filters?.page_size !== undefined) params.append('page_size', String(filters.page_size))

    const response = await axiosInstance.get<Types.PaginatedSessionResponse>(
      `/sessions?${params.toString()}`
    )
    return response.data
  },

  async get(id: string): Promise<Types.Session> {
    const response = await axiosInstance.get<Types.Session>(`/sessions/${id}`)
    return response.data
  },

  async update(id: string, data: Partial<Types.SessionFormData>): Promise<Types.Session> {
    const response = await axiosInstance.put<Types.Session>(`/sessions/${id}`, data)
    return response.data
  },

  async delete(id: string): Promise<void> {
    await axiosInstance.delete(`/sessions/${id}`)
  },

  async join(id: string): Promise<{ status: string }> {
    const response = await axiosInstance.post<{ status: string }>(`/sessions/${id}/join`, {})
    return response.data
  },

  async getUpcoming(limit: number = 5): Promise<Types.Session[]> {
    const response = await axiosInstance.get<Types.Session[]>(
      `/sessions?status=scheduled&limit=${limit}`
    )
    return response.data
  },
}

/* ============================================================================ */
/* EVIDENCE API */
/* ============================================================================ */

export const evidenceApi = {
  async create(
    sessionId: string,
    data: Types.EvidenceFormData,
    file?: File
  ): Promise<Types.Evidence> {
    const formData = new FormData()
    formData.append('capture_type', data.capture_type)
    if (data.description) formData.append('description', data.description)
    if (data.latitude !== undefined) formData.append('latitude', String(data.latitude))
    if (data.longitude !== undefined) formData.append('longitude', String(data.longitude))
    if (data.learning_objectives)
      formData.append('learning_objectives', JSON.stringify(data.learning_objectives))
    if (data.competencies) formData.append('competencies', JSON.stringify(data.competencies))
    if (file) formData.append('file', file)

    const response = await axiosInstance.post<Types.Evidence>(
      `/sessions/${sessionId}/evidence`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    )
    return response.data
  },

  async list(
    sessionId: string,
    filters?: Types.EvidenceFilters
  ): Promise<Types.PaginatedEvidenceResponse> {
    const params = new URLSearchParams()
    if (filters?.capture_type) params.append('capture_type', filters.capture_type)
    if (filters?.student_id) params.append('student_id', filters.student_id)
    if (filters?.skip !== undefined) params.append('skip', String(filters.skip))
    if (filters?.limit !== undefined) params.append('limit', String(filters.limit))

    const response = await axiosInstance.get<Types.PaginatedEvidenceResponse>(
      `/sessions/${sessionId}/evidence?${params.toString()}`
    )
    return response.data
  },

  async get(evidenceId: string): Promise<Types.Evidence> {
    const response = await axiosInstance.get<Types.Evidence>(`/evidence/${evidenceId}`)
    return response.data
  },

  async delete(evidenceId: string): Promise<void> {
    await axiosInstance.delete(`/evidence/${evidenceId}`)
  },
}

/* ============================================================================ */
/* PROGRESS API */
/* ============================================================================ */

export const progressApi = {
  async getStudentProgress(studentId: string): Promise<Types.StudentProgress[]> {
    const response = await axiosInstance.get<Types.StudentProgress[]>(
      `/progress?student_id=${studentId}`
    )
    return response.data
  },

  async getActivityProgress(activityId: string): Promise<Types.StudentProgress[]> {
    const response = await axiosInstance.get<Types.StudentProgress[]>(
      `/progress?activity_id=${activityId}`
    )
    return response.data
  },

  async getSummary(): Promise<{ overall: number; activities: Types.StudentProgress[] }> {
    const response = await axiosInstance.get<{
      overall: number
      activities: Types.StudentProgress[]
    }>('/progress/summary')
    return response.data
  },
}

/* ============================================================================ */
/* ASSESSMENT API (Rubrics & Scoring) */
/* ============================================================================ */

export const assessmentApi = {
  async createRubric(data: Partial<Types.Rubric>): Promise<Types.Rubric> {
    const response = await axiosInstance.post<Types.Rubric>('/rubrics', data)
    return response.data
  },

  async listRubrics(): Promise<Types.Rubric[]> {
    const response = await axiosInstance.get<Types.Rubric[]>('/rubrics')
    return response.data
  },

  async getRubric(id: string): Promise<Types.Rubric> {
    const response = await axiosInstance.get<Types.Rubric>(`/rubrics/${id}`)
    return response.data
  },

  async updateRubric(id: string, data: Partial<Types.Rubric>): Promise<Types.Rubric> {
    const response = await axiosInstance.put<Types.Rubric>(`/rubrics/${id}`, data)
    return response.data
  },

  async deleteRubric(id: string): Promise<void> {
    await axiosInstance.delete(`/rubrics/${id}`)
  },

  async scoreAssignment(data: Partial<Types.RubricScore>): Promise<Types.RubricScore> {
    const response = await axiosInstance.post<Types.RubricScore>('/assessment/score', data)
    return response.data
  },

  async getScore(scoreId: string): Promise<Types.RubricScore> {
    const response = await axiosInstance.get<Types.RubricScore>(`/assessment/score/${scoreId}`)
    return response.data
  },
}

/* ============================================================================ */
/* CURRICULUM API */
/* ============================================================================ */

export const curriculumApi = {
  async listUnits(filters?: Types.CurriculumFilters): Promise<Types.PaginatedCurriculumResponse> {
    const params = new URLSearchParams()
    if (filters?.subject) params.append('subject', filters.subject)
    if (filters?.grade_level) params.append('grade_level', filters.grade_level)
    if (filters?.skip !== undefined) params.append('skip', String(filters.skip))
    if (filters?.limit !== undefined) params.append('limit', String(filters.limit))

    const response = await axiosInstance.get<Types.PaginatedCurriculumResponse>(
      `/curriculum/units?${params.toString()}`
    )
    return response.data
  },

  async getUnit(id: string): Promise<Types.CurriculumUnit> {
    const response = await axiosInstance.get<Types.CurriculumUnit>(`/curriculum/units/${id}`)
    return response.data
  },

  async listStandards(filters?: Types.CurriculumFilters): Promise<Types.CurriculumStandard[]> {
    const params = new URLSearchParams()
    if (filters?.subject) params.append('subject', filters.subject)
    if (filters?.grade_level) params.append('grade_level', filters.grade_level)

    const response = await axiosInstance.get<Types.CurriculumStandard[]>(
      `/curriculum/standards?${params.toString()}`
    )
    return response.data
  },
}

/* ============================================================================ */
/* TEACHER API */
/* ============================================================================ */

export const teacherApi = {
  async getStudents(): Promise<Types.User[]> {
    const response = await axiosInstance.get<Types.User[]>('/activities/teacher/students')
    return response.data
  },

  async getClasses(): Promise<Types.TeacherClass[]> {
    const response = await axiosInstance.get<Types.TeacherClass[]>('/activities/teacher/classes')
    return response.data
  },

  async getSubmissions(params?: Types.SubmissionQueryParams): Promise<Types.TeacherSubmission[]> {
    const response = await axiosInstance.get<Types.TeacherSubmission[]>('/activities/teacher/submissions', { params })
    return response.data
  },

  // Raw session rows from GET /activities/teacher/submissions (this endpoint
  // returns *all* sessions — in_progress, completed, paused — across every
  // activity this teacher owns). Filtered here to just the sessions that are
  // currently live, so the dashboard can link straight into the GPS map at
  // /teacher/sessions/{session_id}/monitor.
  async getActiveSessions(): Promise<Types.TeacherActiveSession[]> {
    const response = await axiosInstance.get<Types.TeacherActiveSession[]>('/activities/teacher/submissions', {
      params: { limit: 200 },
    })
    const rows = Array.isArray(response.data) ? response.data : []
    return rows.filter((r) => r.status === 'in_progress')
  },

  async getDashboard(): Promise<Types.TeacherDashboardData> {
    const response = await axiosInstance.get<Types.TeacherDashboardData>('/activities/teacher/dashboard')
    return response.data
  },

  async getActivities(): Promise<Types.Activity[]> {
    // Backend returns a paginated object { items, total, page, page_size, total_pages }
    // (see PaginatedActivityResponse), not a bare array — extract the array so
    // callers (and the teacher store) always get Activity[].
    const response = await axiosInstance.get<{ items?: Types.Activity[] } | Types.Activity[]>('/activities')
    const data = response.data as any
    return Array.isArray(data) ? data : (data?.items ?? [])
  },
}

/* ============================================================================ */
/* STUDENT API */
/* ============================================================================ */

export const studentApi = {
  async getDashboard(): Promise<Types.StudentDashboardData> {
    const response = await axiosInstance.get<Types.StudentDashboardData>('/student/dashboard')
    return response.data
  },

  async getProgress(): Promise<Types.StudentProgress[]> {
    const response = await axiosInstance.get<Types.StudentProgress[]>('/student/progress')
    return response.data
  },

  async getActiveProjects(): Promise<Types.Project[]> {
    const response = await axiosInstance.get<Types.Project[]>('/student/self-projects')
    return response.data
  },

  async getActivities(): Promise<Types.Activity[]> {
    const response = await axiosInstance.get<{ activities?: Types.Activity[] } | Types.Activity[]>('/student/activities')
    // Backend returns paginated { activities: [...], total, page } — extract the array
    const data = response.data as any
    return Array.isArray(data) ? data : (data?.activities ?? [])
  },
}

/* ============================================================================ */
/* PARENT API */
/* ============================================================================ */

export const parentApi = {
  async getLinkedChildren(): Promise<Types.LinkedChild[]> {
    const response = await axiosInstance.get<Types.LinkedChild[]>('/parent/children')
    return response.data
  },

  async getChildProgress(childId: string): Promise<Types.ChildProgress> {
    const response = await axiosInstance.get<Types.ChildProgress>(
      `/parent/children/${childId}/progress`
    )
    return response.data
  },

  async getChildActivities(childId: string): Promise<Types.Activity[]> {
    const response = await axiosInstance.get<Types.Activity[]>(
      `/parent/children/${childId}/activities`
    )
    return response.data
  },

  async getDashboard(): Promise<Types.ParentDashboardData> {
    const response = await axiosInstance.get<Types.ParentDashboardData>('/parent/dashboard')
    return response.data
  },

  async linkChild(childEmail: string): Promise<{ status: string; pending_verification: boolean }> {
    const response = await axiosInstance.post<{
      status: string
      pending_verification: boolean
    }>('/parent/link-child', { child_email: childEmail })
    return response.data
  },
}

/* ============================================================================ */
/* ADMIN API */
/* ============================================================================ */

export const adminApi = {
  async listUsers(skip: number = 0, limit: number = 20): Promise<Types.PaginatedResponse<Types.User>> {
    const response = await axiosInstance.get<Types.PaginatedResponse<Types.User>>(
      `/admin/users?skip=${skip}&limit=${limit}`
    )
    return response.data
  },

  async createUser(data: Types.SignupRequest): Promise<Types.User> {
    const response = await axiosInstance.post<Types.User>('/admin/users', data)
    return response.data
  },

  async updateUser(id: string, data: Partial<Types.User>): Promise<Types.User> {
    const response = await axiosInstance.put<Types.User>(`/admin/users/${id}`, data)
    return response.data
  },

  async deleteUser(id: string): Promise<void> {
    await axiosInstance.delete(`/admin/users/${id}`)
  },

  async getAnalytics(): Promise<Types.SystemAnalytics> {
    const response = await axiosInstance.get<Types.SystemAnalytics>('/admin/analytics')
    return response.data
  },

  async getDashboard(): Promise<Types.AdminDashboardData> {
    const response = await axiosInstance.get<Types.AdminDashboardData>('/admin/dashboard')
    return response.data
  },
}

/* ============================================================================ */
/* EXPORT ALL SERVICES */
/* ============================================================================ */

export const apiServices = {
  auth: authApi,
  activities: activitiesApi,
  projects: projectsApi,
  sessions: sessionsApi,
  evidence: evidenceApi,
  progress: progressApi,
  assessment: assessmentApi,
  curriculum: curriculumApi,
  teacher: teacherApi,
  student: studentApi,
  parent: parentApi,
  admin: adminApi,
}

export default apiServices

/* ============================================================================ */
/* RE-EXPORTED TYPES (for pages that import from @/services/api)                */
/* ============================================================================ */

export type { ActivityQueryParams, SubmissionQueryParams } from './types'

/* ============================================================================ */
/* useApiData — generic data-fetching hook                                      */
/* ============================================================================ */

type ApiState<T> = {
  data: T | null
  loading: boolean
  error: string | null
}

type ApiAction<T> =
  | { type: 'LOADING' }
  | { type: 'SUCCESS'; payload: T }
  | { type: 'ERROR'; payload: string }

function apiReducer<T>(state: ApiState<T>, action: ApiAction<T>): ApiState<T> {
  switch (action.type) {
    case 'LOADING': return { ...state, loading: true, error: null }
    case 'SUCCESS': return { data: action.payload, loading: false, error: null }
    case 'ERROR':   return { ...state, loading: false, error: action.payload }
    default:        return state
  }
}

export function useApiData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[]
): ApiState<T> & { refetch: () => void } {
  const [state, dispatch] = useReducer(
    apiReducer as (s: ApiState<T>, a: ApiAction<T>) => ApiState<T>,
    { data: null, loading: true, error: null }
  )

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const run = useCallback(() => {
    dispatch({ type: 'LOADING' })
    fetcherRef.current()
      .then((d) => dispatch({ type: 'SUCCESS', payload: d }))
      .catch((err: unknown) => dispatch({
        type: 'ERROR',
        payload: err instanceof Error ? err.message : String(err),
      }))
  }, [])

  useEffect(() => { run() }, deps) // eslint-disable-line -- deps intentionally dynamic

  return { ...state, refetch: run }
}

/* ============================================================================ */
/* Role-specific API hooks                                                        */
/* ============================================================================ */

export function useTeacher() {
  return {
    getActivities: (_params?: Types.ActivityQueryParams) => teacherApi.getActivities(),
    getActivity: (id: string) =>
      axiosInstance.get<Types.Activity>(`/teacher/activities/${id}`).then((r) => r.data),
    createActivity: (data: Types.CreateActivityRequest) =>
      axiosInstance.post<Types.Activity>('/activities', data).then((r) => r.data),
    updateActivity: (id: string, data: Types.UpdateActivityRequest) =>
      axiosInstance.put<Types.Activity>(`/teacher/activities/${id}`, data).then((r) => r.data),
    deleteActivity: (id: string) =>
      axiosInstance.delete(`/teacher/activities/${id}`).then(() => undefined),
    getSubmissions: (params?: Types.SubmissionQueryParams) => teacherApi.getSubmissions(params),
    getActiveSessions: () => teacherApi.getActiveSessions(),
    approveSubmission: (id: string, data?: { feedback?: string; score?: number }) =>
      axiosInstance.post(`/activities/teacher/submissions/${id}/approve`, data ?? {}).then((r) => r.data),
    rejectSubmission: (id: string, feedback: string) =>
      axiosInstance.post(`/activities/teacher/submissions/${id}/reject`, { feedback }).then((r) => r.data),
    getSubmissionDetail: (sessionId: string) =>
      axiosInstance.get<Types.SubmissionDetail>(`/activities/teacher/submissions/${sessionId}/detail`).then((r) => r.data),
    reviewFieldPhase: (sessionId: string, data: { feedback: string; approve?: boolean; reject?: boolean }) =>
      axiosInstance.post(`/activities/teacher/submissions/${sessionId}/review-field`, data).then((r) => r.data),
  }
}

export function useStudent() {
  return {
    getDashboard: () => studentApi.getDashboard(),
    getActivities: () => studentApi.getActivities(),
    getActivityDetail: (id: string) =>
      axiosInstance.get<Types.Activity>(`/student/activities/${id}`).then((r) => r.data),

    // Start or resume a session for an activity
    startSession: (activityId: string, opts?: { latitude?: number; longitude?: number; locationName?: string }) =>
      axiosInstance.post<{ session_id: string; activity_id: string; status: string; started_at: string }>(
        `/student/activities/${activityId}/start`,
        { location_latitude: opts?.latitude, location_longitude: opts?.longitude, location_name: opts?.locationName }
      ).then((r) => r.data),

    // Upload evidence to a session (multipart/form-data)
    addEvidence: (sessionId: string, formData: FormData) =>
      axiosInstance.post(`/student/sessions/${sessionId}/evidence`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data),

    // Add a text reflection to a session
    addReflection: (sessionId: string, data: { reflection_type?: string; title?: string; content: string; learning_objectives?: string[]; competencies?: string[] }) =>
      axiosInstance.post(`/student/sessions/${sessionId}/reflection`, data).then((r) => r.data),

    // List evidence for a session
    getSessionEvidence: (sessionId: string) =>
      axiosInstance.get<{ captures: Types.EvidenceCapture[]; total: number }>(`/student/sessions/${sessionId}/evidence`).then((r) => r.data),

    // Get session progress snapshot
    getSessionProgress: (sessionId: string) =>
      axiosInstance.get(`/student/sessions/${sessionId}/progress`).then((r) => r.data),

    // Submit a completed activity (field_only mode)
    submitActivity: (activityId: string, sessionId: string) =>
      axiosInstance.post(`/student/activities/${activityId}/submit`, { session_id: sessionId }).then((r) => r.data),

    // Complete the field phase (for field_and_reflection mode)
    completeFieldPhase: (sessionId: string) =>
      axiosInstance.post(`/student/sessions/${sessionId}/complete-field`).then((r) => r.data),

    getProgress: () => studentApi.getProgress(),
    getPendingReflections: () =>
      axiosInstance.get<Types.PendingReflectionItem[]>('/student/pending-reflection').then((r) => r.data),
    saveReflection: (submissionId: string, data: { reflection_content: Record<string, any>; linked_field_note_id?: string; submit?: boolean }) =>
      axiosInstance.post(`/student/submissions/${submissionId}/save-reflection`, data).then((r) => r.data),

    // Legacy — kept for backward compat
    submitEvidence: (activityId: string, data: FormData | Record<string, any>) =>
      axiosInstance.post(`/student/activities/${activityId}/evidence`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data),
  }
}

export function useParent() {
  return {
    getChildren: () => parentApi.getLinkedChildren(),
    getChildProgress: (childId: string) => parentApi.getChildProgress(childId),
    getChildDigest: (childId: string) =>
      axiosInstance.get(`/parent/children/${childId}/digest`).then((r) => r.data),
    getChildCompetencies: (childId: string) =>
      axiosInstance.get(`/parent/children/${childId}/competencies`).then((r) => r.data),
  }
}
