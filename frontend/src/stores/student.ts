# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

/**
 * Zustand Store for Student Notebook & Portfolio
 * Manages state for captures, reflections, evidence, and progress
 */

import { create } from 'zustand';
import {
  Capture,
  NotebookEntry,
  EvidenceCollection,
  Portfolio,
  ProgressDashboard,
  CompetencyProgress,
  ActivityEngagement,
  Annotation,
  CaptureFormData,
  NotebookEntryFormData,
  CaptureFilters,
  EntryFilters,
  PaginatedCaptureResponse,
  PaginatedEntryResponse,
} from '@types/student';

// ============================================================================
// CAPTURE STORE
// ============================================================================

interface CaptureState {
  // Data
  captures: Capture[];
  selectedCapture: Capture | null;
  paginatedCaptures: PaginatedCaptureResponse | null;
  
  // State
  loading: boolean;
  error: string | null;
  
  // Filters
  filters: CaptureFilters;
  
  // Actions
  fetchCaptures: (sessionId: string, filters?: Partial<CaptureFilters>) => Promise<void>;
  fetchCapture: (id: string) => Promise<void>;
  createCapture: (sessionId: string, data: CaptureFormData) => Promise<Capture>;
  updateCapture: (id: string, data: Partial<CaptureFormData>) => Promise<Capture>;
  deleteCapture: (id: string) => Promise<void>;
  setFilters: (filters: Partial<CaptureFilters>) => void;
  selectCapture: (capture: Capture | null) => void;
  clearError: () => void;
}

export const useCaptureStore = create<CaptureState>((set, get) => ({
  // Initial state
  captures: [],
  selectedCapture: null,
  paginatedCaptures: null,
  loading: false,
  error: null,
  filters: {
    page: 1,
    page_size: 20,
  },

  // Fetch captures with pagination
  async fetchCaptures(sessionId: string, filters?: Partial<CaptureFilters>) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const response = await captureApi.list(sessionId, { ...get().filters, ...filters });
      // set({
      //   paginatedCaptures: response,
      //   captures: response.items,
      //   filters: { ...get().filters, ...filters },
      // });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch captures' });
    } finally {
      set({ loading: false });
    }
  },

  // Fetch single capture
  async fetchCapture(id: string) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const capture = await captureApi.get(id);
      // set({ selectedCapture: capture });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch capture' });
    } finally {
      set({ loading: false });
    }
  },

  // Create capture
  async createCapture(sessionId: string, data: CaptureFormData) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const capture = await captureApi.create(sessionId, data);
      // set((state) => ({
      //   captures: [capture, ...state.captures],
      // }));
      // return capture;
      throw new Error('API not yet implemented');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create capture';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Update capture
  async updateCapture(id: string, data: Partial<CaptureFormData>) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const capture = await captureApi.update(id, data);
      // set((state) => ({
      //   captures: state.captures.map((c) => (c.id === id ? capture : c)),
      //   selectedCapture: state.selectedCapture?.id === id ? capture : state.selectedCapture,
      // }));
      // return capture;
      throw new Error('API not yet implemented');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update capture';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Delete capture
  async deleteCapture(id: string) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // await captureApi.delete(id);
      // set((state) => ({
      //   captures: state.captures.filter((c) => c.id !== id),
      //   selectedCapture: state.selectedCapture?.id === id ? null : state.selectedCapture,
      // }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to delete capture' });
    } finally {
      set({ loading: false });
    }
  },

  // Set filters
  setFilters(filters: Partial<CaptureFilters>) {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
  },

  // Select capture
  selectCapture(capture: Capture | null) {
    set({ selectedCapture: capture });
  },

  // Clear error
  clearError() {
    set({ error: null });
  },
}));

// ============================================================================
// NOTEBOOK ENTRY STORE
// ============================================================================

interface NotebookEntryState {
  // Data
  entries: NotebookEntry[];
  selectedEntry: NotebookEntry | null;
  paginatedEntries: PaginatedEntryResponse | null;
  
  // State
  loading: boolean;
  error: string | null;
  
  // Filters
  filters: EntryFilters;
  
  // Actions
  fetchEntries: (sessionId: string, filters?: Partial<EntryFilters>) => Promise<void>;
  fetchEntry: (id: string) => Promise<void>;
  createEntry: (sessionId: string, data: NotebookEntryFormData) => Promise<NotebookEntry>;
  updateEntry: (id: string, data: Partial<NotebookEntryFormData>) => Promise<NotebookEntry>;
  deleteEntry: (id: string) => Promise<void>;
  submitEntry: (id: string) => Promise<NotebookEntry>;
  setFilters: (filters: Partial<EntryFilters>) => void;
  selectEntry: (entry: NotebookEntry | null) => void;
  clearError: () => void;
}

