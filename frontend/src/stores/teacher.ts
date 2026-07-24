// src/stores/teacher.ts
// Block 4: All stubs replaced with real API calls + Bearer auth
import { create } from 'zustand'
import type { Activity, Project } from '@/types/teacher'

const API_BASE = '/api/v1'

/** Read Bearer token from the same localStorage key auth store uses */
function authHeader(): Record<string, string> {
  const token = localStorage.getItem('auth_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Shared fetch wrapper — throws on non-2xx */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...(options.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    let message = res.statusText || `Request failed (${res.status})`
    if (text) {
      try {
        const body = JSON.parse(text)
        if (typeof body?.detail === 'string') {
          // Plain FastAPI HTTPException — already human-readable.
          message = body.detail
        } else if (Array.isArray(body?.detail)) {
          // Pydantic 422 validation errors: [{ loc: [...], msg, type }, ...].
          // Surfacing this array's raw JSON (the old behavior) dumped things
          // like {"detail":[{"type":"string_too_short","loc":["body",
          // "description"],"msg":"String should have at least 10
          // characters",...}]} straight into the UI. Turn each entry into
          // "<field>: <message>" instead.
          const formatted = body.detail
            .map((e: any) => {
              const field = Array.isArray(e?.loc) ? e.loc[e.loc.length - 1] : e?.loc
              return field && typeof field === 'string' ? `${field}: ${e.msg}` : e.msg
            })
            .filter(Boolean)
          if (formatted.length) message = formatted.join('; ')
        } else if (text) {
          message = text
        }
      } catch {
        // Body wasn't JSON — fall back to the raw text.
        message = text
      }
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json()
}

/**
 * ActivityPayload - Data structure for saving activities
 * Used by ActivityBuilder with location and Ollama features
 */
export interface ActivityPayload {
  id?: string
  title: string
  description: string
  subject: string
  grade_level: number
  activity_type: string
  difficulty_level: number
  estimated_duration_minutes: number
  location: {
    latitude: number | null
    longitude: number | null
    address?: string
    wikiId?: string
  }
  learning_objectives: string[]
  bloom_level: string
  assessment_type: string
  materials_needed: string[]
  resources?: string[]
  location_info?: string
  suggested_lessons?: string[]
  curriculum_units?: string[]
  status: 'draft' | 'published'
}

export interface TeacherStore {
  // Activity state
  activities: Activity[]
  paginatedActivities: Activity[]
  selectedActivity: Activity | null
  currentActivity?: Activity | null
  activityLoading: boolean
  activityError: string | null
  totalPages: number
  currentPage: number

  // Project state
  projects: Project[]
  paginatedProjects: Project[] & { total_pages?: number }
  selectedProject: Project | null
  projectLoading: boolean
  projectError: string | null

  // Filters
  filters: Record<string, any>
  loading: boolean
  error: string | null

  // Activity actions
  fetchActivities: (params?: any) => Promise<void>
  fetchActivity: (id: string) => Promise<void>
  createActivity: (data: Partial<Activity>) => Promise<Activity>
  updateActivity: (id: string, data: Partial<Activity>) => Promise<Activity>
  deleteActivity: (id: string) => Promise<void>
  getActivity?: (id: string) => Promise<Activity | null>
  publishActivity?: (id: string) => Promise<void>
  archiveActivity?: (id: string) => Promise<void>
  clearCurrentActivity?: () => void
  saveActivity: (data: ActivityPayload) => Promise<Activity>

  // Project actions
  fetchProjects: (params?: any) => Promise<void>
  fetchProject: (id: string) => Promise<void>
  createProject: (data: Partial<Project>) => Promise<Project>
  updateProject: (id: string, data: Partial<Project>) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  addActivityToProject: (projectId: string, activityId: string) => Promise<void>
  removeActivityFromProject: (projectId: string, activityId: string) => Promise<void>
  reorderActivities: (projectId: string, activityIds: string[]) => Promise<void>

  // Pagination
  setCurrentPage: (page: number) => void

  // Filter actions
  setFilters: (filters: Record<string, any>) => void
  clearError: () => void
}

export const useTeacherStore = create<TeacherStore>((set, get) => ({
  // ── Initial state ────────────────────────────────────────────────────────
  activities: [],
  paginatedActivities: [],
  selectedActivity: null,
  currentActivity: null,
  activityLoading: false,
  activityError: null,
  totalPages: 0,
  currentPage: 1,

  projects: [],
  paginatedProjects: [],
  selectedProject: null,
  projectLoading: false,
  projectError: null,

  filters: {},
  loading: false,
  error: null,

  // ── Activity actions ─────────────────────────────────────────────────────

  fetchActivities: async (params?: any) => {
    set({ activityLoading: true, activityError: null })
    try {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      const data = await apiFetch<{ activities: Activity[]; total_pages?: number }>(
        `/activities${qs}`
      )
      // Backend may return array or { activities, total_pages }
      const activities = Array.isArray(data) ? data : data.activities ?? []
      const totalPages = Array.isArray(data) ? 1 : data.total_pages ?? 1
      set({ activities, paginatedActivities: activities, totalPages, activityLoading: false })
    } catch (error) {
      set({ activityError: String(error), activityLoading: false })
    }
  },

  fetchActivity: async (id: string) => {
    set({ activityLoading: true, activityError: null })
    try {
      const activity = await apiFetch<Activity>(`/activities/${id}`)
      set({ currentActivity: activity, selectedActivity: activity, activityLoading: false })
    } catch (error) {
      set({ activityError: String(error), activityLoading: false })
    }
  },

  getActivity: async (id: string): Promise<Activity | null> => {
    try {
      const activity = await apiFetch<Activity>(`/activities/${id}`)
      set({ currentActivity: activity, selectedActivity: activity })
      return activity
    } catch {
      return null
    }
  },

  createActivity: async (data: Partial<Activity>) => {
    set({ loading: true, error: null })
    try {
      const activity = await apiFetch<Activity>('/activities', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      set((state) => ({
        activities: [...state.activities, activity],
        currentActivity: activity,
        loading: false,
      }))
      return activity
    } catch (error) {
      set({ error: String(error), loading: false })
      throw error
    }
  },

  updateActivity: async (id: string, data: Partial<Activity>) => {
    set({ loading: true, error: null })
    try {
      const activity = await apiFetch<Activity>(`/activities/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      set((state) => ({
        activities: state.activities.map((a) => (a.id === id ? activity : a)),
        currentActivity: activity,
        loading: false,
      }))
      return activity
    } catch (error) {
      set({ error: String(error), loading: false })
      throw error
    }
  },

  deleteActivity: async (id: string) => {
    set({ loading: true, error: null })
    try {
      await apiFetch<void>(`/activities/${id}`, { method: 'DELETE' })
      set((state) => ({
        activities: state.activities.filter((a) => a.id !== id),
        loading: false,
      }))
    } catch (error) {
      set({ error: String(error), loading: false })
      throw error
    }
  },

  publishActivity: async (id: string) => {
    set({ loading: true, error: null })
    try {
      const activity = await apiFetch<Activity>(`/activities/${id}/publish`, {
        method: 'POST',
      })
      set((state) => ({
        activities: state.activities.map((a) => (a.id === id ? activity : a)),
        currentActivity: activity,
        loading: false,
      }))
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  archiveActivity: async (id: string) => {
    set({ loading: true, error: null })
    try {
      const activity = await apiFetch<Activity>(`/activities/${id}/archive`, {
        method: 'POST',
      })
      set((state) => ({
        activities: state.activities.map((a) => (a.id === id ? activity : a)),
        loading: false,
      }))
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  clearCurrentActivity: () => {
    set({ currentActivity: null })
  },

  /**
   * saveActivity — create or update from ActivityPayload (used by ActivityBuilder)
   * Derives teacher_id from JWT on the backend; removes hardcoded stub.
   */
  saveActivity: async (data: ActivityPayload) => {
    set({ loading: true, error: null })
    try {
      const body = {
        title: data.title,
        description: data.description,
        subject: data.subject,
        grade_level: data.grade_level,
        activity_type: data.activity_type,
        difficulty_level: data.difficulty_level,
        estimated_duration_minutes: data.estimated_duration_minutes,
        location_latitude: data.location.latitude,
        location_longitude: data.location.longitude,
        location_address: data.location.address,
        location_name: data.location.address,
        location_radius_meters: 1000,
        wiki_location_id: data.location.wikiId,
        learning_objectives: data.learning_objectives,
        bloom_level: data.bloom_level,
        assessment_type: data.assessment_type,
        materials_needed: data.materials_needed,
        resources: data.resources,
        curriculum_unit_ids: data.curriculum_units,
        location_info: data.location_info,
        suggested_lessons: data.suggested_lessons,
        status: data.status,
      }

      const savedActivity = data.id
        ? await apiFetch<Activity>(`/activities/${data.id}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        : await apiFetch<Activity>('/activities', {
            method: 'POST',
            body: JSON.stringify(body),
          })

      set((state) => {
        if (data.id) {
          return {
            activities: state.activities.map((a) => (a.id === data.id ? savedActivity : a)),
            currentActivity: savedActivity,
            loading: false,
          }
        }
        return {
          activities: [...state.activities, savedActivity],
          currentActivity: savedActivity,
          loading: false,
        }
      })

      return savedActivity
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      set({ error: msg, loading: false })
      throw error
    }
  },

  // ── Project actions ──────────────────────────────────────────────────────

  fetchProjects: async (params?: any) => {
    set({ projectLoading: true, projectError: null })
    try {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      const data = await apiFetch<{ projects: Project[]; total_pages?: number } | Project[]>(
        `/teacher/projects${qs}`
      )
      const projects = Array.isArray(data) ? data : (data as any).projects ?? []
      const totalPages = Array.isArray(data) ? 1 : (data as any).total_pages ?? 1
      set({ projects, paginatedProjects: projects, totalPages, projectLoading: false })
    } catch (error) {
      set({ projectError: String(error), projectLoading: false })
    }
  },

  fetchProject: async (id: string) => {
    set({ projectLoading: true, projectError: null })
    try {
      const project = await apiFetch<Project>(`/teacher/projects/${id}`)
      set({ selectedProject: project, projectLoading: false })
    } catch (error) {
      set({ projectError: String(error), projectLoading: false })
    }
  },

  createProject: async (data: Partial<Project>) => {
    set({ loading: true, error: null })
    try {
      const project = await apiFetch<Project>('/teacher/projects', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      set((state) => ({ projects: [...state.projects, project], loading: false }))
      return project
    } catch (error) {
      set({ error: String(error), loading: false })
      throw error
    }
  },

  updateProject: async (id: string, data: Partial<Project>) => {
    set({ loading: true, error: null })
    try {
      const project = await apiFetch<Project>(`/teacher/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? project : p)),
        selectedProject: project,
        loading: false,
      }))
      return project
    } catch (error) {
      set({ error: String(error), loading: false })
      throw error
    }
  },

  deleteProject: async (id: string) => {
    set({ loading: true, error: null })
    try {
      await apiFetch<void>(`/teacher/projects/${id}`, { method: 'DELETE' })
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        loading: false,
      }))
    } catch (error) {
      set({ error: String(error), loading: false })
      throw error
    }
  },

  addActivityToProject: async (projectId: string, activityId: string) => {
    set({ loading: true, error: null })
    try {
      await apiFetch<void>(`/teacher/projects/${projectId}/activities`, {
        method: 'POST',
        body: JSON.stringify({ activity_id: activityId }),
      })
      set({ loading: false })
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  removeActivityFromProject: async (projectId: string, activityId: string) => {
    set({ loading: true, error: null })
    try {
      await apiFetch<void>(`/teacher/projects/${projectId}/activities/${activityId}`, {
        method: 'DELETE',
      })
      set({ loading: false })
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  reorderActivities: async (projectId: string, activityIds: string[]) => {
    set({ loading: true, error: null })
    try {
      await apiFetch<void>(`/teacher/projects/${projectId}/activities/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ activity_ids: activityIds }),
      })
      set({ loading: false })
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  // ── Pagination / filter helpers ──────────────────────────────────────────

  setCurrentPage: (page: number) => {
    set({ currentPage: page })
  },

  setFilters: (filters: Record<string, any>) => {
    set({ filters })
  },

  clearError: () => {
    set({ error: null, activityError: null, projectError: null })
  },
}))

export default useTeacherStore
