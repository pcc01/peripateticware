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
  // Coarse band only (k-2/3-5/6-8/9-12), never an exact grade/birth date/age
  // (PERI_OFFLINE_SPEC_v2.md "Mixed-age groups"). null when not derivable
  // (no homeschool or classroom grade on file), which is normal, not an error.
  grade_band?: string | null;
  // Reuses the same age/consent check chat's AI-sharing gate already runs
  // server-side (_is_third_party_ai_sharing_permitted) --
  // PERI_SPONTANEOUS_DISCOVERY_SPEC_v1.md Design C's gate for "Use my
  // location". Defaults true when absent (older server/cached response).
  can_use_location_gps?: boolean;
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
