// src/i18n/t.ts
// ─────────────────────────────────────────────────────────────────
// Translation seam. Mobile has no i18n library wired up yet (see
// FEATURE_PLAN.md section 3.1 — that's still an open scope decision:
// bring in a lightweight RN i18n library vs. persist-only-for-now).
// Until that's decided, `t()` is a pass-through that returns the English
// fallback — but every button label and other user-facing string that
// goes through it is now a single, mechanical swap away from real
// translation: once a library is picked, this function's body becomes
// the only thing that changes (e.g. `return i18n.t(key, { defaultValue:
// fallback })`), and every call site stays untouched.
//
// Use this instead of inlining raw English strings in `label`,
// `accessibilityLabel`, etc. for anything a user reads. `key` should be a
// stable dotted id (screen.element) independent of the English wording,
// since the wording is exactly what will change per-locale.
// ─────────────────────────────────────────────────────────────────

export function t(key: string, fallback: string): string {
  return fallback;
}
