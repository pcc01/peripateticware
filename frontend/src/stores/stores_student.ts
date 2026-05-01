# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import { create } from 'zustand';
import {
  Capture,
  CaptureFormData,
  CaptureFilters,
  NotebookEntry,
  NotebookEntryFormData,
  EntryFilters,
  EvidenceCollection,
  CompetencyProgress,
  LearningObjectiveProgress,
  ProgressDashboard,
} from '../../types/student';

// ============================================================
// CAPTURE STORE
// ============================================================

interface CaptureState {
  captures: Capture[];
  selectedCapture: Capture | null;
  loading: boolean;
  error: string | null;
  filters: Partial<CaptureFilters>;
  
  setFilters: (filters: Partial<CaptureFilters>) => void;
  fetchCaptures: (sessionId: string, filters?: Partial<CaptureFilters>) => Promise<void>;
  fetchCapture: (id: string) => Promise<void>;
  createCapture: (sessionId: string, data: CaptureFormData) => Promise<Capture>;
  updateCapture: (id: string, data: Partial<CaptureFormData>) => Promise<void>;
  deleteCapture: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useCaptureStore = create<CaptureState>((set) => ({
  captures: [],
  selectedCapture: null,
  loading: false,
  error: null,
  filters: {},

  setFilters: (filters) => set({ filters }),

  async fetchCaptures(sessionId, filters) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // const response = await captureService.list(sessionId, filters);
      set({ captures: [], loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch captures', loading: false });
    }
  },

  async fetchCapture(id) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // const response = await captureService.get(id);
      set({ selectedCapture: null, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch capture', loading: false });
    }
  },

  async createCapture(sessionId, data) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // const response = await captureService.create(sessionId, data, file);
      const newCapture: Capture = {
        id: 'temp-id',
        session_id: sessionId,
        student_id: '',
        activity_id: '',
        capture_type: data.capture_type,
        file_url: '',
        title: data.title,
        description: data.description,
        learning_objectives: data.learning_objectives,
        competencies: data.competencies,
        created_at: new Date().toISOString(),
      };
      
      set((state) => ({
        captures: [...state.captures, newCapture],
        loading: false,
      }));
      
      return newCapture;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create capture', loading: false });
      throw err;
    }
  },

  async updateCapture(id, data) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // await captureService.update(id, data);
      set({ loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update capture', loading: false });
    }
  },

  async deleteCapture(id) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // await captureService.delete(id);
      set((state) => ({
        captures: state.captures.filter(c => c.id !== id),
        loading: false,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete capture', loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));

// ============================================================
// NOTEBOOK ENTRY STORE
// ============================================================

interface NotebookEntryState {
  entries: NotebookEntry[];
  selectedEntry: NotebookEntry | null;
  loading: boolean;
  error: string | null;
  filters: Partial<EntryFilters>;
  
  setFilters: (filters: Partial<EntryFilters>) => void;
  fetchEntries: (sessionId: string, filters?: Partial<EntryFilters>) => Promise<void>;
  fetchEntry: (id: string) => Promise<void>;
  createEntry: (sessionId: string, data: NotebookEntryFormData) => Promise<NotebookEntry>;
  updateEntry: (id: string, data: Partial<NotebookEntryFormData>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  submitEntry: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useNotebookEntryStore = create<NotebookEntryState>((set) => ({
  entries: [],
  selectedEntry: null,
  loading: false,
  error: null,
  filters: {},

  setFilters: (filters) => set({ filters }),

  async fetchEntries(sessionId, filters) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // const response = await notebookService.list(sessionId, filters);
      set({ entries: [], loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch entries', loading: false });
    }
  },

  async fetchEntry(id) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // const response = await notebookService.get(id);
      set({ selectedEntry: null, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch entry', loading: false });
    }
  },

  async createEntry(sessionId, data) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // const response = await notebookService.create(sessionId, data);
      const newEntry: NotebookEntry = {
        id: 'temp-id',
        session_id: sessionId,
        student_id: '',
        title: data.title,
        content: data.content,
        reflection_type: data.reflection_type,
        prompts_used: data.prompts_used || [],
        prompt_responses: data.prompt_responses || {},
        learning_objectives: data.learning_objectives,
        competencies: data.competencies,
        capture_ids: data.capture_ids,
        status: 'draft',
        created_at: new Date().toISOString(),
      };
      
      set((state) => ({
        entries: [...state.entries, newEntry],
        loading: false,
      }));
      
      return newEntry;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create entry', loading: false });
      throw err;
    }
  },

  async updateEntry(id, data) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // await notebookService.update(id, data);
      set({ loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update entry', loading: false });
    }
  },

  async deleteEntry(id) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // await notebookService.delete(id);
      set((state) => ({
        entries: state.entries.filter(e => e.id !== id),
        loading: false,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete entry', loading: false });
    }
  },

  async submitEntry(id) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // await notebookService.submit(id);
      set((state) => ({
        entries: state.entries.map(e => e.id === id ? { ...e, status: 'submitted' as const } : e),
        loading: false,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to submit entry', loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));

// ============================================================
// PORTFOLIO STORE
// ============================================================

interface PortfolioState {
  portfolio: EvidenceCollection | null;
  collections: EvidenceCollection[];
  selectedCollection: EvidenceCollection | null;
  loading: boolean;
  error: string | null;
  
  fetchPortfolio: (studentId: string) => Promise<void>;
  fetchCollections: (studentId: string) => Promise<void>;
  fetchCollection: (collectionId: string) => Promise<void>;
  createCollection: (studentId: string, sessionId: string) => Promise<EvidenceCollection>;
  updateCollection: (id: string, data: Partial<EvidenceCollection>) => Promise<void>;
  submitCollection: (id: string) => Promise<void>;
  clearError: () => void;
}

export const usePortfolioStore = create<PortfolioState>((set) => ({
  portfolio: null,
  collections: [],
  selectedCollection: null,
  loading: false,
  error: null,

  async fetchPortfolio(studentId) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // const response = await portfolioService.getPortfolio(studentId);
      set({ portfolio: null, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch portfolio', loading: false });
    }
  },

  async fetchCollections(studentId) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // const response = await portfolioService.getCollections(studentId);
      set({ collections: [], loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch collections', loading: false });
    }
  },

  async fetchCollection(collectionId) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // const response = await portfolioService.getCollection(collectionId);
      set({ selectedCollection: null, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch collection', loading: false });
    }
  },

  async createCollection(studentId, sessionId) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // const response = await portfolioService.createCollection(studentId, sessionId);
      const newCollection: EvidenceCollection = {
        id: 'temp-id',
        student_id: studentId,
        session_id: sessionId,
        title: 'New Collection',
        captures: [],
        entries: [],
        status: 'draft',
        competencies_demonstrated: [],
        created_at: new Date().toISOString(),
      };
      
      set((state) => ({
        collections: [...state.collections, newCollection],
        loading: false,
      }));
      
      return newCollection;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create collection', loading: false });
      throw err;
    }
  },

  async updateCollection(id, data) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // await portfolioService.updateCollection(id, data);
      set({ loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update collection', loading: false });
    }
  },

  async submitCollection(id) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // await portfolioService.submitCollection(id);
      set((state) => ({
        collections: state.collections.map(c => c.id === id ? { ...c, status: 'submitted' as const } : c),
        loading: false,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to submit collection', loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));

// ============================================================
// PROGRESS STORE
// ============================================================

interface ProgressState {
  dashboard: ProgressDashboard | null;
  competencies: CompetencyProgress[];
  learningObjectives: LearningObjectiveProgress[];
  loading: boolean;
  error: string | null;
  
  fetchProgressDashboard: (studentId: string) => Promise<void>;
  fetchCompetencies: (studentId: string) => Promise<void>;
  fetchLearningObjectives: (studentId: string) => Promise<void>;
  clearError: () => void;
}

export const useProgressStore = create<ProgressState>((set) => ({
  dashboard: null,
  competencies: [],
  learningObjectives: [],
  loading: false,
  error: null,

  async fetchProgressDashboard(studentId) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // const response = await progressService.getDashboard(studentId);
      set({ dashboard: null, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch dashboard', loading: false });
    }
  },

  async fetchCompetencies(studentId) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // const response = await progressService.getCompetencies(studentId);
      set({ competencies: [], loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch competencies', loading: false });
    }
  },

  async fetchLearningObjectives(studentId) {
    set({ loading: true, error: null });
    try {
      // TODO: Call API
      // const response = await progressService.getLearningObjectives(studentId);
      set({ learningObjectives: [], loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch objectives', loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
