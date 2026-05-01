# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

import { create } from 'zustand';
import { AuthState, User, LoginRequest, SignUpRequest } from '../../types/auth';
import { authService } from '../../services/auth';

interface AuthStore extends AuthState {
  login: (credentials: LoginRequest) => Promise<void>;
  signup: (data: SignUpRequest) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: localStorage.getItem('auth_token') || null,
  isLoading: false,
  error: null,
  isAuthenticated: !!localStorage.getItem('auth_token'),

  async login(credentials) {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login(credentials);
      localStorage.setItem('auth_token', response.token);
      set({
        user: response.user,
        token: response.token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({
        error: message,
        isLoading: false,
        isAuthenticated: false,
      });
      throw err;
    }
  },

  async signup(data) {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.signup(data);
      localStorage.setItem('auth_token', response.token);
      set({
        user: response.user,
        token: response.token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      set({
        error: message,
        isLoading: false,
        isAuthenticated: false,
      });
      throw err;
    }
  },

  logout() {
    localStorage.removeItem('auth_token');
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      error: null,
    });
  },

  clearError() {
    set({ error: null });
  },

  setUser(user) {
    set({ user });
  },
}));
