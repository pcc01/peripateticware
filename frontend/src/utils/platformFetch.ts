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
/** Fired whenever clearPlatformSecret() runs, so PlatformShell (which only
 * reads sessionStorage once, on mount) can react without requiring a full
 * page reload -- see clearPlatformSecret()'s docstring below. */
export const PLATFORM_SECRET_CLEARED_EVENT = 'pw:platform-secret-cleared';

/** null = never asked this session; '' = user chose to continue without one */
export function getPlatformSecret(): string | null {
  return sessionStorage.getItem(SECRET_KEY);
}

export function setPlatformSecret(secret: string): void {
  sessionStorage.setItem(SECRET_KEY, secret);
}

/**
 * Clears the stored secret AND notifies any mounted PlatformShell via a
 * window event. Without the event, PlatformShell's `secretEntered` state
 * (set once from sessionStorage on mount) never learns the stored value
 * was invalidated -- client-side nav between /platform/* tabs doesn't
 * remount the shell, so every subsequent request keeps 403ing with no UI
 * path back to the entry prompt short of a manual hard refresh.
 */
export function clearPlatformSecret(): void {
  sessionStorage.removeItem(SECRET_KEY);
  window.dispatchEvent(new Event(PLATFORM_SECRET_CLEARED_EVENT));
}

/**
 * Decodes the `is_platform_admin` claim out of a JWT without verifying its
 * signature (browser-side only -- same technique hooks/useSessionSecurity.ts
 * already uses for `exp`). Used by PlatformShell as a client-side route
 * guard: the real enforcement is server-side (get_current_platform_admin on
 * every /platform/* request), but nothing today stops an unauthenticated or
 * non-platform-admin user from navigating to /platform and seeing the shell
 * UI itself (nav tabs, page chrome, disabled action buttons) even though
 * every actual data request behind it 403s. This closes that off at the
 * route level instead of relying on every page's own error state.
 */
export function isPlatformAdminToken(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload?.is_platform_admin === true;
  } catch {
    return false;
  }
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
