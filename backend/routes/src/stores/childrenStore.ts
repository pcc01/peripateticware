// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { create } from 'zustand';
import { Child, ChildProgress, Activity } from '../types';
import axios from 'axios';
import { useAuthStore } from './authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

interface ChildrenStore {
  children: Child[];
  selectedChild: Child | null;
  progress: Map<string, ChildProgress>;
  activities: Map<string, Activity[]>;
  isLoading: boolean;
  error: string | null;

  fetchChildren: () => Promise<void>;
  selectChild: (childId: string) => void;
  fetchChildProgress: (childId: string) => Promise<ChildProgress>;
  fetchActivities: (childId: string) => Promise<Activity[]>;
  linkChild: (code: string, relationship: string) => Promise<Child>;
  unlinkChild: (childId: string) => Promise<void>;
  updateChild: (childId: string, data: Partial<Child>) => Promise<void>;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useChildrenStore = create<ChildrenStore>((set, get) => {
  const getAuthHeaders = () => {
    const token = useAuthStore.getState().token;
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  return {
    children: [],
    selectedChild: null,
    progress: new Map(),
    activities: new Map(),
    isLoading: false,
    error: null,

    fetchChildren: async () => {
      set({ isLoading: true, error: null });
      try {
        const response = await axios.get(`${API_BASE_URL}/children`, {
          headers: getAuthHeaders(),
        });

        set({
          children: response.data,
          isLoading: false,
        });

        // Auto-select first child if available
        if (response.data.length > 0 && !get().selectedChild) {
          set({ selectedChild: response.data[0] });
        }
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to fetch children';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    selectChild: (childId: string) => {
      const child = get().children.find((c) => c.id === childId);
      if (child) {
        set({ selectedChild: child });
      }
    },

    fetchChildProgress: async (childId: string) => {
      set({ isLoading: true, error: null });
      try {
        const response = await axios.get(
          `${API_BASE_URL}/children/${childId}/progress`,
          {
            headers: getAuthHeaders(),
          }
        );

        const progress = new Map(get().progress);
        progress.set(childId, response.data);
        set({ progress, isLoading: false });

        return response.data;
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to fetch child progress';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    fetchActivities: async (childId: string) => {
      set({ isLoading: true, error: null });
      try {
        const response = await axios.get(
          `${API_BASE_URL}/children/${childId}/activities`,
          {
            headers: getAuthHeaders(),
          }
        );

        const activities = new Map(get().activities);
        activities.set(childId, response.data);
        set({ activities, isLoading: false });

        return response.data;
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to fetch activities';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    linkChild: async (code: string, relationship: string) => {
      set({ isLoading: true, error: null });
      try {
        const response = await axios.post(
          `${API_BASE_URL}/children/link`,
          {
            code,
            relationship,
          },
          {
            headers: getAuthHeaders(),
          }
        );

        const newChild = response.data;
        set({
          children: [...get().children, newChild],
          selectedChild: newChild,
          isLoading: false,
        });

        return newChild;
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to link child';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    unlinkChild: async (childId: string) => {
      set({ isLoading: true, error: null });
      try {
        await axios.delete(`${API_BASE_URL}/children/${childId}`, {
          headers: getAuthHeaders(),
        });

        const children = get().children.filter((c) => c.id !== childId);
        const selectedChild =
          get().selectedChild?.id === childId ? children[0] || null : get().selectedChild;

        // Clean up maps
        const progress = new Map(get().progress);
        progress.delete(childId);
        const activities = new Map(get().activities);
        activities.delete(childId);

        set({
          children,
          selectedChild,
          progress,
          activities,
          isLoading: false,
        });
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to unlink child';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    updateChild: async (childId: string, data: Partial<Child>) => {
      set({ isLoading: true, error: null });
      try {
        const response = await axios.patch(
          `${API_BASE_URL}/children/${childId}`,
          data,
          {
            headers: getAuthHeaders(),
          }
        );

        const children = get().children.map((c) =>
          c.id === childId ? response.data : c
        );

        set({
          children,
          selectedChild:
            get().selectedChild?.id === childId ? response.data : get().selectedChild,
          isLoading: false,
        });
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to update child';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    setError: (error: string | null) => {
      set({ error });
    },

    clearError: () => {
      set({ error: null });
    },
  };
});

