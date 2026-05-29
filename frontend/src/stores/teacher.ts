// src/stores/teacher.ts - UPDATED
import { create } from 'zustand'
import type { Activity, Project } from '@/types/teacher'

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
  getActivity?: (id: string) => Promise<void>
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

export const useTeacherStore = create<TeacherStore>((set) => ({
  // Initial state
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

  // Activity actions
  fetchActivities: async (params?: any) => {
    set({ activityLoading: true })
    try {
      set({ activityLoading: false })
    } catch (error) {
      set({ activityError: String(error), activityLoading: false })
    }
  },

  fetchActivity: async (id: string) => {
    set({ activityLoading: true })
    try {
      set({ activityLoading: false })
    } catch (error) {
      set({ activityError: String(error), activityLoading: false })
    }
  },

  getActivity: async (id: string) => {
    set({ activityLoading: true })
    try {
      set({ activityLoading: false })
    } catch (error) {
      set({ activityError: String(error), activityLoading: false })
    }
  },

  createActivity: async (data: Partial<Activity>) => {
    set({ loading: true })
    try {
      const activity: Activity = {
        id: 'stub',
        teacher_id: 'stub',
        title: data.title || '',
        description: data.description || '',
        location_latitude: data.location_latitude || 0,
        location_longitude: data.location_longitude || 0,
        location_radius_meters: data.location_radius_meters || 0,
        location_name: data.location_name || '',
        grade_level: data.grade_level || 0,
        subject: data.subject || '',
        difficulty_level: data.difficulty_level || 0,
        estimated_duration_minutes: data.estimated_duration_minutes || 0,
        curriculum_unit_ids: [],
        learning_objectives: [],
        materials_needed: [],
        resources: [],
        status: 'draft',
        is_shareable: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      set({ loading: false })
      return activity
    } catch (error) {
      set({ error: String(error), loading: false })
      throw error
    }
  },

  updateActivity: async (id: string, data: Partial<Activity>) => {
    set({ loading: true })
    try {
      const activity: Activity = { id } as Activity
      set({ loading: false })
      return activity
    } catch (error) {
      set({ error: String(error), loading: false })
      throw error
    }
  },

  deleteActivity: async (id: string) => {
    set({ loading: true })
    try {
      set({ loading: false })
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  publishActivity: async (id: string) => {
    try {
      // TODO: Implement
    } catch (error) {
      set({ error: String(error) })
    }
  },

  archiveActivity: async (id: string) => {
    try {
      // TODO: Implement
    } catch (error) {
      set({ error: String(error) })
    }
  },

  clearCurrentActivity: () => {
    set({ currentActivity: null })
  },

  /**
   * saveActivity - Save or update an activity with location and Ollama data
   * Handles both draft and published statuses
   * Used by ActivityBuilder component
   */
  saveActivity: async (data: ActivityPayload) => {
    set({ loading: true, error: null })
    try {
      // Convert ActivityPayload to Activity format
      const activity: Activity = {
        id: data.id || `activity_${Date.now()}`,
        teacher_id: 'current_teacher_id', // TODO: Get from auth store
        title: data.title,
        description: data.description,
        subject: data.subject,
        grade_level: data.grade_level,
        activity_type: data.activity_type,
        difficulty_level: data.difficulty_level,
        estimated_duration_minutes: data.estimated_duration_minutes,

        // Location fields
        location_latitude: data.location.latitude || 0,
        location_longitude: data.location.longitude || 0,
        location_address: data.location.address || '',
        location_name: data.location.address || '',
        location_radius_meters: 1000, // Default 1km radius

        // Learning & Assessment
        learning_objectives: data.learning_objectives || [],
        bloom_level: data.bloom_level,
        assessment_type: data.assessment_type,

        // Materials & Resources
        materials_needed: data.materials_needed || [],
        resources: data.resources || [],

        // Curriculum & Meta
        curriculum_unit_ids: data.curriculum_units || [],

        // Status
        status: data.status || 'draft',
        is_shareable: false,

        // Timestamps
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),

        // Extended fields for location features
        ...(data.location_info && { location_info: data.location_info }),
        ...(data.location.wikiId && { wiki_location_id: data.location.wikiId }),
        ...(data.suggested_lessons && { suggested_lessons: data.suggested_lessons }),
      }

      // API call to save activity
      const endpoint = `/api/v1/activities${data.id ? `/${data.id}` : ''}`
      const response = await fetch(endpoint, {
        method: data.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activity)
      })

      if (!response.ok) {
        throw new Error(`Failed to save activity: ${response.statusText}`)
      }

      const savedActivity = await response.json()

      // Update local state with API response
      set((state) => {
        if (data.id) {
          // Update existing activity
          return {
            activities: state.activities.map(a => a.id === data.id ? savedActivity : a),
            currentActivity: savedActivity,
            loading: false,
          }
        } else {
          // Create new activity
          return {
            activities: [...state.activities, savedActivity],
            currentActivity: savedActivity,
            loading: false,
          }
        }
      })

      return savedActivity
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      set({ error: errorMessage, loading: false })
      throw error
    }
  },

  // Project actions
  fetchProjects: async (params?: any) => {
    set({ projectLoading: true })
    try {
      set({ projectLoading: false })
    } catch (error) {
      set({ projectError: String(error), projectLoading: false })
    }
  },

  fetchProject: async (id: string) => {
    set({ projectLoading: true })
    try {
      set({ projectLoading: false })
    } catch (error) {
      set({ projectError: String(error), projectLoading: false })
    }
  },

  createProject: async (data: Partial<Project>) => {
    set({ loading: true })
    try {
      const project: Project = {
        id: 'stub',
        teacher_id: 'stub',
        title: data.title || '',
        description: data.description || '',
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      set({ loading: false })
      return project
    } catch (error) {
      set({ error: String(error), loading: false })
      throw error
    }
  },

  updateProject: async (id: string, data: Partial<Project>) => {
    set({ loading: true })
    try {
      const project: Project = { id } as Project
      set({ loading: false })
      return project
    } catch (error) {
      set({ error: String(error), loading: false })
      throw error
    }
  },

  deleteProject: async (id: string) => {
    set({ loading: true })
    try {
      set({ loading: false })
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  addActivityToProject: async (projectId: string, activityId: string) => {
    try {
      // TODO: Implement
    } catch (error) {
      set({ error: String(error) })
    }
  },

  removeActivityFromProject: async (projectId: string, activityId: string) => {
    try {
      // TODO: Implement
    } catch (error) {
      set({ error: String(error) })
    }
  },

  reorderActivities: async (projectId: string, activityIds: string[]) => {
    try {
      // TODO: Implement
    } catch (error) {
      set({ error: String(error) })
    }
  },

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