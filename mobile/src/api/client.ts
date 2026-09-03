// src/api/client.ts
// Base API client — reads token from AsyncStorage, points at backend
//
// API URL resolution order:
//   1. EXPO_PUBLIC_API_URL env var (set in mobile/.env)
//   2. app.json extra.apiUrl (fallback for EAS builds)
//   3. Hardcoded LAN IP (last resort — update to your machine's IP)
//
// To find your LAN IP:  macOS/Linux: ifconfig | grep "inet " | grep -v 127.0.0.1
//                       Windows:     ipconfig | findstr "IPv4"

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const FALLBACK_IP = '192.168.50.40'; // <- update if your IP changes
const DEFAULT_BASE = `http://${FALLBACK_IP}:8000`;

export const API_BASE: string =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  DEFAULT_BASE;

// Log in dev so you can confirm the right URL is in use
if (__DEV__) {
  console.log('[API] Base URL:', API_BASE);
}

export const TOKEN_KEY = 'auth_token';
export const USER_KEY = 'auth_user';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  return AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  return AsyncStorage.removeItem(TOKEN_KEY);
}

/** Cached user profile (id/email/role) — persisted so a cold start with no
 *  network can still restore an authenticated session instead of bouncing
 *  to the login screen. Corrected/cleared by the next successful /auth/me. */
export async function getStoredUser<T = unknown>(): Promise<T | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setStoredUser(user: unknown): Promise<void> {
  return AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function clearStoredUser(): Promise<void> {
  return AsyncStorage.removeItem(USER_KEY);
}

/** Thrown by apiFetch for a non-2xx response — carries the HTTP status so
 *  callers can tell an auth rejection (401/403) from a server error, and
 *  both of those from a network failure (a plain TypeError from fetch). */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}
