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

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  return AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  return AsyncStorage.removeItem(TOKEN_KEY);
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
    throw new Error(body?.detail ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}
