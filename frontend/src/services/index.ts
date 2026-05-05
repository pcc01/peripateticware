// ==============================================================================
// frontend/src/services/captureService.ts
// Service for managing student captures (photos, videos, audio, etc.)
// ==============================================================================

import { CaptureType, StudentCapture, TranscriptionStatus } from '../types/student';
import { apiClient } from './api';

export class CaptureService {
  private baseUrl = '/api/v1/student/captures';

  /**
   * Upload a capture (photo, video, audio, text, sketch)
   */
  async uploadCapture(
    file: File,
    captureType: CaptureType,
    metadata: {
      activityId?: string;
      sessionId?: string;
      latitude?: number;
      longitude?: number;
      locationName?: string;
      description?: string;
    }
  ): Promise<StudentCapture> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('capture_type', captureType);
    
    if (metadata.activityId) formData.append('activity_id', metadata.activityId);
    if (metadata.sessionId) formData.append('session_id', metadata.sessionId);
    if (metadata.latitude !== undefined) formData.append('latitude', String(metadata.latitude));
    if (metadata.longitude !== undefined) formData.append('longitude', String(metadata.longitude));
    if (metadata.locationName) formData.append('location_name', metadata.locationName);
    if (metadata.description) formData.append('description', metadata.description);

    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: formData
    });

    if (!response.ok) throw new Error('Upload failed');
    return response.json();
  }

  /**
   * Get a specific capture
   */
  async getCapture(captureId: string): Promise<StudentCapture> {
    return apiClient.get(`${this.baseUrl}/${captureId}`);
  }

  /**
   * List captures with optional filters
   */
  async listCaptures(filters: {
    activityId?: string;
    captureType?: CaptureType;
    skip?: number;
    limit?: number;
  } = {}): Promise<StudentCapture[]> {
    const params = new URLSearchParams();
    if (filters.activityId) params.append('activity_id', filters.activityId);
    if (filters.captureType) params.append('capture_type', filters.captureType);
    if (filters.skip !== undefined) params.append('skip', String(filters.skip));
    if (filters.limit !== undefined) params.append('limit', String(filters.limit));

    return apiClient.get(`${this.baseUrl}?${params.toString()}`);
  }

  /**
   * Delete a capture
   */
  async deleteCapture(captureId: string): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/${captureId}`);
  }

  /**
   * Get transcription status
   */
  async getTranscriptionStatus(captureId: string): Promise<{
    status: TranscriptionStatus;
    transcript?: string;
    confidence?: number;
  }> {
    const capture = await this.getCapture(captureId);
    return {
      status: capture.transcript_status || TranscriptionStatus.PENDING,
      transcript: capture.transcript,
      confidence: capture.transcript_confidence
    };
  }

  /**
   * Poll for transcription completion
   */
  async pollTranscription(
    captureId: string,
    maxAttempts: number = 30,
    delayMs: number = 1000
  ): Promise<string | null> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.getTranscriptionStatus(captureId);
      
      if (status.status === TranscriptionStatus.COMPLETED) {
        return status.transcript || null;
      } else if (status.status === TranscriptionStatus.FAILED) {
        throw new Error('Transcription failed');
      }

      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw new Error('Transcription timeout');
  }
}

export const captureService = new CaptureService();


// ==============================================================================
// frontend/src/services/notebookService.ts
// Service for managing student notebook entries
// ==============================================================================

import { StudentNotebook, NotebookEntryType } from '../types/student';

export class NotebookService {
  private baseUrl = '/api/v1/student/notebook';

  /**
   * Create a notebook entry
   */
  async createEntry(data: {
    entryType: NotebookEntryType;
    content: string;
    prompt?: string;
    activityId?: string;
    sessionId?: string;
    learningObjectivesTagged?: string[];
    competenciesAddressed?: string[];
  }): Promise<StudentNotebook> {
    return apiClient.post(this.baseUrl, {
      entry_type: data.entryType,
      content: data.content,
      prompt: data.prompt,
      activity_id: data.activityId,
      session_id: data.sessionId,
      learning_objectives_tagged: data.learningObjectivesTagged,
      competencies_addressed: data.competenciesAddressed
    });
  }

  /**
   * Get a notebook entry
   */
  async getEntry(entryId: string): Promise<StudentNotebook> {
    return apiClient.get(`${this.baseUrl}/${entryId}`);
  }

  /**
   * List notebook entries
   */
  async listEntries(filters: {
    activityId?: string;
    skip?: number;
    limit?: number;
  } = {}): Promise<StudentNotebook[]> {
    const params = new URLSearchParams();
    if (filters.activityId) params.append('activity_id', filters.activityId);
    if (filters.skip !== undefined) params.append('skip', String(filters.skip));
    if (filters.limit !== undefined) params.append('limit', String(filters.limit));

    return apiClient.get(`${this.baseUrl}?${params.toString()}`);
  }

  /**
   * Update a notebook entry
   */
  async updateEntry(
    entryId: string,
    data: {
      content: string;
      prompt?: string;
      learningObjectivesTagged?: string[];
      competenciesAddressed?: string[];
    }
  ): Promise<StudentNotebook> {
    return apiClient.put(`${this.baseUrl}/${entryId}`, data);
  }

  /**
   * Link a capture to a notebook entry
   */
  async linkCapture(entryId: string, captureId: string): Promise<{ status: string }> {
    return apiClient.post(`${this.baseUrl}/${entryId}/link-capture`, {
      capture_id: captureId
    });
  }
}

export const notebookService = new NotebookService();


// ==============================================================================
// frontend/src/services/portfolioService.ts
// Service for managing student portfolio
// ==============================================================================

import { Portfolio } from '../types/student';

export class PortfolioService {
  private baseUrl = '/api/v1/student';

  /**
   * Get full portfolio
   */
  async getPortfolio(activityId?: string): Promise<Portfolio> {
    let url = `${this.baseUrl}/portfolio`;
    if (activityId) {
      url += `?activity_id=${activityId}`;
    }
    return apiClient.get(url);
  }

  /**
   * Get competency progress
   */
  async getCompetencies(status?: string) {
    let url = `${this.baseUrl}/competencies`;
    if (status) {
      url += `?status=${status}`;
    }
    return apiClient.get(url);
  }

  /**
   * Export portfolio as PDF
   */
  async exportPDF(activityId?: string): Promise<Blob> {
    let url = `${this.baseUrl}/portfolio/export/pdf`;
    if (activityId) {
      url += `?activity_id=${activityId}`;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) throw new Error('Export failed');
    return response.blob();
  }

  /**
   * Export portfolio as ZIP
   */
  async exportZIP(activityId?: string): Promise<Blob> {
    let url = `${this.baseUrl}/portfolio/export/zip`;
    if (activityId) {
      url += `?activity_id=${activityId}`;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) throw new Error('Export failed');
    return response.blob();
  }
}

export const portfolioService = new PortfolioService();


// ==============================================================================
// frontend/src/services/asrService.ts
// Service for Automatic Speech Recognition (audio transcription)
// ==============================================================================

export class ASRService {
  /**
   * Transcribe audio capture
   * Uses polling to wait for backend transcription
   */
  async transcribeAudio(
    captureId: string,
    maxWaitSeconds: number = 60
  ): Promise<string> {
    return captureService.pollTranscription(
      captureId,
      Math.floor(maxWaitSeconds / 1),
      1000
    );
  }

  /**
   * Get current transcription status
   */
  async getStatus(captureId: string) {
    return captureService.getTranscriptionStatus(captureId);
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return {
      en: 'English',
      es: 'Spanish',
      ar: 'Arabic',
      ja: 'Japanese',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      nl: 'Dutch',
      ru: 'Russian',
      zh: 'Mandarin Chinese',
      hi: 'Hindi',
      ko: 'Korean'
    };
  }
}

export const asrService = new ASRService();


// ==============================================================================
// frontend/src/services/offlineStorage.ts
// Service for offline-first storage using IndexedDB
// ==============================================================================

import Database from 'better-sqlite3';

interface StoredCapture {
  id: string;
  file: Blob;
  metadata: Record<string, any>;
  uploadedAt?: number;
}

interface StoredNotebook {
  id: string;
  content: string;
  linkedCaptures: string[];
  savedAt: number;
  syncedAt?: number;
}

export class OfflineStorageService {
  private dbName = 'PeripateticwareDB';
  private storeName = 'captures';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('captures')) {
          db.createObjectStore('captures', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('notebooks')) {
          db.createObjectStore('notebooks', { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Save capture locally
   */
  async saveCapture(capture: StoredCapture): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['captures'], 'readwrite');
      const store = tx.objectStore('captures');
      const request = store.put(capture);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get capture from local storage
   */
  async getCapture(id: string): Promise<StoredCapture | undefined> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['captures'], 'readonly');
      const store = tx.objectStore('captures');
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * List all local captures
   */
  async listCaptures(): Promise<StoredCapture[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['captures'], 'readonly');
      const store = tx.objectStore('captures');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Delete local capture
   */
  async deleteCapture(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['captures'], 'readwrite');
      const store = tx.objectStore('captures');
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Save notebook entry locally
   */
  async saveNotebook(notebook: StoredNotebook): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['notebooks'], 'readwrite');
      const store = tx.objectStore('notebooks');
      const request = store.put(notebook);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get unsync'd captures (for uploading)
   */
  async getUnsyncedCaptures(): Promise<StoredCapture[]> {
    const all = await this.listCaptures();
    return all.filter(c => !c.uploadedAt);
  }
}

export const offlineStorage = new OfflineStorageService();
