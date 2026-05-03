// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { create } from 'zustand'

export interface User {
  user_id: string
  email: string
  username: string
  full_name: string
  role: 'teacher' | 'student' | 'parent' | 'admin'
  is_active: boolean
}

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
  
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  clearError: () => void
  setUser: (user: User | null) => void
  checkAuth: () => Promise<void>
}

const API_BASE = 'http://localhost:8000/api/v1'

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ loading: true, error: null })
    try {
      console.log('[Auth] Starting login for:', email)
      console.log('[Auth] Sending payload:', { email, password })
      
      // Send login request - EXACT format backend expects
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      console.log('[Auth] Response status:', response.status)

      if (!response.ok) {
        const errorData = await response.json()
        console.error('[Auth] Backend error:', errorData)
        throw new Error(errorData.detail || 'Login failed')
      }

      const data = await response.json()
      console.log('[Auth] Login successful, received token')
      
      // Store token
      localStorage.setItem('auth_token', data.access_token)
      console.log('[Auth] Token stored in localStorage')

      // Fetch user profile
      console.log('[Auth] Fetching user profile with token...')
      const userResponse = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${data.access_token}`
        }
      })

      console.log('[Auth] User profile response status:', userResponse.status)

      if (!userResponse.ok) {
        const errorData = await userResponse.json()
        console.error('[Auth] Failed to fetch user:', errorData)
        throw new Error('Failed to fetch user profile')
      }

      const userData = await userResponse.json()
      console.log('[Auth] User profile received:', userData)
      
      set({
        user: userData,
        isAuthenticated: true,
        loading: false,
        error: null
      })
      
      console.log('[Auth] LOGIN COMPLETE ✅')
    } catch (error: any) {
      const errorMessage = error.message || 'Login failed'
      console.error('[Auth] ERROR:', errorMessage)
      
      set({
        error: errorMessage,
        loading: false,
        isAuthenticated: false,
        user: null
      })
      throw error
    }
  },

  logout: () => {
    console.log('[Auth] Logging out')
    localStorage.removeItem('auth_token')
    set({
      user: null,
      isAuthenticated: false,
      error: null
    })
  },

  clearError: () => set({ error: null }),

  setUser: (user: User | null) => {
    set({
      user,
      isAuthenticated: !!user
    })
  },

  checkAuth: async () => {
    set({ loading: true })
    try {
      const token = localStorage.getItem('auth_token')
      
      if (!token) {
        console.log('[Auth] No token in localStorage')
        set({ loading: false, isAuthenticated: false })
        return
      }

      console.log('[Auth] Checking token validity...')
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        console.error('[Auth] Token invalid')
        localStorage.removeItem('auth_token')
        set({ loading: false, isAuthenticated: false })
        return
      }

      const userData = await response.json()
      console.log('[Auth] Token valid, user:', userData.email)
      
      set({
        user: userData,
        isAuthenticated: true,
        loading: false
      })
    } catch (error) {
      console.error('[Auth] checkAuth error:', error)
      localStorage.removeItem('auth_token')
      set({
        loading: false,
        isAuthenticated: false
      })
    }
  }
}))