import { UserRole, SessionStatus } from '@/config/constants'

export interface User {
  user_id: string
  email: string
  username: string
  full_name: string
  role: UserRole
  created_at: string
  updated_at: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  username: string
  password: string
  full_name: string
  role: UserRole
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}
