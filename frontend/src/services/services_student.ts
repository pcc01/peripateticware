# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import axios, { AxiosInstance } from 'axios';
import {
  Capture,
  CaptureFormData,
  CaptureFilters,
  Annotation,
  NotebookEntry,
  NotebookEntryFormData,
  EntryFilters,
  EvidenceCollection,
  ProgressDashboard,
  CompetencyProgress,
  LearningObjectiveProgress,
} from '../../types/student';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

class CaptureAPI {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({ baseURL });
  }

  async list(sessionId: string, filters?: Partial<CaptureFilters>) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/sessions/${sessionId}/captures`, { params: filters });
    // return response.data.data;
    return [];
  }

  async get(id: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/captures/${id}`);
    // return response.data.data;
    return null;
  }

  async create(sessionId: string, data: CaptureFormData, file?: File) {
    // TODO: Uncomment when backend ready
    // const formData = new FormData();
    // formData.append('title', data.title);
    // formData.append('description', data.description);
    // formData.append('capture_type', data.capture_type);
    // formData.append('learning_objectives', JSON.stringify(data.learning_objectives));
    // formData.append('competencies', JSON.stringify(data.competencies));
    // if (file) formData.append('file', file);
    // const response = await this.client.post(`/student/sessions/${sessionId}/captures`, formData);
    // return response.data.data;
    return null;
  }

  async update(id: string, data: Partial<CaptureFormData>) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.patch(`/student/captures/${id}`, data);
    // return response.data.data;
    return null;
  }

  async delete(id: string) {
    // TODO: Uncomment when backend ready
    // await this.client.delete(`/student/captures/${id}`);
    return true;
  }

  async getFile(captureId: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/captures/${captureId}/file`);
    // return response.data;
    return null;
  }
}

class AnnotationAPI {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({ baseURL });
  }

  async list(captureId: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/captures/${captureId}/annotations`);
    // return response.data.data;
    return [];
  }

  async create(captureId: string, data: Partial<Annotation>) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.post(`/student/captures/${captureId}/annotations`, data);
    // return response.data.data;
    return null;
  }

  async update(annotationId: string, data: Partial<Annotation>) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.patch(`/student/annotations/${annotationId}`, data);
    // return response.data.data;
    return null;
  }

  async delete(annotationId: string) {
    // TODO: Uncomment when backend ready
    // await this.client.delete(`/student/annotations/${annotationId}`);
    return true;
  }
}

class NotebookAPI {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({ baseURL });
  }

  async list(sessionId: string, filters?: Partial<EntryFilters>) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/sessions/${sessionId}/entries`, { params: filters });
    // return response.data.data;
    return [];
  }

  async get(id: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/entries/${id}`);
    // return response.data.data;
    return null;
  }

  async create(sessionId: string, data: NotebookEntryFormData) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.post(`/student/sessions/${sessionId}/entries`, data);
    // return response.data.data;
    return null;
  }

  async update(id: string, data: Partial<NotebookEntryFormData>) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.patch(`/student/entries/${id}`, data);
    // return response.data.data;
    return null;
  }

  async delete(id: string) {
    // TODO: Uncomment when backend ready
    // await this.client.delete(`/student/entries/${id}`);
    return true;
  }

  async submit(id: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.post(`/student/entries/${id}/submit`);
    // return response.data.data;
    return null;
  }

  async getPrompts(activityId: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/activities/${activityId}/reflection-prompts`);
    // return response.data.data;
    return [];
  }
}

class PortfolioAPI {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({ baseURL });
  }

  async getPortfolio(studentId: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/${studentId}/portfolio`);
    // return response.data.data;
    return null;
  }

  async getCollections(studentId: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/${studentId}/collections`);
    // return response.data.data;
    return [];
  }

  async getCollection(collectionId: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/collections/${collectionId}`);
    // return response.data.data;
    return null;
  }

  async createCollection(studentId: string, sessionId: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.post(`/student/${studentId}/collections`, { sessionId });
    // return response.data.data;
    return null;
  }

  async updateCollection(id: string, data: Partial<EvidenceCollection>) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.patch(`/student/collections/${id}`, data);
    // return response.data.data;
    return null;
  }

  async submitCollection(id: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.post(`/student/collections/${id}/submit`);
    // return response.data.data;
    return null;
  }

  async exportPDF(studentId: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/${studentId}/portfolio/export`, {
    //   responseType: 'blob',
    // });
    // return response.data;
    return null;
  }
}

class ProgressAPI {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({ baseURL });
  }

  async getDashboard(studentId: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/${studentId}/progress/dashboard`);
    // return response.data.data;
    return null;
  }

  async getCompetencies(studentId: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/${studentId}/progress/competencies`);
    // return response.data.data;
    return [];
  }

  async getLearningObjectives(studentId: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/${studentId}/progress/objectives`);
    // return response.data.data;
    return [];
  }

  async getActivityEngagement(studentId: string) {
    // TODO: Uncomment when backend ready
    // const response = await this.client.get(`/student/${studentId}/progress/engagement`);
    // return response.data.data;
    return null;
  }
}

// Initialize API clients
export const captureAPI = new CaptureAPI(API_BASE_URL);
export const annotationAPI = new AnnotationAPI(API_BASE_URL);
export const notebookAPI = new NotebookAPI(API_BASE_URL);
export const portfolioAPI = new PortfolioAPI(API_BASE_URL);
export const progressAPI = new ProgressAPI(API_BASE_URL);

// Default export for convenience
export default {
  captures: captureAPI,
  annotations: annotationAPI,
  notebook: notebookAPI,
  portfolio: portfolioAPI,
  progress: progressAPI,
};
