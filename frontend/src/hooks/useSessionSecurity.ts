// Copyright (c) 2026 Paul Christopher Cerda
/**
 * useSessionSecurity
 *
 * Handles three concerns for authenticated pages:
 *
 * 1. Idle timeout  — user gets a 2-minute warning after IDLE_MINUTES of no
 *    mouse/keyboard/touch activity, then is logged out automatically.
 *
 * 2. Silent token refresh — the backend's access token (ACCESS_TOKEN_EXPIRE_
 *    MINUTES, 60 by default) is short relative to how long someone might
 *    spend writing a single blog post or lesson plan. While the user is
 *    NOT idle, the token is refreshed in the background a few minutes
 *    before it expires, so being actively present never trips the expiry
 *    logout below and loses whatever's unsaved on screen.
 *
 * 3. Token expiry  — decodes the JWT exp claim on mount and on every focus
 *    event; triggers forced logout (with a toast) the moment the token
 *    actually expires. With #2 in place this should now only fire for a
 *    token that expired while the tab was idle or backgrounded (silent
 *    refresh only runs for an active user), not mid-edit.
 *
 * Usage — call once near the root of each authenticated layout:
 *
 *   import { useSessionSecurity } from '@/hooks/useSessionSecurity';
 *   useSessionSecurity();
 */

import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { authApi } from '@/services/api';
import { useTranslation } from 'react-i18next';

// ── Configuration ────────────────────────────────────────────────────────────
const IDLE_MINUTES        = 30;         // warn after this many idle minutes
const WARN_SECONDS        = 120;        // countdown before auto-logout (seconds)
const CHECK_INTERVAL_MS   = 10_000;     // how often to poll idle + expiry
const REFRESH_LEAD_SECONDS = 300;       // silently refresh once this close to expiry (if active)

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Decode JWT payload without verifying signature (browser-side only). */
function getTokenExp(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Show a dismissible banner/toast in the DOM (no external dep required). */
function showWarningBanner(secondsLeft: number, onExtend: () => void, onLogout: () => void): () => void {
  const existing = document.getElementById('__session-warning__');
  if (existing) {
    const counter = existing.querySelector<HTMLSpanElement>('#__session-countdown__');
    if (counter) counter.textContent = String(secondsLeft);
    return () => {};
  }

  const banner = document.createElement('div');
  banner.id = '__session-warning__';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');
  banner.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    z-index: 99999; background: #1e293b; color: #f8fafc;
    padding: 14px 20px; border-radius: 10px; display: flex; align-items: center;
    gap: 14px; box-shadow: 0 4px 24px rgba(0,0,0,0.4); font-size: 14px;
    max-width: 480px; width: calc(100% - 48px);
  `;
  banner.innerHTML = `
    <span>⏱ Session expiring in <strong><span id="__session-countdown__">${secondsLeft}</span>s</strong> due to inactivity.</span>
    <button id="__session-extend__" style="background:#3b82f6;border:none;color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;white-space:nowrap">Stay signed in</button>
    <button id="__session-logout__" style="background:transparent;border:1px solid #64748b;color:#cbd5e1;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;white-space:nowrap">Sign out</button>
  `;
  document.body.appendChild(banner);

  const extendBtn = document.getElementById('__session-extend__');
  const logoutBtn = document.getElementById('__session-logout__');
  extendBtn?.addEventListener('click', onExtend);
  logoutBtn?.addEventListener('click', onLogout);

  return () => banner.remove();
}

function removeWarningBanner() {
  document.getElementById('__session-warning__')?.remove();
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSessionSecurity() {
  const { token, logout, setToken } = useAuthStore();
  const navigate = useNavigate();

  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef  = useRef<boolean>(false);
  const cleanupBannerRef = useRef<(() => void) | null>(null);
  const refreshingRef    = useRef<boolean>(false);

  /** Reset idle timer on any user activity */
  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (warningShownRef.current) {
      warningShownRef.current = false;
      removeWarningBanner();
      cleanupBannerRef.current = null;
    }
  }, []);

  const doLogout = useCallback((reason: 'idle' | 'expired') => {
    removeWarningBanner();
    logout();
    navigate(`/login?reason=${reason}`);
  }, [logout, navigate]);

  /** Exchange the still-valid token for a fresh one, extending the session
   *  without interrupting whatever the user is doing. Silent no-op on
   *  failure -- the next expiry check just falls through to doLogout as
   *  before, so this can never make things worse than the old behavior. */
  const tryRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const { access_token } = await authApi.refreshToken();
      setToken(access_token);
    } catch {
      // Token may have just expired, or the network hiccuped -- either way,
      // the interval's own expiry check handles the fallback.
    } finally {
      refreshingRef.current = false;
    }
  }, [setToken]);

  useEffect(() => {
    if (!token) return;

    // ── Activity listeners ───────────────────────────────────────────────────
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetActivity, { passive: true }));

    // ── Periodic check ───────────────────────────────────────────────────────
    const interval = setInterval(() => {
      const now     = Date.now();
      const idleMs  = now - lastActivityRef.current;
      const idleMin = idleMs / 60_000;

      // ── Token expiry check ───────────────────────────────────────────────
      const exp = getTokenExp(token);
      if (exp !== null) {
        const secondsLeft = exp - now / 1000;
        if (secondsLeft <= 0) {
          doLogout('expired');
          return;
        }
        // Still-present user, token nearing expiry -- refresh quietly rather
        // than waiting for the wall clock to force a logout mid-edit. Not
        // done while idle: an idle tab should still expire on schedule.
        if (secondsLeft <= REFRESH_LEAD_SECONDS && idleMin < IDLE_MINUTES) {
          tryRefresh();
        }
      }

      // ── Idle warning + countdown ─────────────────────────────────────────
      if (idleMin >= IDLE_MINUTES) {
        const overMs      = idleMs - IDLE_MINUTES * 60_000;
        const secondsLeft = Math.max(0, WARN_SECONDS - Math.floor(overMs / 1000));

        if (secondsLeft === 0) {
          doLogout('idle');
          return;
        }

        if (!warningShownRef.current) {
          warningShownRef.current = true;
          cleanupBannerRef.current = showWarningBanner(
            secondsLeft,
            resetActivity,   // "Stay signed in" extends session
            () => doLogout('idle'),
          );
        } else {
          // Update countdown in existing banner
          const el = document.getElementById('__session-countdown__');
          if (el) el.textContent = String(secondsLeft);
        }
      }
    }, CHECK_INTERVAL_MS);

    // ── Visibility / focus: re-check token expiry when tab regains focus ────
    const onFocus = () => {
      const exp = getTokenExp(token);
      if (exp !== null && Date.now() / 1000 >= exp) {
        doLogout('expired');
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onFocus();
    });

    return () => {
      clearInterval(interval);
      events.forEach(e => window.removeEventListener(e, resetActivity));
      window.removeEventListener('focus', onFocus);
      removeWarningBanner();
    };
  }, [token, resetActivity, doLogout, tryRefresh]);
}
