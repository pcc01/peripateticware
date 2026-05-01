# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import { create } from 'zustand'

interface UIStore {
  // Mobile menu
  isMobileMenuOpen: boolean
  toggleMobileMenu: () => void
  closeMobileMenu: () => void

  // Dark mode
  isDarkMode: boolean
  toggleDarkMode: () => void
  setDarkMode: (isDark: boolean) => void

  // Notifications
  notifications: Array<{
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
    duration?: number
  }>
  addNotification: (notification: Omit<UIStore['notifications'][0], 'id'>) => void
  removeNotification: (id: string) => void

  // Modals
  openModals: Record<string, boolean>
  openModal: (modalId: string) => void
  closeModal: (modalId: string) => void
}

export const useUIStore = create<UIStore>((set) => ({
  // Mobile menu
  isMobileMenuOpen: false,
  toggleMobileMenu: () =>
    set((state) => ({
      isMobileMenuOpen: !state.isMobileMenuOpen,
    })),
  closeMobileMenu: () => set({ isMobileMenuOpen: false }),

  // Dark mode
  isDarkMode: localStorage.getItem('dark-mode') === 'true',
  toggleDarkMode: () =>
    set((state) => {
      const newValue = !state.isDarkMode
      localStorage.setItem('dark-mode', String(newValue))
      if (newValue) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
      return { isDarkMode: newValue }
    }),
  setDarkMode: (isDark) => {
    localStorage.setItem('dark-mode', String(isDark))
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    set({ isDarkMode: isDark })
  },

  // Notifications
  notifications: [],
  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        {
          ...notification,
          id: Math.random().toString(36).substr(2, 9),
        },
      ],
    })),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  // Modals
  openModals: {},
  openModal: (modalId) =>
    set((state) => ({
      openModals: {
        ...state.openModals,
        [modalId]: true,
      },
    })),
  closeModal: (modalId) =>
    set((state) => ({
      openModals: {
        ...state.openModals,
        [modalId]: false,
      },
    })),
}))
