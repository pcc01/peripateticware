// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

export type UserRole = 'TEACHER' | 'STUDENT' | 'PARENT' | 'ADMIN'

// ============================================================================
// USER
// ============================================================================
export interface User {
  user_id?: string
  id?: string
  email: string
  username: string
  full_name: string
  name?: string
  role: UserRole
  is_active: boolean
  created_at?: string
  updated_at?: string
  avatar_url?: string
  school_id?: string
}

// ============================================================================
// AUTH REQUESTS/RESPONSES
// ============================================================================
export interface LoginRequest {
  username: string  // ✅ Changed from email to username (backend accepts username)
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: User
}

export interface RegisterRequest {
  email: string
  username: string
  full_name: string
  password: string
  role: UserRole
}

export interface RegisterResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: User
}

export interface SignUpRequest extends RegisterRequest {}

export interface SignUpResponse extends RegisterResponse {}

// ============================================================================
// AUTH STATE
// ============================================================================
export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

// ============================================================================
// SCHOOL
// ============================================================================
export interface School {
  id: string
  name: string
  district: string
  location: string
}