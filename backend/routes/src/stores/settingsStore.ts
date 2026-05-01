# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import { create } from 'zustand';
import { UserSettings, EmailPreferences, NotificationPreferences, PrivacySettings } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useAuthStore } from './authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

interface SettingsStore {
  settings: UserSettings | null;
  isLoading: boolean;
  error: string | null;

  fetchSettings: () => Promise<void>;
  updateLanguage: (language: string) => Promise<void>;
  toggleDarkMode: () => Promise<void>;
  updateEmailPreferences: (prefs: Partial<EmailPreferences>) => Promise<void>;
  updateNotificationPreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  updatePrivacySettings: (prefs: Partial<PrivacySettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => {
  const getAuthHeaders = () => {
    const token = useAuthStore.getState().token;
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const defaultSettings: UserSettings = {
    language: 'en',
    darkMode: false,
    emailPreferences: {
      weeklyDigest: true,
      monthlyReport: true,
      achievements: true,
      concerns: true,
      systemNotifications: false,
    },
    notificationPreferences: {
      achievements: true,
      concerns: true,
      activities: true,
      messages: true,
      systemUpdates: false,
      emailNotifications: true,
      pushNotifications: true,
    },
    privacySettings: {
      shareProgress: true,
      allowMessages: true,
      dataCollection: 'standard',
    },
  };

  return {
    settings: null,
    isLoading: false,
    error: null,

    fetchSettings: async () => {
      set({ isLoading: true, error: null });
      try {
        // Try to get from API first
        try {
          const response = await axios.get(`${API_BASE_URL}/settings`, {
            headers: getAuthHeaders(),
          });
          set({
            settings: response.data,
            isLoading: false,
          });
          return;
        } catch (error: any) {
          // If API fails, try local storage
          if (error.response?.status === 404) {
            throw new Error('Settings not found');
          }
        }

        // Get from local storage
        const cached = await AsyncStorage.getItem('userSettings');
        if (cached) {
          set({
            settings: JSON.parse(cached),
            isLoading: false,
          });
        } else {
          // Use defaults
          set({
            settings: defaultSettings,
            isLoading: false,
          });
          await AsyncStorage.setItem(
            'userSettings',
            JSON.stringify(defaultSettings)
          );
        }
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Failed to fetch settings';
        set({ error: message, isLoading: false });
        // Use defaults on error
        set({ settings: defaultSettings });
      }
    },

    updateLanguage: async (language: string) => {
      set({ isLoading: true, error: null });
      try {
        const settings = get().settings || defaultSettings;
        const updated = { ...settings, language };

        // Update locally first
        await AsyncStorage.setItem(
          'userSettings',
          JSON.stringify(updated)
        );
        set({ settings: updated });

        // Sync with API
        try {
          await axios.patch(
            `${API_BASE_URL}/settings`,
            { language },
            {
              headers: getAuthHeaders(),
            }
          );
        } catch (error) {
          console.warn('Failed to sync language to API:', error);
        }

        set({ isLoading: false });
      } catch (error: any) {
        const message = error.message || 'Failed to update language';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    toggleDarkMode: async () => {
      set({ isLoading: true, error: null });
      try {
        const settings = get().settings || defaultSettings;
        const updated = { ...settings, darkMode: !settings.darkMode };

        // Update locally first
        await AsyncStorage.setItem(
          'userSettings',
          JSON.stringify(updated)
        );
        set({ settings: updated });

        // Sync with API
        try {
          await axios.patch(
            `${API_BASE_URL}/settings`,
            { darkMode: updated.darkMode },
            {
              headers: getAuthHeaders(),
            }
          );
        } catch (error) {
          console.warn('Failed to sync dark mode to API:', error);
        }

        set({ isLoading: false });
      } catch (error: any) {
        const message = error.message || 'Failed to toggle dark mode';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    updateEmailPreferences: async (prefs: Partial<EmailPreferences>) => {
      set({ isLoading: true, error: null });
      try {
        const settings = get().settings || defaultSettings;
        const updated = {
          ...settings,
          emailPreferences: { ...settings.emailPreferences, ...prefs },
        };

        // Update locally first
        await AsyncStorage.setItem(
          'userSettings',
          JSON.stringify(updated)
        );
        set({ settings: updated });

        // Sync with API
        try {
          await axios.patch(
            `${API_BASE_URL}/settings/email-preferences`,
            prefs,
            {
              headers: getAuthHeaders(),
            }
          );
        } catch (error) {
          console.warn('Failed to sync email preferences to API:', error);
        }

        set({ isLoading: false });
      } catch (error: any) {
        const message = error.message || 'Failed to update email preferences';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    updateNotificationPreferences: async (prefs: Partial<NotificationPreferences>) => {
      set({ isLoading: true, error: null });
      try {
        const settings = get().settings || defaultSettings;
        const updated = {
          ...settings,
          notificationPreferences: { ...settings.notificationPreferences, ...prefs },
        };

        // Update locally first
        await AsyncStorage.setItem(
          'userSettings',
          JSON.stringify(updated)
        );
        set({ settings: updated });

        // Sync with API
        try {
          await axios.patch(
            `${API_BASE_URL}/settings/notification-preferences`,
            prefs,
            {
              headers: getAuthHeaders(),
            }
          );
        } catch (error) {
          console.warn('Failed to sync notification preferences to API:', error);
        }

        set({ isLoading: false });
      } catch (error: any) {
        const message = error.message || 'Failed to update notification preferences';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    updatePrivacySettings: async (privacySettings: Partial<PrivacySettings>) => {
      set({ isLoading: true, error: null });
      try {
        const settings = get().settings || defaultSettings;
        const updated = {
          ...settings,
          privacySettings: { ...settings.privacySettings, ...privacySettings },
        };

        // Update locally first
        await AsyncStorage.setItem(
          'userSettings',
          JSON.stringify(updated)
        );
        set({ settings: updated });

        // Sync with API
        try {
          await axios.patch(
            `${API_BASE_URL}/settings/privacy`,
            privacySettings,
            {
              headers: getAuthHeaders(),
            }
          );
        } catch (error) {
          console.warn('Failed to sync privacy settings to API:', error);
        }

        set({ isLoading: false });
      } catch (error: any) {
        const message = error.message || 'Failed to update privacy settings';
        set({ error: message, isLoading: false });
        throw error;
      }
    },

    resetSettings: async () => {
      set({ isLoading: true, error: null });
      try {
        await AsyncStorage.removeItem('userSettings');
        set({
          settings: defaultSettings,
          isLoading: false,
        });

        // Notify API
        try {
          await axios.post(
            `${API_BASE_URL}/settings/reset`,
            {},
            {
              headers: getAuthHeaders(),
            }
          );
        } catch (error) {
          console.warn('Failed to reset settings on API:', error);
        }
      } catch (error: any) {
        const message = error.message || 'Failed to reset settings';
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
