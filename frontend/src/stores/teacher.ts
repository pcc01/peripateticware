/**
 * Zustand stores for teacher features
 * Manages state for activities, projects, and UI
 */

import { create } from 'zustand';
import {
  Activity,
  ActivityFormData,
  ActivityFilters,
  Project,
  ProjectFormData,
  ProjectFilters,
  PaginatedActivityResponse,
  PaginatedProjectResponse,
} from '../types/teacher';
import { activityApi, projectApi } from '../services/teacher';

// ============================================================================
// ACTIVITY STORE
// ============================================================================

interface ActivityState {
  // Data
  activities: Activity[];
  paginatedActivities: PaginatedActivityResponse | null;
  selectedActivity: Activity | null;
  
  // State
  loading: boolean;
  error: string | null;
  
  // Filters
  filters: ActivityFilters;
  
  // Actions
  fetchActivities: (filters: ActivityFilters) => Promise<void>;
  fetchActivity: (id: string) => Promise<void>;
  createActivity: (data: ActivityFormData) => Promise<Activity>;
  updateActivity: (id: string, data: Partial<ActivityFormData>) => Promise<Activity>;
  deleteActivity: (id: string) => Promise<void>;
  publishActivity: (id: string) => Promise<Activity>;
  archiveActivity: (id: string) => Promise<Activity>;
  setFilters: (filters: Partial<ActivityFilters>) => void;
  clearError: () => void;
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  // Initial state
  activities: [],
  paginatedActivities: null,
  selectedActivity: null,
  loading: false,
  error: null,
  filters: {
    page: 1,
    page_size: 20,
  },

  // Fetch activities list
  async fetchActivities(filters: ActivityFilters) {
    set({ loading: true, error: null });
    try {
      const response = await activityApi.list(filters);
      set({
        paginatedActivities: response,
        activities: response.items as unknown as Activity[],
        filters,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch activities' });
    } finally {
      set({ loading: false });
    }
  },

  // Fetch single activity
  async fetchActivity(id: string) {
    set({ loading: true, error: null });
    try {
      const activity = await activityApi.get(id);
      set({ selectedActivity: activity });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch activity' });
    } finally {
      set({ loading: false });
    }
  },

  // Create activity
  async createActivity(data: ActivityFormData) {
    set({ loading: true, error: null });
    try {
      const activity = await activityApi.create(data);
      set((state) => ({
        activities: [activity as unknown as Activity, ...state.activities],
      }));
      return activity;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create activity';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Update activity
  async updateActivity(id: string, data: Partial<ActivityFormData>) {
    set({ loading: true, error: null });
    try {
      const activity = await activityApi.update(id, data);
      set((state) => ({
        activities: state.activities.map((a) => (a.id === id ? (activity as unknown as Activity) : a)),
        selectedActivity: state.selectedActivity?.id === id ? (activity as unknown as Activity) : state.selectedActivity,
      }));
      return activity;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update activity';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Delete activity
  async deleteActivity(id: string) {
    set({ loading: true, error: null });
    try {
      await activityApi.delete(id);
      set((state) => ({
        activities: state.activities.filter((a) => a.id !== id),
        selectedActivity: state.selectedActivity?.id === id ? null : state.selectedActivity,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete activity';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Publish activity
  async publishActivity(id: string) {
    set({ loading: true, error: null });
    try {
      const activity = await activityApi.publish(id);
      set((state) => ({
        activities: state.activities.map((a) => (a.id === id ? (activity as unknown as Activity) : a)),
      }));
      return activity;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish activity';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Archive activity
  async archiveActivity(id: string) {
    set({ loading: true, error: null });
    try {
      const activity = await activityApi.archive(id);
      set((state) => ({
        activities: state.activities.map((a) => (a.id === id ? (activity as unknown as Activity) : a)),
      }));
      return activity;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to archive activity';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Set filters
  setFilters(newFilters: Partial<ActivityFilters>) {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
    // Auto-fetch with new filters
    get().fetchActivities({ ...get().filters, ...newFilters });
  },

  // Clear error
  clearError() {
    set({ error: null });
  },
}));

// ============================================================================
// PROJECT STORE
// ============================================================================

interface ProjectState {
  // Data
  projects: Project[];
  paginatedProjects: PaginatedProjectResponse | null;
  selectedProject: Project | null;
  
  // State
  loading: boolean;
  error: string | null;
  
  // Filters
  filters: ProjectFilters;
  
  // Actions
  fetchProjects: (filters: ProjectFilters) => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (data: ProjectFormData) => Promise<Project>;
  updateProject: (id: string, data: Partial<ProjectFormData>) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  addActivityToProject: (projectId: string, activityId: string, order?: number) => Promise<void>;
  removeActivityFromProject: (projectId: string, activityId: string) => Promise<void>;
  reorderActivities: (projectId: string, activities: { id: string; order: number }[]) => Promise<void>;
  setFilters: (filters: Partial<ProjectFilters>) => void;
  clearError: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  // Initial state
  projects: [],
  paginatedProjects: null,
  selectedProject: null,
  loading: false,
  error: null,
  filters: {
    page: 1,
    page_size: 20,
  },

  // Fetch projects list
  async fetchProjects(filters: ProjectFilters) {
    set({ loading: true, error: null });
    try {
      const response = await projectApi.list(filters);
      set({
        paginatedProjects: response,
        projects: response.items as unknown as Project[],
        filters,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch projects' });
    } finally {
      set({ loading: false });
    }
  },

  // Fetch single project
  async fetchProject(id: string) {
    set({ loading: true, error: null });
    try {
      const project = await projectApi.get(id);
      set({ selectedProject: project });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch project' });
    } finally {
      set({ loading: false });
    }
  },

  // Create project
  async createProject(data: ProjectFormData) {
    set({ loading: true, error: null });
    try {
      const project = await projectApi.create(data);
      set((state) => ({
        projects: [project as unknown as Project, ...state.projects],
      }));
      return project;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create project';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Update project
  async updateProject(id: string, data: Partial<ProjectFormData>) {
    set({ loading: true, error: null });
    try {
      const project = await projectApi.update(id, data);
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? (project as unknown as Project) : p)),
        selectedProject: state.selectedProject?.id === id ? (project as unknown as Project) : state.selectedProject,
      }));
      return project;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update project';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Delete project
  async deleteProject(id: string) {
    set({ loading: true, error: null });
    try {
      await projectApi.delete(id);
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        selectedProject: state.selectedProject?.id === id ? null : state.selectedProject,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete project';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Add activity to project
  async addActivityToProject(projectId: string, activityId: string, order?: number) {
    set({ loading: true, error: null });
    try {
      await projectApi.addActivity(projectId, activityId, order);
      await get().fetchProject(projectId); // Refresh project
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add activity to project';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Remove activity from project
  async removeActivityFromProject(projectId: string, activityId: string) {
    set({ loading: true, error: null });
    try {
      await projectApi.removeActivity(projectId, activityId);
      await get().fetchProject(projectId); // Refresh project
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove activity from project';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Reorder activities
  async reorderActivities(projectId: string, activities: { id: string; order: number }[]) {
    set({ loading: true, error: null });
    try {
      await projectApi.reorderActivities(projectId, activities);
      await get().fetchProject(projectId); // Refresh project
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reorder activities';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Set filters
  setFilters(newFilters: Partial<ProjectFilters>) {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
    // Auto-fetch with new filters
    get().fetchProjects({ ...get().filters, ...newFilters });
  },

  // Clear error
  clearError() {
    set({ error: null });
  },
}));
