// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User, AuthState } from '@types/auth'

interface AuthStore extends AuthState {
  login: (credentials: { email: string; password: string }) => Promise<void>
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  clearAuth: () => void
}

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      ...initialState,

      login: async (credentials: { email: string; password: string }) => {
        set({ isLoading: true, error: null })
        try {
          const response = await fetch('http://localhost:8000/api/v1/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(credentials),
          })

          if (!response.ok) {
            throw new Error('Login failed')
          }

          const data = await response.json()
          
          set({
            token: data.access_token,
            user: {
              id: data.user.id,
              email: data.user.email,
              name: `${data.user.first_name} ${data.user.last_name}`,
              role: data.user.role,
              school_id: 'default',
              created_at: data.user.created_at,
            },
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })

          // Store token in localStorage
          localStorage.setItem('auth_token', data.access_token)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Login failed'
          set({
            isLoading: false,
            error: errorMessage,
            isAuthenticated: false,
          })
          throw error
        }
      },

      setUser: (user) =>
        set({
          user,
          isAuthenticated: user !== null,
        }),

      setToken: (token) =>
        set({
          token,
          isAuthenticated: token !== null,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      clearAuth: () => set(initialState),
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)