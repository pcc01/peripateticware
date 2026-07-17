// src/i18n/t.ts
// ─────────────────────────────────────────────────────────────────
// Translation seam. Now backed by real i18next (see src/i18n/index.ts
// for init/config) — this was always meant to be a one-line body swap
// (see prior revision's docstring), and every call site's signature
// `t(key, fallback)` stays exactly the same, so no call site changed.
//
// `defaultValue: fallback` means a genuinely missing key (e.g. a
// translated locale that hasn't caught up with a newly-added English
// key yet) still renders the English fallback text instead of the raw
// key or a blank string.
//
// NOTE: this plain function does NOT subscribe to i18next's
// `languageChanged` event, so a component that only calls `t()` at
// module-import time (module scope) will not re-render when the user
// switches languages at runtime. Use react-i18next's `useTranslation()`
// hook directly inside a component's render body where that reactivity
// matters (see src/onboarding/copy.ts and app/(tabs)/settings.tsx for
// the two places this was fixed).
// ─────────────────────────────────────────────────────────────────

import i18n from './index';

export function t(key: string, fallback: string): string {
  return i18n.t(key, { defaultValue: fallback });
}
