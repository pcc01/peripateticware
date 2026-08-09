// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * GA4 (Google Analytics) — buyer-funnel analytics only.
 *
 * GDPR posture: opt-out by default, opt-in by consent.
 *   - No gtag.js script tag is injected, and no request of any kind is made
 *     to Google, until the visitor has explicitly clicked "Accept" on the
 *     cookie banner (or a still-valid prior acceptance is on file). There is
 *     no "denied ping" phase — silence, not a downgraded signal, is the
 *     default state.
 *   - Consent is stored with a timestamp and expires after ~6 months (the
 *     commonly cited CNIL/EU refresh window), at which point the banner
 *     reappears and consent must be given again.
 *   - CookieConsentBanner.tsx offers Accept and Decline with equal
 *     prominence, and stays reachable afterwards (as a small reopen affordance)
 *     so consent can be withdrawn as easily as it was given.
 *   - Global Privacy Control (GPC) is a hard, un-overridable opt-out — see
 *     useGlobalPrivacyControl.ts for the DSR-side handling of the same signal.
 *   - Google Signals and Ads personalization are disabled outright, always.
 *     This is first-party product/traffic analytics for the marketing site,
 *     not an ad-audience or remarketing pixel.
 *
 * docs/legal/COPPA_DIRECT_NOTICE.md promises children's data is never used
 * for advertising or marketing, and never tied to persistent cross-service
 * identifiers. On top of the consent gate above, that's enforced with two
 * independent checks so a bug in one doesn't silently break the promise:
 *   1. Route guard — anything under /student or /session never fires,
 *      regardless of who's signed in or what consent is on file.
 *   2. Role guard — a signed-in "student" session never fires, regardless
 *      of route or consent.
 */

declare global {
  interface Window {
    dataLayer: unknown[]
  }
}

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined
const CONSENT_KEY = 'ppw_cookie_consent'
const CONSENT_MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000 // ~6 months

export type ConsentChoice = 'accepted' | 'declined'

let scriptInjected = false

function gtag(...args: unknown[]) {
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(args)
}

function gpcActive(): boolean {
  try {
    return (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true
  } catch {
    return false
  }
}

/** Route guard: student- and session-facing surfaces are never measured, no matter who's signed in or what's been consented to. */
function isChildSurface(path: string): boolean {
  return path.startsWith('/student') || path.startsWith('/session')
}

/** Role guard: reads the same localStorage key every login path writes to, so it can't drift out of sync with the auth store. */
function isStudentSession(): boolean {
  try {
    const raw = localStorage.getItem('auth_user')
    if (!raw) return false // no session = anonymous marketing-site visitor, not a student
    const role = (JSON.parse(raw)?.role || '').toLowerCase()
    return role === 'student'
  } catch {
    return false
  }
}

/** Reads the stored consent choice. Returns null if never set, corrupt, or expired (past CONSENT_MAX_AGE_MS) — all of which mean "ask again". */
export function getStoredConsent(): ConsentChoice | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return null
    const { choice, ts } = JSON.parse(raw) as { choice: ConsentChoice; ts: number }
    if (choice !== 'accepted' && choice !== 'declined') return null
    if (typeof ts !== 'number' || Date.now() - ts > CONSENT_MAX_AGE_MS) return null
    return choice
  } catch {
    return null
  }
}

function consentActive(): boolean {
  return getStoredConsent() === 'accepted' && !gpcActive()
}

function ensureScriptLoaded(): void {
  if (scriptInjected || !GA_MEASUREMENT_ID || typeof window === 'undefined') return
  scriptInjected = true

  window.dataLayer = window.dataLayer || []

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  document.head.appendChild(script)

  gtag('js', new Date())
  // We only ever load this script after consent, so there's no "denied"
  // phase to represent — but the ad_* signals stay permanently denied
  // regardless, since this property never does ads/remarketing.
  gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
  gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false, // page_view is sent manually on route change, after the guards run
    allow_google_signals: false, // no cross-device / ads audience building
    allow_ad_personalization_signals: false,
    anonymize_ip: true,
  })
}

/** Deletes GA's own cookies immediately on decline/withdrawal — don't just stop future writes, remove what's already there. */
function clearAnalyticsCookies(): void {
  if (typeof document === 'undefined') return
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim()
    if (name === '_gid' || name.startsWith('_ga')) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    }
  })
}

/**
 * Call once at app startup. Strictly opt-out by default: this only loads
 * the analytics script if a still-valid "accepted" choice is already on
 * file from a previous visit. First-time visitors get zero requests to
 * Google until they click Accept. No-op if VITE_GA_MEASUREMENT_ID isn't set.
 */
export function initAnalytics(): void {
  if (consentActive()) ensureScriptLoaded()
}

/** Wired to the cookie banner's Accept/Decline buttons, including when reopened later to withdraw consent. Records the choice with a timestamp for the ~6-month refresh window. */
export function recordConsent(accepted: boolean): void {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice: accepted ? 'accepted' : 'declined', ts: Date.now() }))

  if (accepted && !gpcActive()) {
    ensureScriptLoaded()
    gtag('consent', 'update', { analytics_storage: 'granted' })
  } else {
    gtag('consent', 'update', { analytics_storage: 'denied' })
    clearAnalyticsCookies()
  }
}

function blocked(path: string): boolean {
  return !GA_MEASUREMENT_ID || !consentActive() || isChildSurface(path) || isStudentSession()
}

export function trackPageview(path: string, title?: string): void {
  if (blocked(path)) return
  gtag('event', 'page_view', { page_path: path, page_title: title ?? document.title })
}

export function trackEvent(path: string, name: string, params: Record<string, unknown> = {}): void {
  if (blocked(path)) return
  gtag('event', name, params)
}
