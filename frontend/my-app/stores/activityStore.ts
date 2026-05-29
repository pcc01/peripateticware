import { create } from 'zustand';
import {
  activitiesApi,
  StudentActivitySummary,
  StudentActivityDetail,
  LearningSessionResponse,
  ActivitySubmissionResponse,
  ActivityListParams,
} from '../services/api';

interface ActivityState {
  activities: StudentActivitySummary[];
  currentActivity: StudentActivityDetail | null;
  currentSession: LearningSessionResponse | null;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  page: number;

  fetchActivities: (params?: ActivityListParams, append?: boolean) => Promise<void>;
  fetchActivity: (id: string) => Promise<void>;
  startSession: (activityId: string, lat?: number, lon?: number, locationName?: string) => Promise<LearningSessionResponse>;
  submitActivity: (activityId: string, sessionId: string) => Promise<ActivitySubmissionResponse>;
  clearError: () => void;
  setCurrentSession: (session: LearningSessionResponse | null) => void;
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  activities: [],
  currentActivity: null,
  currentSession: null,
  loading: false,
  error: null,
  hasMore: true,
  page: 1,

  fetchActivities: async (params, append = false) => {
    set({ loading: true, error: null });
    try {
      const result = await activitiesApi.list({
        skip: append ? (get().page - 1) * 20 : 0,
        limit: 20,
        ...params,
      });
      set((s) => ({
        activities: append ? [...s.activities, ...result.activities] : result.activities,
        hasMore: result.has_more,
        page: append ? s.page + 1 : 2,
        loading: false,
      }));
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to load activities', loading: false });
    }
  },

  fetchActivity: async (id) => {
    set({ loading: true, error: null });
    try {
      const activity = await activitiesApi.get(id);
      set({ currentActivity: activity, loading: false });
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to load activity', loading: false });
    }
  },

  startSession: async (activityId, lat, lon, locationName) => {
    set({ loading: true, error: null });
    try {
      const session = await activitiesApi.start(activityId, {
        location_latitude: lat,
        location_longitude: lon,
        location_name: locationName,
      });
      set({ currentSession: session, loading: false });
      return session;
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to start session', loading: false });
      throw err;
    }
  },

  submitActivity: async (activityId, sessionId) => {
    set({ loading: true, error: null });
    try {
      const result = await activitiesApi.submit(activityId, sessionId);
      set({ loading: false });
      return result;
    } catch (err: any) {
      set({ error: err.message ?? 'Failed to submit activity', loading: false });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
  setCurrentSession: (session) => set({ currentSession: session }),
}));
