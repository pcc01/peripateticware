// src/stores/progressStore.ts

import create from 'zustand';
import { ChildProgress, ChildActivity, Message, Notification } from '../types/parent';

interface ProgressState {
  children: ChildProgress[];
  selectedChildId: string | null;
  activities: ChildActivity[];
  messages: Message[];
  notifications: Notification[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setChildren: (children: ChildProgress[]) => void;
  setSelectedChildId: (childId: string | null) => void;
  setActivities: (activities: ChildActivity[]) => void;
  setMessages: (messages: Message[]) => void;
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  markNotificationAsRead: (notificationId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useProgressStore = create<ProgressState>((set) => ({
  children: [],
  selectedChildId: null,
  activities: [],
  messages: [],
  notifications: [],
  isLoading: false,
  error: null,

  setChildren: (children) => set({ children }),
  setSelectedChildId: (childId) => set({ selectedChildId: childId }),
  setActivities: (activities) => set({ activities }),
  setMessages: (messages) => set({ messages }),
  setNotifications: (notifications) => set({ notifications }),
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
    })),
  markNotificationAsRead: (notificationId) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n
      ),
    })),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}));

// src/stores/uiStore.ts

interface UIState {
  isDarkMode: boolean;
  language: 'en' | 'es' | 'ar' | 'ja';
  sidebarCollapsed: boolean;
  showNotifications: boolean;
  currentPage: string;

  // Actions
  setDarkMode: (enabled: boolean) => void;
  setLanguage: (lang: 'en' | 'es' | 'ar' | 'ja') => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setShowNotifications: (show: boolean) => void;
  setCurrentPage: (page: string) => void;
  toggleSidebar: () => void;
  toggleDarkMode: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isDarkMode: localStorage.getItem('darkMode') === 'true' || false,
  language: (localStorage.getItem('language') as any) || 'en',
  sidebarCollapsed: localStorage.getItem('sidebarCollapsed') === 'true' || false,
  showNotifications: true,
  currentPage: 'dashboard',

  setDarkMode: (enabled) => {
    localStorage.setItem('darkMode', String(enabled));
    set({ isDarkMode: enabled });
  },
  setLanguage: (lang) => {
    localStorage.setItem('language', lang);
    set({ language: lang });
  },
  setSidebarCollapsed: (collapsed) => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
    set({ sidebarCollapsed: collapsed });
  },
  setShowNotifications: (show) => set({ showNotifications: show }),
  setCurrentPage: (page) => set({ currentPage: page }),
  toggleSidebar: () =>
    set((state) => {
      const newCollapsed = !state.sidebarCollapsed;
      localStorage.setItem('sidebarCollapsed', String(newCollapsed));
      return { sidebarCollapsed: newCollapsed };
    }),
  toggleDarkMode: () =>
    set((state) => {
      const newDarkMode = !state.isDarkMode;
      localStorage.setItem('darkMode', String(newDarkMode));
      return { isDarkMode: newDarkMode };
    }),
}));
