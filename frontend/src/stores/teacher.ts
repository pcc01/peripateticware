// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { create } from 'zustand'
import { Activity, CreateActivityInput, UpdateActivityInput, ActivityListResponse, FilterParams } from '@/types/teacher'

interface TeacherStore {
  // State
  activities: Activity[]
  currentActivity: Activity | null
  loading: boolean
  error: string | null
  totalPages: number
  currentPage: number
  pageSize: number

  // Actions
  fetchActivities: (params?: FilterParams) => Promise<void>
  getActivity: (id: string) => Promise<Activity>
  createActivity: (data: CreateActivityInput) => Promise<Activity>
  updateActivity: (id: string, data: UpdateActivityInput) => Promise<Activity>
  deleteActivity: (id: string) => Promise<void>
  publishActivity: (id: string) => Promise<Activity>
  archiveActivity: (id: string) => Promise<Activity>
  setCurrentPage: (page: number) => void
  clearError: () => void
  clearCurrentActivity: () => void
}

const API_BASE = 'http://localhost:8000/api/v1/teacher/activities'

/**
 * Get auth token from localStorage
 */
function getAuthToken(): string {
  const token = localStorage.getItem('auth_token')
  if (!token) {
    throw new Error('No authentication token found')
  }
  return token
}

/**
 * Fetch helper with error handling
 */
async function apiCall<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken()
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.detail || `API error: ${response.status}`)
  }

  return response.json()
}

export const useTeacherStore = create<TeacherStore>((set, get) => ({
  // Initial state
  activities: [],
  currentActivity: null,
  loading: false,
  error: null,
  totalPages: 1,
  currentPage: 1,
  pageSize: 10,

  /**
   * Fetch activities list with optional filters
   */
  fetchActivities: async (params = {}) => {
    set({ loading: true, error: null })
    try {
      const query = new URLSearchParams(
        Object.entries(params).reduce((acc, [key, value]) => {
          if (value !== undefined && value !== null) {
            acc[key] = String(value)
          }
          return acc
        }, {} as Record<string, string>)
      ).toString()

      const url = query ? `${API_BASE}?${query}` : API_BASE
      const data = await apiCall<ActivityListResponse>(url)

      set({
        activities: data.items || [],
        totalPages: data.total_pages || 1,
        currentPage: data.page || 1,
        pageSize: data.page_size || 10,
        loading: false,
        error: null
      })
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch activities',
        loading: false
      })
      throw error
    }
  },

  /**
   * Get single activity by ID
   */
  getActivity: async (id: string) => {
    set({ loading: true, error: null })
    try {
      const data = await apiCall<{ data: Activity }>(`${API_BASE}/${id}`)
      const activity = data.data
      set({
        currentActivity: activity,
        loading: false,
        error: null
      })
      return activity
    } catch (error: any) {
      set({
        error: error.message || 'Failed to fetch activity',
        loading: false
      })
      throw error
    }
  },

  /**
   * Create new activity
   */
  createActivity: async (data: CreateActivityInput) => {
    set({ loading: true, error: null })
    try {
      const response = await apiCall<{ data: Activity }>(API_BASE, {
        method: 'POST',
        body: JSON.stringify(data)
      })
      const newActivity = response.data

      set(state => ({
        activities: [...state.activities, newActivity],
        loading: false,
        error: null
      }))

      return newActivity
    } catch (error: any) {
      set({
        error: error.message || 'Failed to create activity',
        loading: false
      })
      throw error
    }
  },

  /**
   * Update existing activity
   */
  updateActivity: async (id: string, data: UpdateActivityInput) => {
    set({ loading: true, error: null })
    try {
      const response = await apiCall<{ data: Activity }>(`${API_BASE}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      })
      const updated = response.data

      set(state => ({
        activities: state.activities.map(a => a.id === id ? updated : a),
        currentActivity: state.currentActivity?.id === id ? updated : state.currentActivity,
        loading: false,
        error: null
      }))

      return updated
    } catch (error: any) {
      set({
        error: error.message || 'Failed to update activity',
        loading: false
      })
      throw error
    }
  },

  /**
   * Delete activity by ID
   */
  deleteActivity: async (id: string) => {
    set({ loading: true, error: null })
    try {
      await apiCall<void>(`${API_BASE}/${id}`, {
        method: 'DELETE'
      })

      set(state => ({
        activities: state.activities.filter(a => a.id !== id),
        currentActivity: state.currentActivity?.id === id ? null : state.currentActivity,
        loading: false,
        error: null
      }))
    } catch (error: any) {
      set({
        error: error.message || 'Failed to delete activity',
        loading: false
      })
      throw error
    }
  },

  /**
   * Publish activity (change status to published)
   */
  publishActivity: async (id: string) => {
    set({ loading: true, error: null })
    try {
      const response = await apiCall<{ data: Activity }>(`${API_BASE}/${id}/publish`, {
        method: 'POST'
      })
      const updated = response.data

      set(state => ({
        activities: state.activities.map(a => a.id === id ? updated : a),
        currentActivity: state.currentActivity?.id === id ? updated : state.currentActivity,
        loading: false,
        error: null
      }))

      return updated
    } catch (error: any) {
      set({
        error: error.message || 'Failed to publish activity',
        loading: false
      })
      throw error
    }
  },

  /**
   * Archive activity (change status to archived)
   */
  archiveActivity: async (id: string) => {
    set({ loading: true, error: null })
    try {
      const response = await apiCall<{ data: Activity }>(`${API_BASE}/${id}/archive`, {
        method: 'POST'
      })
      const updated = response.data

      set(state => ({
        activities: state.activities.map(a => a.id === id ? updated : a),
        currentActivity: state.currentActivity?.id === id ? updated : state.currentActivity,
        loading: false,
        error: null
      }))

      return updated
    } catch (error: any) {
      set({
        error: error.message || 'Failed to archive activity',
        loading: false
      })
      throw error
    }
  },

  // Utility actions
  setCurrentPage: (page: number) => set({ currentPage: page }),
  clearError: () => set({ error: null }),
  clearCurrentActivity: () => set({ currentActivity: null })
}))