export const useNotebookEntryStore = create<NotebookEntryState>((set, get) => ({
  // Initial state
  entries: [],
  selectedEntry: null,
  paginatedEntries: null,
  loading: false,
  error: null,
  filters: {
    page: 1,
    page_size: 20,
  },

  // Fetch entries with pagination
  async fetchEntries(sessionId: string, filters?: Partial<EntryFilters>) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const response = await entryApi.list(sessionId, { ...get().filters, ...filters });
      // set({
      //   paginatedEntries: response,
      //   entries: response.items,
      //   filters: { ...get().filters, ...filters },
      // });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch entries' });
    } finally {
      set({ loading: false });
    }
  },

  // Fetch single entry
  async fetchEntry(id: string) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const entry = await entryApi.get(id);
      // set({ selectedEntry: entry });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch entry' });
    } finally {
      set({ loading: false });
    }
  },

  // Create entry
  async createEntry(sessionId: string, data: NotebookEntryFormData) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const entry = await entryApi.create(sessionId, data);
      // set((state) => ({
      //   entries: [entry, ...state.entries],
      // }));
      // return entry;
      throw new Error('API not yet implemented');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create entry';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Update entry
  async updateEntry(id: string, data: Partial<NotebookEntryFormData>) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const entry = await entryApi.update(id, data);
      // set((state) => ({
      //   entries: state.entries.map((e) => (e.id === id ? entry : e)),
      //   selectedEntry: state.selectedEntry?.id === id ? entry : state.selectedEntry,
      // }));
      // return entry;
      throw new Error('API not yet implemented');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update entry';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Delete entry
  async deleteEntry(id: string) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // await entryApi.delete(id);
      // set((state) => ({
      //   entries: state.entries.filter((e) => e.id !== id),
      //   selectedEntry: state.selectedEntry?.id === id ? null : state.selectedEntry,
      // }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to delete entry' });
    } finally {
      set({ loading: false });
    }
  },

  // Submit entry for review
  async submitEntry(id: string) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const entry = await entryApi.submit(id);
      // set((state) => ({
      //   entries: state.entries.map((e) => (e.id === id ? entry : e)),
      //   selectedEntry: state.selectedEntry?.id === id ? entry : state.selectedEntry,
      // }));
      // return entry;
      throw new Error('API not yet implemented');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit entry';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Set filters
  setFilters(filters: Partial<EntryFilters>) {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
  },

  // Select entry
  selectEntry(entry: NotebookEntry | null) {
    set({ selectedEntry: entry });
  },

  // Clear error
  clearError() {
    set({ error: null });
  },
}));

// ============================================================================
// PORTFOLIO STORE
// ============================================================================

interface PortfolioState {
  // Data
  portfolio: Portfolio | null;
  collections: EvidenceCollection[];
  selectedCollection: EvidenceCollection | null;
  
  // State
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchPortfolio: (studentId: string) => Promise<void>;
  fetchCollections: (studentId: string) => Promise<void>;
  fetchCollection: (collectionId: string) => Promise<void>;
  createCollection: (studentId: string, sessionId: string) => Promise<EvidenceCollection>;
  updateCollection: (id: string, data: Partial<EvidenceCollection>) => Promise<EvidenceCollection>;
  submitCollection: (id: string) => Promise<EvidenceCollection>;
  selectCollection: (collection: EvidenceCollection | null) => void;
  clearError: () => void;
}

export const usePortfolioStore = create<PortfolioState>((set) => ({
  // Initial state
  portfolio: null,
  collections: [],
  selectedCollection: null,
  loading: false,
  error: null,

  // Fetch student portfolio
  async fetchPortfolio(studentId: string) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const portfolio = await portfolioApi.getPortfolio(studentId);
      // set({ portfolio });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch portfolio' });
    } finally {
      set({ loading: false });
    }
  },

  // Fetch evidence collections
  async fetchCollections(studentId: string) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const collections = await portfolioApi.getCollections(studentId);
      // set({ collections });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch collections' });
    } finally {
      set({ loading: false });
    }
  },

  // Fetch single collection
  async fetchCollection(collectionId: string) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const collection = await portfolioApi.getCollection(collectionId);
      // set({ selectedCollection: collection });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch collection' });
    } finally {
      set({ loading: false });
    }
  },

  // Create new collection
  async createCollection(studentId: string, sessionId: string) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const collection = await portfolioApi.createCollection(studentId, sessionId);
      // set((state) => ({
      //   collections: [collection, ...state.collections],
      // }));
      // return collection;
      throw new Error('API not yet implemented');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create collection';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Update collection
  async updateCollection(id: string, data: Partial<EvidenceCollection>) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const collection = await portfolioApi.updateCollection(id, data);
      // set((state) => ({
      //   collections: state.collections.map((c) => (c.id === id ? collection : c)),
      //   selectedCollection: state.selectedCollection?.id === id ? collection : state.selectedCollection,
      // }));
      // return collection;
      throw new Error('API not yet implemented');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update collection';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Submit collection for teacher review
  async submitCollection(id: string) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const collection = await portfolioApi.submitCollection(id);
      // set((state) => ({
      //   collections: state.collections.map((c) => (c.id === id ? collection : c)),
      //   selectedCollection: state.selectedCollection?.id === id ? collection : state.selectedCollection,
      // }));
      // return collection;
      throw new Error('API not yet implemented');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit collection';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  // Select collection
  selectCollection(collection: EvidenceCollection | null) {
    set({ selectedCollection: collection });
  },

  // Clear error
  clearError() {
    set({ error: null });
  },
}));

// ============================================================================
// PROGRESS STORE
// ============================================================================

interface ProgressState {
  // Data
  dashboard: ProgressDashboard | null;
  competencies: CompetencyProgress[];
  
  // State
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchProgressDashboard: (studentId: string) => Promise<void>;
  fetchCompetencies: (studentId: string) => Promise<void>;
  clearError: () => void;
}

export const useProgressStore = create<ProgressState>((set) => ({
  // Initial state
  dashboard: null,
  competencies: [],
  loading: false,
  error: null,

  // Fetch progress dashboard
  async fetchProgressDashboard(studentId: string) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const dashboard = await progressApi.getDashboard(studentId);
      // set({ dashboard });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch dashboard' });
    } finally {
      set({ loading: false });
    }
  },

  // Fetch competency progress
  async fetchCompetencies(studentId: string) {
    set({ loading: true, error: null });
    try {
      // TODO: Replace with actual API call
      // const competencies = await progressApi.getCompetencies(studentId);
      // set({ competencies });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch competencies' });
    } finally {
      set({ loading: false });
    }
  },

  // Clear error
  clearError() {
    set({ error: null });
  },
}));
