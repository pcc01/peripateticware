// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * CLDR/ICU-correct calendar helpers.
 *
 * Grid/date arithmetic (month boundaries, week-start-per-locale, adding
 * months, ISO date formatting) is delegated to `@internationalized/date` —
 * react-aria's CLDR-backed calendar library. Its `startOfWeek(date, locale)`
 * carries real CLDR week-data (which locales start the week on Sunday,
 * Monday, or Saturday) baked into the package, so we no longer need to
 * hand-maintain a fallback region table or depend on runtime support for
 * the still-not-universally-shipped `Intl.Locale.prototype.getWeekInfo()`.
 *
 * Human-readable formatting (weekday names, month names) stays on the
 * native `Intl.DateTimeFormat` — the browser/Node's built-in ICU — since
 * that's the correct tool for locale-correct display strings.
 */

import {
  CalendarDate,
  startOfMonth as cdStartOfMonth,
  endOfMonth as cdEndOfMonth,
  startOfWeek as cdStartOfWeek,
  getLocalTimeZone,
} from '@internationalized/date';

/** Plain JS Date (calendar day, ignoring time) -> @internationalized/date CalendarDate. */
function toCalendarDate(d: Date): CalendarDate {
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** CalendarDate -> plain JS Date at local midnight for that calendar day. */
function toJSDate(cd: CalendarDate): Date {
  return cd.toDate(getLocalTimeZone());
}

/**
 * Returns 0 (Sunday) .. 6 (Saturday) for the first day of the week in this
 * locale, using @internationalized/date's CLDR week-data.
 */
export function getFirstDayOfWeek(locale: string): number {
  try {
    const anchor = new CalendarDate(1970, 1, 4); // Sunday, arbitrary anchor
    const weekStart = cdStartOfWeek(anchor, locale);
    return toJSDate(weekStart).getDay();
  } catch {
    return 1; // Monday — CLDR default for most of the world
  }
}

/** Locale-correct short weekday labels, ordered starting from this locale's first day. */
export function getWeekdayLabels(locale: string, format: 'short' | 'narrow' | 'long' = 'short'): string[] {
  const firstDay = getFirstDayOfWeek(locale);
  const fmt = new Intl.DateTimeFormat(locale, { weekday: format, timeZone: 'UTC' });
  // Jan 4 1970 was a Sunday — a safe, unambiguous anchor.
  const labels = Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(1970, 0, 4 + i))));
  return [...labels.slice(firstDay), ...labels.slice(0, firstDay)];
}

/** Locale-correct month name (e.g. "March", "mars", "3月", "مارس"). */
export function getMonthLabel(locale: string, date: Date, format: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat(locale, { month: format, year: 'numeric' }).format(date);
}

export function isRTL(locale: string): boolean {
  const base = locale.split('-')[0];
  return ['ar', 'he', 'fa', 'ur'].includes(base);
}

export function startOfMonth(d: Date): Date {
  return toJSDate(cdStartOfMonth(toCalendarDate(d)));
}

export function daysInMonth(d: Date): number {
  return cdEndOfMonth(toCalendarDate(d)).day;
}

export function addMonths(d: Date, n: number): Date {
  return toJSDate(cdStartOfMonth(toCalendarDate(d).add({ months: n })));
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Builds a 6x7 grid of dates (including leading/trailing days from adjacent
 * months) for a month view, respecting the locale's first day of week per
 * CLDR (via @internationalized/date's `startOfWeek`).
 */
export function buildMonthGrid(monthDate: Date, locale: string): Date[] {
  const monthStart = cdStartOfMonth(toCalendarDate(monthDate));
  const gridStart = cdStartOfWeek(monthStart, locale);
  return Array.from({ length: 42 }, (_, i) => toJSDate(gridStart.add({ days: i })));
}

/** ISO 8601 (YYYY-MM-DD) calendar-day string, via CalendarDate's own formatting. */
export function toISODate(d: Date): string {
  return toCalendarDate(d).toString();
}
