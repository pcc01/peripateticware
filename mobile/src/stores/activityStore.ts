# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import { create } from 'zustand';
import { Activity, Evidence } from '../types';
import axios from 'axios';
import { useAuthStore } from './authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

interface ActivityStore {
  activities: Activity[];
  currentActivity: Activity | null;
  isLoading: boolean;
  error: string | null;
  filters: {
    status?: 'not_started' | 'in_progress' | 'completed';
    category?: string;
    searchText?: string;
  };

  fetchActivities: (childId: string, filters?: ActivityStore['filters']) => Promise<void>;
  getActivityById: (childId: string, activityId: string) => Promise<Activity>;
  setCurrentActivity: (activity: Activity | null) => void;
  updateActivityStatus: (childId: string, activityId: string, status: Activity['status']) => Promise<void>;
  addEvidence: (childId: string, activityId: string, evidence: Omit<Evidence, 'id' | 'timestamp'>) => Promise<Evidence>;
  removeEvidence: (childId: string, activityId: string, evidenceId: string) => Promise<void>;
  setFilters: (filters: Partial<ActivityStore['filters']>) => void;
  clearFilters: () => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useActivityStore = create<ActivityStore>((set, get) => {
  const getAuthHeaders = () => {
    const token = useAuthStore.getState().token;
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const buildQueryParams = (filters?: ActivityStore['filters']) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.category) params.append('category', filters.category);
    if (filters?.searchText) params.append('search', filters.searchText);
    return params.toString();
  };

  return {
    activities: [],
    currentActivity: null,
    isLoading: false,
    error: null,
    filters: {},

    fetchActivities: async (childId: string, filters?: ActivityStore['filters']) => {
      set({ isLoading: true, error: null });
      try {
        const queryString = buildQueryParams(filters || get().filters);
        const url = queryString
          ? `${API_BASE_URL}/children/${childId}/activities?${queryString}`
          : `${API_BASE_URL}/children/${childId}/activities`;

        const response = await axios.get(url, {
          headers: getAuthHeaders(),
        });

        set({
          activities: response.data,
          isLoading: false,
          filters: filters || get().filters,
        });
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to fetch activities';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    getActivityById: async (childId: string, activityId: string) => {
      set({ isLoading: true, error: null });
      try {
        const response = await axios.get(
          `${API_BASE_URL}/children/${childId}/activities/${activityId}`,
          {
            headers: getAuthHeaders(),
          }
        );

        set({
          currentActivity: response.data,
          isLoading: false,
        });

        return response.data;
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to fetch activity';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    setCurrentActivity: (activity: Activity | null) => {
      set({ currentActivity: activity });
    },

    updateActivityStatus: async (childId: string, activityId: string, status: Activity['status']) => {
      set({ isLoading: true, error: null });
      try {
        const response = await axios.patch(
          `${API_BASE_URL}/children/${childId}/activities/${activityId}`,
          { status },
          {
            headers: getAuthHeaders(),
          }
        );

        const activities = get().activities.map((a) =>
          a.id === activityId ? response.data : a
        );

        set({
          activities,
          currentActivity:
            get().currentActivity?.id === activityId ? response.data : get().currentActivity,
          isLoading: false,
        });
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to update activity status';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    addEvidence: async (childId: string, activityId: string, evidence: Omit<Evidence, 'id' | 'timestamp'>) => {
      set({ isLoading: true, error: null });
      try {
        const response = await axios.post(
          `${API_BASE_URL}/children/${childId}/activities/${activityId}/evidence`,
          evidence,
          {
            headers: getAuthHeaders(),
          }
        );

        // Update activity in list
        const activities = get().activities.map((a) =>
          a.id === activityId
            ? { ...a, evidence: [...(a.evidence || []), response.data] }
            : a
        );

        // Update current activity
        const currentActivity = get().currentActivity;
        if (currentActivity?.id === activityId) {
          currentActivity.evidence = [...(currentActivity.evidence || []), response.data];
        }

        set({
          activities,
          currentActivity,
          isLoading: false,
        });

        return response.data;
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to add evidence';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    removeEvidence: async (childId: string, activityId: string, evidenceId: string) => {
      set({ isLoading: true, error: null });
      try {
        await axios.delete(
          `${API_BASE_URL}/children/${childId}/activities/${activityId}/evidence/${evidenceId}`,
          {
            headers: getAuthHeaders(),
          }
        );

        // Update activity in list
        const activities = get().activities.map((a) =>
          a.id === activityId
            ? {
                ...a,
                evidence: (a.evidence || []).filter((e) => e.id !== evidenceId),
              }
            : a
        );

        // Update current activity
        const currentActivity = get().currentActivity;
        if (currentActivity?.id === activityId) {
          currentActivity.evidence = (currentActivity.evidence || []).filter(
            (e) => e.id !== evidenceId
          );
        }

        set({
          activities,
          currentActivity,
          isLoading: false,
        });
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to remove evidence';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    setFilters: (filters: Partial<ActivityStore['filters']>) => {
      set({ filters: { ...get().filters, ...filters } });
    },

    clearFilters: () => {
      set({ filters: {} });
    },

    setError: (error: string | null) => {
      set({ error });
    },

    clearError: () => {
      set({ error: null });
    },
  };
});
