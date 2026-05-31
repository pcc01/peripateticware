// Copyright (c) 2026 Paul Christopher Cerda
// Null-safe date formatting utilities.
// Always use these instead of bare new Date(x).toLocaleDateString() to avoid
// "Invalid Date" rendering when the backend returns null or an empty string.

/** Format a date value as a locale date string (e.g. "5/30/2026").
 *  Returns fallback (default "—") when the value is null, undefined, or empty. */
export function fmtDate(
  value: string | number | null | undefined,
  fallback = '—'
): string {
  if (!value) return fallback
  const d = new Date(value)
  return isNaN(d.getTime()) ? fallback : d.toLocaleDateString()
}

/** Format a date value as a locale date+time string (e.g. "5/30/2026, 3:45 PM").
 *  Returns fallback (default "—") when the value is null, undefined, or empty. */
export function fmtDateTime(
  value: string | number | null | undefined,
  fallback = '—'
): string {
  if (!value) return fallback
  const d = new Date(value)
  return isNaN(d.getTime()) ? fallback : d.toLocaleString()
}

/** Format a date value as a locale time string (e.g. "3:45 PM").
 *  Returns fallback (default "—") when the value is null, undefined, or empty. */
export function fmtTime(
  value: string | number | null | undefined,
  fallback = '—'
): string {
  if (!value) return fallback
  const d = new Date(value)
  return isNaN(d.getTime()) ? fallback : d.toLocaleTimeString()
}
