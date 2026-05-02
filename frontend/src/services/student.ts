// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * Student API Service
 * Handles all API calls for student notebook, portfolio, and progress features
 */

import axios from 'axios';
import {
  Capture,
  CaptureFormData,
  NotebookEntry,
  NotebookEntryFormData,
  EvidenceCollection,
  Portfolio,
  ProgressDashboard,
  CompetencyProgress,
  ActivityEngagement,
  Annotation,
  AnnotationFormData,
  CaptureFilters,
  EntryFilters,
  PaginatedCaptureResponse,
  PaginatedEntryResponse,
} from '@types/student';

// ============================================================================
// API BASE SETUP
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Add auth token to all requests
 */
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Handle auth errors
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - redirect to login
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ============================================================================
// CAPTURE API ENDPOINTS
// ============================================================================

export const captureApi = {
  /**
   * List captures for a session with pagination
   */
  async list(
    sessionId: string,
    filters: Partial<CaptureFilters> = {}
  ): Promise<PaginatedCaptureResponse> {
    const params = new URLSearchParams({
      page: (filters.page || 1).toString(),
      page_size: (filters.page_size || 20).toString(),
      ...(filters.capture_type && { capture_type: filters.capture_type }),
      ...(filters.competency && { competency: filters.competency }),
      ...(filters.learning_objective && { learning_objective: filters.learning_objective }),
      ...(filters.status && { status: filters.status }),
      ...(filters.date_from && { date_from: filters.date_from }),
      ...(filters.date_to && { date_to: filters.date_to }),
    });

    const response = await apiClient.get(
      `/student/sessions/${sessionId}/captures?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get single capture
   */
  async get(captureId: string): Promise<Capture> {
    const response = await apiClient.get(`/student/captures/${captureId}`);
    return response.data;
  },

  /**
   * Create new capture
   */
  async create(
    sessionId: string,
    data: CaptureFormData,
    file?: File
  ): Promise<Capture> {
    const formData = new FormData();
    formData.append('title', data.title);
    formData.append('description', data.description || '');
    formData.append('capture_type', data.capture_type);
    formData.append('learning_objectives', JSON.stringify(data.learning_objectives));
    formData.append('competencies', JSON.stringify(data.competencies));

    if (file) {
      formData.append('file', file);
    }

    const response = await apiClient.post(
      `/student/sessions/${sessionId}/captures`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  /**
   * Update capture metadata
   */
  async update(captureId: string, data: Partial<CaptureFormData>): Promise<Capture> {
    const response = await apiClient.patch(
      `/student/captures/${captureId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete capture
   */
  async delete(captureId: string): Promise<void> {
    await apiClient.delete(`/student/captures/${captureId}`);
  },

  /**
   * Get capture file URL (for download/preview)
   */
  getFileUrl(captureId: string): string {
    return `${API_BASE_URL}/student/captures/${captureId}/file`;
  },
};

// ============================================================================
// ANNOTATION API ENDPOINTS
// ============================================================================

export const annotationApi = {
  /**
   * List annotations for a capture
   */
  async list(captureId: string): Promise<Annotation[]> {
    const response = await apiClient.get(`/student/captures/${captureId}/annotations`);
    return response.data;
  },

  /**
   * Create annotation on a capture
   */
  async create(captureId: string, data: AnnotationFormData): Promise<Annotation> {
    const response = await apiClient.post(
      `/student/captures/${captureId}/annotations`,
      data
    );
    return response.data;
  },

  /**
   * Update annotation
   */
  async update(
    captureId: string,
    annotationId: string,
    data: Partial<AnnotationFormData>
  ): Promise<Annotation> {
    const response = await apiClient.patch(
      `/student/captures/${captureId}/annotations/${annotationId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete annotation
   */
  async delete(captureId: string, annotationId: string): Promise<void> {
    await apiClient.delete(
      `/student/captures/${captureId}/annotations/${annotationId}`
    );
  },
};

// ============================================================================
// NOTEBOOK ENTRY API ENDPOINTS
// ============================================================================

export const notebookApi = {
  /**
   * List entries for a session with pagination
   */
  async list(
    sessionId: string,
    filters: Partial<EntryFilters> = {}
  ): Promise<PaginatedEntryResponse> {
    const params = new URLSearchParams({
      page: (filters.page || 1).toString(),
      page_size: (filters.page_size || 20).toString(),
      ...(filters.reflection_type && { reflection_type: filters.reflection_type }),
      ...(filters.competency && { competency: filters.competency }),
      ...(filters.learning_objective && { learning_objective: filters.learning_objective }),
      ...(filters.status && { status: filters.status }),
      ...(filters.date_from && { date_from: filters.date_from }),
      ...(filters.date_to && { date_to: filters.date_to }),
    });

    const response = await apiClient.get(
      `/student/sessions/${sessionId}/entries?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get single notebook entry
   */
  async get(entryId: string): Promise<NotebookEntry> {
    const response = await apiClient.get(`/student/entries/${entryId}`);
    return response.data;
  },

  /**
   * Create new notebook entry
   */
  async create(
    sessionId: string,
    data: NotebookEntryFormData
  ): Promise<NotebookEntry> {
    const response = await apiClient.post(
      `/student/sessions/${sessionId}/entries`,
      data
    );
    return response.data;
  },

  /**
   * Update notebook entry
   */
  async update(
    entryId: string,
    data: Partial<NotebookEntryFormData>
  ): Promise<NotebookEntry> {
    const response = await apiClient.patch(
      `/student/entries/${entryId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete notebook entry
   */
  async delete(entryId: string): Promise<void> {
    await apiClient.delete(`/student/entries/${entryId}`);
  },

  /**
   * Submit entry for review
   */
  async submit(entryId: string): Promise<NotebookEntry> {
    const response = await apiClient.post(
      `/student/entries/${entryId}/submit`
    );
    return response.data;
  },

  /**
   * Get reflection prompts for guided reflection
   */
  async getPrompts(activityId: string): Promise<string[]> {
    const response = await apiClient.get(
      `/student/activities/${activityId}/reflection-prompts`
    );
    return response.data.prompts;
  },
};

// ============================================================================
// PORTFOLIO API ENDPOINTS
// ============================================================================

export const portfolioApi = {
  /**
   * Get student's complete portfolio
   */
  async getPortfolio(studentId: string): Promise<Portfolio> {
    const response = await apiClient.get(`/student/${studentId}/portfolio`);
    return response.data;
  },

  /**
   * List evidence collections
   */
  async getCollections(studentId: string): Promise<EvidenceCollection[]> {
    const response = await apiClient.get(`/student/${studentId}/collections`);
    return response.data;
  },

  /**
   * Get single collection
   */
  async getCollection(collectionId: string): Promise<EvidenceCollection> {
    const response = await apiClient.get(`/student/collections/${collectionId}`);
    return response.data;
  },

  /**
   * Create new evidence collection
   */
  async createCollection(
    studentId: string,
    sessionId: string,
    activityId: string
  ): Promise<EvidenceCollection> {
    const response = await apiClient.post(
      `/student/${studentId}/collections`,
      {
        session_id: sessionId,
        activity_id: activityId,
      }
    );
    return response.data;
  },

  /**
   * Update collection
   */
  async updateCollection(
    collectionId: string,
    data: Partial<EvidenceCollection>
  ): Promise<EvidenceCollection> {
    const response = await apiClient.patch(
      `/student/collections/${collectionId}`,
      data
    );
    return response.data;
  },

  /**
   * Submit collection for teacher review
   */
  async submitCollection(collectionId: string): Promise<EvidenceCollection> {
    const response = await apiClient.post(
      `/student/collections/${collectionId}/submit`
    );
    return response.data;
  },

  /**
   * Export portfolio as PDF
   */
  async exportPDF(studentId: string): Promise<Blob> {
    const response = await apiClient.get(
      `/student/${studentId}/portfolio/export-pdf`,
      {
        responseType: 'blob',
      }
    );
    return response.data;
  },
};

// ============================================================================
// PROGRESS API ENDPOINTS
// ============================================================================

export const progressApi = {
  /**
   * Get student's progress dashboard
   */
  async getDashboard(studentId: string): Promise<ProgressDashboard> {
    const response = await apiClient.get(`/student/${studentId}/progress`);
    return response.data;
  },

  /**
   * Get competency progress
   */
  async getCompetencies(studentId: string): Promise<CompetencyProgress[]> {
    const response = await apiClient.get(
      `/student/${studentId}/progress/competencies`
    );
    return response.data;
  },

  /**
   * Get learning objective progress
   */
  async getLearningObjectives(studentId: string): Promise<Array<any>> {
    const response = await apiClient.get(
      `/student/${studentId}/progress/learning-objectives`
    );
    return response.data;
  },

  /**
   * Get activity engagement data
   */
  async getActivityEngagement(
    studentId: string,
    activityId: string
  ): Promise<ActivityEngagement> {
    const response = await apiClient.get(
      `/student/${studentId}/activities/${activityId}/engagement`
    );
    return response.data;
  },
};

// ============================================================================
// ACTIVITY API ENDPOINTS
// ============================================================================

export const studentActivityApi = {
  /**
   * Get current activity engagement
   */
  async getCurrentActivity(sessionId: string): Promise<any> {
    const response = await apiClient.get(
      `/student/sessions/${sessionId}/current-activity`
    );
    return response.data;
  },

  /**
   * Get activity details with learning objectives
   */
  async getActivity(activityId: string): Promise<any> {
    const response = await apiClient.get(`/student/activities/${activityId}`);
    return response.data;
  },

  /**
   * Mark activity as started
   */
  async startActivity(sessionId: string, activityId: string): Promise<void> {
    await apiClient.post(`/student/sessions/${sessionId}/activities/${activityId}/start`);
  },

  /**
   * Mark activity as completed
   */
  async completeActivity(sessionId: string, activityId: string): Promise<void> {
    await apiClient.post(`/student/sessions/${sessionId}/activities/${activityId}/complete`);
  },
};

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  captures: captureApi,
  annotations: annotationApi,
  notebook: notebookApi,
  portfolio: portfolioApi,
  progress: progressApi,
  activities: studentActivityApi,
};

