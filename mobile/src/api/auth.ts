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

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  await setToken(data.access_token);
  return data;
}

export async function logout(): Promise<void> {
  await clearToken();
}
