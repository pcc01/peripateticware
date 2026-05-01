# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import { create } from 'zustand';
import { Notification, NotificationPreferences } from '../types';
import axios from 'axios';
import { useAuthStore } from './authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  preferences: NotificationPreferences | null;
  filter: 'all' | 'achievements' | 'concerns' | 'activities' | 'messages';
  isLoading: boolean;
  error: string | null;

  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  setFilter: (filter: NotificationStore['filter']) => void;
  fetchPreferences: () => Promise<NotificationPreferences>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useNotificationStore = create<NotificationStore>((set, get) => {
  const getAuthHeaders = () => {
    const token = useAuthStore.getState().token;
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const calculateUnreadCount = (notifications: Notification[]) => {
    return notifications.filter((n) => !n.isRead).length;
  };

  return {
    notifications: [],
    unreadCount: 0,
    preferences: null,
    filter: 'all',
    isLoading: false,
    error: null,

    fetchNotifications: async () => {
      set({ isLoading: true, error: null });
      try {
        const filter = get().filter;
        const url =
          filter === 'all'
            ? `${API_BASE_URL}/notifications`
            : `${API_BASE_URL}/notifications?type=${filter}`;

        const response = await axios.get(url, {
          headers: getAuthHeaders(),
        });

        const notifications = response.data;
        set({
          notifications,
          unreadCount: calculateUnreadCount(notifications),
          isLoading: false,
        });
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to fetch notifications';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    markAsRead: async (id: string) => {
      try {
        await axios.patch(
          `${API_BASE_URL}/notifications/${id}/read`,
          {},
          {
            headers: getAuthHeaders(),
          }
        );

        const notifications = get().notifications.map((n) =>
          n.id === id ? { ...n, isRead: true } : n
        );

        set({
          notifications,
          unreadCount: calculateUnreadCount(notifications),
        });
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to mark notification as read';
        set({ error: message });
        throw error;
      }
    },

    markAllRead: async () => {
      try {
        await axios.post(
          `${API_BASE_URL}/notifications/read-all`,
          {},
          {
            headers: getAuthHeaders(),
          }
        );

        const notifications = get().notifications.map((n) => ({
          ...n,
          isRead: true,
        }));

        set({
          notifications,
          unreadCount: 0,
        });
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to mark all as read';
        set({ error: message });
        throw error;
      }
    },

    deleteNotification: async (id: string) => {
      try {
        await axios.delete(`${API_BASE_URL}/notifications/${id}`, {
          headers: getAuthHeaders(),
        });

        const notifications = get().notifications.filter((n) => n.id !== id);
        set({
          notifications,
          unreadCount: calculateUnreadCount(notifications),
        });
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to delete notification';
        set({ error: message });
        throw error;
      }
    },

    setFilter: (filter: NotificationStore['filter']) => {
      set({ filter });
    },

    fetchPreferences: async () => {
      set({ isLoading: true, error: null });
      try {
        const response = await axios.get(`${API_BASE_URL}/notifications/preferences`, {
          headers: getAuthHeaders(),
        });

        set({
          preferences: response.data,
          isLoading: false,
        });

        return response.data;
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to fetch preferences';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    updatePreferences: async (prefs: Partial<NotificationPreferences>) => {
      set({ isLoading: true, error: null });
      try {
        const response = await axios.patch(
          `${API_BASE_URL}/notifications/preferences`,
          prefs,
          {
            headers: getAuthHeaders(),
          }
        );

        set({
          preferences: response.data,
          isLoading: false,
        });
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to update preferences';
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
