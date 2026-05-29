import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { authApi, User, RegisterPayload } from '../services/api';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  loading: false,
  error: null,

  hydrate: async () => {
    const token = await SecureStore.getItemAsync('auth_token');
    const userJson = await SecureStore.getItemAsync('auth_user');
    if (token && userJson) {
      set({ token, user: JSON.parse(userJson) });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { access_token, user } = await authApi.login(email, password);
      await SecureStore.setItemAsync('auth_token', access_token);
      await SecureStore.setItemAsync('auth_user', JSON.stringify(user));
      set({ token: access_token, user, loading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.detail ?? 'Login failed',
        loading: false,
      });
      throw err;
    }
  },

  register: async (payload) => {
    set({ loading: true, error: null });
    try {
      const { access_token, user } = await authApi.register(payload);
      await SecureStore.setItemAsync('auth_token', access_token);
      await SecureStore.setItemAsync('auth_user', JSON.stringify(user));
      set({ token: access_token, user, loading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.detail ?? 'Registration failed',
        loading: false,
      });
      throw err;
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('auth_user');
    set({ user: null, token: null });
  },

  clearError: () => set({ error: null }),
}));
