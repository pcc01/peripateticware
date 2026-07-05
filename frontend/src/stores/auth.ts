import { create } from 'zustand'

/**
 * Peripateticware Auth Store â€" Zustand
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
  full_name?: string
  first_name?: string
  last_name?: string
  name?: string
  role: string  // Accept any role format (uppercase or lowercase)
  org_id?: string | null  // null = standalone teacher / platform admin
  is_active?: boolean
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
    role?: 'STUDENT' | 'TEACHER' | 'PARENT' | 'ADMIN' | 'HOMESCHOOL'
    age_group?: string
    school_name?: string
    country_code?: string
    subdivision_code?: string
    has_under_13?: boolean
    org_type_v2?: string
    ip_country_hint?: string
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

        // Direct API endpoint — no proxy dependency
        const response = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const detail = errorData?.detail
          // COPPA: student account awaiting parental consent
          if (detail === 'parental_consent_required') {
            const email = credentials.email || ''
            // Derive a deterministic 64-char hex token from the email for the consent URL.
            // The authoritative hash is stored on the backend; this is a display-only redirect.
            const emailBytes = new TextEncoder().encode(email.toLowerCase())
            const hashBuffer = await crypto.subtle.digest('SHA-256', emailBytes).catch(() => null)
            let studentHash = '0'.repeat(64)
            if (hashBuffer) {
              studentHash = Array.from(new Uint8Array(hashBuffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('')
            }
            set({ isLoading: false })
            window.location.href = `/parent-consent/${studentHash}`
            return
          }
          const errorMsg =
            detail ||
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
          org_id: data.org_id ?? null,
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
      role?: 'STUDENT' | 'TEACHER' | 'PARENT' | 'ADMIN' | 'HOMESCHOOL'
      school_name?: string
      country_code?: string
      subdivision_code?: string
      has_under_13?: boolean
      org_type_v2?: string
      ip_country_hint?: string
      invite_token?: string
    }) => {
      set({ isLoading: true, error: null })

      try {
        const response = await fetch('/api/v1/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: data.email,
            password: data.password,
            password_confirm: data.password_confirm,
            first_name: data.first_name,
            last_name: data.last_name,
            name: data.name,
            role: (data.role || 'TEACHER').toUpperCase(),
            school_name: data.school_name,
            country_code: data.country_code,
            subdivision_code: data.subdivision_code,
            has_under_13: data.has_under_13,
            org_type_v2: data.org_type_v2,
            ip_country_hint: data.ip_country_hint,
            invite_token: data.invite_token,
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

        const token = result.access_token || result.token

        if (!token) {
          throw new Error('Invalid signup response: missing access_token')
        }

        const user: User = {
          id: result.user_id,
          email: result.email,
          role: (result.role || 'TEACHER').toLowerCase(),
          org_id: result.org_id ?? null,
          is_active: result.is_active ?? false,
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
          // âœ… Token expired or invalid â€" clear auth
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

        // /auth/me returns { user_id, email, role } at top level
        const freshUser: User = {
          id: data.user_id ?? get().user?.id,
          email: data.email ?? get().user?.email ?? '',
          role: data.role ? data.role.toLowerCase() : (get().user?.role ?? ''),
          org_id: data.org_id !== undefined ? (data.org_id ?? null) : get().user?.org_id,
        }
        set({ user: freshUser, isAuthenticated: true })
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(freshUser))
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
 * Convenience selector — returns the current raw JWT token.
 * Usage: const token = useAuthToken()
 */
export const useAuthToken = (): string | null => {
  return useAuthStore((state) => state.token)
}

/**
 * Convenience selector — returns true when the user is logged in.
 * Usage: const isLoggedIn = useIsAuthenticated()
 */
export const useIsAuthenticated = (): boolean => {
  return useAuthStore((state) => !!state.user && !!state.token)
}
