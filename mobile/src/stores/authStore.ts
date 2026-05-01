# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import { create } from 'zustand';
import { User, LoginRequest, RegisterRequest, AuthState } from '../types';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

import { create } from 'zustand';
import { User, LoginRequest, RegisterRequest, AuthState } from '../types';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

// ADD THESE DEBUG LINES:
console.log('📱 authStore.ts loading...');
console.log('🔍 process.env.EXPO_PUBLIC_API_URL:', process.env.EXPO_PUBLIC_API_URL);

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// ADD THIS:
console.log('✅ API_BASE_URL set to:', API_BASE_URL);

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

interface AuthStore extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  setUser: (user: User | null) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  getCurrentUser: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  token: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login`, {
        email,
        password,
      });

      const { accessToken, refreshToken, user } = response.data;

      // Save tokens securely
      await SecureStore.setItemAsync('accessToken', accessToken);
      await SecureStore.setItemAsync('refreshToken', refreshToken);

      set({
        token: accessToken,
        user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error: any) {
      const message =
        error.response?.data?.message ||
        error.message ||
        'Login failed. Please try again.';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  register: async (data: RegisterRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/register`, {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        parentRelationship: data.parentRelationship,
      });

      const { accessToken, refreshToken, user } = response.data;

      // Save tokens securely
      await SecureStore.setItemAsync('accessToken', accessToken);
      await SecureStore.setItemAsync('refreshToken', refreshToken);

      set({
        token: accessToken,
        user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error: any) {
      const message =
        error.response?.data?.message ||
        error.message ||
        'Registration failed. Please try again.';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      // Call logout endpoint
      const token = get().token;
      if (token) {
        await axios.post(
          `${API_BASE_URL}/auth/logout`,
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      }

      // Clear secure storage
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');

      set({
        user: null,
        isAuthenticated: false,
        token: null,
        isLoading: false,
      });
    } catch (error: any) {
      console.error('Logout error:', error);
      // Clear state anyway
      set({
        user: null,
        isAuthenticated: false,
        token: null,
        isLoading: false,
      });
    }
  },

  refreshToken: async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        refreshToken,
      });

      const { accessToken } = response.data;
      await SecureStore.setItemAsync('accessToken', accessToken);

      set({ token: accessToken });
    } catch (error: any) {
      // If refresh fails, logout the user
      await get().logout();
      throw error;
    }
  },

  requestPasswordReset: async (email: string) => {
    set({ isLoading: true, error: null });
    try {
      await axios.post(`${API_BASE_URL}/auth/forgot-password`, { email });
      set({ isLoading: false });
    } catch (error: any) {
      const message =
        error.response?.data?.message ||
        'Password reset request failed. Please try again.';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  resetPassword: async (token: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      await axios.post(`${API_BASE_URL}/auth/reset-password`, {
        token,
        password,
      });
      set({ isLoading: false });
    } catch (error: any) {
      const message =
        error.response?.data?.message ||
        'Password reset failed. Please try again.';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  getCurrentUser: async () => {
    set({ isLoading: true });
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (!token) {
        set({ isLoading: false });
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      set({
        user: response.data,
        isAuthenticated: true,
        token,
        isLoading: false,
      });
    } catch (error: any) {
      set({ isLoading: false });
      // Token might be expired, try to refresh
      try {
        await get().refreshToken();
        await get().getCurrentUser();
      } catch {
        await get().logout();
      }
    }
  },

  setUser: (user: User | null) => {
    set({ user });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  clearError: () => {
    set({ error: null });
  },
}));
