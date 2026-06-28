// File: frontend/src/services/auth.ts
// Purpose: API calls for authentication including email confirmation and password reset

const API_BASE_URL = '/api/v1';

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    username: string;
    full_name: string;
    role: string;
    is_active: boolean;
  };
}

export interface RegisterPayload {
  email: string;
  username: string;
  full_name: string;
  password: string;
  role: 'STUDENT' | 'TEACHER' | 'PARENT' | 'ADMIN';
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  new_password: string;
}

export interface ConfirmEmailPayload {
  token: string;
}

// ============================================================================
// REGISTER
// ============================================================================
export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Registration failed');
  }

  return response.json();
}

// ============================================================================
// LOGIN
// ============================================================================
export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Login failed');
  }

  return response.json();
}

// ============================================================================
// CONFIRM EMAIL
// ============================================================================
export async function confirmEmail(payload: ConfirmEmailPayload): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/confirm-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Email confirmation failed');
  }

  return response.json();
}

// ============================================================================
// FORGOT PASSWORD
// ============================================================================
export async function forgotPassword(payload: ForgotPasswordPayload): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Forgot password request failed');
  }

  return response.json();
}

// ============================================================================
// RESET PASSWORD
// ============================================================================
export async function resetPassword(payload: ResetPasswordPayload): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Password reset failed');
  }

  return response.json();
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================
export function saveToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

export function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function removeToken(): void {
  localStorage.removeItem('auth_token');
}

/** Alias for removeToken — clears the stored JWT and any session state. */
export function logout(): void {
  removeToken();
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
