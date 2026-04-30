/**
 * API Service for Teacher Features
 * Handles all API calls for Activities, Projects, and Curriculum
 */

import {
  Activity,
  ActivityFormData,
  PaginatedActivityResponse,
  Project,
  ProjectFormData,
  PaginatedProjectResponse,
  PaginatedCurriculumResponse,
  ActivityFilters,
  ProjectFilters,
  CurriculumFilters,
} from '../types/teacher';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Helper to build query string
function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });
  return searchParams.toString();
}

// ============================================================================
// ACTIVITY API
// ============================================================================

export const activityApi = {
  // Create activity
  async create(data: ActivityFormData): Promise<Activity> {
    const response = await fetch(`${API_BASE_URL}/teacher/activities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to create activity: ${response.statusText}`);
    }

    return response.json();
  },

  // List activities with filters
  async list(filters: ActivityFilters): Promise<PaginatedActivityResponse> {
    const queryString = buildQueryString({
      status: filters.status,
      subject: filters.subject,
      grade_level: filters.grade_level,
      difficulty: filters.difficulty,
      page: filters.page,
      page_size: filters.page_size,
    });

    const url = `${API_BASE_URL}/teacher/activities?${queryString}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch activities: ${response.statusText}`);
    }

    return response.json();
  },

  // Get activity detail
  async get(id: string): Promise<Activity> {
    const response = await fetch(`${API_BASE_URL}/teacher/activities/${id}`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch activity: ${response.statusText}`);
    }

    return response.json();
  },

  // Update activity
  async update(id: string, data: Partial<ActivityFormData>): Promise<Activity> {
    const response = await fetch(`${API_BASE_URL}/teacher/activities/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to update activity: ${response.statusText}`);
    }

    return response.json();
  },

  // Delete activity
  async delete(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/teacher/activities/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete activity: ${response.statusText}`);
    }
  },

  // Publish activity
  async publish(id: string): Promise<Activity> {
    const response = await fetch(`${API_BASE_URL}/teacher/activities/${id}/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to publish activity: ${response.statusText}`);
    }

    return response.json();
  },

  // Archive activity
  async archive(id: string): Promise<Activity> {
    const response = await fetch(`${API_BASE_URL}/teacher/activities/${id}/archive`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to archive activity: ${response.statusText}`);
    }

    return response.json();
  },
};

// ============================================================================
// PROJECT API
// ============================================================================

export const projectApi = {
  // Create project
  async create(data: ProjectFormData): Promise<Project> {
    const response = await fetch(`${API_BASE_URL}/teacher/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to create project: ${response.statusText}`);
    }

    return response.json();
  },

  // List projects
  async list(filters: ProjectFilters): Promise<PaginatedProjectResponse> {
    const queryString = buildQueryString({
      status: filters.status,
      subject: filters.subject,
      page: filters.page,
      page_size: filters.page_size,
    });

    const url = `${API_BASE_URL}/teacher/projects?${queryString}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }

    return response.json();
  },

  // Get project detail
  async get(id: string): Promise<Project> {
    const response = await fetch(`${API_BASE_URL}/teacher/projects/${id}`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch project: ${response.statusText}`);
    }

    return response.json();
  },

  // Update project
  async update(id: string, data: Partial<ProjectFormData>): Promise<Project> {
    const response = await fetch(`${API_BASE_URL}/teacher/projects/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to update project: ${response.statusText}`);
    }

    return response.json();
  },

  // Delete project
  async delete(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/teacher/projects/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete project: ${response.statusText}`);
    }
  },

  // Add activity to project
  async addActivity(
    projectId: string,
    activityId: string,
    order?: number
  ): Promise<Project> {
    const response = await fetch(
      `${API_BASE_URL}/teacher/projects/${projectId}/activities`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          activity_id: activityId,
          order: order ?? 0,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to add activity to project: ${response.statusText}`);
    }

    return response.json();
  },

  // Remove activity from project
  async removeActivity(projectId: string, activityId: string): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/teacher/projects/${projectId}/activities/${activityId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to remove activity from project: ${response.statusText}`);
    }
  },

  // Reorder activities in project
  async reorderActivities(
    projectId: string,
    activities: { id: string; order: number }[]
  ): Promise<Project> {
    const response = await fetch(
      `${API_BASE_URL}/teacher/projects/${projectId}/reorder`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          activities,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to reorder activities: ${response.statusText}`);
    }

    return response.json();
  },
};

// ============================================================================
// CURRICULUM API
// ============================================================================

export const curriculumApi = {
  // List curriculum units
  async list(filters: CurriculumFilters): Promise<PaginatedCurriculumResponse> {
    const queryString = buildQueryString({
      subject: filters.subject,
      grade_level: filters.grade_level,
      page: filters.page,
      page_size: filters.page_size,
    });

    const url = `${API_BASE_URL}/curriculum/units?${queryString}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch curriculum units: ${response.statusText}`);
    }

    return response.json();
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get auth token from localStorage
 * Replace with your actual auth implementation
 */
function getAuthToken(): string {
  const token = localStorage.getItem('auth_token');
  if (!token) {
    throw new Error('No auth token found');
  }
  return token;
}

/**
 * Set API base URL (for testing)
 */
export function setApiBaseUrl(url: string): void {
  Object.assign(module, {
    API_BASE_URL: url,
  });
}
