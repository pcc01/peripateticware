// src/i18n/index.ts
// ─────────────────────────────────────────────────────────────────
// i18next init — mobile-appropriate configuration.
//
// Deliberately different from web's frontend/src/config/i18n.ts:
//   - Only English is bundled JSON, imported directly at build time.
//     Every other locale is downloaded on demand from the backend and
//     cached to disk — see src/i18n/localePacks.ts — so the app payload
//     never carries translations nobody asked for. This makes the app
//     NOT fully offline-capable for a language the device hasn't
//     downloaded yet, but restoreLastLocale() below only ever reads
//     from local cache at boot, so a language already in use keeps
//     working with no network required.
//   - No `i18next-browser-languagedetector` — that plugin reads
//     `navigator.language` / cookies, which don't exist on native.
//     Mobile boots to DEFAULT_LOCALE and then restores whatever locale
//     was previously persisted to AsyncStorage under LANGUAGE_STORAGE_KEY
//     (see src/i18n/locales.ts) — this mirrors the Settings screen's
//     existing manual-selection-only picker. Device-locale
//     auto-detection (expo-localization) remains deliberately deferred.
//
// This module must be imported once, before first render (see
// app/_layout.tsx), so i18next is initialized before any component
// calls t() or useTranslation().
// ─────────────────────────────────────────────────────────────────

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE } from './locales';
import { restoreLastLocale } from './localePacks';

import en from './locales/en.json';

const resources = {
  en: { translation: en },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    compatibilityJSON: 'v4',
    interpolation: {
      // React (and React Native Text) already escapes rendered values —
      // i18next's own HTML-escaping would double-escape, same reasoning
      // as web's frontend/src/config/i18n.ts.
      escapeValue: false,
    },
  });

// Restore a previously-selected non-English language (if any and if
// cached locally) before the app's first meaningful render settles.
// This is inherently async, so on a fresh boot there is a brief window
// where i18n.language === DEFAULT_LOCALE until it resolves; any
// component using useTranslation() re-renders automatically once
// changeLanguage() resolves (i18next's own `languageChanged` event), so
// no extra plumbing is needed here.
restoreLastLocale().catch(() => {
  // Non-fatal — app just stays on DEFAULT_LOCALE.
});

export default i18n;
