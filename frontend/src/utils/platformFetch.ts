// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1
//
// platformFetch — the single way to call /api/v1/platform/* endpoints.
//
// The backend guards these routes with THREE checks (core/dependencies.py:
// get_current_platform_admin):
//   1. A valid JWT           → we attach Authorization: Bearer <token>
//   2. users.is_platform_admin = TRUE on that user
//   3. X-Platform-Secret header matching PLATFORM_API_SECRET (when configured)
//
// The secret is entered once per browser session (PlatformShell shows the
// prompt) and kept ONLY in sessionStorage — never in code, localStorage,
// or the bundle. Closing the tab forgets it.

import { useAuthStore } from '@/stores/auth';

const SECRET_KEY = 'pw_platform_secret';

/** null = never asked this session; '' = user chose to continue without one */
export function getPlatformSecret(): string | null {
  return sessionStorage.getItem(SECRET_KEY);
}

export function setPlatformSecret(secret: string): void {
  sessionStorage.setItem(SECRET_KEY, secret);
}

export function clearPlatformSecret(): void {
  sessionStorage.removeItem(SECRET_KEY);
}

/**
 * fetch() wrapper for platform-admin endpoints.
 * Attaches Authorization + X-Platform-Secret automatically.
 */
export function platformFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) ?? {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
  const secret = getPlatformSecret();
  if (secret) headers['X-Platform-Secret'] = secret;
  return fetch(url, { ...init, headers });
}
