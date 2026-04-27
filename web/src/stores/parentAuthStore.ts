// src/stores/parentAuthStore.ts

import create from 'zustand';
import { ParentAccount } from '../types/parent';

interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface ParentAuthState {
  parent: ParentAccount | null;
  token: AuthToken | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreToken: () => Promise<void>;
  refreshToken: () => Promise<void>;
  updateParent: (parent: Partial<ParentAccount>) => void;
  setError: (error: string | null) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const useParentAuthStore = create<ParentAuthState>((set, get) => ({
  parent: null,
  token: null,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/parent/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Login failed');
      }

      const data = await response.json();
      const { parent, token } = data;

      // Store in localStorage
      localStorage.setItem('parentAuthToken', JSON.stringify(token));
      localStorage.setItem('parent', JSON.stringify(parent));

      set({ parent, token, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  register: async (email: string, password: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE_URL}/parent/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Registration failed');
      }

      const data = await response.json();
      const { parent, token } = data;

      localStorage.setItem('parentAuthToken', JSON.stringify(token));
      localStorage.setItem('parent', JSON.stringify(parent));

      set({ parent, token, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      localStorage.removeItem('parentAuthToken');
      localStorage.removeItem('parent');
      set({ parent: null, token: null, error: null });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  restoreToken: async () => {
    set({ isLoading: true });
    try {
      const tokenJson = localStorage.getItem('parentAuthToken');
      const parentJson = localStorage.getItem('parent');

      if (tokenJson && parentJson) {
        const token = JSON.parse(tokenJson);
        const parent = JSON.parse(parentJson);

        // Check if token is expired
        const expiresAt = new Date(token.expiresIn).getTime();
        if (expiresAt < Date.now()) {
          // Token expired, try to refresh
          await get().refreshToken();
        } else {
          set({ token, parent, isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Restore token error:', error);
      set({ isLoading: false });
    }
  },

  refreshToken: async () => {
    try {
      const tokenJson = localStorage.getItem('parentAuthToken');
      if (!tokenJson) {
        throw new Error('No token to refresh');
      }

      const currentToken = JSON.parse(tokenJson);
      const response = await fetch(`${API_BASE_URL}/parent/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentToken.refreshToken }),
      });

      if (!response.ok) {
        // Refresh failed, logout
        await get().logout();
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      const newToken = data.token;

      localStorage.setItem('parentAuthToken', JSON.stringify(newToken));
      set({ token: newToken });
    } catch (error) {
      await get().logout();
      throw error;
    }
  },

  updateParent: (updates: Partial<ParentAccount>) => {
    const current = get().parent;
    if (current) {
      const updated = { ...current, ...updates };
      set({ parent: updated });
      localStorage.setItem('parent', JSON.stringify(updated));
    }
  },

  setError: (error: string | null) => {
    set({ error });
  },
}));
