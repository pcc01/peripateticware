import { useCallback } from 'react'
import { useAuthStore } from '@stores/authStore'
import { apiClient } from '@/config/api'
import { LoginRequest, RegisterRequest, User } from '@types/auth'

export const useAuth = () => {
  const { user, token, isAuthenticated, isLoading, error, setUser, setToken, setLoading, setError, clearAuth } =
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
  }
}
