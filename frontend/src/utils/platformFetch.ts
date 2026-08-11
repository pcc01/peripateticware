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
 *
 * Self-healing for a stale secret: getPlatformSecret() !== null (including ''
 * from a past "continue without a secret" click) makes PlatformShell skip its
 * prompt entirely — which silently 403s forever with no way to fix it from the
 * UI if PLATFORM_API_SECRET got configured (or changed) after that choice was
 * stored. When the backend's specific "wrong secret" 403 comes back, clear the
 * stored value so the next /platform visit shows the prompt again.
 */
export function platformFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) ?? {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
  const secret = getPlatformSecret();
  if (secret) headers['X-Platform-Secret'] = secret;

  return fetch(url, { ...init, headers }).then(res => {
    if (res.status === 403) {
      res.clone().json().then(body => {
        if (body?.detail === 'Invalid platform secret.') clearPlatformSecret();
      }).catch(() => {/* not JSON / already consumed — ignore */});
    }
    return res;
  });
}
