import { create } from 'zustand'

/**
 * Peripateticware Auth Store â€” Zustand
 * 
 * Features:
 * âœ… Persistent token & user in localStorage
 * âœ… Automatic session restore on page load
 * âœ… Login with email or username
 * âœ… API calls use /api/auth/* (vite proxy rewrites to /api/v1/auth/*)
 * âœ… Proper error handling with backend messages
 * âœ… Logout method
 * âœ… Works with App.tsx routing guards
 */

export interface User {
  id?: string
  email: string
  first_name?: string
  last_name?: string
  name?: string
  role: string  // Accept any role format (uppercase or lowercase)
}

export interface AuthStore {
  // State
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Setters
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
  clearAuth: () => void

  // Auth methods
  login: (credentials: {
    email?: string
    username?: string
    password: string
  }) => Promise<void>

  signup: (data: {
    email: string
    password: string
    password_confirm?: string
    first_name?: string
    last_name?: string
    name?: string
    role?: 'STUDENT' | 'TEACHER' | 'PARENT' | 'ADMIN'
  }) => Promise<void>

  logout: () => void
  checkAuth: () => Promise<void>
}

const STORAGE_KEY_TOKEN = 'auth_token'
const STORAGE_KEY_USER = 'auth_user'

/**
 * Create the auth store with localStorage persistence
 */
