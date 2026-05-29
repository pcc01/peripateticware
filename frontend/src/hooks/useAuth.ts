
// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { useCallback } from 'react'
import { useAuthStore } from '@stores/auth'
import { apiClient } from '@/config/api'
import { LoginRequest, RegisterRequest, User } from '@/types/auth'

export const useAuth = () => {
  const { user, token, isAuthenticated, isLoading, error, setUser, setToken, setLoading, setError, clearAuth, checkAuth } =
    useAuthStore()

  const login = useCallback(
    async (credentials: LoginRequest) => {
      setLoading(true)
      setError(null)
      try {
        const response = await apiClient.post('/auth/login', credentials)
        const { access_token, expires_in } = response.data

        // Store token
        localStorage.setItem('auth_token', access_token)
        setToken(access_token)

        // Fetch user data
        const userResponse = await apiClient.get('/auth/me')
        const userData = userResponse.data.data || userResponse.data

        // Store user
        localStorage.setItem('user', JSON.stringify(userData))
        setUser(userData)

        return userData
      } catch (err: any) {
        const errorMessage = err.response?.data?.detail || 'Login failed'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [setUser, setToken, setLoading, setError]
  )

  const register = useCallback(
    async (data: RegisterRequest) => {
      setLoading(true)
      setError(null)
      try {
        const response = await apiClient.post('/auth/register', data)
        return response.data.data || response.data
      } catch (err: any) {
        const errorMessage = err.response?.data?.detail || 'Registration failed'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [setLoading, setError]
  )

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user')
    clearAuth()
  }, [clearAuth])

  const refreshUser = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const response = await apiClient.get('/auth/me')
      const userData = response.data.data || response.data
      setUser(userData)
      localStorage.setItem('user', JSON.stringify(userData))
      return userData
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Failed to refresh user data'
      setError(errorMessage)
      throw err
    }
  }, [isAuthenticated, setUser, setError])

  // ✅ PHASE 0 FIX: Verify token and restore session from localStorage on app mount
  // This is called from App.tsx useEffect on component mount
  // It ensures auth persists across page reloads
  const verifyToken = useCallback(async () => {
    const token = localStorage.getItem('auth_token')
    const user = localStorage.getItem('user')

    if (!token || !user) {
      clearAuth()
      return
    }

    setLoading(true)
    try {
      // Verify token is still valid by calling /auth/me
      const response = await apiClient.get('/auth/me')
      const userData = response.data.data || response.data
      
      // Token is valid, restore session
      setUser(userData)
      setToken(token)
    } catch (err: any) {
      // Token is expired or invalid, clear auth
      console.log('[useAuth] Token verification failed, clearing auth')
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user')
      clearAuth()
    } finally {
      setLoading(false)
    }
  }, [setUser, setToken, setLoading, clearAuth])

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    refreshUser,
    checkAuth: verifyToken,  // ✅ PHASE 0 FIX: Export as checkAuth for App.tsx to call on mount
  }
}
