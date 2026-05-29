import { create } from 'zustand';
import {
  sessionsApi,
  EvidenceCaptureResponse,
  NotebookEntryResponse,
  NotebookEntryCreate,
  SessionProgressResponse,
} from '../services/api';

interface SessionState {
  sessionId: string | null;
  activityId: string | null;
  evidence: EvidenceCaptureResponse[];
  reflections: NotebookEntryResponse[];
  progress: SessionProgressResponse | null;
  loading: boolean;
  error: string | null;

  setSession: (sessionId: string, activityId: string) => void;
  fetchEvidence: () => Promise<void>;
  uploadEvidence: (formData: FormData) => Promise<EvidenceCaptureResponse>;
  fetchReflections: () => Promise<void>;
  addReflection: (entry: NotebookEntryCreate) => Promise<NotebookEntryResponse>;
  fetchProgress: () => Promise<void>;
  reset: () => void;
  clearError: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionId: null,
  activityId: null,
  evidence: [],
  reflections: [],
  progress: null,
  loading: false,
  error: null,

  setSession: (sessionId, activityId) => set({ sessionId, activityId }),

  fetchEvidence: async () => {
    const { sessionId } = get();
    if (!sessionId) return;
    try {
      const result = await sessionsApi.listEvidence(sessionId);
      set({ evidence: result.captures });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to load evidence' });
    }
  },

  uploadEvidence: async (formData) => {
    const { sessionId } = get();
    if (!sessionId) throw new Error('No active session');
    set({ loading: true, error: null });
    try {
      const capture = await sessionsApi.addEvidence(sessionId, formData);
      set((s) => ({ evidence: [...s.evidence, capture], loading: false }));
      return capture;
    } catch (err: any) {
      set({ error: err.message ?? 'Upload failed', loading: false });
      throw err;
    }
  },

  fetchReflections: async () => {
    const { sessionId } = get();
    if (!sessionId) return;
    try {
      const result = await sessionsApi.listReflections(sessionId);
      set({ reflections: result.entries });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to load reflections' });
    }
  },

  addReflection: async (entry) => {
    const { sessionId } = get();
    if (!sessionId) throw new Error('No active session');
    set({ loading: true, error: null });
    try {
      const saved = await sessionsApi.addReflection(sessionId, entry);
      set((s) => ({ reflections: [...s.reflections, saved], loading: false }));
      return saved;
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to save reflection', loading: false });
      throw err;
    }
  },

  fetchProgress: async () => {
    const { sessionId } = get();
    if (!sessionId) return;
    try {
      const progress = await sessionsApi.getProgress(sessionId);
      set({ progress });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to load progress' });
    }
  },

  reset: () => set({
    sessionId: null,
    activityId: null,
    evidence: [],
    reflections: [],
    progress: null,
    loading: false,
    error: null,
  }),

  clearError: () => set({ error: null }),
}));
