// frontend/src/stores/projectStore.ts
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

export interface ProjectContributor {
  id: string
  user_id: string
  role: 'owner' | 'editor' | 'viewer'
  joined_at: string
}

export interface Project {
  id: string
  name: string
  description: string
  contributors: ProjectContributor[]
  status: 'draft' | 'pending_approval' | 'approved' | 'published'
  visibility: 'private' | 'class_only' | 'school_wide'
  created_by: string
  created_at: string
  updated_at: string
  synced: boolean
  approved_scope?: 'class_only' | 'school_wide'
}

export interface SyncQueueItem {
  id: string
  project_id: string
  action: 'create' | 'update' | 'delete'
  data: Partial<Project>
  timestamp: number
  retries: number
}

export interface ApprovalRequest {
  id: string
  project_id: string
  requested_by: string
  teacher_id?: string
  scope: 'class_only' | 'school_wide'
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
  resolved_at?: string
}

export interface ConflictResolution {
  project_id: string
  local_version: Project
  server_version: Project
  conflict_type: 'data_mismatch' | 'concurrent_edit' | 'delete_conflict'
  resolution: 'server_wins' | 'local_wins' | 'manual'
}

export interface ProjectState {
  // Data
  projects: Project[]
  syncQueue: SyncQueueItem[]
  approvalRequests: ApprovalRequest[]
  conflicts: ConflictResolution[]
  isSyncing: boolean
  lastSyncTime: number | null
  
  // Actions
  addProject: (project: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  deleteProject: (id: string) => void
  addContributor: (projectId: string, contributor: ProjectContributor) => void
  removeContributor: (projectId: string, userId: string) => void
  
  // Sync actions
  queueAction: (action: SyncQueueItem) => void
  clearQueue: () => void
  syncProjects: (apiUrl: string, authToken: string) => Promise<void>
  
  // Approval actions
  requestApproval: (request: ApprovalRequest) => void
  updateApprovalStatus: (
    requestId: string,
    status: 'pending' | 'approved' | 'rejected'
  ) => void
  
  // Conflict resolution
  addConflict: (conflict: ConflictResolution) => void
  resolveConflict: (
    projectId: string,
    resolution: 'server_wins' | 'local_wins' | 'manual'
  ) => void
  clearConflicts: () => void
  
  // Helpers
  getProject: (id: string) => Project | undefined
  getProjectsByUser: (userId: string) => Project[]
  getPendingApprovals: () => ApprovalRequest[]
  getConflictingProjects: () => string[]
}

export const useProjectStore = create<ProjectState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        projects: [],
        syncQueue: [],
        approvalRequests: [],
        conflicts: [],
        isSyncing: false,
        lastSyncTime: null,

        // Add a new project (offline)
        addProject: (project) =>
          set((state) => {
            const newProject = { ...project, synced: false }
            return {
              projects: [...state.projects, newProject],
              syncQueue: [
                ...state.syncQueue,
                {
                  id: `sync-${Date.now()}`,
                  project_id: project.id,
                  action: 'create',
                  data: newProject,
                  timestamp: Date.now(),
                  retries: 0,
                },
              ],
            }
          }),

        // Update a project (offline)
        updateProject: (id, updates) =>
          set((state) => {
            const project = state.projects.find((p) => p.id === id)
            if (!project) return state

            const updated = { ...project, ...updates, synced: false }
            return {
              projects: state.projects.map((p) =>
                p.id === id ? updated : p
              ),
              syncQueue: [
                ...state.syncQueue.filter((q) => q.project_id !== id),
                {
                  id: `sync-${Date.now()}`,
                  project_id: id,
                  action: 'update',
                  data: updates,
                  timestamp: Date.now(),
                  retries: 0,
                },
              ],
            }
          }),

        // Delete a project (offline)
        deleteProject: (id) =>
          set((state) => ({
            projects: state.projects.filter((p) => p.id !== id),
            syncQueue: [
              ...state.syncQueue,
              {
                id: `sync-${Date.now()}`,
                project_id: id,
                action: 'delete',
                data: {},
                timestamp: Date.now(),
                retries: 0,
              },
            ],
          })),

        // Add collaborator
        addContributor: (projectId, contributor) =>
          set((state) => ({
            projects: state.projects.map((p) =>
              p.id === projectId
                ? {
                    ...p,
                    contributors: [...p.contributors, contributor],
                    synced: false,
                  }
                : p
            ),
          })),

