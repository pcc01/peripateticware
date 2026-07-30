// src/api/auth.ts

import { apiFetch, setToken, clearToken } from './client';

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
  role: string;
  expires_in: number;
}

export interface MeResponse {
  user_id: string;
  email: string;
  role: string;
  org_id: string | null;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  await setToken(data.access_token);
  return data;
}

/** The JWT itself only carries the user id (see backend/core/security.py's
 * create_access_token call site) — email/role are NOT embedded in it, so a
 * restored session can't recover them by decoding the token locally. This
 * mirrors what the web frontend's checkAuth() already does on every mount. */
export async function getCurrentUser(): Promise<MeResponse> {
  return apiFetch<MeResponse>('/api/v1/auth/me');
}

export async function logout(): Promise<void> {
  await clearToken();
}