export const useAuthStore = create<AuthStore>((set, get) => {
  // Try to restore auth from localStorage on store creation
  const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN)
  const savedUser = localStorage.getItem(STORAGE_KEY_USER)

  return {
    // âœ… Initialize from localStorage if available
    user: savedUser ? JSON.parse(savedUser) : null,
    token: savedToken,
    isAuthenticated: !!(savedToken && savedUser),
    isLoading: false,
    error: null,

    // ============================================================
    // SETTERS
    // ============================================================

    setUser: (user: User | null) => {
      set({ user, isAuthenticated: !!user })
      if (user) {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user))
      } else {
        localStorage.removeItem(STORAGE_KEY_USER)
      }
    },

    setToken: (token: string | null) => {
      set({ token })
      if (token) {
        localStorage.setItem(STORAGE_KEY_TOKEN, token)
      } else {
        localStorage.removeItem(STORAGE_KEY_TOKEN)
      }
    },

    setLoading: (isLoading: boolean) => {
      set({ isLoading })
    },

    setError: (error: string | null) => {
      set({ error })
    },

    clearError: () => {
      set({ error: null })
    },

    clearAuth: () => {
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        error: null,
      })
      localStorage.removeItem(STORAGE_KEY_TOKEN)
      localStorage.removeItem(STORAGE_KEY_USER)
    },

    // ============================================================
    // LOGIN
    // ============================================================

    login: async (credentials: {
      email?: string
      username?: string
      password: string
    }) => {
      set({ isLoading: true, error: null })

      try {
        // âœ… Support both email and username
        const body = {
          ...(credentials.email && { email: credentials.email }),
          ...(credentials.username && { username: credentials.username }),
          password: credentials.password,
        }

        // âœ… API endpoint: /api/auth/login â†’ rewritten to /api/v1/auth/login by vite proxy
        const response = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMsg =
            errorData.detail ||
            errorData.message ||
            `Login failed (${response.status})`
          throw new Error(errorMsg)
        }

        const data = await response.json()

        // âœ… FIXED: Backend returns user_id, email, role at top level (not nested in "user" object)
        const token = data.access_token || data.token

        if (!token) {
          throw new Error('Invalid login response: missing access_token')
        }

        // âœ… Construct user object from response fields
        const user: User = {
          id: data.user_id,
          email: data.email,
          role: (data.role || 'STUDENT').toLowerCase(),
        }

        if (!user.id || !user.email || !user.role) {
          throw new Error('Invalid login response: missing user fields')
        }

        set({
          user,
          token,
          isAuthenticated: true,
          error: null,
        })

        localStorage.setItem(STORAGE_KEY_TOKEN, token)
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user))
      } catch (err: any) {
        const errorMsg = err.message || 'Login failed'
        set({ error: errorMsg, isLoading: false })
        throw err
      } finally {
        set({ isLoading: false })
      }
    },

    // ============================================================
    // SIGNUP
    // ============================================================

    signup: async (data: {
      email: string
      password: string
      password_confirm?: string
      first_name?: string
      last_name?: string
      name?: string
      role?: 'STUDENT' | 'TEACHER' | 'PARENT' | 'ADMIN'
    }) => {
      set({ isLoading: true, error: null })

      try {
        // âœ… API endpoint: /api/auth/signup â†’ rewritten to /api/v1/auth/signup by vite proxy
        const response = await fetch('/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: data.email,
            password: data.password,
            password_confirm: data.password_confirm,
            first_name: data.first_name,
            last_name: data.last_name,
            name: data.name,
            role: (data.role || 'STUDENT').toLowerCase(),
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMsg =
            errorData.detail ||
            errorData.message ||
            `Signup failed (${response.status})`
          throw new Error(errorMsg)
        }

        const result = await response.json()

        // âœ… FIXED: Same as login â€” backend returns user_id, email, role at top level
        const token = result.access_token || result.token

        if (!token) {
          throw new Error('Invalid signup response: missing access_token')
        }

        const user: User = {
          id: result.user_id,
          email: result.email,
          role: (result.role || 'STUDENT').toLowerCase(),
        }

        if (!user.id || !user.email || !user.role) {
          throw new Error('Invalid signup response: missing user fields')
        }

        set({
          user,
          token,
          isAuthenticated: true,
          error: null,
        })

        localStorage.setItem(STORAGE_KEY_TOKEN, token)
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user))
      } catch (err: any) {
        const errorMsg = err.message || 'Signup failed'
        set({ error: errorMsg, isLoading: false })
        throw err
      } finally {
        set({ isLoading: false })
      }
    },

    // ============================================================
    // LOGOUT
    // ============================================================

    logout: () => {
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        error: null,
      })
      localStorage.removeItem(STORAGE_KEY_TOKEN)
      localStorage.removeItem(STORAGE_KEY_USER)
    },

    // ============================================================
    // CHECK AUTH (RESTORE SESSION ON APP LOAD)
    // ============================================================

    checkAuth: async () => {
      const currentToken = get().token
      const currentUser = get().user

      // âœ… If no token/user, nothing to check
      if (!currentToken || !currentUser) {
        return
      }

      set({ isLoading: true })

      try {
        // âœ… Verify token is still valid by fetching user profile
        const response = await fetch('/auth/me', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentToken}`,
          },
        })

        if (!response.ok) {
          // âœ… Token expired or invalid â€” clear auth
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            error: null,
          })
          localStorage.removeItem(STORAGE_KEY_TOKEN)
          localStorage.removeItem(STORAGE_KEY_USER)
          return
        }

        const data = await response.json()

        // âœ… Token still valid â€” update user if changed
        if (data.user) {
          set({ user: data.user })
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(data.user))
        }
      } catch (err: any) {
        console.warn('Auth check failed:', err.message)
        // Don't clear auth on network error, just continue
      } finally {
        set({ isLoading: false })
      }
    },
  }
})

/**
 * Helper hook to get auth token for use in fetch calls
 * Usage: const token = useAuthToken()
 */
export const useAuthToken = () => {
  const token = useAuthStore((state) => state.token)
  return token
}

/**
 * Helper hook to check if user is authenticated
 * Usage: const isAuth = useIsAuthenticated()
 */
export const useIsAuthenticated = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  return isAuthenticated
}

/**
 * Helper hook to get current user
 * Usage: const user = useCurrentUser()
 */
export const useCurrentUser = () => {
  const user = useAuthStore((state) => state.user)
  return user
}