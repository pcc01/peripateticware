// src/i18n/index.ts
// ─────────────────────────────────────────────────────────────────
// i18next init — mobile-appropriate configuration.
//
// Deliberately different from web's frontend/src/config/i18n.ts:
//   - No `i18next-http-backend` — resources are bundled JSON, imported
//     directly at build time (no network fetch, works fully offline).
//   - No `i18next-browser-languagedetector` — that plugin reads
//     `navigator.language` / cookies, which don't exist on native.
//     Mobile boots to DEFAULT_LOCALE and then restores whatever locale
//     was previously persisted to AsyncStorage under LANGUAGE_STORAGE_KEY
//     (see src/i18n/locales.ts) — this mirrors the Settings screen's
//     existing manual-selection-only picker. Device-locale
//     auto-detection (expo-localization) is explicitly deferred — see
//     WORK_PLAN_20260718_MOBILE_I18N.md Priority 3 item 6.
//
// This module must be imported once, before first render (see
// app/_layout.tsx), so i18next is initialized before any component
// calls t() or useTranslation().
// ─────────────────────────────────────────────────────────────────

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LOCALE, LANGUAGE_STORAGE_KEY } from './locales';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import ptBR from './locales/pt-BR.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  ar: { translation: ar },
  ja: { translation: ja },
  ko: { translation: ko },
  'pt-BR': { translation: ptBR },
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

// Restore a previously-selected language (if any) before the app's first
// meaningful render settles. AsyncStorage is inherently async, so on a
// fresh boot there is a brief window where i18n.language === DEFAULT_LOCALE
// until this resolves; any component using useTranslation() re-renders
// automatically once changeLanguage() resolves (i18next's own
// `languageChanged` event), so no extra plumbing is needed here.
AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
  .then((stored) => {
    if (stored && stored !== i18n.language) {
      i18n.changeLanguage(stored);
    }
  })
  .catch(() => {
    // Non-fatal — app just stays on DEFAULT_LOCALE.
  });

export default i18n;
