// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Comprehensive Zustand Stores for Peripateticware
 * Organized stores for: Activities, Projects, Sessions, Progress, Teacher, Student, Parent, Admin
 */

import { create } from 'zustand'
import * as Types from '../types'
import type { StudentProgress as _SP } from '../services/types'
import { apiServices } from '../services/api'

/* ============================================================================ */
/* ACTIVITIES STORE */
/* ============================================================================ */

interface ActivitiesState {
  activities: Types.Activity[]
  selectedActivity: Types.Activity | null
  pagination: { total: number; skip: number; limit: number }
  filters: Types.ActivityFilters
  loading: boolean
  error: string | null

  // Actions
  fetchActivities: (filters?: Types.ActivityFilters) => Promise<void>
  fetchActivity: (id: string) => Promise<void>
  createActivity: (data: Types.CreateActivityRequest) => Promise<Types.Activity>
  updateActivity: (id: string, data: Types.UpdateActivityRequest) => Promise<Types.Activity>
  deleteActivity: (id: string) => Promise<void>
  publishActivity: (id: string) => Promise<Types.Activity>
  setFilters: (filters: Types.ActivityFilters) => void
  selectActivity: (activity: Types.Activity | null) => void
  clearError: () => void
}

export const useActivitiesStore = create<ActivitiesState>((set, get) => ({
  activities: [],
  selectedActivity: null,
  pagination: { total: 0, skip: 0, limit: 20 },
  filters: {},
  loading: false,
  error: null,

  async fetchActivities(filters = {}) {
    set({ loading: true, error: null })
    try {
      const result = await apiServices.activities.list(filters)
      set({
        activities: result.items,
        pagination: { total: result.total, skip: result.skip, limit: result.limit },
        filters,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch activities'
      set({ error: message })
      console.error('fetchActivities error:', message)
    } finally {
      set({ loading: false })
    }
  },

  async fetchActivity(id: string) {
    set({ loading: true, error: null })
    try {
      const activity = await apiServices.activities.get(id)
      set({ selectedActivity: activity })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch activity'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async createActivity(data: Types.CreateActivityRequest) {
    set({ loading: true, error: null })
    try {
      const activity = await apiServices.activities.create(data as any)
      set((state) => ({
        activities: [activity, ...state.activities],
      }))
      return activity
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create activity'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  async updateActivity(id: string, data: Types.UpdateActivityRequest) {
    set({ loading: true, error: null })
    try {
      const activity = await apiServices.activities.update(id, data)
      set((state) => ({
        activities: state.activities.map((a) => (a.id === id ? activity : a)),
        selectedActivity: state.selectedActivity?.id === id ? activity : state.selectedActivity,
      }))
      return activity
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update activity'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  async deleteActivity(id: string) {
    set({ loading: true, error: null })
    try {
      await apiServices.activities.delete(id)
      set((state) => ({
        activities: state.activities.filter((a) => a.id !== id),
        selectedActivity: state.selectedActivity?.id === id ? null : state.selectedActivity,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete activity'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  async publishActivity(id: string) {
    set({ loading: true, error: null })
    try {
      const activity = await apiServices.activities.publish(id)
      set((state) => ({
        activities: state.activities.map((a) => (a.id === id ? activity : a)),
        selectedActivity: state.selectedActivity?.id === id ? activity : state.selectedActivity,
      }))
      return activity
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish activity'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  setFilters(filters: Types.ActivityFilters) {
    set({ filters })
  },

  selectActivity(activity: Types.Activity | null) {
    set({ selectedActivity: activity })
  },

  clearError() {
    set({ error: null })
  },
}))

/* ============================================================================ */
/* PROJECTS STORE */
/* ============================================================================ */

interface ProjectsState {
  projects: Types.Project[]
  selectedProject: Types.Project | null
  pagination: { total: number; skip: number; limit: number }
  filters: Types.ProjectFilters
  loading: boolean
  error: string | null

  // Actions
  fetchProjects: (filters?: Types.ProjectFilters) => Promise<void>
  fetchProject: (id: string) => Promise<void>
  createProject: (data: Types.ProjectFormData) => Promise<Types.Project>
  updateProject: (id: string, data: Partial<Types.ProjectFormData>) => Promise<Types.Project>
  deleteProject: (id: string) => Promise<void>
  setFilters: (filters: Types.ProjectFilters) => void
  selectProject: (project: Types.Project | null) => void
  clearError: () => void
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  selectedProject: null,
  pagination: { total: 0, skip: 0, limit: 20 },
  filters: {},
  loading: false,
  error: null,

  async fetchProjects(filters = {}) {
    set({ loading: true, error: null })
    try {
      const result = await apiServices.projects.list(filters)
      set({
        projects: result.items,
        pagination: { total: result.total, skip: result.skip, limit: result.limit },
        filters,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch projects'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchProject(id: string) {
    set({ loading: true, error: null })
    try {
      const project = await apiServices.projects.get(id)
      set({ selectedProject: project })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch project'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async createProject(data: Types.ProjectFormData) {
    set({ loading: true, error: null })
    try {
      const project = await apiServices.projects.create(data)
      set((state) => ({
        projects: [project, ...state.projects],
      }))
      return project
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create project'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  async updateProject(id: string, data: Partial<Types.ProjectFormData>) {
    set({ loading: true, error: null })
    try {
      const project = await apiServices.projects.update(id, data)
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? project : p)),
        selectedProject: state.selectedProject?.id === id ? project : state.selectedProject,
      }))
      return project
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update project'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  async deleteProject(id: string) {
    set({ loading: true, error: null })
    try {
      await apiServices.projects.delete(id)
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        selectedProject: state.selectedProject?.id === id ? null : state.selectedProject,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete project'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  setFilters(filters: Types.ProjectFilters) {
    set({ filters })
  },

  selectProject(project: Types.Project | null) {
    set({ selectedProject: project })
  },

  clearError() {
    set({ error: null })
  },
}))

/* ============================================================================ */
/* SESSIONS STORE */
/* ============================================================================ */

interface SessionsState {
  sessions: Types.Session[]
  selectedSession: Types.Session | null
  upcomingSessions: Types.Session[]
  loading: boolean
  error: string | null

  // Actions
  fetchSessions: (filters?: Types.SessionFilters) => Promise<void>
  fetchSession: (id: string) => Promise<void>
  fetchUpcomingSessions: (limit?: number) => Promise<void>
  createSession: (data: Types.SessionFormData) => Promise<Types.Session>
  updateSession: (id: string, data: Partial<Types.SessionFormData>) => Promise<Types.Session>
  deleteSession: (id: string) => Promise<void>
  joinSession: (id: string) => Promise<void>
  selectSession: (session: Types.Session | null) => void
  clearError: () => void
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  selectedSession: null,
  upcomingSessions: [],
  loading: false,
  error: null,

  async fetchSessions(filters = {}) {
    set({ loading: true, error: null })
    try {
      const result = await apiServices.sessions.list(filters)
      set({ sessions: result.items })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch sessions'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchSession(id: string) {
    set({ loading: true, error: null })
    try {
      const session = await apiServices.sessions.get(id)
      set({ selectedSession: session })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch session'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchUpcomingSessions(limit = 5) {
    set({ loading: true, error: null })
    try {
      const sessions = await apiServices.sessions.getUpcoming(limit)
      set({ upcomingSessions: sessions })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch upcoming sessions'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async createSession(data: Types.SessionFormData) {
    set({ loading: true, error: null })
    try {
      const session = await apiServices.sessions.create(data)
      set((state) => ({
        sessions: [session, ...state.sessions],
      }))
      return session
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create session'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  async updateSession(id: string, data: Partial<Types.SessionFormData>) {
    set({ loading: true, error: null })
    try {
      const session = await apiServices.sessions.update(id, data)
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === id ? session : s)),
        selectedSession: state.selectedSession?.id === id ? session : state.selectedSession,
      }))
      return session
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update session'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  async deleteSession(id: string) {
    set({ loading: true, error: null })
    try {
      await apiServices.sessions.delete(id)
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== id),
        selectedSession: state.selectedSession?.id === id ? null : state.selectedSession,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete session'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  async joinSession(id: string) {
    set({ loading: true, error: null })
    try {
      await apiServices.sessions.join(id)
      await get().fetchSession(id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join session'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  selectSession(session: Types.Session | null) {
    set({ selectedSession: session })
  },

  clearError() {
    set({ error: null })
  },
}))

/* ============================================================================ */
/* PROGRESS STORE */
/* ============================================================================ */

interface ProgressState {
  progress: Types.StudentProgress[]
  loading: boolean
  error: string | null

  // Actions
  fetchStudentProgress: (studentId: string) => Promise<void>
  fetchActivityProgress: (activityId: string) => Promise<void>
  fetchProgressSummary: () => Promise<void>
  clearError: () => void
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  progress: [],
  loading: false,
  error: null,

  async fetchStudentProgress(studentId: string) {
    set({ loading: true, error: null })
    try {
      const progress = await apiServices.progress.getStudentProgress(studentId)
      set({ progress })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch progress'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchActivityProgress(activityId: string) {
    set({ loading: true, error: null })
    try {
      const progress = await apiServices.progress.getActivityProgress(activityId)
      set({ progress })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch progress'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchProgressSummary() {
    set({ loading: true, error: null })
    try {
      const data = await apiServices.progress.getSummary()
      set({ progress: data.activities })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch progress summary'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  clearError() {
    set({ error: null })
  },
}))

/* ============================================================================ */
/* TEACHER STORE */
/* ============================================================================ */

interface TeacherState {
  dashboardData: Types.TeacherDashboardData | null
  students: Types.User[]
  classes: Types.TeacherClass[]
  submissions: Types.TeacherSubmission[]
  activities: Types.Activity[]
  loading: boolean
  error: string | null

  // Actions
  fetchDashboard: () => Promise<void>
  fetchStudents: () => Promise<void>
  fetchClasses: () => Promise<void>
  fetchSubmissions: () => Promise<void>
  fetchActivities: () => Promise<void>
  clearError: () => void
}

export const useTeacherStore = create<TeacherState>((set, get) => ({
  dashboardData: null,
  students: [],
  classes: [],
  submissions: [],
  activities: [],
  loading: false,
  error: null,

  async fetchDashboard() {
    set({ loading: true, error: null })
    try {
      const data = await apiServices.teacher.getDashboard()
      set({ dashboardData: data })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch dashboard'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchStudents() {
    set({ loading: true, error: null })
    try {
      const students = await apiServices.teacher.getStudents()
      set({ students })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch students'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchClasses() {
    set({ loading: true, error: null })
    try {
      const classes = await apiServices.teacher.getClasses()
      set({ classes })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch classes'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchSubmissions() {
    set({ loading: true, error: null })
    try {
      const submissions = await apiServices.teacher.getSubmissions()
      set({ submissions })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch submissions'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchActivities() {
    set({ loading: true, error: null })
    try {
      const activities = await apiServices.teacher.getActivities()
      set({ activities })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch activities'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  clearError() {
    set({ error: null })
  },
}))

/* ============================================================================ */
/* STUDENT STORE */
/* ============================================================================ */

interface StudentState {
  dashboardData: Types.StudentDashboardData | null
  progress: Types.StudentProgress[]
  activeProjects: Types.Project[]
  activities: Types.Activity[]
  loading: boolean
  error: string | null

  // Actions
  fetchDashboard: () => Promise<void>
  fetchProgress: () => Promise<void>
  fetchActiveProjects: () => Promise<void>
  fetchActivities: () => Promise<void>
  clearError: () => void
}

export const useStudentStore = create<StudentState>((set, get) => ({
  dashboardData: null,
  progress: [],
  activeProjects: [],
  activities: [],
  loading: false,
  error: null,

  async fetchDashboard() {
    set({ loading: true, error: null })
    try {
      const data = await apiServices.student.getDashboard()
      set({ dashboardData: data })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch dashboard'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchProgress() {
    set({ loading: true, error: null })
    try {
      const progress = await apiServices.student.getProgress()
      set({ progress })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch progress'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchActiveProjects() {
    set({ loading: true, error: null })
    try {
      const projects = await apiServices.student.getActiveProjects()
      set({ activeProjects: projects })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch projects'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchActivities() {
    set({ loading: true, error: null })
    try {
      const activities = await apiServices.student.getActivities()
      set({ activities })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch activities'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  clearError() {
    set({ error: null })
  },
}))

/* ============================================================================ */
/* PARENT STORE */
/* ============================================================================ */

interface ParentState {
  dashboardData: Types.ParentDashboardData | null
  linkedChildren: Types.LinkedChild[]
  selectedChildId: string | null
  childProgress: Types.ChildProgress | null
  loading: boolean
  error: string | null

  // Actions
  fetchDashboard: () => Promise<void>
  fetchLinkedChildren: () => Promise<void>
  fetchChildProgress: (childId: string) => Promise<void>
  linkChild: (childEmail: string) => Promise<void>
  selectChild: (childId: string) => void
  clearError: () => void
}

export const useParentStore = create<ParentState>((set, get) => ({
  dashboardData: null,
  linkedChildren: [],
  selectedChildId: null,
  childProgress: null,
  loading: false,
  error: null,

  async fetchDashboard() {
    set({ loading: true, error: null })
    try {
      const data = await apiServices.parent.getDashboard()
      set({ dashboardData: data, linkedChildren: data.children })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch dashboard'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchLinkedChildren() {
    set({ loading: true, error: null })
    try {
      const children = await apiServices.parent.getLinkedChildren()
      set({ linkedChildren: children })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch children'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchChildProgress(childId: string) {
    set({ loading: true, error: null })
    try {
      const progress = await apiServices.parent.getChildProgress(childId)
      set({ childProgress: progress as any, selectedChildId: childId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch child progress'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async linkChild(childEmail: string) {
    set({ loading: true, error: null })
    try {
      await apiServices.parent.linkChild(childEmail)
      await get().fetchLinkedChildren()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to link child'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  selectChild(childId: string) {
    set({ selectedChildId: childId })
  },

  clearError() {
    set({ error: null })
  },
}))

/* ============================================================================ */
/* ADMIN STORE */
/* ============================================================================ */

interface AdminState {
  dashboardData: Types.AdminDashboardData | null
  users: Types.User[]
  analytics: Types.SystemAnalytics | null
  pagination: { total: number; skip: number; limit: number }
  loading: boolean
  error: string | null

  // Actions
  fetchDashboard: () => Promise<void>
  fetchUsers: (skip?: number, limit?: number) => Promise<void>
  fetchAnalytics: () => Promise<void>
  createUser: (data: Types.SignupRequest) => Promise<Types.User>
  updateUser: (id: string, data: Partial<Types.User>) => Promise<Types.User>
  deleteUser: (id: string) => Promise<void>
  clearError: () => void
}

export const useAdminStore = create<AdminState>((set, get) => ({
  dashboardData: null,
  users: [],
  analytics: null,
  pagination: { total: 0, skip: 0, limit: 20 },
  loading: false,
  error: null,

  async fetchDashboard() {
    set({ loading: true, error: null })
    try {
      const data = await apiServices.admin.getDashboard()
      set({ dashboardData: data })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch dashboard'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchUsers(skip = 0, limit = 20) {
    set({ loading: true, error: null })
    try {
      const result = await apiServices.admin.listUsers(skip, limit)
      set({
        users: result.items,
        pagination: { total: result.total, skip: result.skip, limit: result.limit },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch users'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async fetchAnalytics() {
    set({ loading: true, error: null })
    try {
      const analytics = await apiServices.admin.getAnalytics()
      set({ analytics })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch analytics'
      set({ error: message })
    } finally {
      set({ loading: false })
    }
  },

  async createUser(data: Types.SignupRequest) {
    set({ loading: true, error: null })
    try {
      const user = await apiServices.admin.createUser(data)
      set((state) => ({
        users: [user, ...state.users],
      }))
      return user
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create user'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  async updateUser(id: string, data: Partial<Types.User>) {
    set({ loading: true, error: null })
    try {
      const user = await apiServices.admin.updateUser(id, data)
      set((state) => ({
        users: state.users.map((u) => (u.id === id ? user : u)),
      }))
      return user
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update user'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  async deleteUser(id: string) {
    set({ loading: true, error: null })
    try {
      await apiServices.admin.deleteUser(id)
      set((state) => ({
        users: state.users.filter((u) => u.id !== id),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete user'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  clearError() {
    set({ error: null })
  },
}))

/* ============================================================================ */
/* EXPORT ALL STORES */
/* ============================================================================ */

export const allStores = {
  useActivitiesStore,
  useProjectsStore,
  useSessionsStore,
  useProgressStore,
  useTeacherStore,
  useStudentStore,
  useParentStore,
  useAdminStore,
}

export default allStores
