/**
 * Localization utilities
 * Includes pseudo-localization for testing string externalization
 */

import { SUPPORTED_LANGUAGES } from '@/config/i18n'

/**
 * Pseudo-localize text for testing
 * Expands text by ~30% to test layout overflow
 * Scrambles text to verify all UI strings are externalized (not hardcoded)
 *
 * Example: "Hello" → "Ħēļļōxxxxxxxxxxxxxxxxxx"
 */
export function pseudoLocalize(text: string): string {
  if (!text) return text

  // Map of characters for pseudo-localization
  const charMap: Record<string, string> = {
    a: 'ā',
    b: 'ḃ',
    c: 'č',
    d: 'đ',
    e: 'ē',
    f: 'ƒ',
    g: 'ğ',
    h: 'ħ',
    i: 'ī',
    j: 'ĵ',
    k: 'ķ',
    l: 'ļ',
    m: 'ṃ',
    n: 'ņ',
    o: 'ō',
    p: 'ṗ',
    q: 'q̃',
    r: 'ŕ',
    s: 'š',
    t: 'ţ',
    u: 'ū',
    v: 'ṽ',
    w: 'ŵ',
    x: 'x̃',
    y: 'ŷ',
    z: 'ž',
    A: 'Ā',
    B: 'Ḃ',
    C: 'Č',
    D: 'Đ',
    E: 'Ē',
    F: 'Ƒ',
    G: 'Ğ',
    H: 'Ħ',
    I: 'Ī',
    J: 'Ĵ',
    K: 'Ķ',
    L: 'Ļ',
    M: 'Ṃ',
    N: 'Ņ',
    O: 'Ō',
    P: 'Ṗ',
    Q: 'Q̃',
    R: 'Ŕ',
    S: 'Š',
    T: 'Ţ',
    U: 'Ū',
    V: 'Ṽ',
    W: 'Ŵ',
    X: 'X̃',
    Y: 'Ŷ',
    Z: 'Ž',
  }

  // Pseudo-localize by:
  // 1. Replacing each character with accented version
  // 2. Adding padding with 'x' to simulate 30% text expansion
  const pseudoLocalized = text
    .split('')
    .map((char) => charMap[char] || char)
    .join('')

  // Add padding to simulate RTL/longer languages
  const padding = 'x'.repeat(Math.ceil(text.length * 0.3))
  return `[${pseudoLocalized}${padding}]`
}

/**
 * Detect if pseudo-localization is enabled
 * Check URL param: ?pseudo-loc=true or localStorage: pseudo-loc
 */
export function isPseudoLocalizationEnabled(): boolean {
  if (typeof window === 'undefined') return false

  const urlParam = new URLSearchParams(window.location.search).get('pseudo-loc')
  if (urlParam === 'true') return true

  const stored = localStorage.getItem('pseudo-loc')
  return stored === 'true'
}

/**
 * Enable/disable pseudo-localization
 */
export function setPseudoLocalization(enabled: boolean): void {
  if (enabled) {
    localStorage.setItem('pseudo-loc', 'true')
  } else {
    localStorage.removeItem('pseudo-loc')
  }
  window.location.reload()
}

/**
 * Get language native name
 */
export function getLanguageName(languageCode: string): string {
  const language = SUPPORTED_LANGUAGES[languageCode as keyof typeof SUPPORTED_LANGUAGES]
  return language?.nativeName || languageCode
}

/**
 * Get text direction for language
 */
export function getTextDirection(languageCode: string): 'ltr' | 'rtl' {
  const language = SUPPORTED_LANGUAGES[languageCode as keyof typeof SUPPORTED_LANGUAGES]
  return language?.dir || 'ltr'
}

/**
 * Format number for locale
 */
export function formatNumber(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(value)
  } catch {
    return value.toString()
  }
}

/**
 * Format date for locale
 */
export function formatDate(date: Date | string, locale: string, options?: Intl.DateTimeFormatOptions): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    return new Intl.DateTimeFormat(locale, options).format(dateObj)
  } catch {
    return date.toString()
  }
}

/**
 * Format currency for locale
 */
export function formatCurrency(
  value: number,
  locale: string,
  currency: string = 'USD'
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(value)
  } catch {
    return `${currency} ${value}`
  }
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string, locale: string): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const secondsElapsed = Math.round((now.getTime() - dateObj.getTime()) / 1000)

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

    const minutes = Math.round(secondsElapsed / 60)
    if (minutes < 60) return rtf.format(-minutes, 'minute')

    const hours = Math.round(secondsElapsed / 3600)
    if (hours < 24) return rtf.format(-hours, 'hour')

    const days = Math.round(secondsElapsed / 86400)
    if (days < 30) return rtf.format(-days, 'day')

    const months = Math.round(secondsElapsed / 2592000)
    if (months < 12) return rtf.format(-months, 'month')

    const years = Math.round(secondsElapsed / 31536000)
    return rtf.format(-years, 'year')
  } catch {
    return 'recently'
  }
}

export const Localization = {
  pseudoLocalize,
  isPseudoLocalizationEnabled,
  setPseudoLocalization,
  getLanguageName,
  getTextDirection,
  formatNumber,
  formatDate,
  formatCurrency,
  formatRelativeTime,
}

export default Localization