        // Remove collaborator
        removeContributor: (projectId, userId) =>
          set((state) => ({
            projects: state.projects.map((p) =>
              p.id === projectId
                ? {
                    ...p,
                    contributors: p.contributors.filter(
                      (c) => c.user_id !== userId
                    ),
                    synced: false,
                  }
                : p
            ),
          })),

        // Queue offline action for sync
        queueAction: (action) =>
          set((state) => ({
            syncQueue: [...state.syncQueue, action],
          })),

        // Clear sync queue
        clearQueue: () =>
          set(() => ({
            syncQueue: [],
          })),

        // Sync with server (with conflict resolution)
        syncProjects: async (apiUrl: string, authToken: string) => {
          set({ isSyncing: true })

          try {
            const { syncQueue, projects } = get()

            // Sync each queued action
            for (const item of syncQueue) {
              try {
                const response = await fetch(
                  `${apiUrl}/projects/${item.project_id}`,
                  {
                    method:
                      item.action === 'create'
                        ? 'POST'
                        : item.action === 'update'
                          ? 'PATCH'
                          : 'DELETE',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${authToken}`,
                    },
                    body:
                      item.action !== 'delete'
                        ? JSON.stringify(item.data)
                        : undefined,
                  }
                )

                if (!response.ok) {
                  // Handle conflict
                  if (response.status === 409) {
                    const serverVersion = await response.json()
                    const localProject = projects.find(
                      (p) => p.id === item.project_id
                    )

                    if (localProject) {
                      set((state) => ({
                        conflicts: [
                          ...state.conflicts,
                          {
                            project_id: item.project_id,
                            local_version: localProject,
                            server_version: serverVersion,
                            conflict_type: 'data_mismatch',
                            resolution: 'server_wins', // Default to server-wins
                          },
                        ],
                      }))
                    }
                  }

                  // Retry on next sync
                  set((state) => ({
                    syncQueue: state.syncQueue.map((q) =>
                      q.id === item.id
                        ? { ...q, retries: q.retries + 1 }
                        : q
                    ),
                  }))

                  continue
                }

                // Mark as synced
                const syncedProject = await response.json()
                set((state) => ({
                  projects: state.projects.map((p) =>
                    p.id === item.project_id
                      ? { ...syncedProject, synced: true }
                      : p
                  ),
                  syncQueue: state.syncQueue.filter((q) => q.id !== item.id),
                }))
              } catch (error) {
                console.error(`Sync error for project ${item.project_id}:`, error)
                // Keep in queue for retry
              }
            }

            set({
              isSyncing: false,
              lastSyncTime: Date.now(),
            })
          } catch (error) {
            console.error('Sync failed:', error)
            set({ isSyncing: false })
            throw error
          }
        },

        // Request approval from teacher
        requestApproval: (request) =>
          set((state) => ({
            approvalRequests: [...state.approvalRequests, request],
            syncQueue: [
              ...state.syncQueue,
              {
                id: `sync-approval-${Date.now()}`,
                project_id: request.project_id,
                action: 'create',
                data: { status: 'pending_approval' },
                timestamp: Date.now(),
                retries: 0,
              },
            ],
          })),

        // Update approval status
        updateApprovalStatus: (requestId, status) =>
          set((state) => ({
            approvalRequests: state.approvalRequests.map((r) =>
              r.id === requestId
                ? {
                    ...r,
                    status,
                    resolved_at: new Date().toISOString(),
                  }
                : r
            ),
          })),

        // Add conflict
        addConflict: (conflict) =>
          set((state) => ({
            conflicts: [...state.conflicts, conflict],
          })),

        // Resolve conflict
        resolveConflict: (projectId, resolution) =>
          set((state) => ({
            conflicts: state.conflicts.map((c) =>
              c.project_id === projectId ? { ...c, resolution } : c
            ),
            projects: state.projects.map((p) =>
              p.id === projectId
                ? {
                    ...p,
                    ...(resolution === 'server_wins'
                      ? state.conflicts.find((c) => c.project_id === projectId)
                          ?.server_version
                      : {}),
                  }
                : p
            ),
          })),

        // Clear conflicts
        clearConflicts: () =>
          set(() => ({
            conflicts: [],
          })),

        // Get single project
        getProject: (id) => get().projects.find((p) => p.id === id),

        // Get projects by user
        getProjectsByUser: (userId) =>
          get().projects.filter((p) => p.created_by === userId),

        // Get pending approvals
        getPendingApprovals: () =>
          get().approvalRequests.filter((r) => r.status === 'pending'),

        // Get conflicting projects
        getConflictingProjects: () =>
          get().conflicts.map((c) => c.project_id),
      }),
      {
        name: 'peripateticware-projects', // localStorage key
      }
    )
  )
)